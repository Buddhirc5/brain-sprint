import { useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Seg } from "../components/ui";
import { board, RULES, unitBoard, windowStart, type Window } from "../lib/scoring";
import type { UnitType } from "../types";
import { Avatar, pubName, TopBar, unitLabel } from "./common";

type Tab = Window | "units";

export function Board() {
  const { d, me, go, players, features, labels } = useApp();
  const [tab0, setTab] = useState<Tab>("week");
  const tab: Tab = tab0 === "units" && !features.battle ? "week" : tab0;
  const tabs: [Tab, string][] = [["week", "Week"], ["month", "Month"], ["all", "All time"]];
  if (features.battle) tabs.push(["units", labels.branches]);
  const [unitWin, setUnitWin] = useState<Window>("week");
  const rows = useMemo(() => (tab === "units" ? [] : board(players, d.dq, windowStart(tab))), [tab, players, d.dq]);
  const units = useMemo(() => (tab === "units" ? unitBoard(players, d.dq, windowStart(unitWin)) : []), [tab, unitWin, players, d.dq]);
  const pod = rows.slice(0, 3);
  const rest = rows.slice(3);
  const myIdx = me ? rows.findIndex((r) => r.uid === me.uid) : -1;

  return (
    <div className="phone">
      <TopBar title="Leaderboard" back={() => go({ v: "lobby" })} />
      <Seg<Tab> value={tab} onChange={setTab} label="Leaderboard period" options={tabs} />
      {tab !== "units" ? (
        <>
          {pod.length > 0 && (
            <div className="podium">
              {[1, 0, 2].map((k) => {
                const row = pod[k];
                if (!row) return <div key={k} />;
                const p = d.players[row.uid];
                return (
                  <div key={row.uid} className={`pod p${k + 1}`}>
                    <Chibi look={p?.look ?? 0} equipped={p?.equipped} variant="full" size={k === 0 ? 92 : 74} mood={k === 0 ? "cheer" : "happy"} />
                    <b>{pubName(p, d.cfg)}</b>
                    <div className="blk num">{k + 1}</div>
                    <span className="sub num">{row.points.toLocaleString()} pts</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="lb">
            {rest.map((row, i) => {
              const p = d.players[row.uid];
              const mine = row.uid === me?.uid;
              return (
                <div key={row.uid} className={`lb-row ${mine ? "me-row" : ""}`}>
                  <span className="lb-rank num">{i + 4}</span>
                  <Avatar p={p} />
                  <div className="lb-name">
                    <b>
                      {pubName(p, d.cfg)}
                      {mine ? " (you)" : ""}
                    </b>
                    <span className="sub">
                      {p?.unit} · {row.acc}% · {row.runs} quiz{row.runs > 1 ? "zes" : ""}
                    </span>
                  </div>
                  <span className="lb-score num">
                    {row.points.toLocaleString()}
                    <small>pts</small>
                  </span>
                </div>
              );
            })}
            {!rows.length && <div className="empty">No finished quizzes in this period yet.</div>}
          </div>
          {myIdx >= 0 && (
            <p className="fine" style={{ textAlign: "center" }}>
              You're #{myIdx + 1} of {rows.length}
            </p>
          )}
          <p className="rules-note">Ties are broken by accuracy, then less time used, then whoever got there first. Only your first try at each quiz counts.</p>
        </>
      ) : (
        <>
          <Seg<Window> value={unitWin} onChange={setUnitWin} label={`${labels.battle} period`} options={[["week", "This week"], ["month", "This month"], ["all", "All time"]]} />
          <p className="rules-note">
            {labels.battle} ranks by <b>average points per active player</b>, so small {labels.branches.toLowerCase()} can beat big ones. A {labels.branch.toLowerCase()} or {labels.dept.toLowerCase()} needs {RULES.branchMin}+ active players to be ranked.
          </p>
          <div className="lb">
            {units.map((u, i) => (
              <div key={u.unitType + u.unit} className={`lb-row ${me && me.unit === u.unit && me.unitType === u.unitType ? "me-row" : ""}`}>
                <span className="lb-rank num">{u.ranked ? i + 1 : "–"}</span>
                <div className="lb-name">
                  <b>{u.unit}</b>
                  <span className="sub">
                    {unitLabel(labels, u.unitType as UnitType)} · {u.active}/{u.registered} playing{u.active ? ` · ${u.acc}%` : ""}
                    {!u.ranked ? ` · needs ${RULES.branchMin} players` : ""}
                  </span>
                </div>
                <span className="lb-score num">
                  {u.avg.toLocaleString()}
                  <small>avg</small>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
