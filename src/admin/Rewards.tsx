import { useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Modal, Seg } from "../components/ui";
import { board, runCorrect, unitBoard, validRuns } from "../lib/scoring";
import { monthStart, newId, pct, weekStart } from "../lib/util";
import type { Gift } from "../types";
import { useScan } from "./useScan";
import { useLiveTenant } from "./common";

type Per = "tw" | "lw" | "tm" | "lm";
const DAY = 864e5;

function range(p: Per): { from: number; to: number; prevFrom: number; label: string } {
  const now = Date.now();
  if (p === "tw" || p === "lw") {
    const ws = weekStart(now) - (p === "lw" ? 7 * DAY : 0);
    return { from: ws, to: ws + 7 * DAY, prevFrom: ws - 7 * DAY, label: `Week of ${new Date(ws).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` };
  }
  const d = new Date(now);
  const ms = p === "tm" ? monthStart(now) : new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const next = new Date(new Date(ms).getFullYear(), new Date(ms).getMonth() + 1, 1).getTime();
  const prev = new Date(new Date(ms).getFullYear(), new Date(ms).getMonth() - 1, 1).getTime();
  return { from: ms, to: next, prevFrom: prev, label: new Date(ms).toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
}

export function Rewards() {
  const { d, players, approve, api, tid, toast } = useApp();
  const { labels } = useLiveTenant();
  const { flags } = useScan();
  const [per, setPer] = useState<Per>("lw");
  const [award, setAward] = useState<Omit<Gift, "id" | "at" | "by" | "prize"> & { prize: string } | null>(null);
  const R = range(per);

  const top = useMemo(() => board(players, d.dq, R.from, R.to).slice(0, 3), [players, d.dq, R.from, R.to]);
  const improved = useMemo(() => {
    const accIn = (uid: string, a: number, b: number) => {
      const p = d.players[uid];
      const runs = p ? validRuns(p, d.dq).filter((x) => x.status === "done" && (x.finishedAt || 0) >= a && (x.finishedAt || 0) < b) : [];
      const n = runs.reduce((s, x) => s + x.ans.length, 0);
      return { runs: runs.length, acc: pct(runs.reduce((s, x) => s + runCorrect(x), 0), n) };
    };
    return players
      .map((p) => ({ uid: p.uid, now: accIn(p.uid, R.from, R.to), before: accIn(p.uid, R.prevFrom, R.from) }))
      .filter((x) => x.now.runs >= 2 && x.before.runs >= 2 && x.now.acc > x.before.acc)
      .sort((a, b) => b.now.acc - b.before.acc - (a.now.acc - a.before.acc))
      .slice(0, 3);
  }, [players, d.players, d.dq, R.from, R.to, R.prevFrom]);
  const units = useMemo(() => unitBoard(players, d.dq, R.from, R.to).filter((u) => u.ranked).slice(0, 3), [players, d.dq, R.from, R.to]);
  const alerts = new Set(flags.filter((f) => f.sev === "alert").map((f) => f.uid));
  const issued = Object.values(d.gifts).sort((a, b) => b.at - a.at);

  const give = () => {
    if (!award) return;
    const g: Gift = { ...award, id: newId("gift-"), at: Date.now(), by: "", prize: award.prize.trim().slice(0, 80) };
    approve({
      label: `Record a ${award.kind} gift for ${award.winner.startsWith("unit:") ? award.winner.slice(5) : d.players[award.winner]?.name} (${g.prize}). It appears in the Hall of Fame for all players.`,
      yes: "Record gift",
      run: async () => {
        await api.saveGift(tid, g);
        toast("Gift recorded — it's in the Hall of Fame");
        setAward(null);
      },
    });
  };
  const remove = (g: Gift) =>
    approve({
      label: `Remove "${g.label}" (${g.period}) from the Hall of Fame.`,
      yes: "Remove",
      danger: true,
      run: async () => {
        await api.deleteGift(tid, g.id);
      },
    });

  const Person = ({ uid, sub, medal, kind, label, prize }: { uid: string; sub: string; medal: string; kind: Gift["kind"]; label: string; prize: string }) => {
    const p = d.players[uid];
    const already = issued.some((g) => g.winner === uid && g.period === R.label && g.kind === kind);
    return (
      <div className="cand">
        <span className="medal">{medal}</span>
        <div className="who">
          <Chibi look={p?.look ?? 0} equipped={p?.equipped} size={40} still />
          <div>
            <b>{p?.name}</b> {alerts.has(uid) && <span className="sev alert">Review flags first</span>}
            <div className="fine">{p?.empId} · {p?.unit} · {sub}</div>
          </div>
        </div>
        <button className="btn small primary" disabled={already} onClick={() => setAward({ kind, winner: uid, period: R.label, label, prize })}>
          {already ? "Recorded" : "Award"}
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="toolbar">
        <h1>Rewards</h1>
        <Seg<Per> value={per} onChange={setPer} label="Period" options={[["tw", "This week"], ["lw", "Last week"], ["tm", "This month"], ["lm", "Last month"]]} />
      </div>
      <p className="fine">Winners come straight from the leaderboard rules. Players with integrity alerts are marked so you can check them in Security before giving anything. Prizes are free text — write whatever you give.</p>
      <div className="grid3">
        <section className="panel">
          <div className="panel-h"><div><h2>Top 3 · {R.label}</h2><p>Most points in the period</p></div></div>
          {top.length ? top.map((row, i) => <Person key={row.uid} uid={row.uid} medal={String(i + 1)} kind="weekly" sub={`${row.points.toLocaleString()} pts · ${row.acc}%`} label={`#${i + 1} · ${row.points.toLocaleString()} pts`} prize={["Gift voucher (1st)", "Gift voucher (2nd)", "Gift voucher (3rd)"][i]} />) : <p className="fine">No plays in this period.</p>}
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>Most improved</h2><p>Biggest accuracy jump vs the period before (2+ quizzes in each)</p></div></div>
          {improved.length ? improved.map((x, i) => <Person key={x.uid} uid={x.uid} medal={`+${x.now.acc - x.before.acc}`} kind="improved" sub={`${x.before.acc}% → ${x.now.acc}%`} label={`Most improved · ${x.before.acc}% → ${x.now.acc}%`} prize={i === 0 ? "Gift voucher" : "Certificate"} />) : <p className="fine">Nobody qualifies yet — players need 2+ quizzes in both periods.</p>}
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>{labels.branch} champion</h2><p>Highest average points per active player</p></div></div>
          {units.length ? units.map((u, i) => {
            const winner = `unit:${u.unit}`;
            const already = issued.some((g) => g.winner === winner && g.period === R.label);
            return (
              <div className="cand" key={u.unit}>
                <span className="medal">{i + 1}</span>
                <div><b>{u.unit}</b><div className="fine">{u.avg} avg · {u.active}/{u.registered} active · {u.acc}%</div></div>
                <button className="btn small primary" disabled={already} onClick={() => setAward({ kind: "branch", winner, period: R.label, label: `${u.unitType === "dept" ? labels.dept : labels.branch} champion · ${u.avg} avg`, prize: "Team lunch" })}>{already ? "Recorded" : "Award"}</button>
              </div>
            );
          }) : <p className="fine">No {labels.branch.toLowerCase()} or {labels.dept.toLowerCase()} has enough active players yet.</p>}
        </section>
      </div>
      <section className="panel">
        <div className="panel-h"><div><h2>Hall of Fame</h2><p>Gifts recorded so far — players see these in the app</p></div></div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Period</th><th>Type</th><th>Winner</th><th>Label</th><th>Prize</th><th>Recorded</th><th /></tr></thead>
            <tbody>
              {issued.map((g) => (
                <tr key={g.id}>
                  <td>{g.period}</td>
                  <td>{g.kind === "weekly" ? "Top players" : g.kind === "improved" ? "Most improved" : `${labels.branch} / ${labels.dept}`}</td>
                  <td><b>{g.winner.startsWith("unit:") ? g.winner.slice(5) : d.players[g.winner]?.name || "Former player"}</b></td>
                  <td>{g.label}</td>
                  <td>{g.prize}</td>
                  <td className="num">{new Date(g.at).toLocaleDateString()}</td>
                  <td><button className="link danger" onClick={() => remove(g)}>Remove</button></td>
                </tr>
              ))}
              {!issued.length && <tr><td colSpan={7} className="fine">No gifts recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {award && (
        <Modal label="Record a gift" onClose={() => setAward(null)}>
          <h3>Record a gift</h3>
          <p>{award.label} · {award.period}</p>
          <div className="field">
            <label htmlFor="prize">Prize</label>
            <input className="inp" id="prize" value={award.prize} maxLength={80} onChange={(e) => setAward({ ...award, prize: e.target.value })} />
          </div>
          {!award.winner.startsWith("unit:") && d.dq.runs && Object.keys(d.dq.runs).some((k) => k.startsWith(award.winner + ":")) && <p className="err">This player has disqualified plays.</p>}
          <div className="row end">
            <button className="btn ghost small" onClick={() => setAward(null)}>Cancel</button>
            <button className="btn primary small" disabled={!award.prize.trim()} onClick={give}>Record gift</button>
          </div>
        </Modal>
      )}
    </>
  );
}
