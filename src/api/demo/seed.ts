/* Demo world: two fictional companies, a super admin, and a year of play history.
   Loaded lazily (dynamic import) so it never ships in the production chunk. */
import seed from "../../demo/seed.json";
import library from "../../data/library.json";
import type { AnswerKey, Game, LibraryItem, OrgConfig, Player, Poll, PollResponse, Tenant } from "../../types";
import { DEFAULT_BRANDING, LABELS, defaultCfg } from "../engine";
import { pbkdf2, PBKDF2_ITER, sha256 } from "../../lib/security";
import { randHex } from "../../lib/util";
import type { DB, TStore } from "./db";

/** The demo companies show off the Knowledge World add-on (off by default for real companies). */
const withWorld = (c: OrgConfig): OrgConfig => ({ ...c, features: { ...c.features, world: true } });

export const DEMO_PASSWORD = "demo1234";
export const DEMO_ACCOUNTS = {
  super: "super@demo.app",
  harbor: "admin@harbor.demo",
  harborHost: "host@harbor.demo",
  northwind: "admin@northwind.demo",
};
export const pwHash = (pw: string) => sha256("bsx|" + pw);

const SEED_TODAY = new Date("2026-09-24T12:00:00").getTime();
const DAY = 864e5;

function shifted<T>(o: T): T {
  const shiftDays = Math.round((new Date().setHours(12, 0, 0, 0) - SEED_TODAY) / DAY);
  const ms = shiftDays * DAY;
  const shiftDate = (k: string) => {
    const d = new Date(k + "T12:00");
    d.setDate(d.getDate() + shiftDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const TS = new Set(["at", "startedAt", "finishedAt", "qAt", "createdAt", "updatedAt", "consentAt"]);
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const r: any = {};
      for (const [k, x] of Object.entries(v)) {
        if (TS.has(k) && typeof x === "number" && x > 0) r[k] = x + ms;
        else if ((k === "date" || k === "until") && typeof x === "string" && x) r[k] = shiftDate(x);
        else r[k] = walk(x);
      }
      return r;
    }
    return v;
  };
  return walk(structuredClone(o));
}

const emptyStore = (): TStore => ({ games: {}, keys: {}, players: {}, gifts: {}, dq: { runs: {} }, roster: null, audit: [], members: [] });

function fromLibrary(it: LibraryItem, gid: string, extra: Partial<Game>): { g: Game; k: AnswerKey } {
  const now = Date.now();
  const g: Game = {
    id: gid, kind: "sprint", title: it.title, desc: "", minutes: 3, color: "lime", status: "live", questions: structuredClone(it.questions),
    createdAt: now, updatedAt: now, ...extra,
  };
  return { g, k: { gid, answers: { ...it.answers }, updatedAt: now } };
}

export async function buildDemoDB(): Promise<DB> {
  const now = Date.now();
  const lib = library as unknown as LibraryItem[];
  const s = shifted(seed) as any;
  const today = new Date();
  const dk = (off: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + off);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /* ---------- Harbor Bank (bank template, custom brand) ---------- */
  const harbor: Tenant = {
    id: "t-harbor", slug: "harbor", name: "Harbor Bank (demo)", status: "active", template: "bank",
    branding: { productName: "Harbor Academy", tagline: "Learn a little every day", primary: "#5EEAD4", accent: "#EA580C", ink: "#0B1B2B", paper: "#EEF3F6" },
    labels: LABELS.bank, cfg: withWorld(defaultCfg("bank")), createdAt: now - 120 * DAY,
  };
  harbor.cfg.makerChecker = false; // demo: let one admin publish straight away
  harbor.cfg.signIn.adminMfa = false; // demo: MFA optional (turn it on in Settings to try it)
  const hs = emptyStore();
  for (const [gid, g] of Object.entries<any>(s.games)) {
    const game: Game = { ...g, kind: "sprint", questions: g.questions.map(({ check: _c, ...q }: any) => q) };
    hs.games[gid] = game;
    hs.keys[gid] = s.keys[gid];
  }
  for (const [uid, p] of Object.entries<any>(s.players)) hs.players[uid] = { ...(p as Player), email: `${String(p.name).split(" ")[0].toLowerCase()}.${uid.slice(-3)}@harbor.demo` };
  hs.gifts = s.gifts;
  hs.dq = { runs: {}, ...(s.config?.dq || {}) };
  // certification exam + live quiz from the library
  const aml = lib.find((x) => x.id === "lib-aml")!;
  const cert = fromLibrary(aml, "g-cert-aml", {
    kind: "cert", title: "AML Certification 2026", desc: "Pass mark 75%. Three attempts.", minutes: 6, color: "ink",
    cert: { passPct: 75, attempts: 3, certTitle: "Certified: Anti-Money Laundering Essentials", validMonths: 12, showAnswers: true },
  });
  hs.games[cert.g.id] = cert.g;
  hs.keys[cert.g.id] = cert.k;
  const liveSrc = lib.find((x) => x.id === "lib-bcyber")!;
  const liveQs = liveSrc.questions.filter((q) => q.type === "mcq" || q.type === "tf").map((q) => ({ ...q, seconds: 20 }));
  const live = fromLibrary({ ...liveSrc, questions: liveQs }, "g-live-townhall", { kind: "live", title: "Town Hall Cyber Showdown", desc: "Live game for the monthly town hall.", color: "orange", minutes: 0 });
  hs.games[live.g.id] = live.g;
  hs.keys[live.g.id] = live.k;
  hs.members = [
    { email: DEMO_ACCOUNTS.harbor, role: "owner", invitedAt: now - 120 * DAY },
    { email: DEMO_ACCOUNTS.harborHost, role: "host", invitedAt: now - 60 * DAY },
  ];
  hs.audit = [{ id: "e-seed", at: now - 120 * DAY, actor: DEMO_ACCOUNTS.super, action: "Company created", detail: "Harbor Bank (demo)", sev: "info" }];

  /* ---------- Northwind Traders (generic template, default brand) ---------- */
  const northwind: Tenant = {
    id: "t-northwind", slug: "northwind", name: "Northwind Traders (demo)", status: "active", template: "generic",
    branding: { ...DEFAULT_BRANDING }, labels: LABELS.generic, cfg: withWorld(defaultCfg("generic")), createdAt: now - 30 * DAY,
  };
  const ns = emptyStore();
  const picks: [string, string, Partial<Game>][] = [
    ["lib-cyber", "g-nw-cyber", { date: dk(-2), color: "lime", order: 1 }],
    ["lib-privacy", "g-nw-privacy", { date: dk(0), color: "blue", order: 2 }],
    ["lib-service", "g-nw-service", { date: dk(0), color: "pink", order: 3 }],
    ["lib-safety", "g-nw-safety", { status: "draft", color: "orange" }],
  ];
  for (const [lid, gid, extra] of picks) {
    const r = fromLibrary(lib.find((x) => x.id === lid)!, gid, extra);
    ns.games[gid] = r.g;
    ns.keys[gid] = r.k;
  }
  const fun = lib.find((x) => x.id === "lib-fun")!;
  const nl = fromLibrary({ ...fun, questions: fun.questions.filter((q) => q.type === "mcq" || q.type === "tf") }, "g-nw-live", { kind: "live", title: "Friday Fun Live", color: "pink", minutes: 0 });
  ns.games[nl.g.id] = nl.g;
  ns.keys[nl.g.id] = nl.k;
  const nwPlayers: [string, string, string, number][] = [
    ["NW-001", "Ava Thompson", "Head Office", 1], ["NW-002", "Liam Carter", "North Office", 9], ["NW-003", "Maya Patel", "South Office", 3], ["NW-004", "Noah Kim", "Remote", 12],
  ];
  nwPlayers.forEach(([emp, name, unit, look], i) => {
    const uid = "nw-" + (i + 1);
    ns.players[uid] = { uid, empId: emp, name, unitType: "branch", unit, look, consentAt: now - 20 * DAY, createdAt: now - 20 * DAY, updatedAt: now - 20 * DAY, runs: {}, demo: true, email: `${name.split(" ")[0].toLowerCase()}@northwind.demo` };
  });
  ns.members = [{ email: DEMO_ACCOUNTS.northwind, role: "owner", invitedAt: now - 30 * DAY }];

  /* ---------- a ready-made poll for Harbor ---------- */
  const poll: Poll = {
    id: "poll-townhall", tenantId: harbor.id, title: "Monthly Town Hall", code: "482913", current: 0, status: "open", showResults: true, locked: false,
    createdAt: now - DAY, updatedAt: now - DAY, createdBy: DEMO_ACCOUNTS.harbor,
    slides: [
      { id: "s1", type: "word", prompt: "One word for how this month felt", maxWords: 2 },
      { id: "s2", type: "mc", prompt: "Which training should we run next?", options: ["Fraud & scams", "Customer care", "Digital products", "Leadership"] },
      { id: "s3", type: "scale", prompt: "How confident are you spotting a phishing email?", scaleMin: 1, scaleMax: 5, scaleLabels: ["Not at all", "Very"] },
      { id: "s4", type: "rank", prompt: "Rank these priorities for next quarter", options: ["Faster onboarding", "Fewer complaints", "More digital sign-ups", "Lower fraud losses"] },
      { id: "s5", type: "open", prompt: "What's one thing we should stop doing?" },
      { id: "s6", type: "qa", prompt: "Ask the leadership team anything" },
    ],
  };
  const words = ["busy", "exciting", "busy", "hectic", "rewarding", "busy", "fast", "exciting", "tiring", "productive", "rewarding", "busy", "growth", "teamwork", "teamwork"];
  const rs: PollResponse[] = [];
  words.forEach((w, i) => rs.push({ id: "r-w" + i, pollId: poll.id, slideId: "s1", who: "seed-" + i, value: { words: [w] }, at: now - DAY + i * 1000 }));
  [0, 0, 1, 2, 0, 3, 1, 0, 2, 0, 1].forEach((c, i) => rs.push({ id: "r-m" + i, pollId: poll.id, slideId: "s2", who: "seed-" + i, value: { choice: [c] }, at: now - DAY + i * 1000 }));
  [4, 3, 5, 2, 4, 4, 3, 5, 3].forEach((v, i) => rs.push({ id: "r-s" + i, pollId: poll.id, slideId: "s3", who: "seed-" + i, value: { score: v }, at: now - DAY + i * 1000 }));
  rs.push({ id: "r-q1", pollId: poll.id, slideId: "s6", who: "seed-1", value: { text: "Will we get the new mobile app this year?" }, at: now - DAY, votes: 7 });
  rs.push({ id: "r-q2", pollId: poll.id, slideId: "s6", who: "seed-2", value: { text: "Can branches get more training days?" }, at: now - DAY, votes: 4 });
  rs.push({ id: "r-o1", pollId: poll.id, slideId: "s5", who: "seed-3", value: { text: "Printing reports nobody reads." }, at: now - DAY });

  const salt = randHex(16);
  const db: DB = {
    v: 1,
    users: {},
    otp: {},
    links: {},
    outbox: [],
    tenants: { [harbor.id]: harbor, [northwind.id]: northwind },
    t: { [harbor.id]: hs, [northwind.id]: ns },
    polls: { [poll.id]: poll },
    resp: { [poll.id]: rs },
    live: {},
    lp: {},
    la: {},
    sup: {
      emails: [DEMO_ACCOUNTS.super],
      code: { salt, hash: await pbkdf2("Sandeepa", salt, PBKDF2_ITER), iter: PBKDF2_ITER, isDefault: true },
      unlocked: {},
      fails: {},
      audit: [],
    },
    library: lib,
    rate: {},
  };
  for (const email of Object.values(DEMO_ACCOUNTS)) {
    const id = "u-" + randHex(6);
    db.users[id] = { id, email, pw: await pwHash(DEMO_PASSWORD), anonymous: false, createdAt: now };
  }
  return db;
}
