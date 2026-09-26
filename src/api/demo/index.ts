/* =====================================================================
   DemoApi — the full backend, running in this browser.
   It enforces the SAME rules as the Supabase functions (roles, tenant
   isolation, server-side scoring, rate limits, super-admin code) so the
   demo behaves like production. Data lives in localStorage.
   ===================================================================== */
import {
  ApiError, PIN_RE, SLUG_RE,
  type Access, type Api, type AnswerResult, type AuthUser, type LookupCard, type MfaState, type NewTenantInput,
  type QuizDraft, type RegisterInput, type TenantData, type Unsub,
} from "../Api";
import type {
  AuditEntry, Branding, Disqualified, Equipped, Game, Gift, Labels, LibraryItem, LiveBoardRow, LiveHostView,
  LivePlayer, LiveSession, OrgConfig, Player, Poll, PollResponse, PollValue, Role, Roster, Run, SlideResults, Tenant, TenantPublic,
  TenantUsage, UnitType,
} from "../../types";
import { runKey } from "../../types";
import * as store from "./db";
import type { DB } from "./db";
import { GRACE_MS, LABELS, LIVE, aggregate, defaultCfg, isRight, livePoints, normalizeCfg, pollValueProblem, scoreAnswer, DEFAULT_BRANDING } from "../engine";
import { limitMs, runPoints, statsOf, levelOf } from "../../lib/scoring";
import { ITEM } from "../../lib/catalog";
import { isOpen } from "../../lib/games";
import { cleanName, cleanText, maskId, normEmpId, pbkdf2, PBKDF2_ITER, safeEqual, sha256, validEmpId, validName } from "../../lib/security";
import { LS, newId, randHex, randInt } from "../../lib/util";
import { newSecret, otpauthUrl, totp, verifyTotp } from "../../lib/totp";
import { qrDataUrl } from "../../lib/qr";
import { validImg } from "../../lib/image";

const AUTH_KEY = "bsx.demo.auth";
const RANK: Record<Role, number> = { viewer: 0, host: 1, editor: 2, admin: 3, owner: 4 };
const DAY = 864e5;

interface Sess {
  userId: string;
  aal: 1 | 2;
}

const err = (code: ConstructorParameters<typeof ApiError>[0], msg: string, wait?: number) => new ApiError(code, msg, wait);

/** Certification: per-question right/wrong stays hidden until the exam can't be retaken (passed or out of attempts). */
function certFinal(p: Player, g: Game): boolean {
  let n = 1;
  while (p.runs?.[runKey(g.id, n + 1)]) n++;
  const last = p.runs?.[runKey(g.id, n)];
  return !!last && last.status === "done" && (!!last.passed || n >= (g.cert?.attempts || 1));
}
function maskCertRun(r: Run): Run {
  return { ...r, ans: r.ans.map((a) => ({ ...a, ok: 0 as const, pts: 0 })) };
}
/** What a player may see of runs: own runs in full (cert masked until final), others without their choices. */
function playerRuns(p: Player, games: Record<string, Game>, own: boolean): Record<string, Run> {
  const out: Record<string, Run> = {};
  for (const [k, r] of Object.entries(p.runs || {})) {
    const g = games[r.gid];
    let x: Run = own ? r : { ...r, ans: r.ans.map((a) => ({ ...a, c: null })) };
    if (g?.kind === "cert" && (!own || !certFinal(p, g))) x = maskCertRun(x);
    out[k] = x;
  }
  return out;
}

export async function createDemoApi(): Promise<Api> {
  if (!store.hasDB()) {
    const { buildDemoDB } = await import("./seed");
    store.init(await buildDemoDB());
  } else store.read();
  return new DemoApi();
}

export async function resetDemo() {
  store.wipe();
  LS.set(AUTH_KEY, null);
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

class DemoApi implements Api {
  readonly mode = "demo" as const;
  private sess: Sess | null = null;
  private authCbs = new Set<(u: AuthUser | null) => void>();

  constructor() {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    raw = raw || LS.get(AUTH_KEY);
    try {
      this.sess = raw ? (JSON.parse(raw) as Sess) : null;
    } catch {
      this.sess = null;
    }
    if (this.sess && !store.read().users[this.sess.userId]) this.sess = null;
    // magic links in the demo carry a token in the URL
    const m = location.hash.match(/[?&]demo_token=([a-f0-9]+)/);
    if (m) {
      const tok = m[1];
      const link = store.read().links[tok];
      if (link && link.exp > Date.now()) {
        const uid = store.tx((db) => {
          delete db.links[tok];
          return this.userByEmail(db, link.email, true)!.id;
        });
        this.setSess({ userId: uid, aal: 1 });
      }
      history.replaceState(null, "", location.href.replace(/[?&]demo_token=[a-f0-9]+/, ""));
    }
  }

  /* ================= auth ================= */
  private setSess(s: Sess | null, tabOnly = false) {
    this.sess = s;
    const v = s ? JSON.stringify(s) : null;
    try {
      if (v) sessionStorage.setItem(AUTH_KEY, v);
      else sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    if (!tabOnly) LS.set(AUTH_KEY, v);
    const u = this.user();
    this.authCbs.forEach((f) => f(u));
  }
  user(): AuthUser | null {
    if (!this.sess) return null;
    const u = store.read().users[this.sess.userId];
    return u ? { id: u.id, email: u.email, anonymous: u.anonymous } : null;
  }
  onAuth(cb: (u: AuthUser | null) => void): Unsub {
    this.authCbs.add(cb);
    return () => this.authCbs.delete(cb);
  }
  private userByEmail(db: DB, email: string, create: boolean) {
    const e = email.trim().toLowerCase();
    let u = Object.values(db.users).find((x) => x.email === e);
    if (!u && create) {
      u = { id: "u-" + randHex(6), email: e, anonymous: false, createdAt: Date.now() };
      db.users[u.id] = u;
    }
    return u;
  }
  private mail(db: DB, to: string, body: string, extra: { code?: string; link?: string } = {}) {
    db.outbox.unshift({ to, body, at: Date.now(), ...extra });
    db.outbox = db.outbox.slice(0, 5);
  }
  demoOutbox() {
    return store.read().outbox[0] || null;
  }
  private rate(key: string, max = 5, baseMs = 60_000, capMs = 10 * 60_000) {
    const r = store.read().rate[key];
    if (r && r.until > Date.now()) throw err("rate_limited", `Too many tries. Try again in ${Math.ceil((r.until - Date.now()) / 60000)} min.`, r.until - Date.now());
    return {
      fail: () =>
        store.tx((db) => {
          const cur = db.rate[key] || { n: 0, until: 0 };
          cur.n++;
          if (cur.n >= max) cur.until = Date.now() + Math.min(capMs, baseMs * 2 ** (cur.n - max));
          db.rate[key] = cur;
        }),
      ok: () => store.tx((db) => void delete db.rate[key]),
    };
  }
  async signInPassword(email: string, password: string) {
    const e = email.trim().toLowerCase();
    const rl = this.rate("pw:" + e);
    const u = this.userByEmail(store.read(), e, false);
    if (!u?.pw || u.pw !== (await sha256("bsx|" + password))) {
      rl.fail();
      throw err("auth", "Email or password is wrong.");
    }
    rl.ok();
    this.setSess({ userId: u.id, aal: 1 });
  }
  async signUpPassword(email: string, password: string) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw err("invalid", "Enter a valid email.");
    if (password.length < 10) throw err("invalid", "Use at least 10 characters.");
    const h = await sha256("bsx|" + password);
    const id = store.tx((db) => {
      const u = this.userByEmail(db, e, true)!;
      if (u.pw) throw err("conflict", "This email already has a password. Sign in instead.");
      u.pw = h;
      return u.id;
    });
    this.setSess({ userId: id, aal: 1 });
    return { needsConfirm: false };
  }
  async sendMagicLink(email: string, redirectTo: string) {
    const e = email.trim().toLowerCase();
    this.rate("ml:" + e, 5, 60_000).fail();
    const tok = randHex(16);
    const sep = redirectTo.includes("?") ? "&" : "?";
    store.tx((db) => {
      db.links[tok] = { email: e, exp: Date.now() + 15 * 60_000 };
      this.mail(db, e, "Your sign-in link", { link: redirectTo + sep + "demo_token=" + tok });
    });
  }
  async sendEmailCode(email: string) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw err("invalid", "Enter a valid email.");
    const code = String(randInt(1e6)).padStart(6, "0");
    store.tx((db) => {
      db.otp[e] = { code, exp: Date.now() + 10 * 60_000, tries: 0 };
      this.mail(db, e, "Your sign-in code", { code });
    });
  }
  async verifyEmailCode(email: string, code: string) {
    const e = email.trim().toLowerCase();
    const res = store.tx((db) => {
      const o = db.otp[e];
      if (!o || o.exp < Date.now()) return "expired";
      if (o.tries >= 5) return "locked";
      if (o.code !== code.trim()) {
        o.tries++;
        return "wrong";
      }
      delete db.otp[e];
      const cur = this.sess && db.users[this.sess.userId];
      // an anonymous visitor who verifies an email keeps the same identity (like Supabase linking)
      if (cur && cur.anonymous && !this.userByEmail(db, e, false)) {
        cur.anonymous = false;
        cur.email = e;
        return cur.id;
      }
      return this.userByEmail(db, e, true)!.id;
    });
    if (res === "expired") throw err("auth", "That code has expired. Send a new one.");
    if (res === "locked") throw err("rate_limited", "Too many wrong codes. Send a new one.");
    if (res === "wrong") throw err("auth", "That code isn't right.");
    this.setSess({ userId: res, aal: 1 });
  }
  async signInMicrosoft() {
    throw err("invalid", "Microsoft sign-in works once the company's Entra ID is connected in Supabase (see README → SSO). It isn't available in the demo.");
  }
  async signInAnonymous() {
    if (this.sess) return;
    const id = "u-" + randHex(6);
    store.tx((db) => void (db.users[id] = { id, anonymous: true, createdAt: Date.now() }));
    this.setSess({ userId: id, aal: 1 });
  }
  /** demo helper: a fresh anonymous identity for this tab only (to test several players in one browser) */
  async demoFreshTab() {
    const id = "u-" + randHex(6);
    store.tx((db) => void (db.users[id] = { id, anonymous: true, createdAt: Date.now() }));
    this.setSess({ userId: id, aal: 1 }, true);
  }
  async resetPassword(email: string, redirectTo: string) {
    return this.sendMagicLink(email, redirectTo);
  }
  async updatePassword(pw: string) {
    const u = this.need();
    if (pw.length < 10) throw err("invalid", "Use at least 10 characters.");
    const h = await sha256("bsx|" + pw);
    store.tx((db) => void (db.users[u.id].pw = h));
  }
  async signOut() {
    if (this.sess) {
      const id = this.sess.userId;
      store.tx((db) => {
        for (const until of Object.keys(db.sup.unlocked)) if (until === id) delete db.sup.unlocked[id];
      });
    }
    this.setSess(null);
  }
  async mfaState(): Promise<MfaState> {
    const u = this.sess && store.read().users[this.sess.userId];
    return { enrolled: !!u?.mfa?.verified, verified: this.sess?.aal === 2, factorId: u?.mfa ? "totp" : undefined };
  }
  async mfaEnroll() {
    const u = this.need();
    if (u.anonymous) throw err("forbidden", "Sign in first.");
    const secret = newSecret();
    store.tx((db) => {
      db.users[u.id].mfa = { secret, verified: false };
    });
    const code = await totp(secret);
    store.tx((db) => this.mail(db, u.email || "", "Demo only: the current authenticator code", { code }));
    return { factorId: "totp", secret, qr: qrDataUrl(otpauthUrl(secret, u.email || "admin", "Ant Arena")) };
  }
  async mfaVerify(_factorId: string, code: string) {
    const u = this.need();
    const rl = this.rate("mfa:" + u.id);
    const m = store.read().users[u.id].mfa;
    if (!m || !(await verifyTotp(m.secret, code))) {
      rl.fail();
      throw err("auth", "That code isn't right. Check the time on your phone.");
    }
    rl.ok();
    store.tx((db) => void (db.users[u.id].mfa!.verified = true));
    this.setSess({ userId: u.id, aal: 2 });
  }
  /** demo helper: show the current authenticator code so testers don't need a phone */
  async demoMfaCode(): Promise<string | null> {
    const u = this.sess && store.read().users[this.sess.userId];
    return u?.mfa ? totp(u.mfa.secret) : null;
  }

  /* ================= access helpers ================= */
  private need() {
    const u = this.sess && store.read().users[this.sess.userId];
    if (!u) throw err("auth", "Please sign in.");
    return u;
  }
  private tenant(db: DB, tid: string): Tenant {
    const t = db.tenants[tid];
    if (!t) throw err("not_found", "Company not found.");
    return t;
  }
  private roleIn(db: DB, tid: string): Role | null {
    if (!this.sess) return null;
    const u = db.users[this.sess.userId];
    if (!u || u.anonymous) return null;
    const t = db.tenants[tid];
    if (!t || t.status !== "active") return null;
    const m = db.t[tid]?.members.find((x) => x.userId === u.id || (!x.userId && x.email === u.email) || x.email === u.email);
    if (!m) return null;
    const cfg = normalizeCfg(t.cfg, t.template);
    if (cfg.signIn.adminMfa && this.sess.aal !== 2) return null; // MFA required: no admin rights until verified
    return m.role;
  }
  private isSuper(db: DB): boolean {
    if (!this.sess) return false;
    const u = db.users[this.sess.userId];
    return !!u?.email && db.sup.emails.includes(u.email) && (db.sup.unlocked[u.id] || 0) > Date.now();
  }
  /** On the super admin list, whether or not the console is unlocked. */
  private isSuperUser(db: DB): boolean {
    const u = this.sess ? db.users[this.sess.userId] : undefined;
    return !!u?.email && db.sup.emails.includes(u.email);
  }
  private req(db: DB, tid: string, min: Role): Role {
    if (this.isSuper(db)) return "owner";
    const r = this.roleIn(db, tid);
    if (!r || RANK[r] < RANK[min]) throw err("forbidden", "You don't have permission for that.");
    return r;
  }
  private actor(db: DB) {
    const u = this.sess && db.users[this.sess.userId];
    return u?.email || u?.id || "system";
  }
  private logT(db: DB, tid: string, e: Omit<AuditEntry, "id" | "at" | "actor">) {
    const s = db.t[tid];
    if (!s) return;
    s.audit.unshift({ id: newId("e"), at: Date.now(), actor: this.actor(db), ...e });
    s.audit = s.audit.slice(0, 2000);
  }
  private logS(db: DB, e: Omit<AuditEntry, "id" | "at" | "actor">) {
    db.sup.audit.unshift({ id: newId("e"), at: Date.now(), actor: this.actor(db), ...e });
    db.sup.audit = db.sup.audit.slice(0, 2000);
  }
  private me(db: DB, tid: string): (Player & { authUid?: string }) | null {
    if (!this.sess) return null;
    const ps = db.t[tid]?.players || {};
    return Object.values(ps).find((p) => p.authUid === this.sess!.userId) || null;
  }
  private needMe(db: DB, tid: string) {
    const t = this.tenant(db, tid);
    if (t.status !== "active") throw err("suspended", "This company's account is paused.");
    const p = this.me(db, tid);
    if (!p) throw err("auth", "You're signed out. Sign in again.");
    if (p.locked) throw err("forbidden", "This player card is locked. Ask your admin.");
    return p;
  }

  /* ================= tenants ================= */
  private pub(t: Tenant): TenantPublic {
    const cfg = normalizeCfg(t.cfg, t.template);
    return { id: t.id, slug: t.slug, name: t.name, status: t.status, template: t.template, branding: t.branding, labels: t.labels, features: cfg.features, signIn: cfg.signIn,
      pubCfg: { branches: cfg.branches, departments: cfg.departments, maskIds: cfg.maskIds, lastInitialOnly: cfg.lastInitialOnly, retentionDays: cfg.retentionDays, requireAllowlist: cfg.requireAllowlist } };
  }
  async tenantBySlug(slug: string) {
    const t = Object.values(store.read().tenants).find((x) => x.slug === slug.toLowerCase());
    return t ? this.pub(t) : null;
  }
  async access(tid: string): Promise<Access> {
    const db = store.read();
    return { role: this.isSuper(db) ? "owner" : this.roleIn(db, tid), isSuper: this.isSuper(db), superUser: this.isSuperUser(db) };
  }
  async acceptInvites() {
    const u = this.need();
    if (!u.email) return [];
    return store.tx((db) => {
      const out: { tenantId: string; slug: string; role: Role }[] = [];
      for (const [tid, s] of Object.entries(db.t))
        for (const m of s.members)
          if (m.email === u.email) {
            if (!m.userId) {
              m.userId = u.id;
              m.joinedAt = Date.now();
              this.logT(db, tid, { action: "Admin joined", target: m.email, detail: m.role });
            }
            out.push({ tenantId: tid, slug: db.tenants[tid].slug, role: m.role });
          }
      return out;
    });
  }
  async myTenants() {
    const u = this.sess && store.read().users[this.sess.userId];
    if (!u?.email) return [];
    const db = store.read();
    const out: { tenantId: string; slug: string; name: string; role: Role }[] = [];
    for (const [tid, s] of Object.entries(db.t)) {
      const m = s.members.find((x) => x.email === u.email);
      if (m && db.tenants[tid]) out.push({ tenantId: tid, slug: db.tenants[tid].slug, name: db.tenants[tid].name, role: m.role });
    }
    return out;
  }

  /* ================= tenant data ================= */
  private snapshot(tid: string): TenantData {
    const db = store.read();
    const t = this.tenant(db, tid);
    const s = db.t[tid];
    const role = this.isSuper(db) ? "owner" : this.roleIn(db, tid);
    const admin = !!role;
    const tenant = { ...t, cfg: normalizeCfg(t.cfg, t.template) };
    if (!admin && t.status !== "active") throw err("suspended", "This company's account is paused.");
    const me = this.me(db, tid);
    const players: Record<string, Player> = {};
    for (const [uid, p] of Object.entries(s.players)) {
      const { authUid: _a, ...rest } = p;
      if (admin) players[uid] = rest;
      else {
        // players see a public view: no email, masked ID (their own card in full), no sign-in history
        const own = me?.uid === uid;
        players[uid] = { ...rest, runs: playerRuns(rest, s.games, own), empId: own ? rest.empId : maskId(rest.empId), email: own ? rest.email : undefined, logins: own ? rest.logins : undefined };
      }
    }
    const games: Record<string, Game> = {};
    for (const [gid, g] of Object.entries(s.games)) {
      if (!admin && (g.status !== "live" && g.status !== "closed")) continue;
      if (!admin && g.kind === "live") continue; // live quizzes are only played through a live session
      games[gid] = admin ? g : { ...g, questions: g.questions.map(({ explain: _e, ...q }) => q) };
    }
    return {
      tenant,
      games,
      players,
      gifts: s.gifts,
      dq: s.dq,
      keys: admin ? s.keys : {},
      roster: admin ? s.roster : null,
      audit: admin ? s.audit : [],
      admins: admin ? s.members : [],
      polls: admin ? Object.fromEntries(Object.values(db.polls).filter((p) => p.tenantId === tid).map((p) => [p.id, p])) : {},
      live: admin ? Object.values(db.live).filter((l) => l.tenantId === tid).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map((l) => this.pubLive(l)) : [],
    };
  }
  watchTenant(tid: string, cb: (d: TenantData) => void, onErr?: (e: ApiError) => void): Unsub {
    const run = () => {
      try {
        cb(this.snapshot(tid));
      } catch (e) {
        onErr?.(e instanceof ApiError ? e : err("network", String(e)));
      }
    };
    setTimeout(run, 0);
    return store.subscribe(run);
  }
  refresh() {
    /* the demo pushes every change */
  }

  /* ================= players ================= */
  async myPlayer(tid: string) {
    const db = store.read();
    const p = this.me(db, tid);
    if (!p || p.locked) return null;
    const { authUid: _a, ...rest } = p;
    return { ...rest, runs: playerRuns(rest, db.t[tid].games, true) };
  }
  async playerLookup(tid: string, empId: string): Promise<LookupCard | null> {
    const db = store.read();
    const t = this.tenant(db, tid);
    if (!normalizeCfg(t.cfg, t.template).signIn.empId) throw err("forbidden", "Employee ID sign-in is turned off.");
    const id = normEmpId(empId);
    const rl = this.rate(`lookup:${tid}:${this.sess?.userId || "anon"}`);
    const p = Object.values(db.t[tid].players).find((x) => x.empId === id);
    if (!p || p.locked) {
      rl.fail();
      return null;
    }
    rl.ok();
    const parts = p.name.trim().split(/\s+/);
    return { first: parts[0], lastInitial: parts.length > 1 ? parts[parts.length - 1][0] + "." : "", unit: p.unit, unitType: p.unitType, level: levelOf(statsOf(p, db.t[tid].dq).points).level, look: p.look };
  }
  async playerClaim(tid: string, empId: string, device: string) {
    const u = this.need();
    const id = normEmpId(empId);
    return store.tx((db) => {
      const t = this.tenant(db, tid);
      if (t.status !== "active") throw err("suspended", "This company's account is paused.");
      if (!normalizeCfg(t.cfg, t.template).signIn.empId) throw err("forbidden", "Employee ID sign-in is turned off.");
      const p = Object.values(db.t[tid].players).find((x) => x.empId === id);
      if (!p) throw err("not_found", "No player card with that Employee ID.");
      if (p.locked) throw err("forbidden", "This player card is locked. Ask your admin.");
      // unlink this auth user from any other card in the tenant, then bind (one device at a time)
      for (const x of Object.values(db.t[tid].players)) if (x.authUid === u.id) x.authUid = undefined;
      p.authUid = u.id;
      p.logins = [{ at: Date.now(), dev: device.slice(0, 60) }, ...(p.logins || [])].slice(0, 10);
      p.updatedAt = Date.now();
      const { authUid: _a, ...rest } = p;
      return structuredClone(rest);
    });
  }
  async playerRegister(tid: string, input: RegisterInput, device: string) {
    const u = this.need();
    const empId = normEmpId(input.empId);
    const name = cleanName(input.name);
    if (!validEmpId(empId)) throw err("invalid", "Employee ID should be 3–12 letters or numbers.");
    if (!validName(name)) throw err("invalid", "Please enter your name (letters only).");
    const db0 = store.read();
    const t0 = this.tenant(db0, tid);
    const cfg = normalizeCfg(t0.cfg, t0.template);
    if (cfg.requireAllowlist) {
      const r = db0.t[tid].roster;
      const h = r ? await sha256(r.salt + empId) : "";
      if (!r || !r.hashes.includes(h)) throw err("forbidden", "This Employee ID isn't on the staff list. Ask your admin.");
    }
    const units = input.unitType === "dept" ? cfg.departments : cfg.branches;
    if (!units.includes(input.unit)) throw err("invalid", "Pick your unit from the list.");
    return store.tx((db) => {
      const t = this.tenant(db, tid);
      if (t.status !== "active") throw err("suspended", "This company's account is paused.");
      const s = db.t[tid];
      if (Object.values(s.players).some((x) => x.empId === empId)) throw err("conflict", "That Employee ID already has a player card. Sign in instead.");
      if (!cfg.signIn.empId && !u.email) throw err("forbidden", "Sign in with your work email first.");
      for (const x of Object.values(s.players)) if (x.authUid === u.id) throw err("conflict", "You already have a player card here.");
      const now = Date.now();
      const p: Player & { authUid?: string } = {
        uid: "p-" + randHex(8), empId, name, unitType: input.unitType, unit: input.unit, look: Math.max(0, Math.min(15, input.look | 0)),
        email: u.email || (input.email ? input.email.trim().toLowerCase() : undefined), consentAt: now, createdAt: now, updatedAt: now, runs: {},
        logins: [{ at: now, dev: device.slice(0, 60) }], authUid: u.id,
      };
      s.players[p.uid] = p;
      const { authUid: _a, ...rest } = p;
      return structuredClone(rest);
    });
  }
  async playerLinkEmail(tid: string, device: string) {
    const u = this.need();
    if (!u.email) return null;
    return store.tx((db) => {
      const t = this.tenant(db, tid);
      if (t.status !== "active") throw err("suspended", "This company's account is paused.");
      const p = Object.values(db.t[tid].players).find((x) => x.email === u.email);
      if (!p) return null;
      if (p.locked) throw err("forbidden", "This player card is locked. Ask your admin.");
      p.authUid = u.id;
      p.logins = [{ at: Date.now(), dev: device.slice(0, 60) }, ...(p.logins || [])].slice(0, 10);
      const { authUid: _a, ...rest } = p;
      return structuredClone(rest);
    });
  }
  async updateMyCard(tid: string, patch: { name?: string; look?: number; equipped?: Equipped; unit?: string; unitType?: UnitType }) {
    store.tx((db) => {
      const p = this.needMe(db, tid);
      const t = db.tenants[tid];
      const cfg = normalizeCfg(t.cfg, t.template);
      if (patch.name != null) {
        const n = cleanName(patch.name);
        if (!validName(n)) throw err("invalid", "Please enter your name (letters only).");
        p.name = n;
      }
      if (patch.look != null) p.look = Math.max(0, Math.min(15, patch.look | 0));
      if (patch.unit != null && patch.unitType) {
        const units = patch.unitType === "dept" ? cfg.departments : cfg.branches;
        if (!units.includes(patch.unit)) throw err("invalid", "Pick from the list.");
        p.unit = patch.unit;
        p.unitType = patch.unitType;
      }
      if (patch.equipped) {
        // you can only wear what you own
        const own = new Set((p.purchases || []).map((x) => x.id));
        const eq: Equipped = {};
        for (const [slot, id] of Object.entries(patch.equipped)) if (id && own.has(id) && ITEM[id]?.slot === slot) (eq as any)[slot] = id;
        p.equipped = eq;
      }
      p.updatedAt = Date.now();
    });
  }
  async buyItem(tid: string, itemId: string) {
    store.tx((db) => {
      const p = this.needMe(db, tid);
      const t = db.tenants[tid];
      const cfg = normalizeCfg(t.cfg, t.template);
      if (!cfg.features.store || !cfg.features.coins) throw err("forbidden", "The store is turned off.");
      const it = ITEM[itemId];
      if (!it) throw err("not_found", "No such item.");
      const st = statsOf(p, db.t[tid].dq);
      const owned = (p.purchases || []).filter((x) => x.id === itemId).length;
      if (it.slot !== "power" && owned) throw err("conflict", "You already own this.");
      if (it.slot === "power" && st.streak.shieldsOwned >= (it.max || 1)) throw err("conflict", `You can hold ${it.max} at most.`);
      if (it.minLevel && st.level.level < it.minLevel) throw err("forbidden", `Unlocks at level ${it.minLevel}.`);
      if (st.coins < it.price) throw err("invalid", "Not enough coins yet.");
      p.purchases = [...(p.purchases || []), { id: itemId, at: Date.now() }];
      p.updatedAt = Date.now();
    });
  }

  /* ================= plays — scored here, like the server ================= */
  private currentRun(p: Player, g: Game): { key: string; run: Run | undefined; n: number } {
    let n = 1;
    while (p.runs?.[runKey(g.id, n + 1)]) n++;
    const key = runKey(g.id, n);
    return { key, run: p.runs?.[key], n };
  }
  async startRun(tid: string, gid: string) {
    return store.tx((db) => {
      const p = this.needMe(db, tid);
      const t = db.tenants[tid];
      const cfg = normalizeCfg(t.cfg, t.template);
      const g = db.t[tid].games[gid];
      if (!g || g.kind === "live") throw err("not_found", "Quiz not found.");
      if ((g.kind === "sprint" && !cfg.features.sprint) || (g.kind === "cert" && !cfg.features.cert)) throw err("forbidden", "This mode is turned off.");
      if (!isOpen(g)) throw err("closed", "This quiz isn't open.");
      if (!g.questions.length) throw err("invalid", "This quiz has no questions.");
      p.runs ||= {};
      const cur = this.currentRun(p, g);
      if (cur.run?.status === "playing") return structuredClone(cur.run);
      let n = cur.n;
      if (cur.run?.status === "done") {
        if (g.kind !== "cert") return structuredClone(cur.run);
        if (cur.run.passed) throw err("conflict", "You've already passed this exam.");
        if (n >= (g.cert?.attempts || 1)) throw err("closed", "No attempts left.");
        n++;
      }
      const run: Run = { gid, kind: g.kind, attempt: n, startedAt: Date.now(), status: "playing", ans: [], score: 0, correct: 0, total: g.questions.length, blur: 0 };
      p.runs[runKey(gid, n)] = run;
      p.updatedAt = Date.now();
      return structuredClone(run);
    });
  }
  async showQuestion(tid: string, gid: string, index: number) {
    return store.tx((db) => {
      const p = this.needMe(db, tid);
      const g = db.t[tid].games[gid];
      if (!g) throw err("not_found", "Quiz not found.");
      const { run } = this.currentRun(p, g);
      if (!run || run.status !== "playing") throw err("closed", "This play has finished.");
      if (index !== run.ans.length) throw err("invalid", "Out of order.");
      if (!run.qAt) run.qAt = Date.now();
      return structuredClone(run);
    });
  }
  async answer(tid: string, gid: string, index: number, choice: string | null, blur: number): Promise<AnswerResult> {
    return store.tx((db) => {
      const p = this.needMe(db, tid);
      const g = db.t[tid].games[gid];
      if (!g) throw err("not_found", "Quiz not found.");
      const { run } = this.currentRun(p, g);
      if (!run || run.status !== "playing") throw err("closed", "This play has finished.");
      if (index !== run.ans.length) throw err("invalid", "Already answered.");
      const q = g.questions[index];
      const canon = db.t[tid].keys[gid]?.answers[q.id];
      const now = Date.now();
      const qAt = run.qAt || now;
      const used = run.ans.reduce((s, a) => s + a.ms, 0);
      const left = limitMs(g) - used;
      let ms = now - qAt;
      let c = choice == null ? null : String(choice).slice(0, 40);
      if (ms > left + GRACE_MS) c = null; // too late: the quiz clock ran out
      ms = Math.max(0, Math.min(ms, Math.max(0, left)));
      const ok = isRight(canon, c);
      const pts = scoreAnswer(g, ok, ms);
      run.ans.push({ ok: ok ? 1 : 0, ms, c, pts });
      run.qAt = undefined;
      run.blur = Math.max(run.blur || 0, blur | 0);
      run.correct = run.ans.filter((a) => a.ok).length;
      p.updatedAt = now;
      const hide = g.kind === "cert";
      return { ok: hide ? null : ok, canon: hide ? null : canon ?? null, explain: hide ? undefined : q.explain, pts: hide ? 0 : pts, run: hide ? maskCertRun(structuredClone(run)) : structuredClone(run) };
    });
  }
  async finishRun(tid: string, gid: string) {
    return store.tx((db) => {
      const p = this.needMe(db, tid);
      const g = db.t[tid].games[gid];
      if (!g) throw err("not_found", "Quiz not found.");
      const { run } = this.currentRun(p, g);
      if (!run) throw err("not_found", "No play found.");
      if (run.status === "playing") {
        while (run.ans.length < g.questions.length) run.ans.push({ ok: 0, ms: 0, c: null, pts: 0, sk: 1 });
        run.status = "done";
        run.finishedAt = Date.now();
        run.qAt = undefined;
        run.correct = run.ans.filter((a) => a.ok).length;
        run.total = g.questions.length;
        run.score = g.kind === "cert" ? run.correct : runPoints(run).total;
        if (g.kind === "cert") run.passed = (run.correct / run.total) * 100 >= (g.cert?.passPct ?? 80);
        p.updatedAt = Date.now();
      }
      // the exam key (and right/wrong per question) only once the exam can't be retaken
      const final = g.kind === "cert" && certFinal(p, g);
      const key = final && g.cert?.showAnswers ? db.t[tid].keys[gid]?.answers : undefined;
      return { run: g.kind === "cert" && !final ? maskCertRun(structuredClone(run)) : structuredClone(run), key: key ? { ...key } : undefined };
    });
  }

  /* ================= tenant admin ================= */
  async saveQuiz(tid: string, d: QuizDraft) {
    store.tx((db) => {
      const role = this.req(db, tid, "editor");
      const s = db.t[tid];
      const t = db.tenants[tid];
      const cfg = normalizeCfg(t.cfg, t.template);
      const prev = s.games[d.game.id];
      const g: Game = { ...structuredClone(d.game), updatedAt: Date.now(), editedBy: this.actor(db), createdBy: prev?.createdBy || this.actor(db) };
      if (!["sprint", "live", "cert"].includes(g.kind)) throw err("invalid", "Unknown quiz type.");
      if (g.questions.length > 50) throw err("invalid", "50 questions at most.");
      for (const q of g.questions) if (!d.key.answers[q.id]) throw err("invalid", "Every question needs an answer.");
      if (g.kind === "live" && g.questions.some((q) => q.type !== "mcq" && q.type !== "tf")) throw err("invalid", "Live quizzes use multiple-choice and true/false questions.");
      for (const q of g.questions) {
        if (q.img === undefined) continue;
        if (!validImg(q.img)) throw err("invalid", "Question images must be PNG, JPEG, WebP or GIF and under about 250 KB.");
      }
      // the demo lives in localStorage (~5 MB per site): keep room for everything else
      const imgChars = Object.values(db.t).flatMap((x) => Object.values(x.games)).filter((x) => x.id !== g.id).flatMap((x) => x.questions).reduce((n, q) => n + (q.img?.length || 0), 0)
        + g.questions.reduce((n, q) => n + (q.img?.length || 0), 0);
      if (imgChars > 2_500_000) throw err("invalid", "The demo stores everything in this browser, which only has room for a few images. Remove an image, or reset the demo.");
      // maker-checker: editors can't publish directly; a change to a live quiz goes back to pending
      if (cfg.makerChecker && g.status === "live" && g.kind !== "live") {
        if (RANK[role] < RANK.admin || !prev || prev.status !== "live" || JSON.stringify(prev.questions) !== JSON.stringify(g.questions)) g.status = "pending";
        g.approvedBy = undefined;
      }
      s.games[g.id] = g;
      s.keys[g.id] = { gid: g.id, answers: { ...d.key.answers }, updatedAt: Date.now() };
      this.logT(db, tid, { action: prev ? "Quiz edited" : "Quiz created", target: g.title, detail: `${g.kind} · ${g.questions.length} questions · ${g.status}` });
    });
  }
  async setQuizStatus(tid: string, gid: string, status: Game["status"], approve?: boolean) {
    store.tx((db) => {
      const role = this.req(db, tid, "editor");
      const s = db.t[tid];
      const t = db.tenants[tid];
      const cfg = normalizeCfg(t.cfg, t.template);
      const g = s.games[gid];
      if (!g) throw err("not_found", "Quiz not found.");
      let next = status;
      if (status === "live" && cfg.makerChecker && g.kind !== "live") {
        if (!approve) next = "pending";
        else {
          if (RANK[role] < RANK.admin) throw err("forbidden", "Only an admin can approve.");
          if (g.editedBy === this.actor(db) && !this.isSuperUser(db)) throw err("forbidden", "A different admin must approve your own changes.");
          g.approvedBy = this.actor(db);
        }
      }
      g.status = next;
      g.updatedAt = Date.now();
      this.logT(db, tid, { action: approve ? "Quiz approved" : "Quiz status changed", target: g.title, detail: next });
    });
  }
  async deleteQuiz(tid: string, gid: string) {
    store.tx((db) => {
      this.req(db, tid, "editor");
      const s = db.t[tid];
      const g = s.games[gid];
      delete s.games[gid];
      delete s.keys[gid];
      this.logT(db, tid, { action: "Quiz deleted", target: g?.title || gid, sev: "warn" });
    });
  }
  async saveConfig(tid: string, cfg: OrgConfig) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      const t = db.tenants[tid];
      t.cfg = normalizeCfg(structuredClone(cfg), t.template);
      this.logT(db, tid, { action: "Settings changed", sev: "warn" });
    });
  }
  async saveBrand(tid: string, branding: Branding, labels: Labels) {
    if (branding.logo && branding.logo.length > 200_000) throw err("invalid", "Logo is too large (150 KB max).");
    if (branding.logo && !/^data:image\/(png|jpeg|svg\+xml|webp);/.test(branding.logo)) throw err("invalid", "Logo must be PNG, JPEG, SVG or WebP.");
    store.tx((db) => {
      this.req(db, tid, "admin");
      const t = db.tenants[tid];
      t.branding = { ...DEFAULT_BRANDING, ...branding, productName: cleanText(branding.productName, 40) || "Ant Arena" };
      t.labels = { ...LABELS[t.template], ...labels };
      this.logT(db, tid, { action: "Branding changed" });
    });
  }
  async adminPatchPlayer(tid: string, uid: string, patch: Partial<Pick<Player, "name" | "unit" | "unitType" | "empId" | "email" | "locked">>) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      const p = db.t[tid].players[uid];
      if (!p) throw err("not_found", "Player not found.");
      if (patch.empId != null) {
        const e = normEmpId(patch.empId);
        if (!validEmpId(e)) throw err("invalid", "Employee ID should be 3–12 letters or numbers.");
        if (Object.values(db.t[tid].players).some((x) => x.uid !== uid && x.empId === e)) throw err("conflict", "Another card already uses that ID.");
        p.empId = e;
      }
      if (patch.name != null) p.name = cleanName(patch.name);
      if (patch.unit != null) p.unit = patch.unit;
      if (patch.unitType != null) p.unitType = patch.unitType;
      if (patch.email !== undefined) p.email = patch.email ? patch.email.trim().toLowerCase() : undefined;
      if (patch.locked != null) {
        p.locked = patch.locked;
        if (patch.locked) p.authUid = undefined;
      }
      p.updatedAt = Date.now();
      this.logT(db, tid, { action: patch.locked === true ? "Player locked" : patch.locked === false ? "Player unlocked" : "Player edited", target: p.name, sev: patch.locked ? "warn" : "info" });
    });
  }
  async adminSignOutPlayer(tid: string, uid: string) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      const p = db.t[tid].players[uid];
      if (!p) throw err("not_found", "Player not found.");
      p.authUid = undefined;
      this.logT(db, tid, { action: "Player signed out of all devices", target: p.name, sev: "warn" });
    });
  }
  async adminDeletePlayer(tid: string, uid: string) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      const p = db.t[tid].players[uid];
      delete db.t[tid].players[uid];
      this.logT(db, tid, { action: "Player deleted", target: p?.name || uid, sev: "alert" });
    });
  }
  async adminResetRun(tid: string, uid: string, key: string) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      const p = db.t[tid].players[uid];
      if (!p?.runs?.[key]) throw err("not_found", "Play not found.");
      delete p.runs[key];
      this.logT(db, tid, { action: "Play reset", target: p.name, detail: key, sev: "warn" });
    });
  }
  async adminImportPlayers(tid: string, rows: RegisterInput[]) {
    return store.tx((db) => {
      this.req(db, tid, "admin");
      const s = db.t[tid];
      let added = 0,
        skipped = 0;
      const now = Date.now();
      for (const r of rows.slice(0, 5000)) {
        const empId = normEmpId(r.empId);
        const name = cleanName(r.name);
        if (!validEmpId(empId) || !validName(name) || Object.values(s.players).some((x) => x.empId === empId)) {
          skipped++;
          continue;
        }
        const uid = "p-" + randHex(8);
        s.players[uid] = { uid, empId, name, unitType: r.unitType === "dept" ? "dept" : "branch", unit: r.unit, look: randInt(16), email: r.email?.trim().toLowerCase() || undefined, consentAt: 0, createdAt: now, updatedAt: now, runs: {} };
        added++;
      }
      this.logT(db, tid, { action: "Players imported", detail: `${added} added, ${skipped} skipped` });
      return { added, skipped };
    });
  }
  async saveDQ(tid: string, dq: Disqualified) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      db.t[tid].dq = structuredClone(dq);
      this.logT(db, tid, { action: "Disqualifications updated", sev: "warn" });
    });
  }
  async saveRoster(tid: string, r: Roster | null) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      db.t[tid].roster = r ? structuredClone(r) : null;
      this.logT(db, tid, { action: r ? "Staff allowlist updated" : "Staff allowlist removed", detail: r ? `${r.hashes.length} IDs` : undefined, sev: "warn" });
    });
  }
  async saveGift(tid: string, g: Gift) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      db.t[tid].gifts[g.id] = { ...structuredClone(g), by: this.actor(db) };
      this.logT(db, tid, { action: "Gift recorded", target: g.label, detail: g.prize });
    });
  }
  async deleteGift(tid: string, id: string) {
    store.tx((db) => {
      this.req(db, tid, "admin");
      delete db.t[tid].gifts[id];
      this.logT(db, tid, { action: "Gift removed", detail: id, sev: "warn" });
    });
  }
  async purgeRuns(tid: string, before: number) {
    return store.tx((db) => {
      this.req(db, tid, "admin");
      let n = 0;
      for (const p of Object.values(db.t[tid].players))
        for (const [k, r] of Object.entries(p.runs || {}))
          if ((r.finishedAt || r.startedAt) < before) {
            delete p.runs![k];
            n++;
          }
      this.logT(db, tid, { action: "Old plays purged", detail: `${n} plays before ${new Date(before).toISOString().slice(0, 10)}`, sev: "warn" });
      return n;
    });
  }
  async audit(tid: string, e: Omit<AuditEntry, "id" | "at" | "actor">) {
    try {
      store.tx((db) => {
        this.req(db, tid, "viewer");
        this.logT(db, tid, { ...e, action: cleanText(e.action, 80), detail: e.detail ? cleanText(e.detail, 300) : undefined });
      });
    } catch {
      /* never block on logging */
    }
  }
  async inviteAdmin(tid: string, email: string, role: Role) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw err("invalid", "Enter a valid email.");
    store.tx((db) => {
      const mine = this.req(db, tid, "admin");
      if (role === "owner" && mine !== "owner") throw err("forbidden", "Only an owner can add owners.");
      const s = db.t[tid];
      if (s.members.some((m) => m.email === e)) throw err("conflict", "That email is already an admin.");
      s.members.push({ email: e, role, invitedAt: Date.now() });
      this.mail(db, e, `You've been invited as ${role} of ${db.tenants[tid].name}. Open #/t/${db.tenants[tid].slug}/admin and sign in with this email.`);
      this.logT(db, tid, { action: "Admin invited", target: e, detail: role, sev: "warn" });
    });
  }
  async setAdminRole(tid: string, email: string, role: Role) {
    store.tx((db) => {
      const mine = this.req(db, tid, "admin");
      const s = db.t[tid];
      const m = s.members.find((x) => x.email === email);
      if (!m) throw err("not_found", "Admin not found.");
      if ((role === "owner" || m.role === "owner") && mine !== "owner") throw err("forbidden", "Only an owner can change owners.");
      if (m.role === "owner" && role !== "owner" && s.members.filter((x) => x.role === "owner").length < 2) throw err("invalid", "Keep at least one owner.");
      m.role = role;
      this.logT(db, tid, { action: "Admin role changed", target: email, detail: role, sev: "warn" });
    });
  }
  async removeAdmin(tid: string, email: string) {
    store.tx((db) => {
      const mine = this.req(db, tid, "admin");
      const s = db.t[tid];
      const m = s.members.find((x) => x.email === email);
      if (!m) return;
      if (m.role === "owner" && mine !== "owner") throw err("forbidden", "Only an owner can remove an owner.");
      if (m.role === "owner" && s.members.filter((x) => x.role === "owner").length < 2) throw err("invalid", "Keep at least one owner.");
      s.members = s.members.filter((x) => x.email !== email);
      this.logT(db, tid, { action: "Admin removed", target: email, sev: "alert" });
    });
  }
  async library() {
    return structuredClone(store.read().library);
  }
  async importLibrary(tid: string, ids: string[]) {
    return store.tx((db) => {
      this.req(db, tid, "editor");
      let n = 0;
      for (const it of db.library.filter((x) => ids.includes(x.id))) {
        const gid = newId("g");
        const now = Date.now();
        db.t[tid].games[gid] = { id: gid, kind: "sprint", title: it.title, desc: "", minutes: Math.min(10, Math.max(1, Math.ceil(it.questions.length * 0.5))), color: "lime", status: "draft", questions: structuredClone(it.questions), createdAt: now, updatedAt: now, createdBy: this.actor(db) };
        db.t[tid].keys[gid] = { gid, answers: { ...it.answers }, updatedAt: now };
        n++;
      }
      this.logT(db, tid, { action: "Starter quizzes copied", detail: `${n} quizzes` });
      return n;
    });
  }
  download(filename: string, text: string, mime = "text/csv") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ================= live quiz ================= */
  private pubLive(l: DB["live"][string]): LiveSession {
    // _qs holds every question with its explanation — never send it to anyone
    const { canon: _c, lastRevealQ: _r, _qs: _q, ...rest } = l as typeof l & { _qs?: unknown };
    return { ...structuredClone(rest), players: Object.keys(store.read().lp[l.id] || {}).length };
  }
  async liveCreate(tid: string, gid: string, opts: { guests: boolean }) {
    return store.tx((db) => {
      this.req(db, tid, "host");
      const t = db.tenants[tid];
      const cfg = normalizeCfg(t.cfg, t.template);
      if (!cfg.features.live) throw err("forbidden", "Live quiz is turned off for this company.");
      const g = db.t[tid].games[gid];
      if (!g) throw err("not_found", "Quiz not found.");
      const qs = g.questions.filter((q) => q.type === "mcq" || q.type === "tf");
      if (!qs.length) throw err("invalid", "Live games need multiple-choice or true/false questions.");
      let pin = "";
      const used = new Set(Object.values(db.live).filter((l) => l.state !== "ended").map((l) => l.pin));
      do pin = String(100000 + randInt(900000));
      while (used.has(pin));
      const key = db.t[tid].keys[gid]?.answers || {};
      const id = newId("ls");
      const s: DB["live"][string] = {
        id, tenantId: tid, gid, title: g.title, pin, state: "lobby", qIndex: -1, qStartedAt: 0, qSeconds: LIVE.defaultSeconds, total: qs.length,
        hostId: this.sess!.userId, createdAt: Date.now(), guests: !!opts.guests && cfg.signIn.liveGuests,
        canon: qs.map((q) => key[q.id]),
      };
      (s as any)._qs = qs;
      db.live[id] = s;
      db.lp[id] = {};
      db.la[id] = [];
      this.logT(db, tid, { action: "Live game started", target: g.title, detail: "PIN " + pin });
      return this.pubLive(s);
    });
  }
  private liveQs(db: DB, s: DB["live"][string]) {
    const own = (s as any)._qs as Game["questions"] | undefined;
    if (own) return own;
    return (db.t[s.tenantId].games[s.gid]?.questions || []).filter((q) => q.type === "mcq" || q.type === "tf");
  }
  private settle(db: DB, s: DB["live"][string]) {
    // players who didn't answer the question that just closed lose their streak
    if (s.lastRevealQ === s.qIndex) return;
    s.lastRevealQ = s.qIndex;
    for (const lp of Object.values(db.lp[s.id] || {}))
      if (lp.answeredQ !== s.qIndex) {
        lp.streak = 0;
        lp.lastPts = 0;
        lp.lastOk = false;
      }
  }
  async liveControl(sid: string, action: "start" | "reveal" | "board" | "next" | "end" | "kick", arg?: string) {
    store.tx((db) => {
      const s = db.live[sid];
      if (!s) throw err("not_found", "Game not found.");
      this.req(db, s.tenantId, "host");
      const qs = this.liveQs(db, s);
      const open = (i: number) => {
        const q = qs[i];
        const { explain: _e, ...pub } = q;
        s.qIndex = i;
        s.state = "question";
        s.qStartedAt = Date.now();
        s.qSeconds = Math.max(5, Math.min(120, q.seconds || LIVE.defaultSeconds));
        s.question = pub;
        s.reveal = undefined;
      };
      if (action === "start") {
        if (s.state !== "lobby") return;
        open(0);
      } else if (action === "reveal") {
        if (s.state !== "question") return;
        const q = qs[s.qIndex];
        const n = q.type === "tf" ? 2 : (q.options || []).length;
        const counts = Array.from({ length: n }, () => 0);
        for (const a of db.la[sid]) if (a.qIndex === s.qIndex) {
          const i = q.type === "tf" ? (a.c === "T" ? 0 : 1) : Number(a.c);
          if (counts[i] != null) counts[i]++;
        }
        this.settle(db, s);
        s.state = "reveal";
        s.reveal = { canon: s.canon?.[s.qIndex] || "", counts, explain: q.explain };
      } else if (action === "board") {
        if (s.state === "question") this.settle(db, s);
        s.state = "board";
      } else if (action === "next") {
        if (s.qIndex + 1 >= qs.length) {
          s.state = "ended";
          s.endedAt = Date.now();
          s.question = undefined;
        } else open(s.qIndex + 1);
      } else if (action === "end") {
        s.state = "ended";
        s.endedAt = Date.now();
        s.question = undefined;
        this.logT(db, s.tenantId, { action: "Live game ended", target: s.title, detail: `${Object.keys(db.lp[sid] || {}).length} players` });
      } else if (action === "kick" && arg) {
        delete db.lp[sid][arg];
      }
    });
  }
  private liveBoard(db: DB, sid: string): LiveBoardRow[] {
    return Object.values(db.lp[sid] || {})
      .map((p) => ({ id: p.id, nick: p.nick, look: p.look, score: p.score, streak: p.streak, lastPts: p.lastPts || 0, lastOk: !!p.lastOk, joinedAt: p.joinedAt }))
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
      .map(({ joinedAt: _j, ...r }) => r);
  }
  watchLiveHost(sid: string, cb: (v: LiveHostView) => void): Unsub {
    const run = () => {
      const db = store.read();
      const s = db.live[sid];
      if (!s) return;
      try {
        this.req(db, s.tenantId, "host");
      } catch {
        return;
      }
      const qs = this.liveQs(db, s);
      const q = qs[s.qIndex];
      const n = q ? (q.type === "tf" ? 2 : (q.options || []).length) : 0;
      const counts = Array.from({ length: n }, () => 0);
      let answered = 0;
      for (const a of db.la[sid] || []) if (a.qIndex === s.qIndex) {
        answered++;
        const i = q?.type === "tf" ? (a.c === "T" ? 0 : 1) : Number(a.c);
        if (counts[i] != null) counts[i]++;
      }
      cb({ session: this.pubLive(s), players: this.liveBoard(db, sid), answered, counts });
    };
    setTimeout(run, 0);
    return store.subscribe(run);
  }
  async liveFind(pin: string) {
    if (!PIN_RE.test(pin.trim())) return null;
    const rl = this.rate("pin:" + (this.sess?.userId || "anon"), 10);
    const db = store.read();
    const s = Object.values(db.live).find((l) => l.pin === pin.trim() && l.state !== "ended");
    if (!s) {
      rl.fail();
      return null;
    }
    rl.ok();
    return { sessionId: s.id, tenantId: s.tenantId, slug: db.tenants[s.tenantId].slug, title: s.title, guests: s.guests };
  }
  async liveJoin(sid: string, nick?: string) {
    const u = this.need();
    return store.tx((db) => {
      const s = db.live[sid];
      if (!s || s.state === "ended") throw err("closed", "This game has ended.");
      const lps = (db.lp[sid] ||= {});
      const existing = Object.values(lps).find((x) => x.auth === u.id);
      if (existing) return { livePlayerId: existing.id };
      if (Object.keys(lps).length >= 1000) throw err("closed", "This game is full.");
      const card = this.me(db, s.tenantId);
      let name: string, look: number;
      if (card && !card.locked) {
        const parts = card.name.split(/\s+/);
        name = parts[0] + (parts.length > 1 ? " " + parts[parts.length - 1][0] + "." : "");
        look = card.look;
      } else {
        if (!s.guests) throw err("auth", "Sign in with your player card to join this game.");
        const n = cleanName(nick || "");
        if (n.length < 2 || n.length > 16) throw err("invalid", "Pick a nickname of 2–16 characters.");
        name = n;
        look = randInt(16);
      }
      let nickFinal = name;
      let k = 2;
      while (Object.values(lps).some((x) => x.nick.toLowerCase() === nickFinal.toLowerCase())) nickFinal = `${name} ${k++}`;
      const id = newId("lp");
      lps[id] = { id, sessionId: sid, playerId: card?.uid, nick: nickFinal, look, score: 0, streak: 0, joinedAt: Date.now(), auth: u.id };
      return { livePlayerId: id };
    });
  }
  watchLivePlayer(sid: string, lpid: string, cb: Parameters<Api["watchLivePlayer"]>[2]): Unsub {
    const run = () => {
      const db = store.read();
      const s = db.live[sid];
      if (!s) return;
      const lp = db.lp[sid]?.[lpid];
      if (lp && lp.auth !== this.sess?.userId) return; // only your own view
      const answered = !!lp && lp.answeredQ === s.qIndex;
      const revealed = s.state === "reveal" || s.state === "board" || s.state === "ended";
      // before the reveal, rank and streak must not give away whether the answer was right
      const hide = !revealed && answered && lp;
      let board = this.liveBoard(db, sid);
      if (hide) board = board.map((r) => (r.id === lpid ? { ...r, score: r.score - (lp.lastPts || 0) } : r)).sort((x, y) => y.score - x.score);
      const rank = lp ? board.findIndex((r) => r.id === lpid) + 1 : 0;
      const pub = this.pubLive(s);
      const me: LivePlayer | null = lp
        ? { id: lp.id, sessionId: sid, playerId: lp.playerId, nick: lp.nick, look: lp.look, score: revealed ? lp.score : lp.score - (answered ? lp.lastPts || 0 : 0), streak: hide ? lp.prevStreak ?? 0 : lp.streak, joinedAt: lp.joinedAt, lastPts: revealed ? lp.lastPts : undefined, lastOk: revealed ? lp.lastOk : undefined }
        : null;
      const above = revealed && rank > 1 ? board[rank - 2] : null;
      cb({ session: pub, me, rank, count: board.length, answered, lastOk: revealed && lp ? !!lp.lastOk : null, ahead: above ? { nick: above.nick, score: above.score } : null });
    };
    setTimeout(run, 0);
    return store.subscribe(run);
  }
  async liveAnswer(sid: string, lpid: string, qIndex: number, choice: string) {
    const u = this.need();
    store.tx((db) => {
      const s = db.live[sid];
      if (!s || s.state !== "question" || s.qIndex !== qIndex) throw err("closed", "Too late — this question has closed.");
      const lp = db.lp[sid]?.[lpid];
      if (!lp || lp.auth !== u.id) throw err("forbidden", "Not your player.");
      if (lp.answeredQ === qIndex) throw err("conflict", "Already answered.");
      const ms = Date.now() - s.qStartedAt;
      if (ms > s.qSeconds * 1000 + GRACE_MS) throw err("closed", "Time's up.");
      const q = this.liveQs(db, s)[qIndex];
      const c = String(choice).slice(0, 4);
      if (q.type === "tf" ? !["T", "F"].includes(c) : !(Number(c) >= 0 && Number(c) < (q.options || []).length)) throw err("invalid", "Pick an answer.");
      const ok = isRight(s.canon?.[qIndex], c);
      const pts = livePoints(ok, Math.min(ms, s.qSeconds * 1000), s.qSeconds * 1000, lp.streak);
      lp.answeredQ = qIndex;
      lp.prevStreak = lp.streak;
      lp.streak = ok ? lp.streak + 1 : 0;
      lp.score += pts;
      lp.lastPts = pts;
      lp.lastOk = ok;
      db.la[sid].push({ sessionId: sid, livePlayerId: lpid, qIndex, c, ms, ok, pts });
    });
  }

  /* ================= polls ================= */
  async savePoll(tid: string, poll: Poll) {
    store.tx((db) => {
      this.req(db, tid, "editor");
      const t = db.tenants[tid];
      if (!normalizeCfg(t.cfg, t.template).features.polls) throw err("forbidden", "Polls are turned off for this company.");
      const prev = db.polls[poll.id];
      if (prev && prev.tenantId !== tid) throw err("forbidden", "Not your poll.");
      if (poll.slides.length > 30) throw err("invalid", "30 slides at most.");
      let code = prev?.code || poll.code;
      const used = new Set(Object.values(db.polls).filter((p) => p.id !== poll.id).map((p) => p.code));
      if (!PIN_RE.test(code || "") || used.has(code)) {
        do code = String(100000 + randInt(900000));
        while (used.has(code));
      }
      db.polls[poll.id] = { ...structuredClone(poll), tenantId: tid, code, updatedAt: Date.now(), createdAt: prev?.createdAt || Date.now(), createdBy: prev?.createdBy || this.actor(db) };
      db.resp[poll.id] ||= [];
      if (!prev) this.logT(db, tid, { action: "Poll created", target: poll.title });
    });
  }
  async deletePoll(tid: string, id: string) {
    store.tx((db) => {
      this.req(db, tid, "editor");
      const p = db.polls[id];
      if (!p || p.tenantId !== tid) return;
      delete db.polls[id];
      delete db.resp[id];
      this.logT(db, tid, { action: "Poll deleted", target: p.title, sev: "warn" });
    });
  }
  async pollControl(pollId: string, patch: Partial<Pick<Poll, "current" | "status" | "showResults" | "locked">>) {
    store.tx((db) => {
      const p = db.polls[pollId];
      if (!p) throw err("not_found", "Poll not found.");
      this.req(db, p.tenantId, "host");
      if (patch.current != null) {
        p.current = Math.max(0, Math.min(p.slides.length - 1, patch.current | 0));
        p.locked = false;
      }
      if (patch.status) p.status = patch.status;
      if (patch.showResults != null) p.showResults = patch.showResults;
      if (patch.locked != null) p.locked = patch.locked;
      p.updatedAt = Date.now();
    });
  }
  async pollFind(code: string) {
    const c = code.replace(/\s/g, "");
    if (!PIN_RE.test(c)) return null;
    const rl = this.rate("poll:" + (this.sess?.userId || "anon"), 10);
    const p = Object.values(store.read().polls).find((x) => x.code === c && x.status === "open");
    if (!p) {
      rl.fail();
      return null;
    }
    rl.ok();
    return { pollId: p.id, title: p.title, slug: store.read().tenants[p.tenantId]?.slug || "" };
  }
  private canHost(db: DB, p: Poll) {
    try {
      this.req(db, p.tenantId, "host");
      return true;
    } catch {
      return false;
    }
  }
  watchPoll(pollId: string, cb: (p: Poll) => void): Unsub {
    const run = () => {
      const db = store.read();
      const p = db.polls[pollId];
      if (!p) return;
      if (p.status !== "open" && !this.canHost(db, p)) return cb({ ...structuredClone(p), slides: [] });
      cb(structuredClone(p));
    };
    setTimeout(run, 0);
    return store.subscribe(run);
  }
  watchPollResults(pollId: string, slideId: string, cb: (r: SlideResults) => void): Unsub {
    const run = () => {
      const db = store.read();
      const p = db.polls[pollId];
      const sl = p?.slides.find((s) => s.id === slideId);
      if (!p || !sl) return;
      const host = this.canHost(db, p);
      if (!host && !(p.status === "open" && (p.showResults || sl.type === "qa"))) return;
      const r = aggregate(sl, db.resp[pollId] || []);
      if (!host && r.texts) r.texts = r.texts.map(({ who: _w, ...x }) => ({ ...x, who: "", voters: undefined }) as PollResponse);
      cb(r);
    };
    setTimeout(run, 0);
    return store.subscribe(run);
  }
  async pollRespond(pollId: string, slideId: string, value: PollValue) {
    const u = this.need();
    store.tx((db) => {
      const p = db.polls[pollId];
      if (!p || p.status !== "open") throw err("closed", "This poll is closed.");
      const sl = p.slides[p.current];
      if (!sl || sl.id !== slideId) throw err("closed", "The presenter has moved on.");
      if (p.locked) throw err("closed", "Voting is closed for this question.");
      const bad = pollValueProblem(sl, value);
      if (bad) throw err("invalid", bad);
      const list = (db.resp[pollId] ||= []);
      const clean: PollValue =
        "text" in value ? { text: cleanText((value as { text: string }).text, 280) } : "words" in value ? { words: (value as { words: string[] }).words.map((w) => cleanText(w, 25)) } : structuredClone(value);
      if (sl.type === "qa") {
        if (list.filter((r) => r.slideId === slideId && r.who === u.id).length >= 5) throw err("rate_limited", "You've asked 5 questions already.");
        list.push({ id: newId("r"), pollId, slideId, who: u.id, value: clean, at: Date.now(), votes: 0 });
      } else {
        const i = list.findIndex((r) => r.slideId === slideId && r.who === u.id);
        const r: PollResponse = { id: i >= 0 ? list[i].id : newId("r"), pollId, slideId, who: u.id, value: clean, at: Date.now() };
        if (i >= 0) list[i] = r;
        else list.push(r);
      }
      if (list.length > 20000) throw err("closed", "This poll has reached its response limit.");
    });
  }
  async pollMyResponses(pollId: string) {
    const uid = this.sess?.userId;
    const out: Record<string, PollValue> = {};
    for (const r of store.read().resp[pollId] || []) if (r.who === uid && r.value && !("text" in r.value && r.slideId && this.slideType(pollId, r.slideId) === "qa")) out[r.slideId] = r.value;
    return out;
  }
  private slideType(pollId: string, slideId: string) {
    return store.read().polls[pollId]?.slides.find((s) => s.id === slideId)?.type;
  }
  async qaVote(pollId: string, responseId: string) {
    const u = this.need();
    store.tx((db) => {
      const p = db.polls[pollId];
      if (!p || p.status !== "open") throw err("closed", "This poll is closed.");
      const r = db.resp[pollId]?.find((x) => x.id === responseId);
      if (!r) throw err("not_found", "Question not found.");
      r.voters ||= [];
      if (r.voters.includes(u.id)) {
        r.voters = r.voters.filter((v) => v !== u.id);
        r.votes = Math.max(0, (r.votes || 0) - 1);
      } else {
        r.voters.push(u.id);
        r.votes = (r.votes || 0) + 1;
      }
    });
  }
  async qaModerate(pollId: string, responseId: string, patch: Partial<Pick<PollResponse, "hidden" | "answered">>) {
    store.tx((db) => {
      const p = db.polls[pollId];
      if (!p) throw err("not_found", "Poll not found.");
      this.req(db, p.tenantId, "host");
      const r = db.resp[pollId]?.find((x) => x.id === responseId);
      if (!r) return;
      if (patch.hidden != null) r.hidden = patch.hidden;
      if (patch.answered != null) r.answered = patch.answered;
    });
  }

  /* ================= super admin ================= */
  async superStatus() {
    const db = store.read();
    const u = this.sess && db.users[this.sess.userId];
    const isSuperUser = !!u?.email && db.sup.emails.includes(u.email);
    return { isSuperUser, unlockedUntil: isSuperUser ? db.sup.unlocked[u!.id] || 0 : 0, codeIsDefault: db.sup.code.isDefault };
  }
  async superUnlock(code: string) {
    const u = this.need();
    const db0 = store.read();
    if (!u.email || !db0.sup.emails.includes(u.email) || u.anonymous) throw err("forbidden", "This account isn't a super admin.");
    const f = db0.sup.fails[u.id];
    if (f && f.until > Date.now()) throw err("rate_limited", `Too many wrong codes. Try again in ${Math.ceil((f.until - Date.now()) / 60000)} min.`, f.until - Date.now());
    const c = db0.sup.code;
    const ok = safeEqual(await pbkdf2(code, c.salt, c.iter), c.hash);
    if (!ok) {
      // record the failure first (tx only persists when its callback returns), then throw
      const cur = store.tx((db) => {
        const c2 = db.sup.fails[u.id] || { n: 0, until: 0 };
        c2.n++;
        if (c2.n >= 5) c2.until = Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** (c2.n - 5));
        db.sup.fails[u.id] = c2;
        this.logS(db, { action: "Wrong super admin code", detail: `attempt ${c2.n}`, sev: c2.n >= 5 ? "alert" : "warn" });
        return { ...c2 };
      });
      const locked = cur.until > Date.now();
      throw err(locked ? "rate_limited" : "auth", locked ? "Too many wrong codes. Locked for a while." : `That code isn't right. ${Math.max(0, 5 - cur.n)} tries left.`, locked ? cur.until - Date.now() : undefined);
    }
    return store.tx((db) => {
      delete db.sup.fails[u.id];
      const until = Date.now() + 30 * 60_000;
      db.sup.unlocked[u.id] = until;
      this.logS(db, { action: "Super admin unlocked" });
      return { until };
    });
  }
  async superLock() {
    const id = this.sess?.userId;
    if (id) store.tx((db) => void delete db.sup.unlocked[id]);
  }
  private needSuper(db: DB) {
    if (!this.isSuper(db)) throw err("forbidden", "Unlock the super admin console first.");
  }
  async superChangeCode(oldCode: string, newCode: string) {
    const db0 = store.read();
    this.needSuper(db0);
    const c = db0.sup.code;
    if (!safeEqual(await pbkdf2(oldCode, c.salt, c.iter), c.hash)) throw err("auth", "The current code isn't right.");
    if (newCode.length < 8 || !/[A-Za-z]/.test(newCode) || !/\d/.test(newCode)) throw err("invalid", "Use 8+ characters with letters and numbers.");
    if (newCode.toLowerCase() === "sandeepa") throw err("invalid", "Pick something other than the starting code.");
    const salt = randHex(16);
    const hash = await pbkdf2(newCode, salt, PBKDF2_ITER);
    store.tx((db) => {
      db.sup.code = { salt, hash, iter: PBKDF2_ITER, isDefault: false };
      this.logS(db, { action: "Super admin code changed", sev: "warn" });
    });
  }
  private usage(db: DB, tid: string): TenantUsage {
    const s = db.t[tid];
    const since = Date.now() - 30 * DAY;
    let runs30 = 0,
      last = 0;
    const active = new Set<string>();
    for (const p of Object.values(s.players))
      for (const r of Object.values(p.runs || {})) {
        const at = r.finishedAt || r.startedAt;
        last = Math.max(last, at);
        if (at >= since) {
          runs30++;
          active.add(p.uid);
        }
      }
    return {
      players: Object.keys(s.players).length, activePlayers30: active.size, runs30, quizzes: Object.keys(s.games).length,
      liveSessions30: Object.values(db.live).filter((l) => l.tenantId === tid && l.createdAt >= since).length,
      polls: Object.values(db.polls).filter((p) => p.tenantId === tid).length, admins: s.members.length, lastActive: last,
    };
  }
  async superTenants() {
    const db = store.read();
    this.needSuper(db);
    return Object.values(db.tenants).map((t) => ({ ...structuredClone(t), cfg: normalizeCfg(t.cfg, t.template), usage: this.usage(db, t.id) })).sort((a, b) => b.createdAt - a.createdAt);
  }
  async superCreateTenant(input: NewTenantInput) {
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) throw err("invalid", "Use 3–32 lowercase letters, numbers or dashes for the web address.");
    if (["super", "join", "vote", "admin", "api", "www", "app"].includes(slug)) throw err("invalid", "That address is reserved.");
    const email = input.ownerEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err("invalid", "Enter the owner's email.");
    const name = cleanText(input.name, 80);
    if (name.length < 2) throw err("invalid", "Enter the company name.");
    return store.tx((db) => {
      this.needSuper(db);
      if (Object.values(db.tenants).some((t) => t.slug === slug)) throw err("conflict", "That web address is taken.");
      const id = "t-" + randHex(6);
      const t: Tenant = {
        id, slug, name, status: "active", template: input.template, branding: { ...DEFAULT_BRANDING, ...(input.branding || {}) }, labels: LABELS[input.template],
        cfg: defaultCfg(input.template), createdAt: Date.now(),
      };
      db.tenants[id] = t;
      db.t[id] = { games: {}, keys: {}, players: {}, gifts: {}, dq: { runs: {} }, roster: null, audit: [], members: [{ email, role: "owner", invitedAt: Date.now() }] };
      if (input.starter) {
        const now = Date.now();
        for (const it of db.library.filter((x) => x.industry === "any" || (input.template === "bank" && x.industry === "bank"))) {
          const gid = newId("g");
          db.t[id].games[gid] = { id: gid, kind: "sprint", title: it.title, desc: "", minutes: 3, color: "lime", status: "draft", questions: structuredClone(it.questions), createdAt: now, updatedAt: now };
          db.t[id].keys[gid] = { gid, answers: { ...it.answers }, updatedAt: now };
        }
      }
      this.mail(db, email, `You're the owner of ${name} on Ant Arena. Open #/t/${slug}/admin and sign in with this email.`);
      this.logS(db, { action: "Company created", target: name, detail: `${slug} · owner ${email}` });
      this.logT(db, id, { action: "Company created", detail: `owner ${email}` });
      return structuredClone(t);
    });
  }
  async superUpdateTenant(id: string, patch: Partial<Pick<Tenant, "name" | "slug" | "status" | "template" | "branding" | "labels" | "cfg">>) {
    store.tx((db) => {
      this.needSuper(db);
      const t = this.tenant(db, id);
      if (patch.slug && patch.slug !== t.slug) {
        if (!SLUG_RE.test(patch.slug)) throw err("invalid", "Invalid web address.");
        if (Object.values(db.tenants).some((x) => x.slug === patch.slug)) throw err("conflict", "That web address is taken.");
      }
      Object.assign(t, structuredClone(patch));
      if (patch.cfg) t.cfg = normalizeCfg(t.cfg, t.template);
      this.logS(db, { action: patch.status ? `Company ${patch.status}` : "Company updated", target: t.name, sev: patch.status === "suspended" ? "warn" : "info" });
    });
  }
  async superDeleteTenant(id: string, confirmSlug: string) {
    store.tx((db) => {
      this.needSuper(db);
      const t = this.tenant(db, id);
      if (confirmSlug !== t.slug) throw err("invalid", "Type the web address exactly to confirm.");
      delete db.tenants[id];
      delete db.t[id];
      for (const [pid, p] of Object.entries(db.polls)) if (p.tenantId === id) {
        delete db.polls[pid];
        delete db.resp[pid];
      }
      for (const [sid, s] of Object.entries(db.live)) if (s.tenantId === id) {
        delete db.live[sid];
        delete db.lp[sid];
        delete db.la[sid];
      }
      this.logS(db, { action: "Company deleted", target: t.name, detail: t.slug, sev: "alert" });
    });
  }
  async superAdmins(tid: string) {
    const db = store.read();
    this.needSuper(db);
    return structuredClone(db.t[tid]?.members || []);
  }
  async superInvite(tid: string, email: string, role: Role) {
    await this.inviteAdmin(tid, email, role);
    store.tx((db) => this.logS(db, { action: "Admin invited", target: email, detail: `${db.tenants[tid]?.name} · ${role}` }));
  }
  async superAudit() {
    const db = store.read();
    this.needSuper(db);
    return structuredClone(db.sup.audit);
  }
  async superSaveLibrary(items: LibraryItem[]) {
    store.tx((db) => {
      this.needSuper(db);
      db.library = structuredClone(items);
      this.logS(db, { action: "Starter library updated", detail: `${items.length} sets` });
    });
  }
}

