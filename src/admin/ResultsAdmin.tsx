import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { Modal } from "../components/ui";
import { analyze, scope } from "../lib/analytics";
import { choiceText } from "../lib/answers";
import { sortGames } from "../lib/games";
import { answersReport, playerReport, quizReport, runsOf } from "../lib/reports";
import { dqKey, retryLabel, retryPoints, retryStats, runMs, runPoints } from "../lib/scoring";
import { dayKey, fmtDT, pct } from "../lib/util";
import type { Player, Run } from "../types";
import { useAdmin } from "./Admin";
import { KIND, slugify, unitWord, useLiveTenant } from "./common";

export function ResultsAdmin() {
  const { d, players, stats, approve, api, tid, can, pub } = useApp();
  const { labels } = useLiveTenant();
  const { param, exportCSV } = useAdmin();
  const gs = sortGames(Object.values(d.games).filter((g) => g.kind !== "live"));
  const [gid, setGid] = useState<string | undefined>(param && d.games[param] ? param : gs[0]?.id);
  const [drill, setDrill] = useState<{ uid: string; key: string } | null>(null);
  useEffect(() => {
    if (param && d.games[param]) setGid(param);
  }, [param, d.games]);
  useEffect(() => {
    if (gid && !d.games[gid]) setGid(gs[0]?.id);
  }, [gid, d.games, gs]);
  const g = gid ? d.games[gid] : undefined;
  const cert = g?.kind === "cert";
  const rctx = { players, games: d.games, dq: d.dq, cfg: d.cfg, stats, labels };

  // sprint: one play per player. cert: all attempts per person.
  const people = useMemo(() => {
    if (!g) return [];
    return players
      .map((p) => ({ p, runs: runsOf(p, g.id) }))
      .filter((x) => x.runs.length)
      .map((x) => {
        const done = x.runs.filter((r) => r.r.status === "done");
        const best = done.slice().sort((a, b) => (cert ? b.r.correct - a.r.correct : runPoints(b.r).total - runPoints(a.r).total))[0] || x.runs[x.runs.length - 1];
        return { ...x, best, passed: done.some((r) => r.r.passed), last: x.runs[x.runs.length - 1] };
      })
      .sort((a, b) => (cert ? Number(b.passed) - Number(a.passed) || b.best.r.correct - a.best.r.correct : runPoints(b.best.r).total - runPoints(a.best.r).total));
  }, [players, g, cert]);
  const an = useMemo(() => (g ? analyze(scope(players, d.games, d.dq, g.id, "all").answers, d.games) : null), [players, d.games, d.dq, g]);

  const reset = (p: Player, key: string, r: Run) =>
    approve({
      label: `Reset ${p.name}'s ${cert ? `attempt ${r.attempt || 1} of` : "play of"} "${g!.title}"${cert ? " — this gives the attempt back" : " so they can play it again"}. Those answers are deleted.`,
      yes: "Reset",
      danger: true,
      run: () => api.adminResetRun(tid, p.uid, key),
    });

  if (!gs.length)
    return (
      <>
        <div className="toolbar"><h1>Results</h1></div>
        <div className="empty">No sprint, story or certification quizzes yet. Live quiz results are shown in the Live quiz tab.</div>
      </>
    );

  const doneAll = people.flatMap((x) => x.runs.filter((r) => r.r.status === "done"));
  const passedN = people.filter((x) => x.passed).length;
  const retries = doneAll.map((x) => retryStats(x.r));
  const retryUsers = retries.filter((x) => x.used).length;
  const retryFixed = retries.reduce((s, x) => s + x.fixed, 0);
  const retryTried = retries.reduce((s, x) => s + x.used, 0);
  // per question: how many people fixed it on their second chance
  const fixedByQ = (i: number) => doneAll.filter((x) => x.r.ans[i]?.rt && (x.r.ans[i]?.rp || 0) > 0).length;
  const avgPct = doneAll.length ? Math.round(doneAll.reduce((s, x) => s + pct(x.r.correct, x.r.total), 0) / doneAll.length) : 0;

  return (
    <>
      <div className="toolbar">
        <h1>Results</h1>
        <select className="sel" value={gid} onChange={(e) => setGid(e.target.value)} aria-label="Quiz">
          {(["sprint", "story", "cert"] as const).map((k) => {
            const list = gs.filter((x) => (x.kind || "sprint") === k);
            return list.length ? (
              <optgroup key={k} label={KIND[k].label}>
                {list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        {g && <button className="btn primary small" onClick={() => exportCSV(`${slugify(pub.slug)}-${slugify(g.title)}-${dayKey(Date.now())}.csv`, `results for ${g.title}`, quizReport(rctx, g.id))}>Export this quiz (CSV)</button>}
        <button className="btn ghost small" onClick={() => exportCSV(`${slugify(pub.slug)}-all-answers-${dayKey(Date.now())}.csv`, "every answer", answersReport(rctx))}>Every answer (CSV)</button>
      </div>

      {g && (
        <div className="kpis">
          {cert ? (
            <>
              <div className="kpi"><span className="label">Sat the exam</span><b className="num">{people.length}</b><span className="sub">{doneAll.length} finished attempts</span></div>
              <div className="kpi hl"><span className="label" style={{ color: "var(--ink)" }}>Passed</span><b className="num">{passedN}</b><span className="sub" style={{ color: "var(--ink-2)" }}>{people.length ? `${pct(passedN, people.length)}% pass rate` : "—"}</span></div>
              <div className="kpi bl"><span className="label">Average score</span><b className="num">{doneAll.length ? `${avgPct}%` : "—"}</b><span className="sub">pass mark {g.cert?.passPct ?? 80}%</span></div>
              <div className="kpi pk"><span className="label">Out of attempts</span><b className="num">{people.filter((x) => !x.passed && x.runs.length >= (g.cert?.attempts || 1) && x.last.r.status === "done").length}</b><span className="sub">failed every attempt</span></div>
            </>
          ) : (
            <>
              <div className="kpi"><span className="label">Players</span><b className="num">{people.length}</b><span className="sub">{doneAll.length} finished</span></div>
              <div className="kpi hl"><span className="label" style={{ color: "var(--ink)" }}>Average score</span><b className="num">{doneAll.length ? `${avgPct}%` : "—"}</b><span className="sub" style={{ color: "var(--ink-2)" }}>right answers</span></div>
              <div className="kpi bl"><span className="label">Top points</span><b className="num">{doneAll.length ? Math.max(...doneAll.map((x) => runPoints(x.r).total)) : "—"}</b></div>
              <div className="kpi pk"><span className="label">Perfect runs</span><b className="num">{doneAll.filter((x) => runPoints(x.r).perfect).length}</b></div>
              <div className="kpi"><span className="label">Second chances</span><b className="num">{retryUsers}</b><span className="sub">{retryTried ? `${retryFixed} of ${retryTried} misses fixed` : "players who retried misses"}</span></div>
            </>
          )}
        </div>
      )}

      {g && an && (
        <section className="panel">
          <div className="panel-h"><div><h2>Question breakdown</h2><p>{g.title} · {KIND[g.kind || "sprint"].label}</p></div></div>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>#</th><th>Question</th><th>Topic</th><th className="r">Answered</th><th className="r">Right</th><th className="r">Accuracy</th>{!cert && <th className="r">Fixed on 2nd try</th>}<th>Most common wrong answer</th></tr></thead>
              <tbody>
                {g.questions.map((q, i) => {
                  const s = an.questions.find((x) => x.qid === q.id);
                  return (
                    <tr key={q.id}>
                      <td className="num">{i + 1}</td>
                      <td className="wrap">{q.q}</td>
                      <td>{q.topic}</td>
                      <td className="r num">{s?.n || 0}</td>
                      <td className="r num">{s?.ok || 0}</td>
                      <td className="r num"><b>{s ? `${s.acc}%` : "—"}</b></td>
                      {!cert && <td className="r num">{fixedByQ(i) || "—"}</td>}
                      <td className="wrap">{s?.topWrong ? <>{s.topWrong} <span className="sub">({s.topWrongN}×)</span></> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {g && (
        <section className="panel">
          <div className="panel-h"><div><h2>{cert ? "People" : "Players"}</h2><p>Select a name to see every answer.</p></div></div>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                {cert ? (
                  <tr><th>Name</th><th>ID</th><th>{labels.branch} / {labels.dept}</th><th className="r">Best score</th><th className="r">Attempts</th><th>Result</th><th>Last attempt</th><th /></tr>
                ) : (
                  <tr><th>#</th><th>Name</th><th>ID</th><th>{labels.branch} / {labels.dept}</th><th className="r">Points</th><th className="r">Right</th><th>Second chance</th><th className="r">Time</th><th className="r">Left screen</th><th>Status</th><th>Finished</th><th /></tr>
                )}
              </thead>
              <tbody>
                {people.map(({ p, runs, best, passed, last }, i) => {
                  const dq = d.dq.runs?.[dqKey(p.uid, g.id)];
                  const who = (
                    <button className="link" onClick={() => setDrill({ uid: p.uid, key: best.key })}>
                      <b>{p.name}</b>
                    </button>
                  );
                  return cert ? (
                    <tr key={p.uid}>
                      <td>{who}</td>
                      <td className="num">{p.empId}</td>
                      <td>{p.unit} <span className="sub">{unitWord(labels, p.unitType)}</span></td>
                      <td className="r num"><b>{best.r.status === "done" ? `${pct(best.r.correct, best.r.total)}%` : "—"}</b> <span className="sub">{best.r.correct}/{best.r.total}</span></td>
                      <td className="r num">{runs.length}/{g.cert?.attempts || 1}</td>
                      <td>
                        {last.r.status !== "done" && !passed ? <span className="sev info">In progress</span> : passed ? <span className="sev good">Passed</span> : <span className="sev bad">Failed</span>}
                        {dq && <span className="sev alert" style={{ marginLeft: 6 }}>Disqualified</span>}
                      </td>
                      <td className="num">{fmtDT(last.r.finishedAt || last.r.startedAt)}</td>
                      <td>{can("admin") && <button className="link danger" onClick={() => reset(p, last.key, last.r)}>Reset last attempt</button>}</td>
                    </tr>
                  ) : (
                    <tr key={p.uid}>
                      <td className="num">{i + 1}</td>
                      <td>{who}</td>
                      <td className="num">{p.empId}</td>
                      <td>{p.unit}</td>
                      <td className="r num"><b>{runPoints(best.r).total}</b></td>
                      <td className="r num">{best.r.ans.filter((a) => a.ok).length}/{best.r.total}</td>
                      <td><RetryCell r={best.r} /></td>
                      <td className="r num">{Math.round(runMs(best.r) / 1000)}s</td>
                      <td className="r num">{best.r.blur || 0}</td>
                      <td>
                        {best.r.status === "done" ? "Done" : "Playing"}
                        {dq && <span className="sev alert" style={{ marginLeft: 6 }}>Disqualified</span>}
                      </td>
                      <td className="num">{fmtDT(best.r.finishedAt)}</td>
                      <td>{can("admin") && <button className="link danger" onClick={() => reset(p, best.key, best.r)}>Reset</button>}</td>
                    </tr>
                  );
                })}
                {!people.length && <tr><td colSpan={12} className="fine">No plays yet for this quiz.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {drill && d.players[drill.uid] && g && <Drill p={d.players[drill.uid]} gid={g.id} initial={drill.key} onClose={() => setDrill(null)} />}
    </>
  );
}

function Drill({ p, gid, initial, onClose }: { p: Player; gid: string; initial: string; onClose: () => void }) {
  const { d, players, stats, pub } = useApp();
  const { labels } = useLiveTenant();
  const { exportCSV } = useAdmin();
  const g = d.games[gid];
  const runs = runsOf(p, gid);
  const [key, setKey] = useState(runs.some((r) => r.key === initial) ? initial : runs[0]?.key);
  const r = runs.find((x) => x.key === key)?.r;
  const canon = d.keys[gid]?.answers || {};
  const s = stats[p.uid];
  return (
    <Modal label={`${p.name} — ${g.title}`} onClose={onClose} wide>
      <div className="stack">
        <div className="panel-h">
          <div>
            <h3>{p.name}</h3>
            <p className="fine">{p.empId} · {p.unit} ({unitWord(labels, p.unitType).toLowerCase()}) · {s?.runsDone ?? 0} plays overall · {s?.acc ?? 0}% accuracy</p>
          </div>
          <button className="btn ghost small" onClick={() => exportCSV(`${slugify(pub.slug)}-player-${slugify(p.name)}-${dayKey(Date.now())}.csv`, `every answer by ${p.name}`, playerReport({ players, games: d.games, dq: d.dq, cfg: d.cfg, stats, labels }, p.uid))}>
            Player report (CSV)
          </button>
        </div>
        {runs.length > 1 && (
          <div className="chips-row" role="group" aria-label="Attempt">
            {runs.map((x) => (
              <button key={x.key} className={`chip-tg ${x.key === key ? "on" : ""}`} aria-pressed={x.key === key} onClick={() => setKey(x.key)}>
                Attempt {x.r.attempt || 1} · {pct(x.r.correct, x.r.total)}% {x.r.passed ? "✓" : ""}
              </button>
            ))}
          </div>
        )}
        {r ? (
          <>
            <p className="fine">
              {r.status === "done" ? `Finished ${fmtDT(r.finishedAt)}` : "Still playing"} · {r.ans.filter((a) => a.ok).length}/{r.total} right
              {g.kind === "cert" ? ` · ${r.passed ? "passed" : r.status === "done" ? "failed" : ""}` : ` · ${runPoints(r).total} points`}
              {g.kind !== "cert" && retryStats(r).used ? ` · second chance: fixed ${retryStats(r).fixed} of ${retryStats(r).used} (+${retryStats(r).pts})` : ""} · {Math.round(runMs(r) / 1000)}s answering · left the screen {r.blur || 0}×
            </p>
            <div className="scroll-x">
              <table className="tbl drill">
                <thead><tr><th>#</th><th>Question</th><th>Their answer</th><th>Right answer</th><th className="r">Time</th><th className="r">Pts</th></tr></thead>
                <tbody>
                  {g.questions.map((q, i) => {
                    const a = r.ans[i];
                    return (
                      <tr key={q.id}>
                        <td className="num">{i + 1}</td>
                        <td className="wrap">{q.q}</td>
                        <td className="wrap">
                          {a ? <><span className={`sev ${a.ok ? "good" : "bad"}`}>{a.ok ? "Right" : a.sk ? "Skipped" : "Wrong"}</span> {a.ok ? "" : choiceText(q, a.c)}</> : <span className="sub">not reached</span>}
                          {a?.rt && (
                            <span className="retry-note">
                              <span className={`sev ${(a.rp || 0) > 0 ? "good" : "warn"}`}>2nd chance · {retryLabel(a)}</span> {choiceText(q, a.rc)}
                            </span>
                          )}
                        </td>
                        <td className="wrap">{canon[q.id] ? choiceText(q, canon[q.id]) : "—"}</td>
                        <td className="r num">{a ? `${(a.ms / 1000).toFixed(1)}s` : ""}</td>
                        <td className="r num">{a ? a.pts + retryPoints(a) : ""}{a?.rt && retryPoints(a) ? <span className="sub"> ({a.pts}+{retryPoints(a)})</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="fine">No play found.</p>
        )}
        <div className="row end"><button className="btn primary small" onClick={onClose}>Close</button></div>
      </div>
    </Modal>
  );
}

/** Players table: how this play used its second chance. */
function RetryCell({ r }: { r: Run }) {
  if (r.status !== "done") return <span className="sub">—</span>;
  const s = retryStats(r);
  if (!s.misses) return <span className="sev good">Flawless</span>;
  if (!s.used) return <span className="sub">Not used · {s.misses} miss{s.misses > 1 ? "es" : ""}</span>;
  return (
    <span className={`sev ${s.fixed ? "good" : "warn"}`} title={`${s.used} of ${s.misses} misses retried`}>
      Fixed {s.fixed}/{s.used} · +{s.pts}
    </span>
  );
}
