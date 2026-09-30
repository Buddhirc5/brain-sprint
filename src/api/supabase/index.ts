/* =====================================================================
   SupabaseApi — production backend: Postgres (RLS + SECURITY DEFINER
   functions) + Supabase Auth + Realtime. Every rule is enforced in the
   database (supabase/migrations); this class only calls functions and
   keeps screens fresh. See supabase/README.md.
   ===================================================================== */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  ApiError,
  type Access, type Api, type AnswerResult, type AuthUser, type LookupCard, type MfaState, type NewTenantInput,
  type QuizDraft, type RegisterInput, type TenantData, type Unsub,
} from "../Api";
import type {
  AdminMember, AuditEntry, Branding, Disqualified, Equipped, Game, Gift, Labels, LibraryItem, LiveHostView,
  LiveSession, OrgConfig, Player, Poll, PollResponse, PollValue, Role, Roster, Run, SlideResults, Slide, Tenant, TenantPublic,
  TenantUsage, UnitType,
} from "../../types";
import { aggregate } from "../engine";
import { authError, fromPayload, isErrPayload, toApiError } from "./errors";
import { watch, type Binding, type Watcher } from "./watch";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** payload types come from the Api contract, so they follow it (e.g. `ahead`, poll `slug`) */
type LivePlayerPayload = Parameters<Parameters<Api["watchLivePlayer"]>[2]>[0];
type PollFound = NonNullable<Awaited<ReturnType<Api["pollFind"]>>>;

export async function createSupabaseApi(url: string, anonKey: string): Promise<Api> {
  const sb = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // PKCE: magic links / OAuth come back as ?code=… which leaves the #/hash route alone
      flowType: "pkce",
    },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const { data } = await sb.auth.getSession(); // also completes a ?code= sign-in redirect
  cleanAuthParams();
  return new SupabaseApi(sb, data.session);
}

/** Remove ?code=… / #error=… left by an auth redirect, keeping the #/route. */
function cleanAuthParams() {
  try {
    const u = new URL(window.location.href);
    let dirty = false;
    for (const k of ["code", "error", "error_code", "error_description"])
      if (u.searchParams.has(k)) {
        u.searchParams.delete(k);
        dirty = true;
      }
    if (/^#(access_token|error)=/.test(u.hash)) {
      u.hash = "";
      dirty = true;
    }
    if (dirty) window.history.replaceState(window.history.state, "", u.toString());
  } catch {
    /* not in a browser */
  }
}

/** GoTrue returns the TOTP QR as "data:image/svg+xml;utf-8,<svg…>" — re-encode so <img src> always works. */
function qrToDataUrl(qr: string): string {
  const i = qr.indexOf("<svg");
  if (i < 0) return qr;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr.slice(i));
}

class SupabaseApi implements Api {
  readonly mode = "supabase" as const;
  private session: Session | null;
  private authCbs = new Set<(u: AuthUser | null) => void>();
  private tenantWatchers = new Map<string, Set<Watcher>>();
  /** server clock − client clock (ms), learned from live views; used to fix countdowns on skewed devices */
  private skew = 0;

  constructor(private sb: SupabaseClient, session: Session | null) {
    this.session = session;
    sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") markRecovery(); // opened a "reset your password" email: ask for a new one
      const before = this.session?.user.id ?? null;
      this.session = s;
      const u = this.user();
      // defer: never await supabase calls inside this callback (supabase-js deadlock)
      setTimeout(() => {
        this.authCbs.forEach((f) => f(u));
        if ((s?.user.id ?? null) !== before || event === "MFA_CHALLENGE_VERIFIED") this.refreshAll();
      }, 0);
    });
  }

  /* ================= helpers ================= */
  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    let res;
    try {
      res = await this.sb.rpc(fn, args);
    } catch (e) {
      throw toApiError(e);
    }
    if (res.error) throw toApiError(res.error);
    if (isErrPayload(res.data)) throw fromPayload(res.data);
    return res.data as T;
  }
  private needSession(): Session {
    if (!this.session) throw new ApiError("auth", "Please sign in.");
    return this.session;
  }
  private refreshAll() {
    this.tenantWatchers.forEach((set) => set.forEach((w) => w.kick()));
  }
  private learnSkew(serverNow: unknown, sentAt: number) {
    if (typeof serverNow !== "number") return;
    const mid = (sentAt + Date.now()) / 2;
    const s = serverNow - mid;
    this.skew = this.skew === 0 ? s : this.skew * 0.7 + s * 0.3;
  }
  /** live sessions carry server times; shift them onto this device's clock */
  private localLive(s: LiveSession): LiveSession {
    const k = Math.round(this.skew);
    return k && s.qStartedAt ? { ...s, qStartedAt: s.qStartedAt - k } : s;
  }

  /* ================= auth ================= */
  user(): AuthUser | null {
    const u = this.session?.user;
    return u ? { id: u.id, email: u.email || undefined, anonymous: !!u.is_anonymous } : null;
  }
  onAuth(cb: (u: AuthUser | null) => void): Unsub {
    this.authCbs.add(cb);
    return () => {
      this.authCbs.delete(cb);
    };
  }
  async signInPassword(email: string, password: string) {
    const e = email.trim().toLowerCase();
    const { error } = await this.sb.auth.signInWithPassword({ email: e, password });
    if (error) {
      const ae = authError(error);
      // the demo accounts (…@demo.app, …@x.demo) only exist inside the in-browser demo
      if (ae.code === "auth" && /@(demo\.app|[a-z0-9-]+\.demo)$/.test(e))
        throw new ApiError("auth", "That's a demo account — it only works inside the demo. Open the demo from \"Try it free\", or sign in with your real email.");
      throw ae;
    }
  }
  async signUpPassword(email: string, password: string) {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new ApiError("invalid", "Enter a valid email.");
    if (password.length < 10) throw new ApiError("invalid", "Use at least 10 characters.");
    const { data, error } = await this.sb.auth.signUp({ email: e, password, options: { emailRedirectTo: window.location.href } });
    if (error) throw authError(error);
    // with email confirmation on (recommended) there is no session until the link is clicked
    return { needsConfirm: !data.session };
  }
  async sendMagicLink(email: string, redirectTo: string) {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new ApiError("invalid", "Enter a valid email.");
    const { error } = await this.sb.auth.signInWithOtp({ email: e, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) throw authError(error);
  }
  async sendEmailCode(email: string) {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new ApiError("invalid", "Enter a valid email.");
    const { error } = await this.sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    if (error) throw authError(error);
  }
  async verifyEmailCode(email: string, code: string) {
    const { error } = await this.sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\s/g, ""), type: "email" });
    if (error) throw authError(error);
  }
  async signInMicrosoft(redirectTo: string) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo } });
    if (error) throw authError(error);
  }
  async signInAnonymous() {
    if (this.session) return;
    const { error } = await this.sb.auth.signInAnonymously();
    if (error) throw authError(error);
  }
  async resetPassword(email: string, redirectTo: string) {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new ApiError("invalid", "Enter a valid email.");
    const { error } = await this.sb.auth.resetPasswordForEmail(e, { redirectTo });
    if (error) throw authError(error);
  }
  async updatePassword(pw: string) {
    this.needSession();
    if (pw.length < 10) throw new ApiError("invalid", "Use at least 10 characters.");
    const { error } = await this.sb.auth.updateUser({ password: pw });
    if (error) throw authError(error);
    clearRecovery();
    await this.rpc<boolean>("pw_changed");
    this.refreshAll();
  }
  async changeMyPassword(current: string, next: string) {
    this.needSession();
    if (next === current) throw new ApiError("invalid", "Pick a password different from your current one.");
    if (!(await this.rpc<boolean>("verify_my_password", { p_password: current }))) throw new ApiError("auth", "Your current password isn't right.");
    await this.updatePassword(next);
  }
  async passwordStatus() {
    if (!this.session) return { mustChange: false };
    const r = await this.rpc<{ mustChange: boolean }>("pw_status");
    return { mustChange: r.mustChange || inRecovery() };
  }
  async signOut() {
    clearRecovery();
    const { error } = await this.sb.auth.signOut();
    if (error && !/session/i.test(error.message)) throw authError(error);
  }
  async mfaState(): Promise<MfaState> {
    if (!this.session) return { enrolled: false, verified: false };
    const [aal, fs] = await Promise.all([this.sb.auth.mfa.getAuthenticatorAssuranceLevel(), this.sb.auth.mfa.listFactors()]);
    if (fs.error) throw authError(fs.error);
    const totp = (fs.data?.all || []).filter((f) => f.factor_type === "totp");
    const verified = totp.find((f) => f.status === "verified");
    const pending = totp.filter((f) => f.status !== "verified").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return { enrolled: !!verified, verified: aal.data?.currentLevel === "aal2", factorId: (verified || pending)?.id, canReset: emailLinkRecent(this.session.access_token) };
  }
  async mfaEnroll() {
    const s = this.needSession();
    if (s.user.is_anonymous) throw new ApiError("forbidden", "Sign in first.");
    // drop half-finished enrolments so the user can start over
    const fs = await this.sb.auth.mfa.listFactors();
    for (const f of fs.data?.all || []) if (f.factor_type === "totp" && f.status !== "verified") await this.sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await this.sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Ant Arena ${new Date().toISOString().slice(0, 16)}` });
    if (error || !data) throw authError(error);
    return { factorId: data.id, qr: qrToDataUrl(data.totp.qr_code), secret: data.totp.secret };
  }
  async mfaVerify(factorId: string, code: string) {
    this.needSession();
    const { error } = await this.sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
    if (error) throw authError(error);
    await this.sb.auth.refreshSession().catch(() => undefined);
  }

  async mfaResetSend(redirectTo: string) {
    const s = this.needSession();
    const e = s.user.email;
    if (!e || s.user.is_anonymous) throw new ApiError("forbidden", "Sign in first.");
    const { error } = await this.sb.auth.signInWithOtp({ email: e, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    if (error) throw authError(error);
  }
  async mfaReset() {
    this.needSession();
    await this.rpc("mfa_reset_self");
    await this.sb.auth.refreshSession().catch(() => undefined);
  }

  /* ================= tenants ================= */
  async tenantBySlug(slug: string) {
    return (await this.rpc<TenantPublic | null>("tenant_public", { p_slug: slug })) ?? null;
  }
  async access(tenantId: string): Promise<Access> {
    if (!this.session) return { role: null, isSuper: false };
    return this.rpc<Access>("my_access", { p_tid: tenantId });
  }
  async acceptInvites() {
    if (!this.session) throw new ApiError("auth", "Please sign in.");
    return this.rpc<{ tenantId: string; slug: string; role: Role }[]>("accept_invites");
  }
  async myTenants() {
    if (!this.session) return [];
    return this.rpc<{ tenantId: string; slug: string; name: string; role: Role }[]>("my_tenants");
  }

  /* ================= tenant data ================= */
  watchTenant(tenantId: string, cb: (d: TenantData) => void, onErr?: (e: ApiError) => void): Unsub {
    const f = `tenant_id=eq.${tenantId}`;
    const w = watch<TenantData>({
      sb: this.sb,
      name: "tenant",
      fetch: () => this.rpc<TenantData>("tenant_snapshot", { p_tid: tenantId }),
      cb,
      onErr,
      // admins stream changes; players poll (Realtime connections are limited on the free tier)
      bindings: (d): Binding[] =>
        d.admins.length
          ? [
              { table: "tenants", filter: `id=eq.${tenantId}` },
              ...["tenant_members", "quizzes", "quiz_keys", "players", "runs", "gifts", "disqualified", "rosters", "audit_log", "polls", "live_sessions"].map(
                (table) => ({ table, filter: f }),
              ),
            ]
          : [],
      // the snapshot is the biggest read: coalesce bursts (e.g. many people playing at once)
      debounceMs: 800,
      minGapMs: 4000,
      pollMs: 60_000,
      fastPollMs: 30_000,
    });
    let set = this.tenantWatchers.get(tenantId);
    if (!set) this.tenantWatchers.set(tenantId, (set = new Set()));
    set.add(w);
    return () => {
      w.stop();
      set!.delete(w);
    };
  }
  refresh(tenantId: string) {
    this.tenantWatchers.get(tenantId)?.forEach((w) => w.kick());
  }

  /* ================= player identity ================= */
  async myPlayer(tenantId: string) {
    if (!this.session) return null;
    return (await this.rpc<Player | null>("my_player", { p_tid: tenantId })) ?? null;
  }
  async playerLookup(tenantId: string, empId: string) {
    return (await this.rpc<LookupCard | null>("player_lookup", { p_tid: tenantId, p_emp_id: empId })) ?? null;
  }
  async joinCompany(tenantId: string, key: string) {
    this.needSession();
    return !!(await this.rpc<boolean>("join_company", { p_tid: tenantId, p_key: key }));
  }
  async joinKeyGet(tenantId: string) {
    return this.rpc<{ key: string; required: boolean; rotatedAt: number }>("join_key_get", { p_tid: tenantId });
  }
  async joinKeySet(tenantId: string, required: boolean, rotate = false) {
    const r = await this.rpc<{ key: string; required: boolean; rotatedAt: number }>("join_key_set", { p_tid: tenantId, p_required: required, p_rotate: rotate });
    this.refresh(tenantId);
    return r;
  }
  async playerClaim(tenantId: string, empId: string, device: string) {
    this.needSession();
    const p = await this.rpc<Player>("player_claim", { p_tid: tenantId, p_emp_id: empId, p_device: device });
    this.refresh(tenantId);
    return p;
  }
  async playerRegister(tenantId: string, input: RegisterInput, device: string) {
    this.needSession();
    const p = await this.rpc<Player>("player_register", { p_tid: tenantId, p_input: input, p_device: device });
    this.refresh(tenantId);
    return p;
  }
  async playerLinkEmail(tenantId: string, device: string) {
    this.needSession();
    const p = (await this.rpc<Player | null>("player_link_email", { p_tid: tenantId, p_device: device })) ?? null;
    if (p) this.refresh(tenantId);
    return p;
  }
  async updateMyCard(tenantId: string, patch: { name?: string; look?: number; equipped?: Equipped; unit?: string; unitType?: UnitType }) {
    await this.rpc<void>("update_my_card", { p_tid: tenantId, p_patch: patch });
    this.refresh(tenantId);
  }
  async buyItem(tenantId: string, itemId: string) {
    await this.rpc<void>("buy_item", { p_tid: tenantId, p_item: itemId });
    this.refresh(tenantId);
  }

  /* ================= plays ================= */
  async startRun(tenantId: string, gid: string) {
    return this.rpc<Run>("start_run", { p_tid: tenantId, p_gid: gid });
  }
  async showQuestion(tenantId: string, gid: string, index: number) {
    return this.rpc<Run>("show_question", { p_tid: tenantId, p_gid: gid, p_index: index });
  }
  async answer(tenantId: string, gid: string, index: number, choice: string | null, blur: number): Promise<AnswerResult> {
    return this.rpc<AnswerResult>("answer", { p_tid: tenantId, p_gid: gid, p_index: index, p_choice: choice, p_blur: Math.max(0, Math.floor(blur || 0)) });
  }
  async finishRun(tenantId: string, gid: string) {
    const r = await this.rpc<{ run: Run; key?: Record<string, string> }>("finish_run", { p_tid: tenantId, p_gid: gid });
    this.refresh(tenantId);
    return r;
  }

  /* ================= tenant admin ================= */
  private async adminCall<T>(tenantId: string, fn: string, args: Record<string, unknown>): Promise<T> {
    const r = await this.rpc<T>(fn, { p_tid: tenantId, ...args });
    this.refresh(tenantId);
    return r;
  }
  async saveQuiz(tenantId: string, draft: QuizDraft) {
    await this.adminCall<void>(tenantId, "save_quiz", { p_draft: draft });
  }
  async setQuizStatus(tenantId: string, gid: string, status: Game["status"], approve?: boolean) {
    await this.adminCall<void>(tenantId, "set_quiz_status", { p_gid: gid, p_status: status, p_approve: !!approve });
  }
  async deleteQuiz(tenantId: string, gid: string) {
    await this.adminCall<void>(tenantId, "delete_quiz", { p_gid: gid });
  }
  async saveConfig(tenantId: string, cfg: OrgConfig) {
    await this.adminCall<void>(tenantId, "save_config", { p_cfg: cfg });
  }
  async saveBrand(tenantId: string, branding: Branding, labels: Labels) {
    await this.adminCall<void>(tenantId, "save_brand", { p_branding: branding, p_labels: labels });
  }
  async adminPatchPlayer(tenantId: string, uid: string, patch: Partial<Pick<Player, "name" | "unit" | "unitType" | "empId" | "email" | "locked">>) {
    // like the demo: `email: undefined` = unchanged (JSON drops it); `email: ""` clears it
    await this.adminCall<void>(tenantId, "admin_patch_player", { p_uid: uid, p_patch: patch });
  }
  async adminSignOutPlayer(tenantId: string, uid: string) {
    await this.adminCall<void>(tenantId, "admin_sign_out_player", { p_uid: uid });
  }
  async adminDeletePlayer(tenantId: string, uid: string) {
    await this.adminCall<void>(tenantId, "admin_delete_player", { p_uid: uid });
  }
  async adminResetRun(tenantId: string, uid: string, runKey: string) {
    await this.adminCall<void>(tenantId, "admin_reset_run", { p_uid: uid, p_key: runKey });
  }
  async adminImportPlayers(tenantId: string, rows: RegisterInput[]) {
    return this.adminCall<{ added: number; skipped: number }>(tenantId, "admin_import_players", { p_rows: rows });
  }
  async saveDQ(tenantId: string, dq: Disqualified) {
    await this.adminCall<void>(tenantId, "save_dq", { p_dq: dq });
  }
  async saveRoster(tenantId: string, r: Roster | null) {
    await this.adminCall<void>(tenantId, "save_roster", { p_roster: r });
  }
  async saveGift(tenantId: string, g: Gift) {
    await this.adminCall<void>(tenantId, "save_gift", { p_gift: g });
  }
  async deleteGift(tenantId: string, id: string) {
    await this.adminCall<void>(tenantId, "delete_gift", { p_id: id });
  }
  async purgeRuns(tenantId: string, before: number) {
    return this.adminCall<number>(tenantId, "purge_runs", { p_before: Math.floor(before) });
  }
  async audit(tenantId: string, e: Omit<AuditEntry, "id" | "at" | "actor">) {
    try {
      await this.rpc<void>("audit_add", { p_tid: tenantId, p_entry: e });
    } catch {
      /* never block on logging */
    }
  }
  async inviteAdmin(tenantId: string, email: string, role: Role) {
    await this.adminCall<void>(tenantId, "invite_admin", { p_email: email, p_role: role });
  }
  async setAdminRole(tenantId: string, email: string, role: Role) {
    await this.adminCall<void>(tenantId, "set_admin_role", { p_email: email, p_role: role });
  }
  async removeAdmin(tenantId: string, email: string) {
    await this.adminCall<void>(tenantId, "remove_admin", { p_email: email });
  }
  async library() {
    return this.rpc<LibraryItem[]>("library_list");
  }
  async importLibrary(tenantId: string, ids: string[]) {
    return this.adminCall<number>(tenantId, "import_library", { p_ids: ids });
  }
  download(filename: string, text: string, mime = "text/csv") {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /* ================= live quiz ================= */
  async liveCreate(tenantId: string, gid: string, opts: { guests: boolean }) {
    const s = await this.adminCall<LiveSession>(tenantId, "live_create", { p_gid: gid, p_guests: !!opts.guests });
    return this.localLive(s);
  }
  async liveControl(sessionId: string, action: "start" | "reveal" | "board" | "next" | "end" | "kick", arg?: string) {
    await this.rpc<void>("live_control", { p_sid: sessionId, p_action: action, p_arg: arg ?? null });
  }
  watchLiveHost(sessionId: string, cb: (v: LiveHostView) => void): Unsub {
    const f = `session_id=eq.${sessionId}`;
    const w = watch<LiveHostView>({
      sb: this.sb,
      name: "live-host",
      fetch: async () => {
        const t = Date.now();
        const v = await this.rpc<(LiveHostView & { serverNow?: number }) | null>("live_host_view", { p_sid: sessionId });
        if (!v) return null;
        this.learnSkew(v.serverNow, t);
        const { serverNow: _n, ...rest } = v;
        return { ...rest, session: this.localLive(rest.session) };
      },
      cb,
      bindings: [
        { table: "live_sessions", filter: `id=eq.${sessionId}` },
        { table: "live_players", filter: f },
        { table: "live_answers", filter: f },
      ],
      debounceMs: 200,
      minGapMs: 250,
      pollMs: 5000,
      fastPollMs: 2000,
    });
    return () => w.stop();
  }
  async liveFind(pin: string) {
    return (await this.rpc<{ sessionId: string; tenantId: string; slug: string; title: string; guests: boolean } | null>("live_find", { p_pin: pin })) ?? null;
  }
  async liveJoin(sessionId: string, nick?: string) {
    this.needSession();
    return this.rpc<{ livePlayerId: string }>("live_join", { p_sid: sessionId, p_nick: nick ?? null });
  }
  watchLivePlayer(sessionId: string, livePlayerId: string, cb: (v: LivePlayerPayload) => void): Unsub {
    const w = watch<LivePlayerPayload>({
      sb: this.sb,
      name: "live-player",
      fetch: async () => {
        const t = Date.now();
        const v = await this.rpc<(LivePlayerPayload & { serverNow?: number }) | null>("live_player_view", { p_sid: sessionId, p_lpid: livePlayerId });
        if (!v) return null;
        this.learnSkew(v.serverNow, t);
        const { serverNow: _n, ...rest } = v;
        return { ...rest, session: this.localLive(rest.session) };
      },
      cb,
      bindings: [
        { table: "live_sessions", filter: `id=eq.${sessionId}` },
        { table: "live_players", filter: `id=eq.${livePlayerId}` },
      ],
      debounceMs: 150,
      minGapMs: 250,
      pollMs: 5000,
      fastPollMs: 2000,
    });
    return () => w.stop();
  }
  async liveAnswer(sessionId: string, livePlayerId: string, qIndex: number, choice: string) {
    await this.rpc<void>("live_answer", { p_sid: sessionId, p_lpid: livePlayerId, p_qindex: qIndex, p_choice: choice });
  }

  /* ================= polls ================= */
  async savePoll(tenantId: string, poll: Poll) {
    await this.adminCall<void>(tenantId, "save_poll", { p_poll: poll });
  }
  async deletePoll(tenantId: string, id: string) {
    await this.adminCall<void>(tenantId, "delete_poll", { p_id: id });
  }
  async pollControl(pollId: string, patch: Partial<Pick<Poll, "current" | "status" | "showResults" | "locked">>) {
    await this.rpc<void>("poll_control", { p_poll: pollId, p_patch: patch });
  }
  async pollFind(code: string) {
    return (await this.rpc<PollFound | null>("poll_find", { p_code: code })) ?? null; // { pollId, title, slug }
  }
  watchPoll(pollId: string, cb: (p: Poll) => void): Unsub {
    const w = watch<Poll>({
      sb: this.sb,
      name: "poll",
      fetch: () => this.rpc<Poll | null>("poll_public", { p_poll: pollId }),
      cb,
      bindings: [{ table: "polls", filter: `id=eq.${pollId}` }],
      debounceMs: 150,
      minGapMs: 300,
      pollMs: 20_000, // Realtime brings changes; this is only a safety net
      fastPollMs: 4000,
    });
    return () => w.stop();
  }
  private async pollResultsOnce(pollId: string, slideId: string): Promise<SlideResults | null> {
    const v = await this.rpc<{ host: boolean; slide: Slide; rows: PollResponse[] } | null>("poll_results", { p_poll: pollId, p_slide: slideId });
    if (!v) return null;
    const r = aggregate(v.slide, v.rows);
    if (!v.host && r.texts) r.texts = r.texts.map((x) => ({ ...x, who: "" }));
    return r;
  }
  async readPollResults(pollId: string, slideId: string) {
    return this.pollResultsOnce(pollId, slideId);
  }
  async pollCounts(tenantId: string) {
    return (await this.rpc<Record<string, number> | null>("poll_counts", { p_tid: tenantId })) ?? {};
  }
  watchPollResults(pollId: string, slideId: string, cb: (r: SlideResults) => void): Unsub {
    const w = watch<SlideResults>({
      sb: this.sb,
      name: "poll-results",
      fetch: () => this.pollResultsOnce(pollId, slideId),
      cb,
      bindings: [
        { table: "poll_pulse", filter: `poll_id=eq.${pollId}` },
        { table: "polls", filter: `id=eq.${pollId}` },
      ],
      debounceMs: 500,
      minGapMs: 1200,
      pollMs: 20_000,
      fastPollMs: 5000,
    });
    return () => w.stop();
  }
  async pollRespond(pollId: string, slideId: string, value: PollValue) {
    this.needSession();
    await this.rpc<void>("poll_respond", { p_poll: pollId, p_slide: slideId, p_value: value });
  }
  async pollMyResponses(pollId: string) {
    if (!this.session) return {};
    return (await this.rpc<Record<string, PollValue> | null>("poll_my_responses", { p_poll: pollId })) ?? {};
  }
  async qaVote(pollId: string, responseId: string) {
    this.needSession();
    await this.rpc<void>("qa_vote", { p_poll: pollId, p_response: responseId });
  }
  async qaModerate(pollId: string, responseId: string, patch: Partial<Pick<PollResponse, "hidden" | "answered">>) {
    await this.rpc<void>("qa_moderate", { p_poll: pollId, p_response: responseId, p_patch: patch });
  }

  /* ================= super admin ================= */
  async superStatus() {
    if (!this.session) return { isSuperUser: false };
    return this.rpc<{ isSuperUser: boolean }>("super_status");
  }
  async superResetAdminPassword(tenantId: string, email: string, how: { link: string } | { temp: string }) {
    const e = email.trim().toLowerCase();
    await this.rpc<void>("super_admin_reset_password", { p_tid: tenantId, p_email: e, p_new: "temp" in how ? how.temp : null });
    if ("link" in how) {
      const { error } = await this.sb.auth.resetPasswordForEmail(e, { redirectTo: how.link });
      if (error) throw authError(error);
    }
  }
  async superTenants() {
    return this.rpc<(Tenant & { usage: TenantUsage })[]>("super_tenants");
  }
  async superCreateTenant(input: NewTenantInput) {
    return this.rpc<Tenant>("super_create_tenant", { p_input: input });
  }
  async superUpdateTenant(id: string, patch: Partial<Pick<Tenant, "name" | "slug" | "status" | "template" | "branding" | "labels" | "cfg">>) {
    await this.rpc<void>("super_update_tenant", { p_id: id, p_patch: patch });
    this.refresh(id);
  }
  async superDeleteTenant(id: string, confirmSlug: string) {
    await this.rpc<void>("super_delete_tenant", { p_id: id, p_confirm_slug: confirmSlug });
  }
  async superAdmins(tenantId: string) {
    return this.rpc<AdminMember[]>("super_admins_list", { p_tid: tenantId });
  }
  async superInvite(tenantId: string, email: string, role: Role) {
    await this.rpc<void>("super_invite", { p_tid: tenantId, p_email: email, p_role: role });
    this.refresh(tenantId);
  }
  async superAudit() {
    return this.rpc<AuditEntry[]>("super_audit_list");
  }
  async superSaveLibrary(items: LibraryItem[]) {
    await this.rpc<void>("super_save_library", { p_items: items });
  }
}

/** A "reset your password" email was opened in this tab: the admin screens ask for a new password first. */
const REC = "bsx.pwrecovery";
function markRecovery() {
  try {
    sessionStorage.setItem(REC, "1");
  } catch {
    /* private mode */
  }
}
function clearRecovery() {
  try {
    sessionStorage.removeItem(REC);
  } catch {
    /* private mode */
  }
}
function inRecovery() {
  try {
    return sessionStorage.getItem(REC) === "1";
  } catch {
    return false;
  }
}

/** Was this session opened from an emailed link (magic link / email code) in the last 10 minutes? Read from the JWT's amr claim; the server re-checks. */
function emailLinkRecent(token: string): boolean {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { amr?: { method: string; timestamp: number }[] };
    const now = Date.now() / 1000;
    return (p.amr || []).some((a) => ["otp", "magiclink", "email"].includes(a.method) && now - a.timestamp < 600);
  } catch {
    return false;
  }
}
