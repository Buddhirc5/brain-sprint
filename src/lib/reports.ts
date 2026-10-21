/* CSV report builders (pure functions — easy to unit test). Each report opens with a summary block. */
import type { AuditEntry, Disqualified, Game, Labels, OrgConfig, Player, Run } from "../types";
import { unitTypes } from "../api/engine";
import { analyze, PERIODS, scope, SEV_LABEL, sevOf, unitStats, type Period } from "./analytics";
import { choiceText, TYPE_NAME } from "./answers";
import { isOpen, isScheduled, sortGames } from "./games";
import { board, limitMs, retryLabel, retryStats, runMs, runPoints, type Stats } from "./scoring";
import { maskId } from "./security";
import { dayKey, pct } from "./util";

type Rows = (string | number)[][];
export interface RCtx {
  players: Player[];
  games: Record<string, Game>;
  dq: Disqualified;
  cfg: OrgConfig;
  stats: Record<string, Stats>;
  labels?: Labels; // the company's words for branch / department
}
const LB = (c: RCtx): Labels => c.labels || { branch: "Branch", branches: "Branches", dept: "Department", depts: "Departments", battle: "Battle" };
const unitWord = (c: RCtx, t: string) => (t === "dept" ? LB(c).dept : LB(c).branch);
/** All plays of one quiz by one player (certification exams can have several attempts), oldest first. */
export const runsOf = (p: Player, gid: string): { key: string; r: Run }[] =>
  Object.entries(p.runs || {})
    .filter(([, r]) => r.gid === gid)
    .map(([key, r]) => ({ key, r }))
    .sort((a, b) => (a.r.attempt || 1) - (b.r.attempt || 1));
const idOf = (c: RCtx, p?: Player) => (!p ? "" : c.cfg.exportMask ? maskId(p.empId) : p.empId);

export function fullReport(c: RCtx, gid: string, period: Period): Rows {
  const { runs, answers } = scope(c.players, c.games, c.dq, gid, period);
  const an = analyze(answers, c.games);
  const R: Rows = [];
  const regd = c.players.length;
  const people = new Set(runs.map((r) => r.uid)).size;
  const ok = answers.filter((x) => x.ok).length,
    to = answers.filter((x) => x.c == null).length;
  R.push(["KNOWLEDGE GAP REPORT"], ["Quiz filter", gid === "all" ? "All quizzes" : c.games[gid]?.title || gid], ["Period", PERIODS.find((p) => p[0] === period)![1]], []);
  R.push(["1. SUMMARY"], ["Metric", "Value"]);
  R.push(
    ["Registered players", regd],
    ["Participants", people],
    ["Participation rate %", pct(people, regd)],
    ["Completed plays", runs.filter((r) => r.done).length],
    ["Plays in progress", runs.filter((r) => !r.done).length],
    ["Questions answered", answers.length],
    ["Correct answers", ok],
    ["Wrong answers", answers.length - ok - to],
    ["Timed out", to],
    ["Overall accuracy %", pct(ok, answers.length)],
    ["Avg seconds per answer", answers.length ? (answers.reduce((s, x) => s + x.ms, 0) / answers.length / 1000).toFixed(1) : 0],
    ["Total points", runs.reduce((s, r) => s + r.points, 0)],
    ["Quizzes open today", Object.values(c.games).filter((g) => isOpen(g)).length],
  );
  R.push([], ["2. KNOWLEDGE GAPS BY TOPIC (weakest first)"], ["Topic", "Answers", "Correct", "Wrong", "Timed out", "Accuracy %", "Gap level"]);
  an.topics.forEach((t) => R.push([t.k, t.n, t.ok, t.n - t.ok - t.to, t.to, t.acc, SEV_LABEL[sevOf(t.acc)]]));
  R.push(["TOTAL", answers.length, ok, answers.length - ok - to, to, pct(ok, answers.length), ""], []);
  const kinds = unitTypes(c.cfg);
  kinds.forEach((type, ix) => {
    const rows = unitStats(type, type === "dept" ? c.cfg.departments : c.cfg.branches, c.players, runs, answers);
    const L = unitWord(c, type);
    R.push([`${3 + ix}. GAPS BY ${L.toUpperCase()} (weakest first)`]);
    R.push([L, "Registered", "Players", "Participation %", "Completed plays", "Answers", "Correct", "Accuracy %", "Gap level", "Avg points per play", "Weakest topic", "Weakest %", "Strongest topic", "Strongest %"]);
    rows.forEach((u) => R.push([u.name, u.registered, u.players, u.registered ? pct(u.players, u.registered) : "", u.plays, u.n, u.ok, u.acc ?? "", SEV_LABEL[u.sev], u.avg || "", u.weak?.k || "", u.weak?.acc ?? "", u.strong?.k || "", u.strong?.acc ?? ""]));
    const sum = (f: (u: (typeof rows)[number]) => number) => rows.reduce((s, u) => s + f(u), 0);
    R.push(["TOTAL", sum((u) => u.registered), sum((u) => u.players), "", sum((u) => u.plays), sum((u) => u.n), sum((u) => u.ok), pct(sum((u) => u.ok), sum((u) => u.n)), "", "", "", "", "", ""], []);
    const tcols = an.topics.map((t) => t.k);
    R.push([`${L} × topic accuracy % (answers)`], [L, ...tcols]);
    rows.forEach((u) => R.push([u.name, ...tcols.map((t) => (u.topic[t] ? `${pct(u.topic[t].ok, u.topic[t].n)}% (${u.topic[t].n})` : "—"))]));
    R.push([]);
  });
  R.push([`${3 + kinds.length}. QUESTION ANALYSIS (most missed first)`], ["Quiz", "Question", "Topic", "Type", "Answered", "Correct", "Wrong", "Accuracy %", "Most common wrong answer", "Times chosen"]);
  an.questions
    .slice()
    .sort((a, b) => a.acc - b.acc)
    .forEach((q) => R.push([c.games[q.gid]?.title || q.gid, q.q?.q || q.qid, q.q?.topic || "", q.q ? TYPE_NAME[q.q.type] : "", q.n, q.ok, q.n - q.ok, q.acc, q.topWrong, q.topWrongN || ""]));
  R.push([], [`${4 + kinds.length}. LEADERBOARD (period)`], ["Rank", "Employee ID", "Name", kinds.length > 1 ? `${LB(c).branch} / ${LB(c).dept}` : unitWord(c, kinds[0]), "Completed plays", "Correct", "Answered", "Accuracy %", "Points"]);
  const from = period === "7" ? Date.now() - 7 * 864e5 : period === "30" ? Date.now() - 30 * 864e5 : period === "today" ? new Date().setHours(0, 0, 0, 0) : 0;
  board(c.players, c.dq, from).forEach((r, i) => {
    const p = c.players.find((x) => x.uid === r.uid);
    R.push([i + 1, idOf(c, p), p?.name || "", p?.unit || "", r.runs, r.correct, r.answered, r.acc, r.points]);
  });
  R.push([], [`${5 + kinds.length}. QUIZZES`], ["Quiz", "Type", "Date", "Status", "Questions", "Time limit (min)", "Completed plays", "Avg points", "Accuracy %"]);
  sortGames(Object.values(c.games).filter((g) => g.kind !== "live")).forEach((g) => {
    const done = runs.filter((r) => r.gid === g.id && r.done);
    const n = done.reduce((s, r) => s + r.answered, 0);
    R.push([g.title, g.kind === "cert" ? "Certification" : "Daily sprint", g.date || "", isScheduled(g) ? "scheduled" : g.status, g.questions.length, limitMs(g) / 60000, done.length, done.length ? Math.round(done.reduce((s, r) => s + r.points, 0) / done.length) : "", n ? pct(done.reduce((s, r) => s + r.correct, 0), n) : ""]);
  });
  return R;
}

export function quizReport(c: RCtx, gid: string): Rows {
  const g = c.games[gid];
  const cert = g.kind === "cert";
  // one row per play; certification exams list every attempt
  const rows = c.players.flatMap((p) => runsOf(p, gid).map(({ r }) => ({ p, r })));
  rows.sort((a, b) => (cert ? b.r.correct - a.r.correct : runPoints(b.r).total - runPoints(a.r).total));
  const { answers } = scope(c.players, c.games, c.dq, gid, "all");
  const an = analyze(answers, c.games);
  const done = rows.filter((x) => x.r.status === "done");
  const n = done.reduce((s, x) => s + x.r.ans.length, 0);
  const correct = done.reduce((s, x) => s + x.r.ans.filter((a) => a.ok).length, 0);
  const R: Rows = [[cert ? "CERTIFICATION RESULTS" : "QUIZ RESULTS"], ["Quiz", g.title], ["Date", g.date || ""]];
  if (cert) R.push(["Pass mark %", g.cert?.passPct ?? 80], ["Attempts allowed", g.cert?.attempts ?? 1], ["Certificate", g.cert?.certTitle || ""]);
  R.push([], ["SUMMARY"], ["Metric", "Value"]);
  if (cert) {
    const people = new Set(rows.map((x) => x.p.uid));
    const passed = new Set(done.filter((x) => x.r.passed).map((x) => x.p.uid));
    R.push(["People who sat the exam", people.size], ["Attempts", rows.length], ["Passed", passed.size], ["Pass rate %", pct(passed.size, people.size)], ["Average score %", pct(correct, n)], []);
  } else
    R.push(
      ["Players", rows.length],
      ["Completed", done.length],
      ["In progress", rows.length - done.length],
      ["Average points", done.length ? Math.round(done.reduce((s, x) => s + runPoints(x.r).total, 0) / done.length) : 0],
      ["Top score", done[0] ? runPoints(done[0].r).total : 0],
      ["Accuracy %", pct(correct, n)],
      ["Perfect runs", done.filter((x) => runPoints(x.r).perfect).length],
      ["Players who used a second chance", done.filter((x) => retryStats(x.r).used).length],
      ["Misses fixed on a second chance", done.reduce((s, x) => s + retryStats(x.r).fixed, 0)],
      [],
    );
  R.push(["QUESTIONS"], ["#", "Question", "Topic", "Answered", "Correct", "Wrong", "Accuracy %", "Most common wrong answer", "Times chosen"]);
  g.questions.forEach((q, i) => {
    const r = an.questions.find((x) => x.qid === q.id);
    R.push([i + 1, q.q, q.topic, r?.n || 0, r?.ok || 0, (r?.n || 0) - (r?.ok || 0), r?.acc ?? "", r?.topWrong || "", r?.topWrongN || ""]);
  });
  if (cert) {
    R.push([], ["ATTEMPTS"], ["Employee ID", "Name", "Unit", "Attempt", "Score", "Score %", "Result", "Time (s)", "Left screen", "Finished"]);
    rows.forEach(({ p, r }) =>
      R.push([idOf(c, p), p.name, p.unit, r.attempt || 1, `${r.correct}/${r.total}`, pct(r.correct, r.total), r.status !== "done" ? "In progress" : r.passed ? "Passed" : "Failed", Math.round(runMs(r) / 1000), r.blur || 0, r.finishedAt ? new Date(r.finishedAt).toLocaleString() : ""]),
    );
  } else {
    R.push([], ["PLAYERS"], ["Rank", "Employee ID", "Name", "Unit", "Points", "Correct", "Total", "Second chances used", "Fixed on second chance", "Second chance points", "Time (s)", "Left screen", "Status", "Finished"]);
    rows.forEach(({ p, r }, i) => {
      const rs = retryStats(r);
      R.push([i + 1, idOf(c, p), p.name, p.unit, runPoints(r).total, r.ans.filter((a) => a.ok).length, r.total, rs.used, rs.fixed, rs.pts, Math.round(runMs(r) / 1000), r.blur || 0, r.status, r.finishedAt ? new Date(r.finishedAt).toLocaleString() : ""]);
    });
  }
  return R;
}

/** Everything one player has played, answer by answer. */
export function playerReport(c: RCtx, uid: string): Rows {
  const p = c.players.find((x) => x.uid === uid);
  if (!p) return [["Player not found"]];
  const s = c.stats[uid];
  const R: Rows = [["PLAYER REPORT"], ["Name", p.name], ["Employee ID", idOf(c, p)], [unitWord(c, p.unitType), p.unit], ["Completed plays", s?.runsDone ?? 0], ["Accuracy %", s?.acc ?? 0], ["Points", s?.points ?? 0], []];
  R.push(["Quiz", "Attempt", "Question", "Topic", "Correct?", "Answer given", "Seconds", "Points", "Second chance", "Second chance answer", "Played on"]);
  for (const [, r] of Object.entries(p.runs || {}).sort((a, b) => (a[1].startedAt || 0) - (b[1].startedAt || 0))) {
    const g = c.games[r.gid];
    r.ans.forEach((a, i) => {
      const q = g?.questions[i];
      R.push([g?.title || r.gid, r.attempt || 1, q?.q || "", q?.topic || "", a.ok ? "Yes" : "No", choiceText(q, a.c), (a.ms / 1000).toFixed(1), a.pts, retryLabel(a), a.rt ? choiceText(q, a.rc) : "", dayKey(r.finishedAt || r.startedAt)]);
    });
  }
  return R;
}

export function answersReport(c: RCtx): Rows {
  const R: Rows = [["Quiz", "Quiz date", "Employee ID", "Name", "Unit", "Unit type", "Question", "Topic", "Type", "Correct?", "Answer given", "Seconds", "Points", "Second chance", "Second chance answer", "Answered on"]];
  let n = 0,
    ok = 0;
  for (const p of c.players)
    for (const r of Object.values(p.runs || {})) {
      const g = c.games[r.gid];
      r.ans.forEach((a, i) => {
        const q = g?.questions[i];
        n++;
        if (a.ok) ok++;
        R.push([g?.title || r.gid, g?.date || "", idOf(c, p), p.name, p.unit, unitWord(c, p.unitType), q?.q || "", q?.topic || "", q ? TYPE_NAME[q.type] : "", a.ok ? "Yes" : "No", choiceText(q, a.c), (a.ms / 1000).toFixed(1), a.pts, retryLabel(a), a.rt ? choiceText(q, a.rc) : "", dayKey(r.finishedAt || r.startedAt)]);
      });
    }
  R.push([], ["TOTAL ANSWERS", n], ["CORRECT", ok], ["WRONG / TIMED OUT", n - ok], ["ACCURACY %", pct(ok, n)]);
  return R;
}

export function usersReport(c: RCtx): Rows {
  const rows = c.players.slice().sort((a, b) => (c.stats[b.uid]?.points || 0) - (c.stats[a.uid]?.points || 0));
  const active = rows.filter((p) => c.stats[p.uid]?.runsDone);
  const R: Rows = [["PLAYERS"], ["Registered", rows.length], ["Have played", active.length], ["Not played yet", rows.length - active.length], []];
  R.push(["Employee ID", "Name", `${LB(c).branch} / ${LB(c).dept}`, "Type", "Email", "Locked", "Registered on", "Consent given", "Completed plays", "Correct", "Answered", "Accuracy %", "Points", "Level", "Coins", "Streak", "Last played"]);
  rows.forEach((p) => {
    const s = c.stats[p.uid];
    R.push([idOf(c, p), p.name, p.unit, unitWord(c, p.unitType), c.cfg.exportMask ? "" : p.email || "", p.locked ? "Yes" : "", new Date(p.createdAt).toLocaleDateString(), p.consentAt ? new Date(p.consentAt).toLocaleString() : "", s.runsDone, s.correct, s.answered, s.acc, s.points, s.level.level, s.coins, s.streak.current, s.lastAt ? new Date(s.lastAt).toLocaleString() : ""]);
  });
  const sum = (f: (s: Stats) => number) => rows.reduce((t, p) => t + f(c.stats[p.uid]), 0);
  R.push(["TOTAL", "", "", "", "", "", "", "", sum((s) => s.runsDone), sum((s) => s.correct), sum((s) => s.answered), pct(sum((s) => s.correct), sum((s) => s.answered)), sum((s) => s.points), "", sum((s) => s.coins), "", ""]);
  return R;
}

export function auditReport(entries: AuditEntry[], names: Record<string, string>): Rows {
  const R: Rows = [["AUDIT LOG"], ["Entries", entries.length], [], ["When", "Who", "Viewer id", "Action", "Target", "Detail", "Severity"]];
  entries.forEach((e) => R.push([new Date(e.at).toLocaleString(), names[e.actor] || "", e.actor, e.action, e.target || "", e.detail || "", e.sev || "info"]));
  return R;
}

/** Wrap every export with a confidentiality header. */
export function watermark(rows: Rows, who: string, org = ""): Rows {
  return [[`${org ? org.toUpperCase() + " — " : ""}CONFIDENTIAL · INTERNAL USE ONLY`], ["Exported", new Date().toLocaleString()], ["Exported by", who], [], ...rows];
}
