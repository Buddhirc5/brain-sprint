import { useMemo } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Icon } from "../components/ui";
import { DARK_CARDS, isOpen, isScheduled, sortGames } from "../lib/games";
import { board, limitMs, runCorrect, runPoints, windowStart } from "../lib/scoring";
import { fmtDate, fmtMin, todayKey } from "../lib/util";
import type { Game } from "../types";
import { buildMap } from "../lib/arenaMap";
import { WHO } from "../lib/answers";
import { Avatar, certInfo, firstName, pubName } from "./common";

export function Lobby() {
  const { me, stats, d, go, players, features, labels } = useApp();
  const s = me ? stats[me.uid] : undefined;
  const t = todayKey();
  const all = useMemo(() => sortGames(Object.values(d.games)), [d.games]);
  const sprints = features.sprint ? all.filter((g) => g.kind === "sprint") : [];
  const stories = features.sprint ? all.filter((g) => g.kind === "story" && isOpen(g, todayKey())) : [];
  const certs = features.cert ? all.filter((g) => g.kind === "cert" && (g.status === "live" || g.status === "closed")) : [];
  const weekBoard = useMemo(() => board(players, d.dq, windowStart("week")), [players, d.dq]);
  if (!me || !s) return null;

  const played = (g: Game) => me.runs?.[g.id]?.status === "done";
  const open = sprints.filter((g) => isOpen(g, t));
  const todays = open.filter((g) => g.date === t);
  const catchUp = open.filter((g) => g.date !== t && !played(g));
  const soon = sprints.filter((g) => isScheduled(g)).slice(0, 3);
  const done = sprints.filter((g) => g.date !== t && played(g)).slice(0, 12);
  const myWeek = weekBoard.findIndex((r) => r.uid === me.uid) + 1;
  const gifts = features.rewards ? Object.values(d.gifts).sort((a, b) => b.at - a.at).slice(0, 8) : [];
  const lv = s.level;
  const hasToday = todays.some((g) => !played(g));
  const certOpen = certs.filter((g) => isOpen(g, t));
  const certPassed = certs.filter((g) => certInfo(me, g).passed).length;
  const certTodo = certOpen.filter((g) => !certInfo(me, g).passed).length;

  const mapInfo = (() => {
    if (!features.sprint) return null;
    const m = buildMap(Object.values(d.games), me, [], d.dq, t, () => "locked");
    const at = m.lands.flatMap((l) => l.stops).find((x) => x.g.id === m.current);
    const land = m.lands.find((l) => l.stops.includes(at!)) || m.lands[0];
    return { total: m.total, at: at?.n || 1, stars: m.stars, land: land.name };
  })();

  const statCount = 1 + (features.streaks ? 1 : 0) + (features.coins ? 1 : 0);
  const quick: { k: string; label: string; icon: JSX.Element; hl?: boolean; on: () => void }[] = [
    { k: "board", label: "Leaderboard", icon: <Icon.trophy />, on: () => go({ v: "board" }) },
  ];
  if (features.store && features.coins) quick.push({ k: "store", label: "Store", icon: <Icon.store />, hl: true, on: () => go({ v: "store" }) });
  if (certs.length) quick.push({ k: "certs", label: "Certifications", icon: <Icon.shield />, on: () => go({ v: "certs" }) });
  quick.push({ k: "guide", label: "How it works", icon: <Icon.book />, on: () => go({ v: "guide" }) });

  return (
    <div className="phone">
      <div className="topbar">
        <span className="pill">{me.unit}</span>
        <span className="grow" />
        {features.coins && (
          <span className="pill num" data-coin-target title="Coins">
            <span className="coin-ic" />
            {s.coins.toLocaleString()}
          </span>
        )}
        <button type="button" className="icon-btn" aria-label="Edit player card" onClick={() => go({ v: "setup", editing: true })}>
          <Icon.user />
        </button>
      </div>

      <section className="me" aria-label="Your player card">
        <h1 className="me-name" style={{ fontSize: nameSize(firstName(me.name).length) }}>
          {firstName(me.name)}
        </h1>
        <div className="me-lvl">Level {lv.level}</div>
        <div className="me-title">
          {lv.title}
          {myWeek ? ` · #${myWeek} this week` : ""}
        </div>
        <div className="me-char" aria-hidden="true">
          <Chibi look={me.look} equipped={me.equipped} variant="full" size={150} mood={hasToday ? "idle" : "happy"} />
        </div>
        <div className="xp" role="progressbar" aria-label="Progress to next level" aria-valuenow={Math.round(lv.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.round(lv.progress * 100)}%` }} />
        </div>
        <div className="xp-cap num">
          <span>{s.points.toLocaleString()} pts</span>
          <span>
            {(lv.to - s.points).toLocaleString()} to Level {lv.level + 1}
          </span>
        </div>
        <div className="stats" style={{ gridTemplateColumns: `repeat(${statCount}, 1fr)` }}>
          {features.streaks && (
            <div className="stat">
              <span className="ic" style={{ background: "var(--orange-soft)", color: "var(--orange)" }}>
                <Icon.fire />
              </span>
              <div>
                <b className="num">{s.streak.current}-day</b>
                <small>{s.streak.current && !s.streak.alive ? "Play today!" : "Streak"}</small>
              </div>
            </div>
          )}
          {features.coins && (
            <div className="stat">
              <span className="ic" style={{ background: "#FFF3C4" }}>
                <span className="coin-ic" style={{ margin: 0 }} />
              </span>
              <div>
                <b className="num">{s.coins.toLocaleString()}</b>
                <small>Coins</small>
              </div>
            </div>
          )}
          <div className="stat">
            <span className="ic" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
              <Icon.check />
            </span>
            <div>
              <b className="num">{s.answered ? `${s.acc}%` : "—"}</b>
              <small>Accuracy</small>
            </div>
          </div>
        </div>
      </section>

      <nav className="quick" aria-label="Shortcuts" style={{ gridTemplateColumns: `repeat(${Math.min(quick.length, 4)}, 1fr)` }}>
        {quick.map((x) => (
          <button type="button" key={x.k} onClick={x.on} className={x.hl ? "hl" : ""}>
            {x.icon}
            {x.label}
          </button>
        ))}
      </nav>

      {mapInfo && mapInfo.total > 0 && (
        <button type="button" className="map-cta" onClick={() => go({ v: "map" })}>
          <span className="map-cta-l">
            <small>Arena Map</small>
            <b>{mapInfo.land}</b>
            <span className="num">
              Stop {mapInfo.at} of {mapInfo.total} · ★ {mapInfo.stars}
            </span>
          </span>
          <svg className="map-cta-art" viewBox="0 0 120 70" aria-hidden="true">
            <path d="M6 62 C30 62 26 36 52 36 S78 10 112 10" fill="none" stroke="#FFF6DD" strokeWidth="12" strokeLinecap="round" />
            <path d="M6 62 C30 62 26 36 52 36 S78 10 112 10" fill="none" stroke="#FF5A1F" strokeWidth="4" strokeDasharray="0.1 9" strokeLinecap="round" />
            <circle cx="14" cy="61" r="9" fill="#C6F432" stroke="#fff" strokeWidth="3" />
            <circle cx="52" cy="36" r="9" fill="#C6F432" stroke="#fff" strokeWidth="3" />
            <circle cx="100" cy="12" r="11" fill="#FF5A1F" stroke="#fff" strokeWidth="3" />
          </svg>
        </button>
      )}

      {features.live && (
        <a className="live-cta" href="#/join">
          <span className="dot" aria-hidden="true" />
          <span className="grow">
            <b>Join a live game</b>
            <small>Got a game PIN from your host? Jump in.</small>
          </span>
          <span className="btn lime small" aria-hidden="true">
            Join
          </span>
        </a>
      )}

      {certTodo > 0 && (
        <button type="button" className="cert-cta" onClick={() => go({ v: "certs" })}>
          <span className="seal" aria-hidden="true">
            <Icon.shield />
          </span>
          <span className="grow">
            <b>
              {certTodo} certification{certTodo > 1 ? "s" : ""} to complete
            </b>
            <small>{certPassed ? `${certPassed} passed so far` : "Pass the exam to get your certificate"}</small>
          </span>
          <Icon.back />
        </button>
      )}

      {features.sprint && (
        <>
          <div className="sec-h">
            <h2>Today's sprint</h2>
            <span className="sub">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</span>
          </div>
          <div className="games">
            {todays.length ? (
              todays.map((g) => <GameCard key={g.id} g={g} today />)
            ) : (
              <div className="empty">{catchUp.length ? "Today's questions drop soon. Warm up with a catch-up quiz below." : "Today's questions drop soon. Check back later!"}</div>
            )}
          </div>
        </>
      )}

      {stories.length > 0 && (
        <>
          <div className="sec-h">
            <h2 className="sm-h">Story Mode</h2>
            <span className="sub">Comic case studies · no timer</span>
          </div>
          <div className="sm-shelf">
            {stories.map((g, i) => (
              <StoryCover key={g.id} g={g} n={i + 1} />
            ))}
          </div>
        </>
      )}

      {catchUp.length > 0 && (
        <>
          <div className="sec-h">
            <h2>Catch up</h2>
            <span className="sub">{catchUp.length} to play</span>
          </div>
          <div className="games">
            {catchUp.map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <div className="sec-h">
            <h2>Coming up</h2>
          </div>
          <div className="done-list">
            {soon.map((g) => (
              <div key={g.id} className="done-row">
                <span className="dot" style={{ background: dotColor(g) }} />
                <b>{g.title}</b>
                <span className="sub">{fmtDate(g.date)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {gifts.length > 0 && (
        <>
          <div className="sec-h">
            <h2>Hall of fame</h2>
            <span className="sub">Recent winners</span>
          </div>
          <div className="fame">
            {gifts.map((g) => {
              const p = d.players[g.winner];
              return (
                <div className="f" key={g.id}>
                  {p ? (
                    <Avatar p={p} size={56} />
                  ) : (
                    <span className="lock-badge">
                      <Icon.trophy />
                    </span>
                  )}
                  <b>{g.winner.startsWith("unit:") ? g.winner.slice(5) : pubName(p, d.cfg)}</b>
                  <small>{g.label}</small>
                  <span className="prize">{g.period}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <div className="sec-h">
            <h2>Completed</h2>
          </div>
          <div className="done-list">
            {done.map((g) => {
              const r = me.runs![g.id];
              return (
                <button type="button" key={g.id} className="done-row" onClick={() => go({ v: "results", gid: g.id })}>
                  <span className="dot" style={{ background: dotColor(g) }} />
                  <b>{g.title}</b>
                  <span className="sub num">
                    {runCorrect(r)}/{r.total} · {runPoints(r).total} pts
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="sec-h">
        <h2>Top this week</h2>
        <button type="button" className="link" onClick={() => go({ v: "board" })}>
          Full board
        </button>
      </div>
      <div className="lb">
        {weekBoard.slice(0, 5).map((row, i) => {
          const p = d.players[row.uid];
          const mine = row.uid === me.uid;
          return (
            <div key={row.uid} className={`lb-row ${mine ? "me-row" : ""}`}>
              <span className="lb-rank num">{i + 1}</span>
              <Avatar p={p} />
              <div className="lb-name">
                <b>
                  {pubName(p, d.cfg)}
                  {mine ? " (you)" : ""}
                </b>
                <span className="sub">{p?.unit}</span>
              </div>
              <span className="lb-score num">
                {row.points.toLocaleString()}
                <small>pts</small>
              </span>
            </div>
          );
        })}
        {!weekBoard.length && <div className="empty">No plays yet this week. Be first on the board.</div>}
      </div>
      {features.battle && (
        <button type="button" className="btn ghost block" onClick={() => go({ v: "board" })}>
          {labels.battle}: see how your {labels.branch.toLowerCase()} is doing
        </button>
      )}
    </div>
  );
}

const dotColor = (g: Game) => `var(--${g.color === "ink" ? "ink" : g.color === "blush" ? "pink" : g.color})`;

/** A Story Mode episode as a little comic cover: its first character, NEW or the rank you got. */
function StoryCover({ g, n }: { g: Game; n: number }) {
  const { me, go } = useApp();
  const run = me?.runs?.[g.id];
  const done = run?.status === "done";
  const steps = g.questions[0]?.story?.steps || [];
  const lead = steps.find((s) => s.who !== "narrator");
  const share = done ? (run!.ans.length ? run!.ans.reduce((t, a) => t + (a.ok ? 1 : a.f || 0), 0) / run!.ans.length : 0) : 0;
  const rank = share >= 1 ? "S" : share >= 0.5 ? "A" : "B";
  return (
    <button type="button" className={`sm-cover c-${g.color}`} onClick={() => go(done ? { v: "results", gid: g.id } : { v: "play", gid: g.id })} aria-label={`Story ${n}: ${g.title}${done ? `, rank ${rank}` : ""}`}>
      <span className="sm-ep">EP. {n}</span>
      {done ? <span className="sm-rank">{rank}</span> : !run && <span className="sm-new">NEW!</span>}
      {lead && (
        <span className="sm-fig" aria-hidden="true">
          <Chibi look={lead.look ?? WHO[lead.who].look} variant="bust" size={92} mood={lead.mood || "idle"} still />
        </span>
      )}
      <b className="sm-t">{g.title}</b>
      <small>
        {g.questions[0]?.topic} · {steps.length} pages
      </small>
    </button>
  );
}

function GameCard({ g, today }: { g: Game; today?: boolean }) {
  const { me, go } = useApp();
  const run = me?.runs?.[g.id];
  const n = g.questions.length;
  const topics = [...new Set(g.questions.map((q) => q.topic))].slice(0, 3);
  const btn = DARK_CARDS.includes(g.color) ? "lime" : "primary";
  return (
    <article className={`game ${g.color}`}>
      {today ? (
        <span className="today-tag">Today!</span>
      ) : (
        <span className="deco" aria-hidden="true">
          {n}Q
        </span>
      )}
      <h3>{g.title}</h3>
      {g.desc && <p className="desc">{g.desc}</p>}
      <div className="meta">
        <span className="chip">
          {n} question{n > 1 ? "s" : ""}
        </span>
        <span className="chip">{fmtMin(limitMs(g) / 60000)}</span>
        {topics.map((t) => (
          <span className="chip" key={t}>
            {t}
          </span>
        ))}
      </div>
      <div className="go">
        {run?.status === "done" ? (
          <>
            <span className="done-badge">Scored {runPoints(run).total} ✓</span>
            <button type="button" className={`btn ${btn} small`} onClick={() => go({ v: "results", gid: g.id })}>
              See scorecard
            </button>
          </>
        ) : run ? (
          <>
            <span className="done-badge">In progress — the clock kept running</span>
            <button type="button" className={`btn ${btn}`} onClick={() => go({ v: "play", gid: g.id })}>
              Resume
            </button>
          </>
        ) : (
          <>
            <span className="done-badge" style={{ fontWeight: 700, opacity: 0.85 }}>
              One try · answers shown instantly
            </span>
            <button type="button" className={`btn ${btn}`} onClick={() => go({ v: "play", gid: g.id })} aria-label={`Play ${g.title}`}>
              Play
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/* The name sits beside the 132px character, so on narrow phones it also shrinks to fit that column
   (the display font is about 0.52em per letter) instead of breaking a letter onto the next line. */
function nameSize(len: number) {
  const n = Math.max(1, len);
  return `max(22px, min(clamp(44px, 13vw, 64px), ${Math.max(28, Math.floor(380 / n))}px, calc((min(100vw - 32px, 470px) - 176px) / ${(n * 0.52).toFixed(2)})))`;
}
