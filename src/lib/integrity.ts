/* =====================================================================
   Integrity scan (admins).
   Scoring happens on the server, so this is a second pair of eyes over
   the stored plays: it re-derives every answer's right/wrong and points
   from the admin-only answer key and the quiz rules, and looks for
   timing, identity and device patterns worth a human look.
   Nothing here changes data — admins decide (disqualify / restore).
   ===================================================================== */
import type { AnswerKey, Game, Player, Roster, Run } from "../types";
import { GRACE_MS, isRight, scoreAnswer } from "../api/engine";
import { limitMs, RULES, runMs, runPoints, statsOf } from "./scoring";
import { sha256 } from "./security";

export type Sev = "alert" | "warn" | "info";
export interface Flag {
  sev: Sev;
  uid: string;
  gid?: string;
  /** run key (quiz id, or "<quizId>~<attempt>" for later certification attempts) */
  key?: string;
  kind: string;
  detail: string;
}

const DAY = 864e5;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Checks one play against its quiz and answer key. Pure — exported for tests. */
export function checkRun(r: Run, g: Game, key: Record<string, string> | undefined): { sev: Sev; kind: string; detail: string }[] {
  const out: { sev: Sev; kind: string; detail: string }[] = [];
  const mk = (sev: Sev, kind: string, detail: string) => out.push({ sev, kind, detail });
  const ans = r.ans || [];
  const cert = g.kind === "cert";
  // A quiz edited after the play started may have different questions or timing: only re-score unchanged quizzes.
  const unchanged = !g.updatedAt || !r.startedAt || g.updatedAt <= r.startedAt;

  if (ans.length > g.questions.length) mk("alert", "Extra answers", `${ans.length} answers recorded for a ${g.questions.length}-question quiz.`);

  if (key && unchanged) {
    let wrongMark = 0,
      wrongPts = 0;
    ans.forEach((a, i) => {
      const q = g.questions[i];
      if (!q) return;
      const ok = a.c == null ? false : isRight(key[q.id], a.c);
      if (Number(ok) !== Number(!!a.ok)) wrongMark++;
      const expect = scoreAnswer(g, ok, Math.max(0, a.ms || 0));
      if (Math.abs((a.pts || 0) - expect) > 1) wrongPts++;
    });
    if (wrongMark) mk("alert", "Answer doesn't match key", `${plural(wrongMark, "answer was", "answers were")} marked right or wrong differently from the answer key.`);
    // right/wrong is what matters; a speed bonus that differs (but stays in range) is only worth a note —
    // boards cap it anyway, and imported or migrated plays may have been timed differently.
    else if (wrongPts) mk("info", "Speed bonus differs", `${plural(wrongPts, "answer's", "answers'")} speed bonus differs from the current rules (points stay within the allowed range).`);
  } else if (!key) mk("info", "No answer key", "This quiz has no answer key, so its plays can't be re-checked.");

  const maxPts = cert ? 1 : RULES.base + RULES.speedMax;
  if (ans.some((a) => (a.pts || 0) > maxPts || (!a.ok && (a.pts || 0) > 0))) mk("alert", "Points out of range", "An answer carries more points than the rules allow.");

  if (r.status === "done") {
    const correct = ans.filter((a) => a.ok).length;
    const expectScore = cert ? correct : runPoints(r).total;
    if (typeof r.score === "number" && Math.abs(r.score - expectScore) > 1)
      mk("warn", "Score edited", `Saved score ${r.score} differs from the recalculated ${expectScore}. Boards use the recalculated figure.`);
    if (cert && r.total > 0 && typeof r.passed === "boolean") {
      const should = (correct / r.total) * 100 >= (g.cert?.passPct ?? 80);
      if (should !== r.passed) mk("alert", "Pass/fail mismatch", `Marked ${r.passed ? "passed" : "failed"} but scored ${Math.round((correct / r.total) * 100)}% against a ${g.cert?.passPct ?? 80}% pass mark.`);
    }
  }

  const used = runMs(r);
  if (unchanged && used > limitMs(g) + GRACE_MS * 2) mk("warn", "Over time", `Answers add up to ${Math.round(used / 1000)}s on a ${Math.round(limitMs(g) / 1000)}s quiz.`);
  if (r.finishedAt && r.startedAt && r.finishedAt - r.startedAt + 5000 < used) mk("alert", "Impossible clock", "More answer time was recorded than passed between start and finish.");
  const fast = ans.filter((a) => a.ok && a.c != null && (a.ms || 0) < RULES.tooFastMs).length;
  if (fast >= 2) mk("warn", "Very fast answers", `${fast} right answers in under ${RULES.tooFastMs / 1000}s each.`);
  if (g.date && r.startedAt && r.startedAt < new Date(g.date + "T00:00").getTime()) mk("alert", "Played before release", `Started before the quiz opened on ${g.date}.`);
  if (g.until && r.startedAt && r.startedAt > new Date(g.until + "T23:59:59").getTime()) mk("warn", "Played after close", `Started after the quiz closed on ${g.until}.`);
  if ((r.blur || 0) >= 3) mk("info", "Left the quiz screen", `Switched away ${r.blur} times during the quiz.`);
  return out;
}

export async function scan(players: Player[], games: Record<string, Game>, keys: Record<string, AnswerKey>, roster: Roster | null): Promise<Flag[]> {
  const out: Flag[] = [];
  const byEmp = new Map<string, string[]>();
  const byDev = new Map<string, Set<string>>();
  const allowed = roster?.hashes?.length ? new Set(roster.hashes) : null;
  const since = Date.now() - 30 * DAY;

  for (const p of players) {
    byEmp.set(p.empId, [...(byEmp.get(p.empId) || []), p.uid]);
    // allowlist hashes are sha256(salt + EMPID) — no separator, same as the backend
    if (allowed && !allowed.has(await sha256(roster!.salt + p.empId)))
      out.push({ sev: "warn", uid: p.uid, kind: "Not on staff list", detail: `ID ${p.empId} isn't on the uploaded staff allowlist.` });

    const week = new Set((p.logins || []).filter((l) => l.at >= Date.now() - 7 * DAY).map((l) => l.dev));
    if (week.size >= 3) out.push({ sev: "warn", uid: p.uid, kind: "Many devices", detail: `Signed in from ${week.size} different devices this week. Check nobody else is using this card.` });
    for (const l of p.logins || []) if (l.at >= since && l.dev) (byDev.get(l.dev) || byDev.set(l.dev, new Set()).get(l.dev)!).add(p.uid);

    const attempts = new Map<string, number>();
    for (const [k, r] of Object.entries(p.runs || {})) {
      const g = games[r.gid];
      if (!g || g.kind === "live") continue;
      attempts.set(r.gid, (attempts.get(r.gid) || 0) + 1);
      for (const f of checkRun(r, g, keys[r.gid]?.answers)) out.push({ ...f, uid: p.uid, gid: r.gid, key: k });
    }
    for (const [gid, n] of attempts) {
      const g = games[gid];
      const max = g.kind === "cert" ? g.cert?.attempts || 1 : 1;
      if (n > max) out.push({ sev: "alert", uid: p.uid, gid, kind: "Too many attempts", detail: `${n} plays recorded; the quiz allows ${max}.` });
    }

    const s = statsOf(p, null);
    if (s.coinsSpent > s.coinsEarned) out.push({ sev: "warn", uid: p.uid, kind: "Coins overspent", detail: `Spent ${s.coinsSpent} coins but earned ${s.coinsEarned}.` });
  }

  for (const [emp, uids] of byEmp) if (uids.length > 1) uids.forEach((uid) => out.push({ sev: "alert", uid, kind: "Shared employee ID", detail: `ID ${emp} is used by ${uids.length} player cards.` }));
  const name = (uid: string) => players.find((x) => x.uid === uid)?.name || uid;
  for (const [dev, uids] of byDev)
    if (uids.size > 1)
      for (const uid of uids)
        out.push({ sev: "warn", uid, kind: "Shared device", detail: `Same browser (${dev}) also signed in as ${[...uids].filter((u) => u !== uid).map(name).join(", ")} in the last 30 days.` });

  const order: Record<Sev, number> = { alert: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}
