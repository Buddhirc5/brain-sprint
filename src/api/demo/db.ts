/* Demo storage: one JSON document in localStorage, shared by every tab of this
   browser (BroadcastChannel + storage events), so a host screen and several
   player tabs can run a live quiz together without any server. */
import type {
  AdminMember, AnswerKey, AuditEntry, Disqualified, Game, Gift, LibraryItem, LiveAnswer, LivePlayer, LiveSession,
  Player, Poll, PollResponse, Roster, Tenant,
} from "../../types";

export interface DemoUser {
  id: string;
  email?: string;
  pw?: string; // sha256(salt|password)
  mustChange?: string; // password hash when a super admin reset it: no admin rights until it changes
  recover?: boolean; // a reset link was sent: ask for a new password after signing in
  anonymous: boolean;
  mfa?: { secret: string; verified: boolean };
  createdAt: number;
}
export interface TStore {
  games: Record<string, Game>;
  keys: Record<string, AnswerKey>;
  players: Record<string, Player & { authUid?: string }>;
  gifts: Record<string, Gift>;
  dq: Disqualified;
  roster: Roster | null;
  audit: AuditEntry[];
  members: AdminMember[];
}
export interface DB {
  v: 1;
  users: Record<string, DemoUser>;
  otp: Record<string, { code: string; exp: number; tries: number }>;
  links: Record<string, { email: string; exp: number }>;
  outbox: { to: string; body: string; at: number; code?: string; link?: string }[];
  tenants: Record<string, Tenant>;
  t: Record<string, TStore>;
  polls: Record<string, Poll>;
  resp: Record<string, (PollResponse & { voters?: string[] })[]>;
  live: Record<string, LiveSession & { canon?: string[]; lastRevealQ?: number }>;
  lp: Record<string, Record<string, LivePlayer & { auth: string; answeredQ?: number; prevStreak?: number; raceQ?: number; correct?: number; totalMs?: number; qShownAt?: number; finishedAt?: number; lastC?: string }>>;
  la: Record<string, LiveAnswer[]>;
  sup: {
    emails: string[];
    audit: AuditEntry[];
  };
  library: LibraryItem[];
  joinKeys?: Record<string, { key: string; required: boolean; rotatedAt: number }>; // tenant id → private invite key
  joinPasses?: Record<string, number>; // "tid:userId" → when the key was accepted
  rate: Record<string, { n: number; until: number }>;
}

const KEY = "bsx.demo.v1";
const chan: BroadcastChannel | null = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("bsx.demo") : null;
const listeners = new Set<() => void>();
let cache: DB | null = null;
let pending = false;

function notify() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    listeners.forEach((f) => f());
  }, 0);
}
/** Parse a saved demo database, upgrading data saved by older versions. */
function parse(raw: string): DB {
  const db = JSON.parse(raw) as DB;
  // the product was renamed from "Brain Sprint" to "Ant Arena"
  for (const t of Object.values(db.tenants || {})) if (t.branding?.productName === "Brain Sprint") t.branding.productName = "Ant Arena";
  return db;
}
function reload() {
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? parse(raw) : cache;
  } catch {
    /* keep cache */
  }
  notify();
}
chan?.addEventListener("message", reload);
if (typeof window !== "undefined") window.addEventListener("storage", (e) => e.key === KEY && reload());

export function hasDB(): boolean {
  if (cache) return true;
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
export function init(seed: DB) {
  cache = seed;
  persist();
}
export function read(): DB {
  if (!cache) {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("demo db missing");
    cache = parse(raw);
  }
  return cache;
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("demo storage full", e);
  }
  chan?.postMessage(1);
  notify();
}
/** Read-modify-write against the freshest copy (another tab may have written). */
export function tx<T>(fn: (db: DB) => T): T {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cache = parse(raw);
  } catch {
    /* use cache */
  }
  const out = fn(read());
  persist();
  return out;
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function wipe() {
  cache = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  chan?.postMessage(1);
}
