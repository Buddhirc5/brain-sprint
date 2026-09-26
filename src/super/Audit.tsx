/* Super admin audit log and cross-company usage overview. */
import { useEffect, useMemo, useState } from "react";
import type { AuditEntry } from "../types";
import { useApi, errMsg } from "../app/ApiCtx";
import { Seg } from "../components/ui";
import { toCSV } from "../lib/security";
import { fmtDT } from "../lib/util";
import { SI, ago, useSuper } from "./shared";
import { CoLogo } from "./Companies";

type Sev = "all" | "info" | "warn" | "alert";
type Range = "all" | "1" | "7" | "30";

export function Audit() {
  const { api, toast } = useApi();
  const { recheck } = useSuper();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<Sev>("all");
  const [range, setRange] = useState<Range>("all");
  const [action, setAction] = useState("");

  const load = () =>
    api.superAudit().then(setRows, (e) => {
      toast(errMsg(e));
      if ((e as { code?: string }).code === "forbidden") recheck();
    });
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const actions = useMemo(() => [...new Set((rows || []).map((r) => r.action))].sort(), [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const since = range === "all" ? 0 : Date.now() - Number(range) * 864e5;
    return (rows || []).filter(
      (r) =>
        r.at >= since &&
        (sev === "all" || (r.sev || "info") === sev) &&
        (!action || r.action === action) &&
        (!s || [r.actor, r.action, r.target, r.detail].some((x) => x?.toLowerCase().includes(s))),
    );
  }, [rows, q, sev, range, action]);

  const exportCSV = () => {
    const data = [["When", "Who", "Action", "Target", "Detail", "Severity"], ...list.map((r) => [new Date(r.at).toISOString(), r.actor, r.action, r.target || "", r.detail || "", r.sev || "info"])];
    api.download(`super-audit-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(data));
  };

  return (
    <>
      <div className="toolbar">
        <h1>Audit</h1>
        <button className="btn white small" onClick={() => void load()}>Refresh</button>
        <button className="btn primary small" disabled={!list.length} onClick={exportCSV}>
          <SI.download /> Export CSV
        </button>
      </div>
      <section className="panel">
        <div className="su-filter">
          <label className="su-search">
            <SI.search />
            <span className="sr">Search the log</span>
            <input type="search" placeholder="Search who, what or which company" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="sel su-sel" aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <Seg value={sev} onChange={setSev} label="Severity" options={[["all", "All"], ["info", "Info"], ["warn", "Warning"], ["alert", "Alert"]]} />
          <Seg value={range} onChange={setRange} label="Period" options={[["all", "All time"], ["1", "24 h"], ["7", "7 days"], ["30", "30 days"]]} />
        </div>
        {rows === null ? (
          <p className="fine">Loading…</p>
        ) : !list.length ? (
          <div className="empty">{rows.length ? "Nothing matches these filters." : "No super admin activity yet."}</div>
        ) : (
          <>
            <p className="fine">{list.length} of {rows.length} entries</p>
            <div className="scroll-x">
              <table className="tbl su-audit">
                <thead>
                  <tr><th>When</th><th>Who</th><th>Action</th><th>Company / target</th><th>Detail</th><th>Severity</th></tr>
                </thead>
                <tbody>
                  {list.slice(0, 500).map((r) => (
                    <tr key={r.id}>
                      <td className="sub nowrap" title={new Date(r.at).toLocaleString()}>{fmtDT(r.at)}</td>
                      <td>{r.actor}</td>
                      <td><b>{r.action}</b></td>
                      <td>{r.target || "—"}</td>
                      <td className="wrap sub">{r.detail || ""}</td>
                      <td><span className={`sev ${r.sev || "info"}`}>{r.sev || "info"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.length > 500 && <p className="fine">Showing the newest 500 — export CSV for everything.</p>}
          </>
        )}
      </section>
    </>
  );
}

type Metric = "runs30" | "players" | "activePlayers30" | "liveSessions30";
const METRIC: Record<Metric, string> = { runs30: "Plays · 30 days", players: "Players", activePlayers30: "Active players · 30 days", liveSessions30: "Live games · 30 days" };

export function Usage() {
  const { tenants, go } = useSuper();
  const [m, setM] = useState<Metric>("runs30");
  const ts = tenants || [];
  const sum = (k: keyof (typeof ts)[number]["usage"]) => ts.reduce((a, t) => a + (t.usage[k] as number), 0);
  const sorted = [...ts].sort((a, b) => b.usage[m] - a.usage[m] || a.name.localeCompare(b.name));
  const max = Math.max(1, ...ts.map((t) => t.usage[m]));
  const total = sum(m);
  const players = sum("players");
  const active = sum("activePlayers30");
  return (
    <>
      <div className="toolbar">
        <h1>Usage</h1>
      </div>
      {tenants === null ? (
        <p className="fine">Loading…</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi hl"><span className="sub">Companies</span><b className="num">{ts.length}</b><span className="sub">{ts.filter((t) => t.status === "active").length} active</span></div>
            <div className="kpi"><span className="sub">Players</span><b className="num">{players.toLocaleString()}</b><span className="sub">{players ? Math.round((active / players) * 100) : 0}% active in 30 days</span></div>
            <div className="kpi bl"><span className="sub">Plays · 30 days</span><b className="num">{sum("runs30").toLocaleString()}</b><span className="sub">{sum("quizzes")} quizzes in total</span></div>
            <div className="kpi pk"><span className="sub">Live games · 30 days</span><b className="num">{sum("liveSessions30")}</b><span className="sub">{sum("polls")} polls</span></div>
            <div className="kpi or"><span className="sub">Admins</span><b className="num">{sum("admins")}</b><span className="sub">across companies</span></div>
          </div>
          <section className="panel">
            <div className="panel-h">
              <div>
                <h2>{METRIC[m]} by company</h2>
                <p>{total.toLocaleString()} in total · click a company to open it</p>
              </div>
              <Seg value={m} onChange={setM} label="Measure" options={[["runs30", "Plays"], ["players", "Players"], ["activePlayers30", "Active"], ["liveSessions30", "Live games"]]} />
            </div>
            {!ts.length ? (
              <div className="empty">No companies yet.</div>
            ) : (
              <div className="bars su-bars" role="list" aria-label={`${METRIC[m]} by company`}>
                {sorted.map((t) => (
                  <button key={t.id} role="listitem" className="bar-row su-bar" title={`${t.name}: ${t.usage[m].toLocaleString()} ${METRIC[m].toLowerCase()}`} onClick={() => go("co-" + t.id)}>
                    <span className="nm su-bar-nm">
                      <CoLogo b={t.branding} size={22} name={t.name} />
                      <span>{t.name}</span>
                    </span>
                    <span className="track">
                      <span style={{ width: `${(t.usage[m] / max) * 100}%` }} />
                    </span>
                    <span className="v num">
                      {t.usage[m].toLocaleString()}
                      {total > 0 && <small className="fine">{Math.round((t.usage[m] / total) * 100)}%</small>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-h">
              <div>
                <h2>Quiet companies</h2>
                <p>Active companies with no plays in the last 30 days — worth a check-in.</p>
              </div>
            </div>
            {(() => {
              const quiet = ts.filter((t) => t.status === "active" && t.usage.runs30 === 0);
              return quiet.length ? (
                <div className="chips-row">
                  {quiet.map((t) => (
                    <button key={t.id} className="chip-tg" onClick={() => go("co-" + t.id)}>
                      {t.name} · last active {ago(t.usage.lastActive)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="fine">Every active company has played in the last 30 days.</p>
              );
            })()}
          </section>
        </>
      )}
    </>
  );
}
