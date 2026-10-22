/* Knowledge-gap analytics for the admin dashboard and reports. */
import type { Disqualified, Game, Player, Question, QuizKind } from "../types";
import { choiceText } from "./answers";
import { dqKey, runPoints } from "./scoring";
import { dayKey, pct } from "./util";

export type Period = "all" | "today" | "7" | "30";
export const PERIODS: [Period, string][] = [["all", "All time"], ["today", "Today"], ["7", "7 days"], ["30", "30 days"]];

export interface Flat {
  gid: string;
  qid: string;
  topic: string;
  ok: boolean;
  c: string | null;
  ms: number;
  uid: string;
  unit: string;
  unitType: string;
  at: number;
}
export interface RunRow {
  uid: string;
  gid: string;
  kind: QuizKind;
  passed?: boolean;
  unit: string;
  unitType: string;
  done: boolean;
  points: number;
  correct: number;
  answered: number;
  at: number;
}

export const sevOf = (a: number) => (a < 55 ? "bad" : a < 75 ? "warn" : "good");
export const SEV_LABEL: Record<string, string> = { bad: "Gap", warn: "Watch", good: "Strong", none: "No plays" };
export const SEV_HEX: Record<string, string> = { bad: "#E5431A", warn: "#C98A00", good: "#2E9E4F" };

/** Every play (and answer) in range. Live-quiz games are never part of the knowledge-gap data:
 *  they are scored in live sessions, not as plays. `kinds` picks sprint, story and/or certification. */
export function scope(players: Player[], games: Record<string, Game>, dq: Disqualified, gid: string, period: Period, kinds: QuizKind[] = ["sprint", "story", "cert"]) {
  const now = Date.now(),
    t = dayKey(now);
  const runs: RunRow[] = [];
  const answers: Flat[] = [];
  for (const p of players)
    for (const r of Object.values(p.runs || {})) {
      if (dq?.runs?.[dqKey(p.uid, r.gid)]) continue;
      if (gid !== "all" && r.gid !== gid) continue;
      const at = r.finishedAt || r.startedAt || 0;
      if (period === "today" && dayKey(at) !== t) continue;
      if (period === "7" && at < now - 7 * 864e5) continue;
      if (period === "30" && at < now - 30 * 864e5) continue;
      const g = games[r.gid];
      if (g && !kinds.includes(g.kind || "sprint")) continue;
      const correct = (r.ans || []).filter((a) => a.ok).length;
      runs.push({ uid: p.uid, gid: r.gid, kind: g?.kind || "sprint", passed: r.passed, unit: p.unit, unitType: p.unitType, done: r.status === "done", points: r.status === "done" ? runPoints(r).total : 0, correct, answered: (r.ans || []).length, at });
      (r.ans || []).forEach((a, i) => {
        const q = g?.questions[i];
        answers.push({ gid: r.gid, qid: q?.id || String(i), topic: q?.topic || "General Knowledge", ok: !!a.ok, c: a.c, ms: a.ms || 0, uid: p.uid, unit: p.unit, unitType: p.unitType, at });
      });
    }
  return { runs, answers };
}

export interface QStat {
  gid: string;
  qid: string;
  q?: Question;
  n: number;
  ok: number;
  acc: number;
  topWrong: string;
  topWrongN: number;
}
export function analyze(answers: Flat[], games: Record<string, Game>) {
  const tMap: Record<string, { k: string; n: number; ok: number; to: number }> = {};
  for (const x of answers) {
    const t = (tMap[x.topic] ||= { k: x.topic, n: 0, ok: 0, to: 0 });
    t.n++;
    if (x.ok) t.ok++;
    if (x.c == null) t.to++;
  }
  const topics = Object.values(tMap).map((t) => ({ ...t, acc: pct(t.ok, t.n) })).sort((a, b) => a.acc - b.acc);

  const qMap: Record<string, { gid: string; qid: string; n: number; ok: number; wrong: Record<string, number> }> = {};
  for (const x of answers) {
    const r = (qMap[x.gid + ":" + x.qid] ||= { gid: x.gid, qid: x.qid, n: 0, ok: 0, wrong: {} });
    r.n++;
    if (x.ok) r.ok++;
    else {
      const q = games[x.gid]?.questions.find((y) => y.id === x.qid);
      const w = choiceText(q, x.c);
      r.wrong[w] = (r.wrong[w] || 0) + 1;
    }
  }
  const questions: QStat[] = Object.values(qMap).map((r) => {
    const w = Object.entries(r.wrong).sort((a, b) => b[1] - a[1])[0];
    return { gid: r.gid, qid: r.qid, n: r.n, ok: r.ok, acc: pct(r.ok, r.n), q: games[r.gid]?.questions.find((y) => y.id === r.qid), topWrong: w ? w[0] : "", topWrongN: w ? w[1] : 0 };
  });
  return { topics, questions };
}

export interface UnitStat {
  name: string;
  registered: number;
  players: number;
  plays: number;
  n: number;
  ok: number;
  acc: number | null;
  avg: number;
  weak?: { k: string; acc: number };
  strong?: { k: string; acc: number };
  sev: string;
  topic: Record<string, { n: number; ok: number }>;
}
export function unitStats(type: "branch" | "dept", names: string[], players: Player[], runs: RunRow[], answers: Flat[]): UnitStat[] {
  const reg: Record<string, number> = {};
  players.forEach((p) => {
    if (p.unitType === type) reg[p.unit] = (reg[p.unit] || 0) + 1;
  });
  const all = [...new Set([...names, ...Object.keys(reg)])];
  return all
    .map((name) => {
      const rr = runs.filter((r) => r.unitType === type && r.unit === name);
      const aa = answers.filter((a) => a.unitType === type && a.unit === name);
      const topic: Record<string, { n: number; ok: number }> = {};
      aa.forEach((a) => {
        const t = (topic[a.topic] ||= { n: 0, ok: 0 });
        t.n++;
        if (a.ok) t.ok++;
      });
      const ok = aa.filter((a) => a.ok).length;
      const done = rr.filter((r) => r.done);
      const ts = Object.entries(topic).map(([k, v]) => ({ k, acc: pct(v.ok, v.n) })).sort((a, b) => a.acc - b.acc);
      const acc = aa.length ? pct(ok, aa.length) : null;
      return {
        name,
        registered: reg[name] || 0,
        players: new Set(rr.map((r) => r.uid)).size,
        plays: done.length,
        n: aa.length,
        ok,
        acc,
        avg: done.length ? Math.round(done.reduce((s, r) => s + r.points, 0) / done.length) : 0,
        weak: ts[0],
        strong: ts.length > 1 ? ts[ts.length - 1] : undefined,
        sev: acc == null ? "none" : sevOf(acc),
        topic,
      };
    })
    .sort((a, b) => Number(a.acc == null) - Number(b.acc == null) || (a.acc ?? 0) - (b.acc ?? 0) || a.name.localeCompare(b.name));
}

/* ---------- gap trend: is the knowledge gap closing? ---------- */
export type Bucket = "week" | "day";
export interface TrendBucket {
  start: number;
  label: string;
}
export interface TrendSeries {
  key: string;
  gap: (number | null)[]; // % of answers wrong or timed out; null = too few answers
  n: number[];
}
const MIN_ANSWERS = 5;

export function gapTrend(answers: Flat[], bucket: Bucket, unit: string): { buckets: TrendBucket[]; overall: TrendSeries; topics: TrendSeries[] } {
  const rows = unit === "all" ? answers : answers.filter((a) => `${a.unitType}|${a.unit}` === unit);
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    if (bucket === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  };
  const step = (t: number) => {
    const d = new Date(t);
    d.setDate(d.getDate() + (bucket === "week" ? 7 : 1));
    return d.getTime();
  };
  const now = startOf(Date.now());
  const maxBuckets = bucket === "week" ? 12 : 30;
  let first = rows.length ? Math.min(...rows.map((a) => startOf(a.at))) : now;
  let count = 1;
  for (let t = first; t < now; t = step(t)) count++;
  while (count > maxBuckets) {
    first = step(first);
    count--;
  }
  const buckets: TrendBucket[] = [];
  for (let t = first; t <= now; t = step(t))
    buckets.push({ start: t, label: new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) });
  const idx = new Map(buckets.map((b, i) => [b.start, i]));
  const make = (key: string): TrendSeries & { w: number[] } => ({ key, gap: buckets.map(() => null), n: buckets.map(() => 0), w: buckets.map(() => 0) });
  const overall = make("Overall");
  const topics = new Map<string, ReturnType<typeof make>>();
  for (const a of rows) {
    const i = idx.get(startOf(a.at));
    if (i == null) continue;
    const t = topics.get(a.topic) || make(a.topic);
    topics.set(a.topic, t);
    for (const s of [overall, t]) {
      s.n[i]++;
      if (!a.ok) s.w[i]++;
    }
  }
  const fin = (s: ReturnType<typeof make>): TrendSeries => ({ key: s.key, n: s.n, gap: s.n.map((n, i) => (n >= MIN_ANSWERS ? Math.round((s.w[i] / n) * 100) : null)) });
  return {
    buckets,
    overall: fin(overall),
    topics: [...topics.values()].map(fin).sort((a, b) => b.n.reduce((x, y) => x + y, 0) - a.n.reduce((x, y) => x + y, 0)),
  };
}

/** First and last plotted values of a series, for the "closing / growing" headline. */
export function trendChange(s: TrendSeries, buckets: TrendBucket[]) {
  const pts = s.gap.map((g, i) => ({ g, i })).filter((p) => p.g != null) as { g: number; i: number }[];
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  return { from: a.g, to: b.g, delta: b.g - a.g, since: buckets[a.i].label };
}
