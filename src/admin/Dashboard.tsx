import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { Seg } from "../components/ui";
import { analyze, PERIODS, scope, SEV_HEX, SEV_LABEL, sevOf, unitStats, type Period, type QStat } from "../lib/analytics";
import { sortGames } from "../lib/games";
import { board } from "../lib/scoring";
import { fullReport } from "../lib/reports";
import { dayKey, mix, pct } from "../lib/util";
import { Avatar } from "../player/common";
import { useAdmin } from "./Admin";
import { slugify, unitWord, unitsWord, useLiveTenant } from "./common";
import type { Labels, QuizKind, UnitType } from "../types";
import { unitTypes } from "../api/engine";
import type { UnitStat } from "../lib/analytics";
import { GapTrend } from "./GapTrend";
import { ReportView, type ReportData } from "./Report";
import { useApi } from "../app/ApiCtx";

export function Dashboard() {
  const { d, players, stats, pub, can, features, api, tid, approve } = useApp();
  const { user } = useApi();
  const [rep, setRep] = useState<ReportData | null>(null);
  const { labels } = useLiveTenant();
  const { exportCSV, setTab } = useAdmin();
  const hasCert = Object.values(d.games).some((g) => g.kind === "cert");
  const [withCert, setWithCert] = useState(false);
  const kinds: QuizKind[] = withCert ? ["sprint", "cert"] : ["sprint"];
  const quizzes = useMemo(() => sortGames(Object.values(d.games).filter((g) => g.kind !== "live" && (withCert || g.kind !== "cert"))), [d.games, withCert]);
  const [period, setPeriod] = useState<Period>("all");
  const [gid, setGid] = useState("all");
  // only the kinds of unit this company uses (Settings → How your staff are organised)
  const types = unitTypes(d.cfg);
  const [ut0, setUt] = useState<UnitType>(types[0]);
  const ut: UnitType = types.includes(ut0) ? ut0 : types[0];
  useEffect(() => {
    if (gid !== "all" && !quizzes.some((g) => g.id === gid)) setGid("all");
  }, [gid, quizzes]);

  const { runs, answers } = useMemo(() => scope(players, d.games, d.dq, gid, period, kinds), [players, d.games, d.dq, gid, period, withCert]);
  const an = useMemo(() => analyze(answers, d.games), [answers, d.games]);
  const byType = useMemo(
    () => Object.fromEntries(types.map((t) => [t, unitStats(t, t === "dept" ? d.cfg.departments : d.cfg.branches, players, runs, answers)])) as Partial<Record<UnitType, UnitStat[]>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [types.join(), d.cfg, players, runs, answers],
  );
  const urows = byType[ut] || [];
  const from = period === "7" ? Date.now() - 7 * 864e5 : period === "30" ? Date.now() - 30 * 864e5 : period === "today" ? new Date().setHours(0, 0, 0, 0) : 0;
  const lb = useMemo(() => board(players, d.dq, from).filter((r) => gid === "all" || d.players[r.uid]?.runs?.[gid]).slice(0, 10), [players, d.dq, from, gid, d.players]);
  const certRuns = runs.filter((r) => r.kind === "cert" && r.done);
  const certPass = new Set(certRuns.filter((r) => r.passed).map((r) => r.uid)).size;
  const certPeople = new Set(certRuns.map((r) => r.uid)).size;

  const regd = players.length;
  const people = new Set(runs.map((r) => r.uid)).size;
  const done = runs.filter((r) => r.done).length;
  const ok = answers.filter((x) => x.ok).length;
  const avgMs = answers.length ? answers.reduce((s, x) => s + x.ms, 0) / answers.length : 0;
  const demo = players.some((p) => p.demo);
  const tcols = an.topics.map((t) => t.k);
  const qs = an.questions.filter((r) => r.n >= 2);
  const missed = qs.filter((r) => r.ok < r.n).sort((a, b) => a.acc - b.acc || b.n - a.n).slice(0, 8);
  const best = qs.slice().sort((a, b) => b.acc - a.acc || b.n - a.n).slice(0, 8);
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const dd = new Date();
    dd.setDate(dd.getDate() - i);
    days.push(dayKey(dd));
  }
  const perDay: Record<string, number> = {};
  scope(players, d.games, d.dq, gid, "all", kinds).runs.forEach((r) => {
    if (r.done) perDay[dayKey(r.at)] = (perDay[dayKey(r.at)] || 0) + 1;
  });
  const partMax = Math.max(1, ...urows.map((x) => Math.max(x.registered, x.players)));
  const pLabel = PERIODS.find((p) => p[0] === period)![1];
  const openReport = () =>
    approve({
      label: `Open the PDF report. It contains staff names — keep it inside ${pub.name}.`,
      yes: "Open report",
      run: async () =>
        setRep({
          company: pub.name,
          product: pub.branding.productName,
          logo: pub.branding.logo,
          period: pLabel,
          quiz: gid === "all" ? (withCert ? "All sprints and certifications" : "All sprints") : d.games[gid]?.title || "Quiz",
          by: user?.email || "admin",

          kpi: { registered: regd, active: people, plays: done, acc: answers.length ? pct(ok, answers.length) : null, avgSec: avgMs / 1000, certPass, certPeople },
          topics: an.topics,
          unitGroups: types.map((t) => ({ word: unitWord(labels, t), words: unitsWord(labels, t), units: byType[t] || [] })),
          leaders: lb.map((r) => ({ name: d.players[r.uid]?.name || "Player", unit: d.players[r.uid]?.unit || "", plays: r.runs, acc: r.acc, points: r.points })),
          missed,
          best,
          days: days.map((k) => ({ k, n: perDay[k] || 0 })),
        }),
    });
  const downloadReport = async () => {
    const t = document.title;
    document.title = `${slugify(pub.slug)}-knowledge-report-${dayKey(Date.now())}`;
    await api.audit(tid, { action: "Exported data", target: "PDF knowledge report", detail: `${pLabel} · ${rep?.quiz}` }).catch(() => {});
    window.print();
    document.title = t;
  };

  return (
    <>
      {rep && <ReportView data={rep} onClose={() => setRep(null)} onDownload={() => void downloadReport()} />}
      <div className="toolbar">
        <h1>Knowledge pulse</h1>
        <Seg value={period} options={PERIODS} onChange={setPeriod} label="Period" />
        {hasCert && features.cert && <Seg value={withCert ? "c" : "s"} options={[["s", "Sprints"], ["c", "Sprints + certs"]]} onChange={(v) => setWithCert(v === "c")} label="Quiz types" />}
        <select className="sel" value={gid} onChange={(e) => setGid(e.target.value)} aria-label="Quiz">
          <option value="all">All quizzes</option>
          {quizzes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <button className="btn primary small" onClick={() => exportCSV(`${slugify(pub.slug)}-gap-report-${dayKey(Date.now())}.csv`, "full knowledge-gap report", fullReport({ players, games: d.games, dq: d.dq, cfg: d.cfg, stats, labels }, gid, period))}>
          Full report (CSV)
        </button>
        <button className="btn lime small" onClick={openReport}>PDF report</button>
      </div>
      {demo && (
        <div className="banner">
          Includes <b>sample players</b> so you can see the dashboard working.{can("admin") ? " Remove them from the Players tab before launch." : ""}
        </div>
      )}
      <div className="kpis">
        <div className="kpi"><span className="label">Registered</span><b className="num">{regd}</b><span className="sub">player cards</span></div>
        <div className="kpi hl"><span className="label" style={{ color: "var(--ink)" }}>Participants</span><b className="num">{people}</b><span className="sub" style={{ color: "var(--ink-2)" }}>{regd ? `${pct(people, regd)}% of registered` : "—"}</span></div>
        <div className="kpi"><span className="label">Completed plays</span><b className="num">{done}</b><span className="sub">{runs.length - done} in progress</span></div>
        <div className="kpi bl"><span className="label">Accuracy</span><b className="num">{answers.length ? `${pct(ok, answers.length)}%` : "—"}</b><span className="sub">{ok} of {answers.length} right</span></div>
        <div className="kpi pk"><span className="label">Avg answer time</span><b className="num">{answers.length ? `${(avgMs / 1000).toFixed(1)}s` : "—"}</b><span className="sub">per question</span></div>
        {withCert && certPeople > 0 ? (
          <div className="kpi or"><span className="label">Cert pass rate</span><b className="num">{pct(certPass, certPeople)}%</b><span className="sub">{certPass} of {certPeople} passed</span></div>
        ) : (
          <div className="kpi"><span className="label">Timed out</span><b className="num">{answers.filter((x) => x.c == null).length}</b><span className="sub">no answer given</span></div>
        )}
      </div>

      <Highlights byType={byType} topics={an.topics} labels={labels} />

      <GapTrend gid={gid} kinds={kinds} />

      <div className="grid2">
        <section className="panel">
          <div className="panel-h">
            <div><h2>Leaderboard</h2><p>Top 10 by points · {pLabel.toLowerCase()}</p></div>
            {can("admin") && <button className="link" onClick={() => setTab("users")}>All players</button>}
          </div>
          {lb.length ? (
            <div className="scroll-x">
              <table className="tbl">
                <thead><tr><th>#</th><th>Player</th><th className="r">Plays</th><th className="r">Accuracy</th><th className="r">Points</th></tr></thead>
                <tbody>
                  {lb.map((r, i) => {
                    const p = d.players[r.uid];
                    return (
                      <tr key={r.uid}>
                        <td className="num"><b>{i + 1}</b></td>
                        <td><div className="who"><Avatar p={p} size={36} /><div><b>{p?.name}</b><div className="sub num">{p?.empId} · {p?.unit}</div></div></div></td>
                        <td className="r num">{r.runs}</td>
                        <td className="r num">{r.acc}%</td>
                        <td className="r num"><b>{r.points.toLocaleString()}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="fine">No finished plays in this period.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>Knowledge gaps by topic</h2><p>Accuracy per topic, weakest first</p></div></div>
          <div className="bars">
            {an.topics.length ? (
              an.topics.map((t) => {
                const s = sevOf(t.acc);
                return (
                  <div className="bar-row" key={t.k} title={`${t.k}: ${t.ok}/${t.n} right · ${t.to} timed out`}>
                    <span className="nm">{t.k}</span>
                    <div className="track"><span style={{ width: `${t.acc}%`, background: SEV_HEX[s] }} /></div>
                    <span className="v num">{t.acc}% <span className={`sev ${s}`}>{SEV_LABEL[s]}</span></span>
                  </div>
                );
              })
            ) : (
              <p className="fine">No answers yet.</p>
            )}
          </div>
          <div className="legend"><span className="sev bad">Gap</span> under 55% <span className="sev warn">Watch</span> 55–74% <span className="sev good">Strong</span> 75%+</div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Gaps across all {unitsWord(labels, ut).toLowerCase()}</h2>
            <p>Every {unitWord(labels, ut).toLowerCase()} from Settings, weakest first. Rows with no plays need engagement.</p>
          </div>
          {types.length > 1 && <Seg<UnitType> value={ut} options={types.map((t) => [t, unitsWord(labels, t)] as [UnitType, string])} onChange={setUt} label="Group by" />}
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>{unitWord(labels, ut)}</th><th className="r">Registered</th><th className="r">Players</th><th className="r">Plays</th><th className="r">Answers</th><th className="r">Accuracy</th><th>Status</th><th>Weakest topic</th><th>Strongest topic</th></tr></thead>
            <tbody>
              {urows.map((u) => (
                <tr key={u.name} className={u.acc == null ? "nodata" : ""}>
                  <td><b>{u.name}</b></td>
                  <td className="r num">{u.registered}</td>
                  <td className="r num">{u.players}</td>
                  <td className="r num">{u.plays}</td>
                  <td className="r num">{u.n}</td>
                  <td className="r num"><b>{u.acc == null ? "—" : `${u.acc}%`}</b></td>
                  <td><span className={`sev ${u.sev}`}>{SEV_LABEL[u.sev]}</span></td>
                  <td>{u.weak ? <>{u.weak.k} <span className="sub num">{u.weak.acc}%</span></> : "—"}</td>
                  <td>{u.strong ? <>{u.strong.k} <span className="sub num">{u.strong.acc}%</span></> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tcols.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 900 }}>Heatmap: accuracy by {unitWord(labels, ut).toLowerCase()} × topic</h2>
            <div className="scroll-x">
              <table className="hm">
                <thead><tr><th />{tcols.map((t) => <th key={t}>{t}</th>)}</tr></thead>
                <tbody>
                  {urows.map((u) => (
                    <tr key={u.name}>
                      <td className="u">{u.name}</td>
                      {tcols.map((t) => {
                        const c = u.topic[t];
                        if (!c) return <td key={t} className="c na">–</td>;
                        const a = pct(c.ok, c.n);
                        const gap = Math.min(1, ((100 - a) / 100) * 1.4);
                        return (
                          <td key={t} className="c num" style={{ background: mix("#FFF4EC", "#E5431A", gap), color: gap > 0.6 ? "#fff" : "#161512" }} title={`${u.name} · ${t}: ${a}% (${c.ok}/${c.n})`}>
                            {a}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="legend">Strong <span className="ramp" /> Big gap · – means no answers yet</div>
          </>
        )}
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="panel-h"><div><h2>Most-missed questions</h2><p>Lowest accuracy, with the wrong answer people believed</p></div></div>
          <div className="qlist">{missed.length ? missed.map((r) => <QItem key={r.gid + r.qid} r={r} good={false} />) : <p className="fine">Not enough answers yet.</p>}</div>
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>Most-correct questions</h2><p>Knowledge staff already have</p></div></div>
          <div className="qlist">{best.length ? best.map((r) => <QItem key={r.gid + r.qid} r={r} good />) : <p className="fine">Not enough answers yet.</p>}</div>
        </section>
      </div>

      <div className="grid2">
        <section className="panel">
          <div className="panel-h"><div><h2>Plays per day</h2><p>Completed plays, last 14 days · today in orange</p></div></div>
          <ActivityChart days={days} perDay={perDay} />
        </section>
        <section className="panel">
          <div className="panel-h">
            <div><h2>Participation by {unitWord(labels, ut).toLowerCase()}</h2><p>Players vs registered</p></div>
            {types.length > 1 && <Seg<UnitType> value={ut} options={types.map((t) => [t, unitsWord(labels, t)] as [UnitType, string])} onChange={setUt} label="Participation by" />}
          </div>
          <div className="bars">
            {urows
              .filter((u) => u.registered || u.players)
              .sort((a, b) => b.players - a.players)
              .slice(0, 12)
              .map((u) => (
                <div className="bar-row" key={u.name} title={`${u.name}: ${u.players} played of ${u.registered} registered`}>
                  <span className="nm">{u.name}</span>
                  <div className="track">
                    <span style={{ width: `${(u.registered / partMax) * 100}%`, background: "var(--blue-soft)" }} />
                    <span style={{ width: `${(u.players / partMax) * 100}%`, background: "var(--blue)" }} />
                  </div>
                  <span className="v num">{u.players}/{u.registered}</span>
                </div>
              ))}
          </div>
          <div className="legend"><span className="sw" style={{ background: "var(--blue)" }} /> Played <span className="sw" style={{ background: "var(--blue-soft)" }} /> Registered</div>
        </section>
      </div>
    </>
  );
}

/** At a glance: the strongest and weakest unit of each kind, the most engaged one, and the topic extremes. */
function Highlights({ byType, topics, labels }: { byType: Partial<Record<UnitType, UnitStat[]>>; topics: { k: string; acc: number; n: number }[]; labels: Labels }) {
  const cards: { k: string; tone: string; label: string; name: string; v: string; sub: string }[] = [];
  for (const t of ["branch", "dept"] as UnitType[]) {
    const rows = (byType[t] || []).filter((u) => u.n >= 5 && u.acc != null);
    const w = unitWord(labels, t);
    if (rows.length) {
      const best = rows.reduce((a, b) => ((b.acc ?? 0) > (a.acc ?? 0) ? b : a));
      const worst = rows.reduce((a, b) => ((b.acc ?? 0) < (a.acc ?? 0) ? b : a));
      cards.push({ k: t + "best", tone: "good", label: `Top ${w.toLowerCase()}`, name: best.name, v: `${best.acc}%`, sub: `${best.players} player${best.players === 1 ? "" : "s"} · ${best.plays} play${best.plays === 1 ? "" : "s"}` });
      if (worst.name !== best.name) cards.push({ k: t + "worst", tone: "bad", label: `${w} to support`, name: worst.name, v: `${worst.acc}%`, sub: worst.weak ? `weakest: ${worst.weak.k}` : `${worst.n} answers` });
    }
    const eng = (byType[t] || []).filter((u) => u.registered >= 2).map((u) => ({ u, r: u.players / u.registered })).sort((a, b) => b.r - a.r)[0];
    if (eng && eng.r > 0) cards.push({ k: t + "eng", tone: "blue", label: `Most engaged ${w.toLowerCase()}`, name: eng.u.name, v: `${Math.round(eng.r * 100)}%`, sub: `${eng.u.players} of ${eng.u.registered} played` });
  }
  const ts = topics.filter((t) => t.n >= 3);
  if (ts.length) {
    const strong = ts.reduce((a, b) => (b.acc > a.acc ? b : a));
    const weak = ts.reduce((a, b) => (b.acc < a.acc ? b : a));
    cards.push({ k: "tstrong", tone: "good", label: "Strongest topic", name: strong.k, v: `${strong.acc}%`, sub: `${strong.n} answers` });
    if (weak.k !== strong.k) cards.push({ k: "tweak", tone: "bad", label: "Biggest gap", name: weak.k, v: `${weak.acc}%`, sub: "plan a refresher sprint" });
  }
  if (!cards.length) return null;
  return (
    <section className="hl-strip" aria-label="Highlights">
      {cards.map((c) => (
        <div key={c.k} className={`hl-card ${c.tone}`}>
          <span className="hl-l">{c.label}</span>
          <b className="hl-n" title={c.name}>{c.name}</b>
          <span className="hl-v num">{c.v}</span>
          <span className="hl-s">{c.sub}</span>
        </div>
      ))}
    </section>
  );
}

function QItem({ r, good }: { r: QStat; good: boolean }) {
  return (
    <div className="qitem">
      <span className="pct num" style={{ color: good ? "var(--good)" : "var(--bad)" }}>{r.acc}%</span>
      <div>
        <p className="q">{r.q?.q || r.qid}</p>
        <p className="w">
          <span className="chip">{r.q?.topic}</span> {r.ok}/{r.n} right
          {!good && r.topWrong ? <> · Top wrong answer: <b>{r.topWrong}</b> ({r.topWrongN}×)</> : null}
        </p>
      </div>
    </div>
  );
}

function ActivityChart({ days, perDay }: { days: string[]; perDay: Record<string, number> }) {
  const W = 560, H = 190, L = 30, B = 26, T = 14, R = 8;
  const vals = days.map((k) => perDay[k] || 0);
  const max = Math.max(4, ...vals);
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = (W - L - R) / days.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  return (
    <div className="scroll-x">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Completed plays per day, last 14 days">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(step * i)} y2={y(step * i)} stroke="#ECEBE5" />
            <text x={L - 6} y={y(step * i) + 4} textAnchor="end">{step * i}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#C9C7BF" />
        {vals.map((v, i) => {
          const x = L + i * bw + bw * 0.2, w = bw * 0.6;
          const h = Math.max(v ? 3 : 0, ((H - T - B) * v) / top);
          const dd = new Date(days[i] + "T00:00");
          return (
            <g key={i}>
              <title>{`${dd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${v} play${v === 1 ? "" : "s"}`}</title>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              {v > 0 && <path d={`M${x} ${H - B} V${H - B - h + Math.min(4, h)} Q${x} ${H - B - h} ${x + Math.min(4, h)} ${H - B - h} H${x + w - Math.min(4, h)} Q${x + w} ${H - B - h} ${x + w} ${H - B - h + Math.min(4, h)} V${H - B} Z`} style={{ fill: i === days.length - 1 ? "var(--orange)" : "var(--ink)" }} />}
              {(i % 2 === 1 || i === days.length - 1) && <text x={x + w / 2} y={H - 8} textAnchor="middle">{dd.getDate()}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
