import { useMemo, useRef, useState } from "react";
import { useApp } from "../app/ctx";
import { Seg } from "../components/ui";
import { gapTrend, scope, trendChange, type Bucket, type TrendSeries } from "../lib/analytics";
import type { QuizKind } from "../types";
import { useLiveTenant } from "./common";

/* Line chart: share of answers wrong or timed out, per week (or day). Down = the gap is closing.
   Overall line in ink; up to three topic lines in validated categorical slots (blue, orange, aqua),
   each direct-labelled at its end so identity never relies on colour alone. */
const SLOT = ["#2a78d6", "#eb6834", "#1baf7a"];
const INK = "#161512";
const W = 780, H = 280, L = 44, R = 196, T = 18, B = 34;

export function GapTrend({ gid, kinds = ["sprint"] }: { gid: string; kinds?: QuizKind[] }) {
  const { players, d } = useApp();
  const { labels: UL } = useLiveTenant();
  const kk = kinds.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const answers = useMemo(() => scope(players, d.games, d.dq, gid, "all", kinds).answers, [players, d.games, d.dq, gid, kk]);
  const units = useMemo(() => {
    const m = new Map<string, string>();
    players.forEach((p) => m.set(`${p.unitType}|${p.unit}`, `${p.unit} (${(p.unitType === "dept" ? UL.dept : UL.branch).toLowerCase()})`));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [players, UL]);
  const [unit, setUnit] = useState("all");
  const weeksOfData = useMemo(() => (answers.length ? (Date.now() - Math.min(...answers.map((a) => a.at))) / (7 * 864e5) : 0), [answers]);
  const [bucket, setBucket] = useState<Bucket>(weeksOfData >= 4 ? "week" : "day");
  const tr = useMemo(() => gapTrend(answers, bucket, unit), [answers, bucket, unit]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const topicKeys = tr.topics.map((t) => t.key);
  const chosen = (picked ?? topicKeys.slice(0, 3)).filter((k) => topicKeys.includes(k)).slice(0, 3);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const series: { s: TrendSeries; color: string; width: number; label: string }[] = [
    { s: tr.overall, color: INK, width: 3, label: "All topics" },
    ...chosen.map((k, i) => ({ s: tr.topics.find((t) => t.key === k)!, color: SLOT[i], width: 2, label: k })),
  ];
  const n = tr.buckets.length;
  const all = series.flatMap((x) => x.s.gap.filter((g): g is number => g != null));
  const yMax = Math.min(100, Math.max(40, Math.ceil((Math.max(0, ...all) + 5) / 10) * 10));
  const x = (i: number) => (n <= 1 ? L + (W - L - R) / 2 : L + ((W - L - R) * i) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / yMax);
  const ticks = Array.from({ length: yMax / 10 + 1 }, (_, i) => i * 10).filter((v) => yMax <= 60 || v % 20 === 0);
  const change = trendChange(tr.overall, tr.buckets);

  const path = (g: (number | null)[]) => {
    let dd = "", pen = false;
    g.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      dd += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return dd;
  };
  // direct labels at each line's last point, nudged apart so they never overlap
  const labels = series
    .map((sr) => {
      const li = sr.s.gap.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
      return li == null ? null : { ...sr, li, yy: y(sr.s.gap[li]!) };
    })
    .filter(Boolean) as ((typeof series)[number] & { li: number; yy: number })[];
  labels.sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < labels.length; i++) if (labels[i].yy - labels[i - 1].yy < 16) labels[i].yy = labels[i - 1].yy + 16;

  const toggle = (k: string) => {
    const cur = chosen.slice();
    const next = cur.includes(k) ? cur.filter((c) => c !== k) : cur.length >= 3 ? [...cur.slice(1), k] : [...cur, k];
    setPicked(next);
  };
  const tipX = hover != null ? (x(hover) / W) * 100 : 0;

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Is the knowledge gap closing?</h2>
          <p>Share of answers wrong or timed out, per {bucket}. Lower is better.</p>
        </div>
        <div className="row">
          <select className="sel" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={`${UL.branch} or ${UL.dept.toLowerCase()}`}>
            <option value="all">All {UL.branches.toLowerCase()} &amp; {UL.depts.toLowerCase()}</option>
            {units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Seg<Bucket> value={bucket} onChange={setBucket} options={[["week", "Weekly"], ["day", "Daily"]]} label="Group by" />
        </div>
      </div>

      {change ? (
        <div className={`trend-head ${change.delta < 0 ? "good" : change.delta > 0 ? "bad" : ""}`}>
          <b className="num">{change.delta < 0 ? "▼" : change.delta > 0 ? "▲" : "●"} {Math.abs(change.delta)} pts</b>
          <span>
            {change.delta < 0 ? "Gap closing" : change.delta > 0 ? "Gap growing" : "No change"} — {change.from}% → {change.to}% since {change.since}
          </span>
        </div>
      ) : (
        <p className="fine">Not enough answers yet to draw a trend. Each point needs at least 5 answers.</p>
      )}

      <div className="chips-row" role="group" aria-label="Topics to compare (up to 3)">
        {topicKeys.map((k) => {
          const on = chosen.includes(k);
          const c = on ? SLOT[chosen.indexOf(k)] : undefined;
          return (
            <button key={k} className={`chip-tg ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(k)}>
              <span className="sw" style={{ background: c || "transparent", borderColor: c || "var(--line)" }} />
              {k}
            </button>
          );
        })}
      </div>

      {table ? (
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr><th>{bucket === "week" ? "Week of" : "Day"}</th>{series.map((s) => <th key={s.label} className="r">{s.label}</th>)}</tr>
            </thead>
            <tbody>
              {tr.buckets.map((b, i) => (
                <tr key={b.start}>
                  <td>{b.label}</td>
                  {series.map((s) => <td key={s.label} className="r num">{s.s.gap[i] == null ? "—" : `${s.s.gap[i]}%`} <span className="sub">({s.s.n[i]})</span></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="trend-wrap scroll-x" ref={wrap} onMouseLeave={() => setHover(null)}>
          <svg className="chart trend" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Knowledge gap per ${bucket}${change ? `: ${change.from}% to ${change.to}%` : ""}`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ECEBE5" />
                <text x={L - 8} y={y(v) + 4} textAnchor="end">{v}%</text>
              </g>
            ))}
            <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#C9C7BF" />
            {tr.buckets.map((b, i) => {
              const every = Math.ceil(n / 8);
              return (i % every === 0 || i === n - 1) && <text key={b.start} x={x(i)} y={H - 10} textAnchor="middle">{b.label}</text>;
            })}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#9A988F" strokeDasharray="3 3" />}
            {series.slice().reverse().map((sr) => (
              <g key={sr.label}>
                <path d={path(sr.s.gap)} fill="none" stroke={sr.color} strokeWidth={sr.width} strokeLinejoin="round" strokeLinecap="round" />
                {sr.s.gap.map((v, i) => v != null && (hover === i || sr.s.gap.filter((g) => g != null).length <= 1 || i === sr.s.gap.map((g, j) => (g == null ? -1 : j)).filter((j) => j >= 0).pop()) && (
                  <circle key={i} cx={x(i)} cy={y(v)} r={4.5} fill={sr.color} stroke="#FFFEFA" strokeWidth={2} />
                ))}
              </g>
            ))}
            {labels.map((lb) => (
              <g key={lb.label}>
                <rect x={x(lb.li) + 10} y={lb.yy - 5} width={10} height={10} rx={2} fill={lb.color} />
                <text x={x(lb.li) + 25} y={lb.yy + 4} className="dl">{`${lb.label.length > 18 ? lb.label.slice(0, 17) + "…" : lb.label} ${lb.s.gap[lb.li]}%`}</text>
              </g>
            ))}
            {tr.buckets.map((b, i) => (
              <rect key={b.start} x={x(i) - (W - L - R) / Math.max(1, n - 1) / 2} y={T} width={(W - L - R) / Math.max(1, n - 1)} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            ))}
          </svg>
          {hover != null && (
            <div className="trend-tip" style={{ left: `${Math.min(80, Math.max(8, tipX))}%` }}>
              <b>{bucket === "week" ? `Week of ${tr.buckets[hover].label}` : tr.buckets[hover].label}</b>
              {series.map((s) => (
                <div key={s.label}>
                  <span className="sw" style={{ background: s.color }} /> {s.label}: <b className="num">{s.s.gap[hover] == null ? "too few answers" : `${s.s.gap[hover]}% gap`}</b>
                  <span className="sub"> · {s.s.n[hover]} answers</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="legend">
        <span className="sw" style={{ background: INK }} /> All topics
        {chosen.map((k, i) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="sw" style={{ background: SLOT[i] }} /> {k}</span>
        ))}
        <span style={{ marginLeft: "auto" }} />
        <button className="link" onClick={() => setTable((t) => !t)}>{table ? "Show chart" : "Show as table"}</button>
      </div>
    </section>
  );
}
