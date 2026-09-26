/* Admin portal → Live quiz: pick a live quiz, host it, and manage recent games. */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { useAdmin } from "../admin/Admin";
import { absUrl, href, nav } from "../app/router";
import { Modal } from "../components/ui";
import { fmtDT } from "../lib/util";
import type { Game, LiveSession } from "../types";
import "../styles/live.css";

const STATE_LABEL: Record<LiveSession["state"], string> = { lobby: "In lobby", question: "Question on", reveal: "Showing answer", board: "Scoreboard", ended: "Ended" };

export function LiveTab() {
  const { api, d, slug, tid, can, run, approve } = useApp();
  const { setTab } = useAdmin();
  const [pick, setPick] = useState<Game | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const games = useMemo(
    () =>
      Object.values(d.games)
        .filter((g) => g.kind === "live")
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [d.games],
  );
  const active = useMemo(() => d.live.filter((l) => l.state !== "ended"), [d.live]);
  const recent = d.live.slice(0, 12);

  // player counts for games still running (one watcher each, at most a handful)
  const activeIds = active.slice(0, 6).map((l) => l.id).join(",");
  useEffect(() => {
    if (!activeIds) return;
    const uns = activeIds.split(",").map((id) => api.watchLiveHost(id, (v) => setCounts((c) => (c[id] === v.players.length ? c : { ...c, [id]: v.players.length }))));
    return () => uns.forEach((u) => u());
  }, [api, activeIds]);

  const playable = (g: Game) => g.questions.filter((q) => q.type === "mcq" || q.type === "tf").length;

  return (
    <div className="stack">
      <div className="toolbar">
        <h1>Live quiz</h1>
        {can("editor") && (
          <button type="button" className="btn primary small" onClick={() => setTab("edit", "new:live")}>
            + Create a live quiz
          </button>
        )}
      </div>
      <p className="fine" style={{ maxWidth: "70ch" }}>
        Host a game-show style quiz on a big screen. Players join on their phones at <b>{absUrl({ r: "join" }).replace(/^https?:\/\//, "")}</b> with the game PIN, answer against the clock, and
        climb the scoreboard. Faster right answers score more (500–1,000) plus a streak bonus.
      </p>

      {active.length > 0 && (
        <section className="panel lv-activep">
          <div className="panel-h">
            <h2>Running now</h2>
          </div>
          <div className="lv-sess">
            {active.map((l) => (
              <div key={l.id} className="lv-sessrow">
                <span className="lv-live-dot" aria-hidden="true" />
                <div className="grow">
                  <b>{l.title}</b>
                  <span className="fine">
                    {STATE_LABEL[l.state]}
                    {l.state !== "lobby" ? ` · question ${l.qIndex + 1} of ${l.total}` : ""} · {counts[l.id] ?? l.players ?? "…"} players
                  </span>
                </div>
                <span className="lv-pinchip num">PIN {l.pin}</span>
                <a className="btn lime small" href={href({ r: "host", slug, id: l.id })}>
                  Reopen host screen
                </a>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() =>
                    approve({
                      label: `End "${l.title}" (PIN ${l.pin}) for everyone? Players go to the final results.`,
                      yes: "End game",
                      danger: true,
                      run: () => api.liveControl(l.id, "end"),
                    })
                  }
                >
                  End
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Your live quizzes</h2>
            <p>Live quizzes use multiple-choice and true/false questions, each with its own timer.</p>
          </div>
        </div>
        {games.length === 0 ? (
          <div className="empty">
            No live quizzes yet.{" "}
            {can("editor") ? (
              <button type="button" className="link" onClick={() => setTab("edit", "new:live")}>
                Create one
              </button>
            ) : (
              "Ask an editor to create one."
            )}
          </div>
        ) : (
          <div className="lv-games">
            {games.map((g) => {
              const n = playable(g);
              const secs = g.questions.reduce((a, q) => a + (q.seconds || 20), 0);
              return (
                <div key={g.id} className={`lv-gcard c-${g.color}`}>
                  <div className="lv-gcard-top">
                    <span className="chip">{g.status === "draft" ? "Draft" : g.status === "pending" ? "Awaiting approval" : "Ready"}</span>
                    <span className="chip num">
                      {n} question{n === 1 ? "" : "s"} · ~{Math.max(1, Math.round((secs + n * 15) / 60))} min
                    </span>
                  </div>
                  <b className="lv-gtitle">{g.title}</b>
                  {g.desc && <p className="fine">{g.desc}</p>}
                  <div className="row">
                    <button type="button" className="btn primary small" disabled={!n} onClick={() => setPick(g)}>
                      Host now
                    </button>
                    {can("editor") && (
                      <button type="button" className="btn ghost small" onClick={() => setTab("edit", g.id)}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2>Recent games</h2>
        </div>
        {recent.length === 0 ? (
          <div className="empty">No games hosted yet.</div>
        ) : (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Started</th>
                  <th>PIN</th>
                  <th>State</th>
                  <th className="r">Players</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.title}</b>
                    </td>
                    <td>{fmtDT(l.createdAt)}</td>
                    <td className="num">{l.pin}</td>
                    <td>
                      <span className={`sev ${l.state === "ended" ? "none" : "good"}`}>{STATE_LABEL[l.state]}</span>
                    </td>
                    <td className="r num">{counts[l.id] ?? l.players ?? "–"}</td>
                    <td className="r">
                      <a className="link" href={href({ r: "host", slug, id: l.id })}>
                        {l.state === "ended" ? "Results" : "Host screen"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pick && (
        <HostModal
          g={pick}
          guestsAllowed={d.cfg.signIn.liveGuests}
          canSettings={can("admin")}
          onSettings={() => setTab("settings")}
          onClose={() => setPick(null)}
          onHost={async (guests, where) => {
            // open the second-screen window before the await so pop-up blockers allow it
            const win = where === "window" ? window.open("", "_blank") : null;
            const s = await run(() => api.liveCreate(tid, pick.id, { guests }));
            if (!s) {
              win?.close();
              return;
            }
            setPick(null);
            if (win) win.location.href = absUrl({ r: "host", slug, id: s.id });
            else nav({ r: "host", slug, id: s.id });
          }}
        />
      )}
    </div>
  );
}

function HostModal({
  g, guestsAllowed, canSettings, onSettings, onClose, onHost,
}: { g: Game; guestsAllowed: boolean; canSettings: boolean; onSettings: () => void; onClose: () => void; onHost: (guests: boolean, where: "here" | "window") => Promise<void> }) {
  const [guests, setGuests] = useState(guestsAllowed);
  const [busy, setBusy] = useState(false);
  const go = async (where: "here" | "window") => {
    setBusy(true);
    await onHost(guestsAllowed && guests, where);
    setBusy(false);
  };
  return (
    <Modal label={`Host ${g.title}`} onClose={onClose}>
      <h3>Host "{g.title}"</h3>
      <p className="fine">You'll get a game PIN and QR code to show on the big screen. Players join on their phones.</p>
      {guestsAllowed ? (
        <label className="check">
          <input type="checkbox" checked={guests} onChange={(e) => setGuests(e.target.checked)} />
          <span>
            <b>Allow guests with a nickname</b>
            <br />
            <span className="fine">Off: only signed-in players with a player card can join (scores are tied to real people).</span>
          </span>
        </label>
      ) : (
        <p className="banner blue">
          Only signed-in players can join. Nickname-only guests are turned off for your company
          {canSettings ? (
            <>
              {" "}— turn on <b>Live quiz guests</b> in{" "}
              <button type="button" className="link" onClick={onSettings}>
                Settings
              </button>
              .
            </>
          ) : (
            " (an admin can change this in Settings)."
          )}
        </p>
      )}
      <div className="row end">
        <button type="button" className="btn ghost small" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn white small" disabled={busy} onClick={() => void go("window")} title="Open the host screen in a new window you can drag to the projector">
          Open in new window
        </button>
        <button type="button" className="btn primary small" data-autofocus disabled={busy} onClick={() => void go("here")}>
          {busy ? "Starting…" : "Host here"}
        </button>
      </div>
    </Modal>
  );
}
