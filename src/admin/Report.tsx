/* Printable knowledge report: a designed A4 page an admin saves as a PDF (browser "Save as PDF"). */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SEV_HEX, SEV_LABEL, sevOf, type QStat, type UnitStat } from "../lib/analytics";
import { LogoMark } from "../components/Logo";
import "../styles/report.css";

export interface ReportData {
  company: string;
  product: string;
  logo?: string;
  period: string;
  quiz: string;
  by: string;

  kpi: { registered: number; active: number; plays: number; acc: number | null; avgSec: number; certPass: number; certPeople: number };
  topics: { k: string; n: number; acc: number }[];
  /** one section per kind of unit the company uses (branches, departments or both) */
  unitGroups: { word: string; words: string; units: UnitStat[] }[];
  leaders: { name: string; unit: string; plays: number; acc: number; points: number }[];
  missed: QStat[];
  best: QStat[];
  days: { k: string; n: number }[];
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Ring({ v, label }: { v: number | null; label: string }) {
  const r = 42, c = 2 * Math.PI * r, p = v == null ? 0 : v / 100;
  return (
    <svg className="rp-ring" viewBox="0 0 110 110" role="img" aria-label={`${label}: ${v == null ? "no data" : v + "%"}`}>
      <circle cx="55" cy="55" r={r} className="rp-ring-bg" />
      <circle cx="55" cy="55" r={r} className="rp-ring-fg" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 55 55)" style={{ stroke: v == null ? "#bbb" : SEV_HEX[sevOf(v)] }} />
      <text x="55" y="60" textAnchor="middle">{v == null ? "—" : `${v}%`}</text>
    </svg>
  );
}

function Days({ days }: { days: ReportData["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const w = 100 / days.length;
  return (
    <svg className="rp-days" viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="Completed plays per day, last 14 days">
      {days.map((d, i) => {
        const h = (d.n / max) * 34;
        return <rect key={d.k} x={i * w + w * 0.16} y={38 - h} width={w * 0.68} height={Math.max(h, 0.6)} rx="1.2" className={i === days.length - 1 ? "today" : ""} />;
      })}
      <line x1="0" y1="38.4" x2="100" y2="38.4" />
    </svg>
  );
}

function tips(r: ReportData): string[] {
  const out: string[] = [];
  const weak = r.topics.filter((t) => t.n >= 3 && t.acc < 75).slice(0, 2);
  for (const t of weak) out.push(`Run a refresher sprint on ${t.k} — only ${t.acc}% of answers were right.`);
  const m = r.missed[0];
  if (m?.q && m.topWrong) out.push(`Clear up a common mistake: “${m.q.q}” — ${m.n - m.ok} of ${m.n} answered “${m.topWrong}”.`);
  const low = r.unitGroups.flatMap((g) => g.units).filter((u) => u.registered >= 3).map((u) => ({ u, rate: u.players / u.registered })).sort((a, b) => a.rate - b.rate)[0];
  if (low && low.rate < 0.6) out.push(`Boost participation in ${low.u.name}: ${low.u.players} of ${low.u.registered} registered staff played.`);
  const strong = r.topics.filter((t) => t.n >= 3 && t.acc >= 85).slice(-1)[0];
  if (strong) out.push(`Celebrate ${strong.k} — ${strong.acc}% accuracy. Share it in the next team update.`);
  if (!out.length) out.push("Keep the daily rhythm going — add a new sprint this week to build more data.");
  return out.slice(0, 4);
}

export function ReportView({ data: r, onClose, onDownload }: { data: ReportData; onClose: () => void; onDownload: () => void }) {
  useEffect(() => {
    document.body.classList.add("rp-open");
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => {
      document.body.classList.remove("rp-open");
      window.removeEventListener("keydown", f);
    };
  }, [onClose]);
  const active = r.kpi.registered ? Math.round((r.kpi.active / r.kpi.registered) * 100) : 0;
  const medal = ["gold", "silver", "bronze"];
  const qMax = r.unitGroups.length > 1 ? 4 : 5; // both unit tables on page 2: keep it to one A4 sheet
  return createPortal(
    <div className="rp-overlay" role="dialog" aria-modal="true" aria-label="Knowledge report preview">
      <div className="rp-bar">
        <b>Report preview</b>
        <span className="fine">Tip: in the print window choose “Save as PDF”, and turn on background graphics.</span>
        <button className="btn lime small" onClick={onDownload}>Download PDF</button>
        <button className="btn white small" onClick={onClose}>Close</button>
      </div>
      <div className="rp-doc">
        {/* page 1 */}
        <section className="rp-page">
          <header className="rp-cover">
            <div className="rp-brand">
              {r.logo ? <img src={r.logo} alt="" /> : <LogoMark size={46} />}
              <div>
                <b>{r.company}</b>
                <span>{r.product}</span>
              </div>
            </div>
            <div className="rp-title">
              <span className="rp-kicker">Knowledge pulse report</span>
              <h1>How sharp is<br />the team?</h1>
              <p>{r.period} · {r.quiz} · generated {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <div className="rp-blobs" aria-hidden="true"><i /><i /><i /></div>
          </header>

          <div className="rp-kpis">
            <div className="rp-kpi lime"><b>{r.kpi.registered.toLocaleString()}</b><span>staff registered</span></div>
            <div className="rp-kpi"><b>{active}%</b><span>played ({r.kpi.active.toLocaleString()})</span></div>
            <div className="rp-kpi"><b>{r.kpi.plays.toLocaleString()}</b><span>quizzes completed</span></div>
            <div className="rp-kpi"><b>{r.kpi.avgSec ? `${r.kpi.avgSec.toFixed(1)}s` : "—"}</b><span>avg. answer time</span></div>
            {r.kpi.certPeople > 0 && <div className="rp-kpi"><b>{r.kpi.certPass}/{r.kpi.certPeople}</b><span>certified</span></div>}
          </div>

          <div className="rp-row">
            <div className="rp-card rp-acc">
              <h2>Overall accuracy</h2>
              <Ring v={r.kpi.acc} label="Overall accuracy" />
              <span className={`rp-sev ${r.kpi.acc == null ? "none" : sevOf(r.kpi.acc)}`}>{r.kpi.acc == null ? "No plays yet" : SEV_LABEL[sevOf(r.kpi.acc)]}</span>
            </div>
            <div className="rp-card rp-grow">
              <h2>Plays per day <small>last 14 days</small></h2>
              <Days days={r.days} />
              <div className="rp-days-x"><span>{r.days[0]?.k.slice(5)}</span><span>today</span></div>
            </div>
          </div>

          <div className="rp-card">
            <h2>Knowledge by topic <small>weakest first</small></h2>
            {r.topics.length ? (
              <div className="rp-bars">
                {r.topics.slice(0, 10).map((t) => (
                  <div key={t.k} className="rp-barrow">
                    <span className="rp-bar-l">{t.k}</span>
                    <span className="rp-track"><i style={{ width: `${Math.max(2, t.acc)}%`, background: SEV_HEX[sevOf(t.acc)] }} /></span>
                    <b>{t.acc}%</b>
                    <span className={`rp-sev ${sevOf(t.acc)}`}>{SEV_LABEL[sevOf(t.acc)]}</span>
                  </div>
                ))}
              </div>
            ) : <p className="rp-empty">No answers in this period yet.</p>}
          </div>

          <div className="rp-card rp-tips">
            <h2>What to do next</h2>
            <ol>{tips(r).map((t) => <li key={t}>{t}</li>)}</ol>
          </div>
          <footer className="rp-foot"><span>{r.company} · confidential — contains staff data</span><span>Page 1</span></footer>
        </section>

        {/* page 2 */}
        <section className="rp-page">
          <div className="rp-row">
            <div className="rp-card rp-grow">
              <h2>Leaderboard <small>top 10 by points</small></h2>
              {r.leaders.length ? (
                <ol className="rp-leaders">
                  {r.leaders.map((p, i) => (
                    <li key={p.name + i} className={medal[i] || ""}>
                      <span className="rp-rank">{i + 1}</span>
                      <span className="rp-av">{initials(p.name)}</span>
                      <span className="rp-who"><b>{p.name}</b><small>{p.unit}</small></span>
                      <span className="rp-pts"><b>{p.points.toLocaleString()}</b><small>{p.acc}% · {p.plays} plays</small></span>
                    </li>
                  ))}
                </ol>
              ) : <p className="rp-empty">No plays in this period.</p>}
            </div>
          </div>

          {r.unitGroups.map((grp) => {
            const units = grp.units.filter((u) => u.registered || u.players).slice().sort((a, b) => (a.acc ?? 101) - (b.acc ?? 101));
            // with both kinds on one page, keep each table short enough to fit
            const max = r.unitGroups.length > 1 ? 5 : 12;
            return (
              <div className="rp-card" key={grp.word}>
                <h2>By {grp.word.toLowerCase()} <small>weakest first{units.length > max ? ` · ${max} of ${units.length}` : ""}</small></h2>
                {units.length ? (
                  <table className="rp-tbl">
                    <thead><tr><th>{grp.word}</th><th>Played</th><th>Accuracy</th><th>Weakest topic</th><th>Strongest topic</th></tr></thead>
                    <tbody>
                      {units.slice(0, max).map((u) => (
                        <tr key={u.name}>
                          <td><b>{u.name}</b></td>
                          <td>{u.players}/{u.registered}</td>
                          <td>
                            <span className="rp-mini"><i style={{ width: `${u.acc ?? 0}%`, background: u.acc == null ? "#ccc" : SEV_HEX[sevOf(u.acc)] }} /></span>
                            {u.acc == null ? "—" : `${u.acc}%`}
                          </td>
                          <td>{u.weak ? `${u.weak.k} (${u.weak.acc}%)` : "—"}</td>
                          <td>{u.strong ? `${u.strong.k} (${u.strong.acc}%)` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="rp-empty">No {grp.words.toLowerCase()} with players yet.</p>}
              </div>
            );
          })}

          <div className="rp-row">
            <div className="rp-card rp-grow rp-q bad">
              <h2>Most-missed questions</h2>
              {r.missed.length ? r.missed.slice(0, qMax).map((q) => (
                <div key={q.gid + q.qid} className="rp-qi">
                  <b>{q.acc}%</b>
                  <p>{q.q?.q || "(question removed)"}{q.topWrong && <small>Most picked wrong answer: “{q.topWrong}”</small>}</p>
                </div>
              )) : <p className="rp-empty">Not enough answers yet.</p>}
            </div>
            <div className="rp-card rp-grow rp-q good">
              <h2>Already mastered</h2>
              {r.best.length ? r.best.slice(0, qMax).map((q) => (
                <div key={q.gid + q.qid} className="rp-qi">
                  <b>{q.acc}%</b>
                  <p>{q.q?.q || "(question removed)"}</p>
                </div>
              )) : <p className="rp-empty">Not enough answers yet.</p>}
            </div>
          </div>
          <footer className="rp-foot"><span>Prepared for {r.by} · Made with Ant Arena</span><span>Page 2</span></footer>
        </section>
      </div>
    </div>,
    document.body,
  );
}
