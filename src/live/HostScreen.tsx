/* Live quiz — the host's big screen (projector / TV / laptop).
   lobby → question → reveal → board → … → podium. The server owns the state; this
   screen just shows it and sends the host's commands, so it can be reloaded or opened
   on another device at any time. */
import "../styles/admin.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApi } from "../app/ApiCtx";
import { useTenantPub } from "../pages/useTenantPub";
import { absUrl, href } from "../app/router";
import { qrDataUrl } from "../lib/qr";
import { toCSV } from "../lib/security";
import { isDemo } from "../api/demo/guard";
import { Chibi, Mascot } from "../components/Chibi";
import { LogoMark } from "../components/Logo";
import { CountUp, Icon, Modal, confetti } from "../components/ui";
import { Loading } from "../App";
import type { LiveBoardRow, LiveHostView, Role, TenantPublic } from "../types";
import { Shape, TILES, choiceIndex, fmtPts, optionsOf, ordinal, remainingMs, tileOf, tileVars, useNow } from "./common";
import { sound } from "./sound";
import { StageModeToggle, useStageMode } from "../app/stageTheme";
import "../styles/live.css";

const RANK: Record<Role, number> = { viewer: 0, host: 1, editor: 2, admin: 3, owner: 4 };

export function HostScreen({ slug, sessionId }: { slug: string; sessionId: string }) {
  const { api, user } = useApi();
  const { pub, error } = useTenantPub(slug, "Live quiz");
  const [gate, setGate] = useState<"loading" | "signin" | "denied" | "ok">("loading");

  useEffect(() => {
    if (!pub) return;
    if (!user || user.anonymous) return setGate("signin");
    let live = true;
    api.access(pub.id).then(
      (a) => live && setGate(a.role && RANK[a.role] >= RANK.host ? "ok" : "denied"),
      () => live && setGate("denied"),
    );
    return () => {
      live = false;
    };
  }, [api, pub, user]);

  if (error) return <HostMsg title="Can't load" text={error} />;
  if (pub === undefined || (pub && gate === "loading")) return <Loading text="Getting the stage ready…" />;
  if (!pub) return <HostMsg title="Company not found" text="Check the link to this host screen." />;
  if (gate !== "ok")
    return (
      <HostMsg
        title={gate === "signin" ? "Sign in to host" : "Hosts only"}
        text={
          gate === "signin"
            ? `Sign in to the ${pub.name} admin portal on this device, then open this game again from Live quiz → Reopen host screen.`
            : `${user?.email || "This account"} can't host games for ${pub.name}. Ask an admin to give you the Host role.`
        }
        link={{ href: href({ r: "admin", slug, tab: "live" }), label: gate === "signin" ? "Sign in" : "Open the admin portal" }}
      />
    );
  return <Stage pub={pub} sessionId={sessionId} />;
}

function HostMsg({ title, text, link }: { title: string; text: string; link?: { href: string; label: string } }) {
  return (
    <div className="phone" style={{ paddingTop: 40 }}>
      <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <Mascot mood="think" size={110} />
        <h2>{title}</h2>
        <p className="fine">{text}</p>
        {link && (
          <a className="btn primary" href={link.href}>
            {link.label}
          </a>
        )}
      </div>
    </div>
  );
}

/* ====================================================================== */

function Stage({ pub, sessionId }: { pub: TenantPublic; sessionId: string }) {
  const { api, run, user } = useApi();
  const [v, setV] = useState<LiveHostView | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(sound.on);
  const [full, setFull] = useState(!!document.fullscreenElement);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMissing(true), 6000);
    const un = api.watchLiveHost(sessionId, (x) => {
      clearTimeout(t);
      setMissing(false);
      setV(x);
    });
    return () => {
      clearTimeout(t);
      un();
    };
  }, [api, sessionId]);

  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  // body padding would frame the stage — the host screen owns the whole window
  useEffect(() => {
    document.body.classList.add("lv-body");
    return () => {
      document.body.classList.remove("lv-body");
      sound.stopLoop();
    };
  }, []);

  const s = v?.session;
  const state = s?.state;
  const qIndex = s?.qIndex ?? -1;
  const players = useMemo(() => v?.players ?? [], [v]);
  const last = !!s && qIndex + 1 >= s.total;

  const act = useCallback(
    async (action: "start" | "reveal" | "board" | "next" | "end" | "kick", arg?: string) => {
      sound.unlock();
      setBusy(true);
      await run(() => api.liveControl(sessionId, action, arg));
      setBusy(false);
    },
    [api, run, sessionId],
  );

  const primary = useMemo((): { label: string; go: () => void; disabled?: boolean } | null => {
    if (!s) return null;
    if (state === "lobby") return { label: "Start", go: () => void act("start"), disabled: !players.length };
    if (state === "question") return { label: "Skip", go: () => void act("reveal") };
    if (state === "reveal") return last ? { label: "Final results", go: () => void act("next") } : { label: "Scoreboard", go: () => void act("board") };
    if (state === "board") return { label: "Next question", go: () => void act("next") };
    return null;
  }, [s, state, players.length, last, act]);

  /* auto-reveal: when time is up or everyone has answered */
  const now = useNow(state === "question", 200);
  const left = remainingMs(s, now);
  const revealed = useRef(-2);
  const allIn = state === "question" && players.length > 0 && (v?.answered ?? 0) >= players.length;
  useEffect(() => {
    if (state !== "question" || revealed.current === qIndex) return;
    const wait = allIn ? 900 : left + 250;
    const t = setTimeout(() => {
      if (revealed.current === qIndex) return;
      revealed.current = qIndex;
      void api.liveControl(sessionId, "reveal").catch(() => undefined);
    }, wait);
    return () => clearTimeout(t);
    // left is recomputed often; only (re)arm on the second boundary
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, qIndex, allIn, Math.ceil(left / 1000), api, sessionId]);

  /* sounds */
  useEffect(() => {
    if (!state) return;
    if (state === "lobby") sound.loop("lobby");
    else if (state === "question") {
      sound.go();
      sound.loop("question");
    } else {
      sound.loop(null);
      if (state === "reveal") sound.gong();
      if (state === "board") sound.whoosh();
    }
  }, [state, qIndex, soundOn]);
  const secLeft = Math.ceil(left / 1000);
  useEffect(() => {
    if (state === "question" && secLeft > 0 && secLeft <= 5) sound.tick(secLeft === 1);
  }, [secLeft, state]);
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    let fresh = false;
    for (const p of players) if (!seen.current.has(p.id)) (seen.current.add(p.id), (fresh = true));
    if (fresh && state === "lobby") sound.pop();
  }, [players, state]);

  /* keyboard: Space / Enter = next step, F = full screen, M = sound */
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  const [mode, toggleMode] = useStageMode();
  const toggleSound = useCallback(() => {
    sound.set(!sound.on);
    setSoundOn(sound.on);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button, a, [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (primary && !primary.disabled && !busy) primary.go();
      } else if (e.key === "f" || e.key === "F") toggleFull();
      else if (e.key === "m" || e.key === "M") toggleSound();
      else if (e.key === "t" || e.key === "T") toggleMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary, busy, toggleFull, toggleSound, toggleMode]);

  if (!v || !s)
    return missing ? (
      <HostMsg title="Game not found" text="This game may have been removed, or your account can't host it." link={{ href: href({ r: "admin", slug: pub.slug, tab: "live" }), label: "Back to Live quiz" }} />
    ) : (
      <Loading text="Connecting to the game…" />
    );

  const bar = (
    <div className="lv-ctrl">
      <button type="button" className="lv-ib" aria-pressed={soundOn} aria-label={soundOn ? "Sound off (M)" : "Sound on (M)"} title={soundOn ? "Sound off (M)" : "Sound on (M)"} onClick={toggleSound}>
        <SoundIcon on={soundOn} />
      </button>
      <StageModeToggle mode={mode} onToggle={toggleMode} className="lv-ib" />
      <button type="button" className="lv-ib" aria-label={full ? "Exit full screen (F)" : "Full screen (F)"} title={full ? "Exit full screen (F)" : "Full screen (F)"} onClick={toggleFull}>
        <Icon.full />
      </button>
      {state !== "ended" && (
        <button type="button" className="lv-ib lv-end" onClick={() => setEnding(true)}>
          End game
        </button>
      )}
    </div>
  );
  const brand = (
    <div className="lv-brand">
      {pub.branding.logo ? <img src={pub.branding.logo} alt="" /> : <LogoMark size={44} />}
      <span>{pub.branding.productName}</span>
    </div>
  );

  return (
    <div className={`lv-host st-${state} ${mode}`}>
      <Backdrop />
      <header className="lv-top">
        {brand}
        <div className="lv-top-mid">
          {state === "lobby" || state === "ended" ? (
            <span className="lv-title">{s.title}</span>
          ) : (
            <span className="lv-qcount">
              Question <b>{qIndex + 1}</b> of {s.total}
            </span>
          )}
        </div>
        {state !== "lobby" && state !== "ended" && (
          <span className="lv-pinpill" title="Game PIN">
            PIN <b>{s.pin}</b>
          </span>
        )}
        {bar}
      </header>

      <main className="lv-main">
        {state === "lobby" && <Lobby v={v} pub={pub} onKick={(id) => void act("kick", id)} />}
        {(state === "question" || state === "reveal") && <QuestionView v={v} left={left} />}
        {state === "board" && <Board v={v} />}
        {state === "ended" && <Podium v={v} pub={pub} who={user?.email || "host"} />}
      </main>

      {primary && (
        <footer className="lv-foot">
          {state === "lobby" && (
            <span className="lv-hint">
              {players.length ? `${players.length} player${players.length === 1 ? "" : "s"} in · press Space to start` : "Waiting for players…"}
            </span>
          )}
          {state === "question" && <span className="lv-hint">Answers close automatically when time is up or everyone has answered.</span>}
          {state === "reveal" && s.reveal && (
            <span className="lv-hint">
              {(() => {
                const ci = choiceIndex(s.question, s.reveal.canon);
                const right = s.reveal.counts[ci] ?? 0;
                return `${right} of ${players.length} got it right`;
              })()}
            </span>
          )}
          {state === "board" && <span className="lv-hint">Up next: question {qIndex + 2} of {s.total}</span>}
          <button type="button" className={`btn ${state === "question" ? "white" : "lime"} lv-go`} disabled={primary.disabled || busy} onClick={primary.go}>
            {primary.label}
            <kbd>Space</kbd>
          </button>
        </footer>
      )}

      {ending && (
        <Modal label="End game" onClose={() => setEnding(false)}>
          <h3>End this game now?</h3>
          <p>Everyone goes straight to the final results. You can't restart it.</p>
          <div className="row end">
            <button type="button" className="btn ghost small" onClick={() => setEnding(false)}>
              Keep playing
            </button>
            <button
              type="button"
              className="btn orange small"
              data-autofocus
              onClick={() => {
                setEnding(false);
                void act("end");
              }}
            >
              End game
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
    </svg>
  );
}

/** Arena backdrop: glowing spotlights, a halftone floor and drifting brand doodles. */
function Backdrop() {
  return (
    <div className="lv-bg" aria-hidden="true">
      <i className="lv-spot a" />
      <i className="lv-spot b" />
      <i className="lv-dots" />
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 37 + 5) % 100}%`, color: TILES[i % 4].color, animationDelay: `${-i * 2.3}s`, animationDuration: `${18 + (i % 5) * 3}s` }}>
          {i % 5 === 4 ? <b className="lv-qmark">?</b> : <Shape i={i % 4} size={30 + (i % 3) * 22} />}
        </span>
      ))}
    </div>
  );
}

/* ---------------- lobby ---------------- */
function Lobby({ v, pub, onKick }: { v: LiveHostView; pub: TenantPublic; onKick: (id: string) => void }) {
  const { api } = useApi();
  const s = v.session;
  const joinUrl = absUrl({ r: "join" });
  const qr = useMemo(() => qrDataUrl(absUrl({ r: "join", pin: s.pin }), 8, 2), [s.pin]);
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const openTester = () => {
    const url = location.href.split("#")[0] + href({ r: "join", pin: s.pin }) + "?fresh=1";
    window.open(url, "_blank", "noopener");
  };
  return (
    <div className="lv-lobby">
      <section className="lv-joinbox lv-ticket">
        <div className="lv-joinhow">
          <div className="lv-jcol">
            <span className="lv-step">Join at</span>
            <b className="lv-url">{joinUrl.replace(/^https?:\/\//, "")}</b>
            <span className="lv-rules">
              {s.guests ? "Play with your player card or just a nickname." : `Sign in to ${pub.branding.productName} with your player card first.`}
            </span>
          </div>
          <div className="lv-jcol lv-pincol">
            <span className="lv-step">Game PIN</span>
            <b className="lv-pin num" aria-label={`Game PIN ${s.pin.split("").join(" ")}`}>
              {s.pin.slice(0, 3)}
              <span> </span>
              {s.pin.slice(3)}
            </b>
          </div>
        </div>
        <span className="lv-perf" aria-hidden="true" />
        <div className="lv-qrwrap">
          <img className="lv-qr" src={qr} alt="QR code to join this game" />
          <span>Scan to play</span>
        </div>
      </section>

      <section className="lv-crowd" aria-live="polite">
        <div className="lv-crowd-h">
          <span className="lv-count-big num">{v.players.length}</span>
          <span>{v.players.length === 1 ? "player" : "players"}</span>
          {isDemo(api) && (
            <button type="button" className="btn white small lv-tester" onClick={openTester} title="Demo: opens a player in a new tab with its own identity">
              + Open a test player
            </button>
          )}
        </div>
        {v.players.length === 0 ? (
          <div className="lv-waiting">
            <span className="lv-duo"><Mascot who="explorer" mood="think" size={110} /><Mascot who="puff" mood="idle" size={110} /></span>
            <p>Waiting for players to join…</p>
          </div>
        ) : (
          <ul className="lv-people">
            {v.players
              .slice()
              .reverse()
              .map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`lv-person ${armed === p.id ? "armed" : ""}`}
                    title={armed === p.id ? `Click again to remove ${p.nick}` : `Remove ${p.nick}`}
                    onClick={() => (armed === p.id ? (setArmed(null), onKick(p.id)) : setArmed(p.id))}
                  >
                    <Chibi look={p.look} size={62} mood="happy" />
                    <span className="nm">{armed === p.id ? "Remove?" : p.nick}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
        {v.players.length > 0 && <p className="lv-kicknote">Click a name twice to remove it.</p>}
      </section>
    </div>
  );
}

/* ---------------- question & reveal ---------------- */
function QuestionView({ v, left }: { v: LiveHostView; left: number }) {
  const s = v.session;
  const q = s.question;
  const opts = optionsOf(q);
  const reveal = s.state === "reveal" ? s.reveal : undefined;
  const canonIdx = reveal ? choiceIndex(q, reveal.canon) : -1;
  const counts = reveal?.counts ?? v.counts;
  const votes = Math.max(1, counts.reduce((a, b) => a + (b || 0), 0));
  const total = s.qSeconds * 1000;
  const frac = total ? left / total : 0;
  const secs = Math.ceil(left / 1000);
  const n = v.players.length;
  const right = reveal ? counts[canonIdx] ?? 0 : 0;
  const pct = n ? Math.round((right / n) * 100) : 0;
  return (
    <div className={`lv-qv ${reveal ? "revealed" : ""} ${!reveal && secs <= 5 ? "hurry" : ""}`} key={s.qIndex}>
      <div className="lv-qcard">
        <span className="lv-qtag">Question {s.qIndex + 1}</span>
        <h1 className="lv-qtext">{q?.q}</h1>
        {!reveal && (
          <span className="lv-energy" aria-hidden="true">
            <i style={{ transform: `scaleX(${frac})` }} />
          </span>
        )}
      </div>
      <div className="lv-mid">
        {!reveal ? (
          <div className="lv-watch" role="timer" aria-label={`${secs} seconds left`}>
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" className="face" />
              <circle cx="60" cy="60" r="50" className="ticks" />
              <circle cx="60" cy="60" r="50" className="val" style={{ strokeDashoffset: `${(1 - frac) * 314.2}` }} />
            </svg>
            <span className="lv-watch-cap" />
            <b className="num" key={secs}>{secs}</b>
          </div>
        ) : (
          <div className="lv-meter" style={{ ["--p" as string]: pct }} aria-label={`${right} of ${n} got it right`}>
            <b className="num">{pct}%</b>
            <span>got it right</span>
          </div>
        )}
        {q?.img ? (
          <img className="lv-qimg" src={q.img} alt="" />
        ) : (
          <span className="lv-mascot" aria-hidden="true">
            <Mascot who="explorer" mood={reveal ? (pct >= 50 ? "cheer" : "sad") : "think"} size={150} />
            <Mascot who="puff" mood={reveal ? (pct >= 50 ? "cheer" : "sad") : "idle"} size={150} />
          </span>
        )}
        <div className="lv-answered">
          <b className="num">{reveal ? `${right}/${n}` : v.answered}</b>
          <span>{reveal ? "correct" : `of ${n} answered`}</span>
          {!reveal && n > 0 && (
            <span className="lv-dotrow" aria-hidden="true">
              {Array.from({ length: Math.min(n, 30) }, (_, k) => (
                <i key={k} className={k < Math.round((v.answered / n) * Math.min(n, 30)) ? "on" : ""} />
              ))}
            </span>
          )}
        </div>
      </div>
      <div className={`lv-tiles n${opts.length}`}>
        {opts.map((o, i) => {
          const t = tileOf(q, i);
          const c = counts[i] ?? 0;
          const ok = i === canonIdx;
          return (
            <div key={o.choice} className={`lv-tile ${reveal ? (ok ? "ok" : "no") : ""}`} style={tileVars(t, i)}>
              {reveal && <span className="lv-fill" style={{ transform: `scaleX(${c / votes})` }} aria-hidden="true" />}
              <span className="lv-badge">
                <Shape i={t} size={40} />
                <em>{TILES[t].letter}</em>
              </span>
              <span className="tx">{o.label}</span>
              {reveal && <span className="lv-votes num" aria-label={`${c} votes`}>{c}</span>}
              {reveal && ok && (
                <span className="lv-stamp" aria-label="Correct answer">
                  <Icon.check /> Correct
                </span>
              )}
            </div>
          );
        })}
      </div>
      {reveal?.explain && <p className="lv-explain"><b>Why?</b> {reveal.explain}</p>}
    </div>
  );
}

/* ---------------- scoreboard: a race to the finish line ---------------- */
function Board({ v }: { v: LiveHostView }) {
  const s = v.session;
  // where each player stood on the previous scoreboard, so rows can slide to their new place
  const prev = useRef<{ q: number; from: Record<string, number>; seen: Record<string, number> }>({ q: -2, from: {}, seen: {} });
  if (prev.current.q !== s.qIndex) {
    const seen = Object.fromEntries(v.players.map((p, i) => [p.id, i]));
    prev.current = { q: s.qIndex, from: prevRanks.get(s.id) || {}, seen };
    prevRanks.set(s.id, seen);
  }
  const from = prev.current.from;
  const top = v.players.slice(0, 5);
  const lead = Math.max(1, top[0]?.score || 1);
  const hot = v.players.filter((p) => p.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
  const medal = ["gold", "silver", "bronze"];
  return (
    <div className="lv-board">
      <h1 className="lv-h1">
        The <span>race</span> is on
      </h1>
      <ol className="lv-rows">
        {top.map((p, i) => {
          const was = from[p.id];
          const moveFrom = was == null ? 6 - i : Math.min(6, was) - i;
          const up = was != null && was > i;
          const pos = Math.max(0.08, p.score / lead);
          const pos0 = Math.max(0.04, (p.score - p.lastPts) / lead);
          return (
            <li key={p.id} className={`lv-row ${i === 0 ? "first" : ""}`} style={{ "--from": moveFrom, "--pos": pos, "--pos0": pos0, animationDelay: `${i * 70}ms` } as CSSProperties}>
              <span className={`rk num ${medal[i] || ""}`}>{i + 1}</span>
              <span className="lv-lane">
                <span className="lv-track" aria-hidden="true">
                  <i className="lv-trail" />
                  <span className="lv-racer">
                    <Chibi look={p.look} size={54} mood={p.lastOk ? "happy" : "idle"} />
                  </span>
                </span>
                <span className="nm">
                  {p.nick}
                  {up && <span className="up" aria-label="moved up">▲</span>}
                  {p.streak >= 2 && (
                    <span className="lv-streak sm" title={`${p.streak} right in a row`}>
                      <Icon.fire /> {p.streak}
                    </span>
                  )}
                </span>
              </span>
              {p.lastPts > 0 && <span className="lv-delta num">+{fmtPts(p.lastPts)}</span>}
              <CountUp className="sc num" from={p.score - p.lastPts} to={p.score} ms={1100} />
            </li>
          );
        })}
      </ol>
      {hot && (
        <p className="lv-hot">
          <Icon.fire /> {hot.nick} is on fire — {hot.streak} in a row!
        </p>
      )}
    </div>
  );
}
const prevRanks = new Map<string, Record<string, number>>();

/* ---------------- podium & results ---------------- */
function Podium({ v, pub, who }: { v: LiveHostView; pub: TenantPublic; who: string }) {
  const { api } = useApi();
  const [step, setStep] = useState(0); // 0 nothing, 1 third, 2 second, 3 first
  const ps = v.players;
  useEffect(() => {
    sound.loop(null);
    sound.drum();
    const ts = [
      setTimeout(() => setStep(1), 900),
      setTimeout(() => setStep(2), 2100),
      setTimeout(() => {
        setStep(3);
        sound.fanfare();
        confetti(220);
      }, 3600),
      setTimeout(() => confetti(160), 5200),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);
  const exportCsv = () => {
    const s = v.session;
    const rows: (string | number)[][] = [
      [`${pub.name} · ${s.title} · live game PIN ${s.pin} · ${new Date(s.createdAt).toLocaleString()}`],
      [`Exported by ${who} — keep inside ${pub.name}`],
      [],
      ["Rank", "Player", "Score", "Streak at end"],
      ...ps.map((p, i) => [i + 1, p.nick, p.score, p.streak]),
    ];
    const file = `live-${s.title.replace(/[^\w-]+/g, "-").toLowerCase()}-${s.pin}.csv`;
    api.download(file, "﻿" + toCSV(rows), "text/csv");
    void api.audit(pub.id, { action: "Exported data", target: "Live game results", detail: `${s.title} · ${ps.length} players · ${file}` });
  };
  const places = [1, 0, 2]; // 2nd, 1st, 3rd
  return (
    <div className="lv-final">
      <h1 className="lv-h1">{step >= 3 ? <>Champion<span>s!</span></> : "And the winners are…"}</h1>
      <div className={`lv-podium ${step >= 3 ? "lit" : ""}`}>
        <i className="lv-beam l" aria-hidden="true" />
        <i className="lv-beam r" aria-hidden="true" />
        {places.map((idx) => {
          const p: LiveBoardRow | undefined = ps[idx];
          const shown = step >= 3 - idx;
          return (
            <div key={idx} className={`lv-place p${idx + 1} ${shown ? "on" : ""}`}>
              <div className="lv-winner">
                {p && shown && (
                  <>
                    {idx === 0 && (
                      <svg className="lv-crown" viewBox="0 0 64 40" aria-hidden="true">
                        <path d="M4 36 L8 10 L22 22 L32 4 L42 22 L56 10 L60 36 Z" fill="#FFD84D" stroke="#161512" strokeWidth="3" strokeLinejoin="round" />
                        <circle cx="32" cy="26" r="4" fill="#FF5A1F" />
                        <circle cx="16" cy="29" r="3" fill="#3D7BFF" />
                        <circle cx="48" cy="29" r="3" fill="#FF7EB6" />
                      </svg>
                    )}
                    <Chibi look={p.look} variant="full" size={idx === 0 ? 190 : 150} mood="cheer" />
                    <b className="nm">{p.nick}</b>
                    <span className="sc num">{fmtPts(p.score)}</span>
                  </>
                )}
              </div>
              <div className="lv-block">
                <span className="num">{ordinal(idx + 1)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <section className="lv-results">
        <div className="lv-results-h">
          <h2>Full results · {ps.length} players</h2>
          <button type="button" className="btn white small" onClick={exportCsv} disabled={!ps.length}>
            Download CSV
          </button>
          <a className="btn lime small" href={href({ r: "admin", slug: pub.slug, tab: "live" })}>
            Back to Live quiz
          </a>
        </div>
        <div className="lv-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th className="r">Score</th>
                <th className="r">Streak</th>
              </tr>
            </thead>
            <tbody>
              {ps.map((p, i) => (
                <tr key={p.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <span className="who">
                      <Chibi look={p.look} size={30} still />
                      {p.nick}
                    </span>
                  </td>
                  <td className="r num">{fmtPts(p.score)}</td>
                  <td className="r num">{p.streak ? `🔥 ${p.streak}` : "–"}</td>
                </tr>
              ))}
              {!ps.length && (
                <tr className="nodata">
                  <td colSpan={4}>Nobody played.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
