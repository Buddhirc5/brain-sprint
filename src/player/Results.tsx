import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { coinBurst, confetti, CountUp, Icon } from "../components/ui";
import { choiceText } from "../lib/answers";
import { isOpen } from "../lib/games";
import { board, gameBoard, RULES, runCoins, runMs, runPoints, windowStart } from "../lib/scoring";
import { dayKey, pct, reducedMotion } from "../lib/util";
import { runKey, type Game, type Run } from "../types";
import { Avatar, certHref, certInfo, CoinPill, finishCache, fmtLongDate, pubName, scorePct, TopBar } from "./common";

export function Results({ gid, fresh }: { gid: string; fresh?: boolean }) {
  const { d, me, go } = useApp();
  const g = d.games[gid];
  if (!g || !me)
    return (
      <div className="phone">
        <TopBar title="Scorecard" back={() => go({ v: "lobby" })} />
        <div className="empty">No scorecard yet.</div>
      </div>
    );
  return g.kind === "cert" ? <CertResult g={g} fresh={fresh} /> : <SprintResult g={g} fresh={fresh} />;
}

/* ---------------- certification ---------------- */
function CertResult({ g, fresh }: { g: Game; fresh?: boolean }) {
  const { api, tid, me, go, slug } = useApp();
  const info = certInfo(me, g);
  // the attempt to show: the passed one, else the latest finished one
  const shownN = info.passed ? info.runs.indexOf(info.passed) + 1 : info.latest?.status === "done" ? info.attempt : info.attempt - 1;
  const ck = me ? `${tid}|${me.uid}|${runKey(g.id, shownN)}` : "";
  const cached = finishCache.get(ck);
  const run: Run | undefined = (shownN > 0 ? me?.runs?.[runKey(g.id, shownN)] : undefined) || cached?.run;
  const [key, setKey] = useState<Record<string, string> | undefined>(cached?.key);
  const [review, setReview] = useState(false);

  // answers (if the exam allows it) come from finishRun — only ask when the latest attempt is finished,
  // so we never end an attempt that is still in progress
  useEffect(() => {
    // (shown only once no more attempts are possible, so answers can't carry over to a retry)
    if (key || !g.cert?.showAnswers || !info.latest || info.latest.status !== "done" || !(info.passed || info.left === 0)) return;
    let live = true;
    api.finishRun(tid, g.id).then(
      (r) => {
        if (!live) return;
        finishCache.set(ck, r);
        setKey(r.key);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api, tid, g.id, g.cert?.showAnswers, info.latest, info.passed, info.left, key, ck]);

  useEffect(() => {
    if (fresh && run?.passed) {
      const t = setTimeout(() => confetti(), 300);
      return () => clearTimeout(t);
    }
  }, [fresh, run?.passed]);

  if (!me || !run || run.status !== "done")
    return (
      <div className="phone">
        <TopBar title={g.title} back={() => go({ v: "certs" })} />
        <div className="empty">No finished attempt yet.</div>
      </div>
    );

  const p = scorePct(run);
  const passMark = g.cert?.passPct ?? 80;
  const canRetry = !info.passed && info.left > 0 && isOpen(g) && !info.playing;
  const n = shownN;

  return (
    <div className="phone">
      <TopBar title="Exam result" back={() => go({ v: "certs" })} />
      <section className={`res cert-res ${run.passed ? "pass" : "fail"}`}>
        <span className="hand">{run.passed ? "You passed!" : "Not this time"}</span>
        <div className="score num">{fresh ? <CountUp to={p} /> : p}%</div>
        <p className="unit">
          {run.correct} of {run.total} correct · pass mark {passMark}%
        </p>
        <p className="fine cert-sub">
          {g.title} · attempt {n} of {info.max}
          {run.finishedAt ? ` · ${fmtLongDate(run.finishedAt)}` : ""}
        </p>
        <div className="res-char" aria-hidden="true">
          <Chibi look={me.look} equipped={me.equipped} variant="full" size={118} mood={run.passed ? "cheer" : "think"} />
        </div>
      </section>

      {run.passed ? (
        <div className="card stack">
          <b>{g.cert?.certTitle || g.title}</b>
          <p className="fine">
            Your certificate is ready.
            {info.validUntil ? ` It's valid until ${fmtLongDate(info.validUntil)}.` : ""}
          </p>
          <a className="btn primary block" href={certHref(slug, g.id, n)}>
            <Icon.trophy /> View certificate
          </a>
        </div>
      ) : (
        <div className="card stack">
          <p>
            You needed <b>{passMark}%</b> to pass.{" "}
            {info.left > 0 ? `You have ${info.left} attempt${info.left > 1 ? "s" : ""} left.` : "You've used all your attempts — please talk to your admin."}
          </p>
          {canRetry && (
            <button type="button" className="btn primary block" onClick={() => go({ v: "play", gid: g.id })}>
              Try again
            </button>
          )}
        </div>
      )}

      {key && (info.passed || info.left === 0) && (
        <div className="card stack">
          <button type="button" className="row" style={{ justifyContent: "space-between", width: "100%" }} onClick={() => setReview(!review)} aria-expanded={review}>
            <b>Review your answers</b>
            <span className="link">{review ? "Hide" : "Show"}</span>
          </button>
          {review && (
            <ol className="review">
              {g.questions.map((q, i) => {
                const a = run.ans[i];
                const right = key[q.id];
                const ok = a?.c != null && a.c === right;
                return (
                  <li key={q.id} className={ok ? "ok" : "no"}>
                    <b>{q.q}</b>
                    <span>
                      Your answer: {a?.sk ? "Not answered" : choiceText(q, a?.c)} {ok ? "✓" : "✕"}
                    </span>
                    {!ok && right != null && <span>Right answer: {choiceText(q, right)}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
      <button type="button" className="btn ghost block" onClick={() => go({ v: "certs" })}>
        All certifications
      </button>
    </div>
  );
}

/* ---------------- daily sprint ---------------- */
function SprintResult({ g, fresh }: { g: Game; fresh?: boolean }) {
  const { tid, d, me, stats, go, players, features } = useApp();
  const gid = g.id;
  const run = me?.runs?.[gid] || (me ? finishCache.get(`${tid}|${me.uid}|${gid}`)?.run : undefined);
  const coinsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fresh || !run) return;
    const acc = pct(run.ans.filter((a) => a.ok).length, run.ans.length);
    const t1 = setTimeout(() => acc >= 50 && confetti(), 250);
    const t2 = setTimeout(() => features.coins && coinBurst(coinsRef.current, 10), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fresh, !!run]);

  if (!run || !me || run.status !== "done")
    return (
      <div className="phone">
        <TopBar title={g.title} back={() => go({ v: "lobby" })} />
        <div className="empty">No scorecard yet.</div>
      </div>
    );

  const pts = runPoints(run);
  const coins = runCoins(run);
  const correct = run.ans.filter((a) => a.ok).length;
  const acc = pct(correct, run.ans.length);
  const s = stats[me.uid];
  const day = run.finishedAt ? dayKey(run.finishedAt) : "";
  const firstToday =
    Object.values(me.runs || {})
      .filter((r) => r.status === "done" && r.finishedAt && dayKey(r.finishedAt) === day)
      .sort((a, b) => a.finishedAt! - b.finishedAt!)[0]?.gid === gid;
  const streakBonus = features.streaks && firstToday ? s?.streak.bonusByDay[day] || 0 : 0;
  const gb = gameBoard(players, d.dq, gid);
  const rank = gb.findIndex((r) => r.uid === me.uid) + 1;
  const hand = acc >= 90 ? "Legend status!" : acc >= 70 ? "Great run!" : acc >= 50 ? "Solid effort!" : "Every miss is a lesson.";
  const mood = acc >= 70 ? "cheer" : acc >= 40 ? "happy" : "think";
  const weak: Record<string, number> = {};
  run.ans.forEach((a, i) => {
    if (!a.ok) {
      const t = g.questions[i]?.topic || "General";
      weak[t] = (weak[t] || 0) + 1;
    }
  });

  return (
    <div className="phone">
      <TopBar title={g.title} back={() => go({ v: "lobby" })} right={<CoinPill />} />
      <section className="res">
        <span className="hand">{hand}</span>
        <div className="score num">{fresh ? <CountUp to={pts.total} /> : pts.total.toLocaleString()}</div>
        <p className="unit">
          points · {correct} of {run.total} correct
        </p>
        <div className="dots" aria-hidden="true">
          {run.ans.map((a, i) => (
            <i key={i} className={a.ok ? "ok" : ""} />
          ))}
        </div>
        <div className="res-char" aria-hidden="true">
          <Chibi look={me.look} equipped={me.equipped} variant="full" size={118} mood={mood} />
        </div>
      </section>

      <section className="card" aria-label="Scorecard">
        <div className="label" style={{ marginBottom: 4 }}>
          Scorecard
        </div>
        <div className="scorecard">
          <div className="ln">
            <span>
              Correct answers{" "}
              <span className="muted">
                {correct} × {RULES.base}
              </span>
            </span>
            <span className="v">{pts.base}</span>
          </div>
          <div className="ln">
            <span>
              Speed bonus <span className="muted">faster = more, up to {RULES.speedMax} each</span>
            </span>
            <span className="v">+{pts.speed}</span>
          </div>
          <div className="ln">
            <span>
              Perfect run bonus <span className="muted">every answer right</span>
            </span>
            <span className="v">{pts.perfect ? `+${pts.perfect}` : "—"}</span>
          </div>
          <div className="ln tot">
            <span>Points</span>
            <span className="v">{pts.total}</span>
          </div>
        </div>
        {features.coins && (
          <div className="scorecard" style={{ marginTop: 14 }} ref={coinsRef}>
            <div className="ln">
              <span>
                <span className="coin-ic" />
                Correct answers{" "}
                <span className="muted">
                  {correct} × {RULES.coinPerCorrect}
                </span>
              </span>
              <span className="v">{coins.correct}</span>
            </div>
            <div className="ln">
              <span>
                <span className="coin-ic" />
                Finished the quiz
              </span>
              <span className="v">+{coins.finish}</span>
            </div>
            {coins.perfect > 0 && (
              <div className="ln">
                <span>
                  <span className="coin-ic" />
                  Perfect run
                </span>
                <span className="v">+{coins.perfect}</span>
              </div>
            )}
            {streakBonus > 0 && (
              <div className="ln">
                <span>
                  <span className="coin-ic" />
                  Streak bonus <span className="muted">first play today</span>
                </span>
                <span className="v">+{streakBonus}</span>
              </div>
            )}
            <div className="ln tot">
              <span>Coins earned</span>
              <span className="v">{coins.total + streakBonus}</span>
            </div>
          </div>
        )}
      </section>

      <Climb gid={gid} animate={!!fresh} />

      <div className="res-stats">
        <div>
          <b className="num">{rank ? `#${rank}` : "—"}</b>
          <small>in this quiz</small>
        </div>
        <div>
          <b className="num">{acc}%</b>
          <small>accuracy</small>
        </div>
        <div>
          <b className="num">{Math.round(runMs(run) / 1000)}s</b>
          <small>time used</small>
        </div>
      </div>
      {Object.keys(weak).length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          <div className="label">Worth a refresh</div>
          <div className="row" style={{ gap: 6 }}>
            {Object.entries(weak)
              .sort((a, b) => b[1] - a[1])
              .map(([t]) => (
                <span key={t} className="chip" style={{ background: "var(--orange-soft)" }}>
                  {t}
                </span>
              ))}
          </div>
        </div>
      )}
      <button type="button" className="btn primary block" onClick={() => go({ v: "board" })}>
        See the full leaderboard
      </button>
      {features.store && features.coins && (
        <button type="button" className="btn ghost block" onClick={() => go({ v: "store" })}>
          Spend coins in the store
        </button>
      )}
      <button type="button" className="btn ghost block" onClick={() => go({ v: "lobby" })}>
        Back to the lobby
      </button>
    </div>
  );
}

/** This week's board before vs after this quiz — your row slides into its new place. */
function Climb({ gid, animate }: { gid: string; animate: boolean }) {
  const { d, me, players } = useApp();
  const from = windowStart("week");
  const after = useMemo(() => board(players, d.dq, from), [players, d.dq, from]);
  const before = useMemo(() => (me ? board(players, d.dq, from, Infinity, { uid: me.uid, gid }) : []), [players, d.dq, from, me, gid]);
  const [run, setRun] = useState(!animate || reducedMotion());
  const [shownRank, setShownRank] = useState(0);
  const newIdx = me ? after.findIndex((r) => r.uid === me.uid) : -1;
  let oldIdx = me ? before.findIndex((r) => r.uid === me.uid) : -1;
  const isNew = oldIdx < 0;
  if (isNew) oldIdx = before.length;

  useEffect(() => {
    if (run) return;
    const t = setTimeout(() => setRun(true), 800);
    return () => clearTimeout(t);
  }, [run]);
  useEffect(() => {
    if (newIdx < 0) return;
    if (!run) {
      setShownRank(oldIdx + 1);
      return;
    }
    const a = oldIdx + 1,
      b = newIdx + 1;
    if (a === b || reducedMotion()) {
      setShownRank(b);
      return;
    }
    let cur = a;
    const iv = setInterval(() => {
      cur += a > b ? -1 : 1;
      setShownRank(cur);
      if (cur === b) clearInterval(iv);
    }, Math.max(40, 850 / Math.abs(a - b)));
    return () => clearInterval(iv);
  }, [run, oldIdx, newIdx]);

  if (!me || newIdx < 0) return null;
  const RH = 64;
  const start = Math.max(0, newIdx - 2),
    end = Math.min(after.length - 1, start + 4),
    count = end - start + 1;
  const rows = after.slice(start, end + 1);
  const topOf = (idx: number) => Math.max(-1, Math.min(count, idx - start)) * RH;
  const climbed = oldIdx - newIdx;
  const head = isNew ? "New on this week's board!" : climbed > 0 ? `You climbed ${climbed} place${climbed > 1 ? "s" : ""}!` : "Holding your spot!";

  return (
    <section className="climb" aria-label="This week's leaderboard">
      <div className="climb-h">
        <div>
          <div className="label">This week</div>
          <span className="hand">{head}</span>
        </div>
        <div className="climb-rank num">
          #{shownRank || newIdx + 1}
          {climbed > 0 && run && <span className="arrow">▲</span>}
        </div>
      </div>
      <div className="climb-list" style={{ height: count * RH }}>
        {rows.map((row, k) => {
          const mine = row.uid === me.uid;
          let bi = mine ? oldIdx : before.findIndex((y) => y.uid === row.uid);
          if (bi < 0) bi = after.length;
          const p = d.players[row.uid];
          return (
            <div key={row.uid} className={`lb-row ${mine ? "me-row" : ""}`} style={{ top: run ? k * RH : topOf(bi), height: RH - 8 }}>
              <span className="lb-rank num">{mine ? shownRank || start + k + 1 : start + k + 1}</span>
              <Avatar p={p} size={40} />
              <div className="lb-name">
                <b>
                  {pubName(p, d.cfg)}
                  {mine ? " (you)" : ""}
                </b>
                <span className="sub">{p?.unit}</span>
              </div>
              <span className="lb-score num">{row.points.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
