/* =====================================================================
   Game rules — points, coins, levels, streaks and leaderboards.
   These are the exact rules shown to staff in the in-app guide, so
   change them here and the guide stays truthful (it reads RULES).
   ===================================================================== */
import type { Game, Player, Run, Disqualified } from "../types";
import { ITEM } from "./catalog";
import { clamp, dayKey, monthStart, pct, weekStart } from "./util";

export const RULES = {
  base: 100, // points for a correct answer
  speedMax: 50, // extra points for answering instantly, falling to 0 at your time share
  perfect: 50, // bonus points when every answer in a quiz is right
  coinPerCorrect: 10,
  coinFinish: 5,
  coinPerfect: 25,
  streakCoinStep: 5, // per streak day, from day 2
  streakCoinCap: 50,
  levelStep: 200, // level L starts at 200 × L × (L − 1) points
  branchMin: 2, // active players a branch needs to be ranked in Branch Battle
  tooFastMs: 700, // answers quicker than this are flagged for review
};

/** Whole-quiz time. Sprints: 0.5–10 min. Certification exams: 1–180 min. (Mirrored in SQL private.limit_ms.) */
export const limitMs = (g: Pick<Game, "minutes"> & { kind?: Game["kind"] }) =>
  g.kind === "cert" ? clamp(Number(g.minutes) || 10, 1, 180) * 60_000 : clamp(Number(g.minutes) || 2, 0.5, 10) * 60_000;
export const shareMs = (g: Game) => limitMs(g) / Math.max(1, g.questions.length);

/** Points for one answer. */
export function answerPoints(ok: boolean, ms: number, share: number): number {
  if (!ok) return 0;
  return RULES.base + Math.round(RULES.speedMax * Math.max(0, 1 - ms / share));
}

/** Points are re-derived from each answer and capped, so an edited score can't inflate the board. */
export function runPoints(r: Run): { total: number; base: number; speed: number; perfect: number } {
  let base = 0,
    speed = 0;
  for (const a of r.ans || []) {
    if (!a.ok) continue;
    base += RULES.base;
    speed += clamp((a.pts || 0) - RULES.base, 0, RULES.speedMax);
  }
  const allRight = r.status === "done" && r.total > 0 && (r.ans || []).length === r.total && r.ans.every((a) => a.ok);
  const perfect = allRight ? RULES.perfect : 0;
  return { total: base + speed + perfect, base, speed, perfect };
}
export const runCorrect = (r: Run) => (r.ans || []).filter((a) => a.ok).length;
export const runMs = (r: Run) => (r.ans || []).reduce((s, a) => s + Math.max(0, a.ms || 0), 0);

export function runCoins(r: Run): { total: number; correct: number; finish: number; perfect: number } {
  if (r.status !== "done") return { total: 0, correct: 0, finish: 0, perfect: 0 };
  const c = runCorrect(r) * RULES.coinPerCorrect;
  const f = RULES.coinFinish;
  const p = runPoints(r).perfect ? RULES.coinPerfect : 0;
  return { total: c + f + p, correct: c, finish: f, perfect: p };
}

/* ---------- levels ---------- */
export const levelStart = (L: number) => RULES.levelStep * L * (L - 1);
export function levelOf(points: number) {
  let L = 1;
  while (levelStart(L + 1) <= points) L++;
  const from = levelStart(L),
    to = levelStart(L + 1);
  return { level: L, from, to, progress: (points - from) / (to - from), title: levelTitle(L) };
}
export function levelTitle(L: number) {
  if (L >= 16) return "Legend";
  if (L >= 12) return "Master";
  if (L >= 8) return "Expert";
  if (L >= 5) return "Pro";
  if (L >= 3) return "Rising Star";
  return "Rookie";
}

/* ---------- streaks ---------- */
const DAY = 864e5;
const dayNum = (k: string) => Math.round(new Date(k + "T12:00").getTime() / DAY);

export interface StreakInfo {
  current: number;
  best: number;
  alive: boolean; // false = today still needs a play to keep it
  bonusByDay: Record<string, number>; // coins from streaks, per play day
  shieldsOwned: number;
  shieldsUsed: number;
}

export function streakOf(p: Player, runs: Run[]): StreakInfo {
  const days = [...new Set(runs.filter((r) => r.status === "done" && r.finishedAt).map((r) => dayKey(r.finishedAt!)))].sort();
  const shields = (p.purchases || []).filter((x) => x.id === "shield").map((x) => x.at).sort((a, b) => a - b);
  let used = 0;
  const bonusByDay: Record<string, number> = {};
  let cur = 0,
    best = 0,
    prev: number | null = null;
  const canCover = (gapStartDay: number, gap: number) => {
    // shields bought before the first missed day and not used yet
    const avail = shields.filter((t) => t < gapStartDay * DAY).length - used;
    return gap <= avail;
  };
  for (const k of days) {
    const n = dayNum(k);
    if (prev == null) cur = 1;
    else {
      const gap = n - prev - 1;
      if (gap === 0) cur++;
      else if (canCover(prev + 1, gap)) {
        used += gap;
        cur++;
      } else cur = 1;
    }
    best = Math.max(best, cur);
    bonusByDay[k] = cur >= 2 ? Math.min(RULES.streakCoinCap, RULES.streakCoinStep * cur) : 0;
    prev = n;
  }
  const today = dayNum(dayKey(Date.now()));
  let current = 0,
    alive = false;
  if (prev != null) {
    if (prev === today) {
      current = cur;
      alive = true;
    } else if (prev === today - 1) current = cur;
    else {
      const gap = today - 1 - prev;
      if (canCover(prev + 1, gap)) current = cur;
    }
  }
  return { current, best, alive, bonusByDay, shieldsOwned: shields.length - used, shieldsUsed: used };
}

/* ---------- per-player stats ---------- */
export interface Stats {
  uid: string;
  points: number;
  coinsEarned: number;
  coinsSpent: number;
  coins: number;
  runsDone: number;
  correct: number;
  answered: number;
  acc: number;
  ms: number;
  lastAt: number;
  streak: StreakInfo;
  level: ReturnType<typeof levelOf>;
}

export const dqKey = (uid: string, gid: string) => `${uid}:${gid}`;

export function validRuns(p: Player, dq?: Disqualified | null): Run[] {
  // certification exams are separate: they never add points, coins, levels or streak days
  return Object.values(p.runs || {}).filter((r) => r.kind !== "cert" && !dq?.runs?.[dqKey(p.uid, r.gid)]);
}

export function statsOf(p: Player, dq?: Disqualified | null): Stats {
  const runs = validRuns(p, dq);
  const done = runs.filter((r) => r.status === "done");
  const streak = streakOf(p, done);
  const points = done.reduce((s, r) => s + runPoints(r).total, 0);
  const coinsEarned = done.reduce((s, r) => s + runCoins(r).total, 0) + Object.values(streak.bonusByDay).reduce((a, b) => a + b, 0);
  const coinsSpent = (p.purchases || []).reduce((s, x) => s + (ITEM[x.id]?.price || 0), 0);
  const answered = runs.reduce((s, r) => s + (r.ans || []).length, 0);
  const correct = runs.reduce((s, r) => s + runCorrect(r), 0);
  return {
    uid: p.uid,
    points,
    coinsEarned,
    coinsSpent,
    coins: Math.max(0, coinsEarned - coinsSpent),
    runsDone: done.length,
    correct,
    answered,
    acc: pct(correct, answered),
    ms: runs.reduce((s, r) => s + runMs(r), 0),
    lastAt: Math.max(0, ...done.map((r) => r.finishedAt || 0)),
    streak,
    level: levelOf(points),
  };
}

/* ---------- leaderboards ---------- */
export type Window = "week" | "month" | "all";
export const windowStart = (w: Window, now = Date.now()) => (w === "week" ? weekStart(now) : w === "month" ? monthStart(now) : 0);

export interface BoardRow {
  uid: string;
  points: number;
  runs: number;
  correct: number;
  answered: number;
  acc: number;
  ms: number;
  lastAt: number;
}

/** Ranking: points ▸ accuracy ▸ less time used ▸ whoever got there first. */
export const boardSort = (a: BoardRow, b: BoardRow) => b.points - a.points || b.acc - a.acc || a.ms - b.ms || a.lastAt - b.lastAt;

export function board(players: Player[], dq: Disqualified | null | undefined, from = 0, to = Infinity, exclude?: { uid: string; gid: string }): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const p of players) {
    const runs = validRuns(p, dq).filter(
      (r) => r.status === "done" && (r.finishedAt || 0) >= from && (r.finishedAt || 0) < to && !(exclude && exclude.uid === p.uid && exclude.gid === r.gid),
    );
    if (!runs.length) continue;
    const correct = runs.reduce((s, r) => s + runCorrect(r), 0);
    const answered = runs.reduce((s, r) => s + (r.ans || []).length, 0);
    rows.push({
      uid: p.uid,
      points: runs.reduce((s, r) => s + runPoints(r).total, 0),
      runs: runs.length,
      correct,
      answered,
      acc: pct(correct, answered),
      ms: runs.reduce((s, r) => s + runMs(r), 0),
      lastAt: Math.max(...runs.map((r) => r.finishedAt || 0)),
    });
  }
  return rows.sort(boardSort);
}

export function gameBoard(players: Player[], dq: Disqualified | null | undefined, gid: string): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const p of players) {
    const r = p.runs?.[gid];
    if (!r || r.status !== "done" || dq?.runs?.[dqKey(p.uid, gid)]) continue;
    const correct = runCorrect(r);
    rows.push({ uid: p.uid, points: runPoints(r).total, runs: 1, correct, answered: r.ans.length, acc: pct(correct, r.ans.length), ms: runMs(r), lastAt: r.finishedAt || 0 });
  }
  return rows.sort(boardSort);
}

export interface UnitRow {
  unit: string;
  unitType: string;
  active: number;
  registered: number;
  points: number;
  avg: number; // average points per active player — what Branch Battle ranks by
  acc: number;
  ranked: boolean;
}
export function unitBoard(players: Player[], dq: Disqualified | null | undefined, from = 0, to = Infinity): UnitRow[] {
  const byUid = new Map(board(players, dq, from, to).map((r) => [r.uid, r]));
  const m = new Map<string, UnitRow & { ok: number; n: number }>();
  for (const p of players) {
    const k = p.unitType + "|" + p.unit;
    const u = m.get(k) || { unit: p.unit, unitType: p.unitType, active: 0, registered: 0, points: 0, avg: 0, acc: 0, ranked: false, ok: 0, n: 0 };
    u.registered++;
    const r = byUid.get(p.uid);
    if (r) {
      u.active++;
      u.points += r.points;
      u.ok += r.correct;
      u.n += r.answered;
    }
    m.set(k, u);
  }
  return [...m.values()]
    .map((u) => ({ ...u, avg: u.active ? Math.round(u.points / u.active) : 0, acc: pct(u.ok, u.n), ranked: u.active >= RULES.branchMin }))
    .sort((a, b) => Number(b.ranked) - Number(a.ranked) || b.avg - a.avg || b.acc - a.acc);
}
