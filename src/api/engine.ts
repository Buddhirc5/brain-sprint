/* =====================================================================
   Pure game logic shared by the demo engine and mirrored 1:1 in SQL
   (supabase/migrations/*_functions.sql). Change both together.
   ===================================================================== */
import type { Branding, Features, Game, Labels, OrgConfig, Poll, PollResponse, SignIn, Slide, SlideResults, Tenant } from "../types";
import { answerPoints, shareMs } from "../lib/scoring";

export const DEFAULT_BRANDING: Branding = {
  productName: "Brain Sprint",
  tagline: "Daily quizzes, live games and polls for your team",
  primary: "#C6F432",
  accent: "#FF5A1F",
  ink: "#161512",
  paper: "#F4F3EE",
};

export const LABELS: Record<Tenant["template"], Labels> = {
  generic: { branch: "Location", branches: "Locations", dept: "Department", depts: "Departments", battle: "Team Battle" },
  bank: { branch: "Branch", branches: "Branches", dept: "Department", depts: "Departments", battle: "Branch Battle" },
};

export const DEFAULT_FEATURES: Features = {
  sprint: true, live: true, polls: true, cert: true, coins: true, store: true, streaks: true, avatars: true, rewards: true, battle: true,
};
export const DEFAULT_SIGNIN: SignIn = { empId: true, emailOtp: true, sso: false, liveGuests: false, adminAuth: "both", adminMfa: false };

export const TEMPLATE_UNITS: Record<Tenant["template"], Pick<OrgConfig, "branches" | "departments" | "topics">> = {
  generic: {
    branches: ["Head Office", "North Office", "South Office", "Remote"],
    departments: ["Sales", "Operations", "Customer Service", "Finance", "HR", "IT", "Marketing"],
    topics: ["Company Policies", "Cyber Security", "Data Privacy", "Customer Service", "Health & Safety", "Products", "General Knowledge"],
  },
  bank: {
    branches: ["Head Office", "City Branch", "Harbour Branch", "Hill Branch", "Airport Branch"],
    departments: ["Branch Banking", "Operations", "Retail Credit", "Corporate Banking", "Digital Banking", "Cards", "Treasury", "Compliance", "Risk", "IT", "HR", "Finance"],
    topics: ["AML & Compliance", "Cyber Security", "Digital & Payments", "Products & Services", "Operations", "Customer Experience", "General Knowledge"],
  },
};

export function defaultCfg(template: Tenant["template"]): OrgConfig {
  return {
    ...TEMPLATE_UNITS[template],
    maskIds: true,
    lastInitialOnly: false,
    adminIdleMin: 15,
    retentionDays: 365,
    requireAllowlist: false,
    makerChecker: template === "bank",
    exportMask: template === "bank",
    minQ: 1,
    maxQ: 10,
    features: { ...DEFAULT_FEATURES },
    signIn: { ...DEFAULT_SIGNIN, adminMfa: template === "bank" },
  };
}

/** Fill in any settings added after a tenant was created. */
export function normalizeCfg(c: Partial<OrgConfig> | undefined, template: Tenant["template"]): OrgConfig {
  const d = defaultCfg(template);
  return { ...d, ...(c || {}), features: { ...d.features, ...(c?.features || {}) }, signIn: { ...d.signIn, ...(c?.signIn || {}) } };
}

/* ---------------- sprint & certification scoring ---------------- */
export const isRight = (canon: string | undefined, choice: string | null) => choice != null && canon != null && canon === choice;
/** Sprint: 100 + up to 50 speed bonus. Certification: 1 point per right answer (no speed element). */
export function scoreAnswer(g: Game, ok: boolean, ms: number) {
  if (g.kind === "cert") return ok ? 1 : 0;
  return answerPoints(ok, ms, shareMs(g));
}
/** A small grace for network latency before an answer counts as late. */
export const GRACE_MS = 1500;

/* ---------------- live quiz scoring (game-show style) ---------------- */
export const LIVE = { maxPts: 1000, minPts: 500, streakStep: 100, streakCap: 500, defaultSeconds: 20 };
/** Right answer: 500–1000 by speed, plus 100 per answer in a row before this one (max +500). */
export function livePoints(ok: boolean, ms: number, limitMs: number, streakBefore: number) {
  if (!ok) return 0;
  const speed = Math.max(0, Math.min(1, 1 - ms / limitMs));
  return Math.round(LIVE.minPts + (LIVE.maxPts - LIVE.minPts) * speed) + Math.min(LIVE.streakCap, streakBefore * LIVE.streakStep);
}

/* ---------------- polls ---------------- */
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on", "with"]);
export const normWord = (w: string) => w.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} '-]/gu, "").slice(0, 25);

export function aggregate(slide: Slide, rs: PollResponse[]): SlideResults {
  const mine = rs.filter((r) => r.slideId === slide.id && !r.hidden);
  // one (latest) answer per person, except Q&A where every question counts
  const latest = new Map<string, PollResponse>();
  if (slide.type !== "qa") for (const r of mine) if (!latest.has(r.who) || latest.get(r.who)!.at < r.at) latest.set(r.who, r);
  const list = slide.type === "qa" ? mine : [...latest.values()];
  const out: SlideResults = { slideId: slide.id, n: new Set(list.map((r) => r.who)).size };
  if (slide.type === "mc") {
    out.counts = (slide.options || []).map(() => 0);
    for (const r of list) for (const i of (r.value as { choice: number[] }).choice || []) if (out.counts[i] != null) out.counts[i]++;
  } else if (slide.type === "word") {
    const m = new Map<string, number>();
    for (const r of list) for (const w of new Set(((r.value as { words: string[] }).words || []).map(normWord).filter((w) => w && !STOP.has(w)))) m.set(w, (m.get(w) || 0) + 1);
    out.words = [...m.entries()].map(([w, n]) => ({ w, n })).sort((a, b) => b.n - a.n || a.w.localeCompare(b.w)).slice(0, 60);
  } else if (slide.type === "scale") {
    const lo = slide.scaleMin ?? 1, hi = slide.scaleMax ?? 5;
    out.dist = Array.from({ length: hi - lo + 1 }, () => 0);
    let s = 0;
    for (const r of list) {
      const v = (r.value as { score: number }).score;
      if (v >= lo && v <= hi) { out.dist[v - lo]++; s += v; }
    }
    out.avg = list.length ? Math.round((s / list.length) * 10) / 10 : 0;
  } else if (slide.type === "open") {
    out.texts = list.slice().sort((a, b) => b.at - a.at);
  } else if (slide.type === "qa") {
    out.texts = list.slice().sort((a, b) => Number(!!a.answered) - Number(!!b.answered) || (b.votes || 0) - (a.votes || 0) || a.at - b.at);
  } else if (slide.type === "rank") {
    const n = (slide.options || []).length;
    const sc = Array.from({ length: n }, () => 0);
    for (const r of list) ((r.value as { order: number[] }).order || []).forEach((opt, pos) => { if (sc[opt] != null) sc[opt] += n - pos; });
    out.rank = sc.map((score, i) => ({ i, score })).sort((a, b) => b.score - a.score);
  }
  return out;
}

/** Validate a poll answer for its slide; returns an error message or null. */
export function pollValueProblem(slide: Slide, v: unknown): string | null {
  const o = v as Record<string, unknown>;
  if (!o || typeof o !== "object") return "Empty answer";
  const n = (slide.options || []).length;
  if (slide.type === "mc") {
    const c = o.choice as number[];
    if (!Array.isArray(c) || !c.length || c.some((i) => !Number.isInteger(i) || i < 0 || i >= n) || (!slide.multi && c.length > 1)) return "Pick an option";
  } else if (slide.type === "word") {
    const w = o.words as string[];
    if (!Array.isArray(w) || !w.filter((x) => normWord(String(x))).length || w.length > (slide.maxWords || 3)) return "Type a word";
  } else if (slide.type === "scale") {
    const s = o.score as number;
    if (!Number.isInteger(s) || s < (slide.scaleMin ?? 1) || s > (slide.scaleMax ?? 5)) return "Pick a value";
  } else if (slide.type === "open" || slide.type === "qa") {
    const t = String(o.text || "").trim();
    if (t.length < 2 || t.length > 280) return "Write 2–280 characters";
  } else if (slide.type === "rank") {
    const ord = o.order as number[];
    if (!Array.isArray(ord) || ord.length !== n || new Set(ord).size !== n || ord.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) return "Rank every option";
  }
  return null;
}

export const blankPoll = (id: string, tenantId: string, code: string): Poll => ({
  id, tenantId, code, title: "Untitled poll", slides: [{ id: "s1", type: "mc", prompt: "How are you feeling today?", options: ["Great", "Good", "Okay", "Tired"] }],
  current: 0, status: "draft", showResults: true, locked: false, createdAt: Date.now(), updatedAt: Date.now(),
});
