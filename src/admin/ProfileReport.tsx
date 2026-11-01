/* Results for a profile quiz: who took it, the team mix of types, each person's type, and reset (one try each). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { errMsg } from "../app/ApiCtx";
import { Modal } from "../components/ui";
import { ProfileIcon, TRAIT_COLORS } from "../components/ProfileIcon";
import { typeOf } from "../lib/profile";
import { ProfileResultView } from "../player/Profile";
import { dayKey, pct } from "../lib/util";
import type { Game, ProfileResult } from "../types";
import { useAdmin } from "./Admin";
import { slugify } from "./common";

type Row = { uid: string; at: number; result: ProfileResult };

export function ProfileReport({ g }: { g: Game }) {
  const { d, api, tid, approve, toast, players, can, pub } = useApp();
  const { exportCSV } = useAdmin();
  const meta = g.profile!;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unit, setUnit] = useState("all");
  const [view, setView] = useState<Row | null>(null);
  const load = useCallback(() => {
    api.profileResults(tid, g.id).then(setRows, (e) => toast(errMsg(e)));
  }, [api, tid, g.id, toast]);
  useEffect(load, [load]);

  const units = useMemo(() => [...new Set(players.map((p) => p.unit))].sort(), [players]);
  const shown = (rows || []).filter((r) => d.players[r.uid] && (unit === "all" || d.players[r.uid].unit === unit));
  const inScope = players.filter((p) => unit === "all" || p.unit === unit);
  const mix = useMemo(() => {
    const m = new Map<string, { n: number; t: ReturnType<typeof typeOf> }>();
    for (const r of shown) {
      const t = typeOf(meta, r.result);
      const e = m.get(t.name) || { n: 0, t };
      e.n++;
      m.set(t.name, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [shown, meta]);
  const traitAvg = meta.traits.map((_, i) => (shown.length ? Math.round(shown.reduce((s, r) => s + r.result.pct[i], 0) / shown.length) : 0));

  const reset = (r: Row) =>
    approve({
      label: `Let ${d.players[r.uid]?.name || "this player"} take "${g.title}" again? Their current profile is deleted.`,
      yes: "Reset",
      danger: true,
      run: async () => {
        await api.profileReset(tid, g.id, r.uid);
        toast("Reset — they can take it again");
        load();
      },
    });
  const csv = () =>
    exportCSV(`${slugify(pub.slug)}-${slugify(g.title)}-${dayKey(Date.now())}.csv`, `profiles for ${g.title}`, [
      ["Name", "Employee ID", "Unit", "Profile", "Like a", ...meta.traits.map((t) => `${t.name} %`), "Consistent", "Taken"],
      ...shown.map((r) => {
        const p = d.players[r.uid];
        const t = typeOf(meta, r.result);
        return [p?.name || "", p?.empId || "", p?.unit || "", t.name, t.role, ...r.result.pct, r.result.mixed ? "No" : "Yes", new Date(r.at).toLocaleString()];
      }),
    ]);

  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="label">Took it</span><b className="num">{shown.length}</b><span className="sub">{inScope.length ? `${pct(shown.length, inScope.length)}% of ${inScope.length} players` : "—"}</span></div>
        <div className="kpi hl"><span className="label" style={{ color: "var(--ink)" }}>Most common</span><b style={{ fontSize: 22 }}>{mix[0]?.t.name || "—"}</b><span className="sub" style={{ color: "var(--ink-2)" }}>{mix[0] ? `${mix[0].n} ${mix[0].n === 1 ? "person" : "people"}` : ""}</span></div>
        <div className="kpi bl"><span className="label">Profile types seen</span><b className="num">{mix.length}</b><span className="sub">of {meta.types.length}</span></div>
        <div className="kpi pk"><span className="label">Mixed answers</span><b className="num">{shown.filter((r) => r.result.mixed).length}</b><span className="sub">may want a retake</span></div>
      </div>

      <section className="panel">
        <div className="panel-h">
          <div><h2>Team mix</h2><p>Only you and other admins see this. Players see just their own profile.</p></div>
          <div className="row" style={{ gap: 8 }}>
            <select className="sel" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Branch or department">
              <option value="all">Everyone</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            {can("admin") && <button className="btn primary small" disabled={!shown.length} onClick={csv}>Export (CSV)</button>}
          </div>
        </div>
        {!rows ? <p className="fine">Loading…</p> : !shown.length ? <p className="fine">Nobody has taken it yet{unit === "all" ? "" : ` in ${unit}`}.</p> : (
          <div className="grid2">
            <div className="pfr-mix">
              {mix.map(({ n, t }) => (
                <div key={t.name} className="pfr-row">
                  <span className="pfr-ic">
                    <span style={{ color: TRAIT_COLORS[t.a % 6] }}><ProfileIcon name={meta.traits[t.a].icon} size={16} /></span>
                    <span style={{ color: TRAIT_COLORS[t.b % 6] }}><ProfileIcon name={meta.traits[t.b].icon} size={16} /></span>
                  </span>
                  <div className="pfr-t">
                    <div className="pfr-n"><b>{t.name}</b><span className="num">{n} · {pct(n, shown.length)}%</span></div>
                    <div className="pfr-track"><span style={{ width: `${pct(n, mix[0].n)}%`, background: TRAIT_COLORS[t.a % 6] }} /></div>
                    <small className="fine">{t.role}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="pfr-traits">
              <h3 style={{ margin: "0 0 8px" }}>Average traits</h3>
              {meta.traits.map((tr, i) => (
                <div key={tr.name} className="pfr-row">
                  <span className="pfr-ic" style={{ color: TRAIT_COLORS[i % 6] }}><ProfileIcon name={tr.icon} size={18} /></span>
                  <div className="pfr-t">
                    <div className="pfr-n"><b>{tr.name}</b><span className="num">{traitAvg[i]}%</span></div>
                    <div className="pfr-track"><span style={{ width: `${traitAvg[i]}%`, background: TRAIT_COLORS[i % 6] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {shown.length > 0 && (
        <section className="panel">
          <div className="panel-h"><div><h2>People</h2><p>One try each — reset someone to let them take it again.</p></div></div>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Player</th><th>Unit</th><th>Profile</th><th>Top traits</th><th>Taken</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const p = d.players[r.uid];
                  const t = typeOf(meta, r.result);
                  return (
                    <tr key={r.uid}>
                      <td><b>{p?.name}</b><div className="fine">{p?.empId}</div></td>
                      <td>{p?.unit}</td>
                      <td><b>{t.name}</b>{r.result.mixed && <span className="sev warn" style={{ marginLeft: 6 }}>Mixed</span>}<div className="fine">{t.role}</div></td>
                      <td className="num">{r.result.top.map((i) => `${meta.traits[i].name} ${r.result.pct[i]}%`).join(" · ")}</td>
                      <td className="num">{new Date(r.at).toLocaleDateString()}</td>
                      <td className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
                        <button className="link" onClick={() => setView(r)}>View</button>
                        {can("admin") && <button className="link danger" onClick={() => reset(r)}>Reset</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view && (
        <Modal label={`${d.players[view.uid]?.name}'s profile`} onClose={() => setView(null)} className="pf-admin-modal">
          <ProfileResultView g={g} r={view.result} admin={{ name: d.players[view.uid]?.name || "Player", onClose: () => setView(null) }} />
        </Modal>
      )}
    </>
  );
}
