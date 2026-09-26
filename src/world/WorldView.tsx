/* Knowledge World — full-screen shell around the 2D papercraft game:
   HUD, route map, district banners, race overlays, car cards, trivia
   bubbles, pause menu and thumb controls for phones. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./world.css";
import { Icon } from "../components/ui";
import { Game, type Hud } from "./game";
import { BUBBLES, DISTRICTS, FINISH_X, START_X, WORLD_W } from "./city";
import { deck, type Trivia } from "./trivia";
import type { Equipped } from "../types";

/** Phones and tablets get thumb controls (touch screens without a fine pointer, or small touch screens). */
const coarse = () =>
  typeof matchMedia !== "undefined" &&
  (matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820));

export function WorldView({ look, equipped, onExit }: { look: number; equipped?: Equipped; onExit: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const cards = useRef<Trivia[]>(deck());
  const [mobile] = useState(coarse);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [fail, setFail] = useState("");
  const [bubble, setBubble] = useState<{ id: number; t: Trivia; pick: number | null } | null>(null);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(true);
  const [banner, setBanner] = useState<number | null>(null);
  const lastDistrict = useRef(-1);
  const eqKey = JSON.stringify(equipped || {}); // restart only when the outfit really changes

  useEffect(() => {
    if (!canvas.current) return;
    let g: Game;
    try {
      g = new Game({
        canvas: canvas.current,
        look,
        equipped: JSON.parse(eqKey) as Equipped,
        mobile,
        onHud: setHud,
        onReady: () => setReady(true),
        onBubble: (id) => {
          if (!cards.current.length) cards.current = deck();
          setBubble({ id, t: cards.current.pop()!, pick: null });
        },
      });
    } catch {
      setFail("Your browser couldn't start the game. Try another browser or device.");
      return;
    }
    game.current = g;
    setSound(g.sfx.on);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      g.dispose();
      game.current = null;
    };
  }, [look, eqKey, mobile]);

  // district title cards
  useEffect(() => {
    if (!hud || hud.district === lastDistrict.current) return;
    lastDistrict.current = hud.district;
    setBanner(hud.district);
    const t = window.setTimeout(() => setBanner(null), 2600);
    return () => window.clearTimeout(t);
  }, [hud]);

  // Esc / P pauses
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (bubble) return;
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        setPaused((p) => {
          game.current?.setPaused(!p);
          return !p;
        });
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [bubble]);

  const resume = () => {
    setPaused(false);
    game.current?.setPaused(false);
  };
  const pause = () => {
    setPaused(true);
    game.current?.setPaused(true);
  };
  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    game.current?.sfx.set(on);
  };
  const fullscreen = () => {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.().catch(() => undefined);
  };
  const closeBubble = () => {
    if (!bubble) return;
    const ok = bubble.pick === bubble.t.a;
    game.current?.answer(bubble.id, ok);
    setBubble(null);
  };

  const race = hud?.race;
  const d = banner != null ? DISTRICTS[banner] : null;
  return (
    <div className={`kw ${mobile ? "touch" : ""}`} ref={wrap}>
      <canvas ref={canvas} className="kw-canvas" aria-label="Knowledge World" />
      {!ready && !fail && (
        <div className="kw-loading">
          <div className="kw-load-card">
            <span className="kw-kicker">Knowledge World</span>
            <b>Cutting the paper city…</b>
            <span className="kw-load-bar"><i /></span>
          </div>
        </div>
      )}
      {fail && (
        <div className="kw-fail">
          <p>{fail}</p>
          <button className="btn lime" onClick={onExit}>Back</button>
        </div>
      )}

      {ready && hud && (
        <>
          <div className="kw-top">
            <button type="button" className="kw-btn" onClick={onExit} aria-label="Leave Knowledge World">
              <Icon.back />
            </button>
            <span className="kw-pill"><span className="coin-ic" /> <span className="num">{hud.coins.toLocaleString()}</span></span>
            <span className="kw-pill kw-orb">? <span className="num">{hud.bubbles}/{hud.bubblesTotal}</span></span>
            <span className="grow" />
            <button type="button" className="kw-btn light" onClick={toggleSound} aria-label={sound ? "Mute" : "Sound on"} aria-pressed={sound}>
              {sound ? <SpeakerOn /> : <SpeakerOff />}
            </button>
            <button type="button" className="kw-btn light kw-fs" onClick={fullscreen} aria-label="Full screen">
              <Icon.full />
            </button>
            <button type="button" className="kw-btn" onClick={pause} aria-label="Pause">
              <PauseIc />
            </button>
          </div>

          {d && (
            <div className="kw-banner" key={banner} style={{ ["--dc" as string]: d.color }}>
              <b>{d.name}</b>
              <span>{d.sub}</span>
            </div>
          )}

          <RouteMap hud={hud} />

          {hud.mode === "car" && (
            <div className="kw-gauge" aria-hidden="true">
              <span className="kw-speed num">{hud.speed}<small>km/h</small></span>
              <span className="kw-boost"><i style={{ width: `${Math.round(hud.boost * 100)}%` }} /><small>BOOST</small></span>
            </div>
          )}

          {race?.state === "countdown" && (
            <div className="kw-count" key={race.count}>{race.count || "GO!"}</div>
          )}
          {race?.state === "running" && (
            <div className="kw-race" role="timer">
              <span className="num">{race.t.toFixed(1)}s</span>
              <small className={race.gap >= 0 ? "ahead" : "behind"}>{race.gap >= 0 ? `You lead by ${Math.round(race.gap / 10)} m` : `Sprinty leads by ${Math.round(-race.gap / 10)} m`}</small>
            </div>
          )}
          {race?.state === "done" && race.result && (
            <div className={`kw-result ${race.result.win ? "win" : "lose"}`} role="status">
              <span className="kw-kicker">{race.result.win ? "Winner!" : "So close!"}</span>
              <b>{race.result.win ? "You beat Sprinty" : "Sprinty wins this time"}</b>
              <div className="kw-result-row">
                <span><small>Your time</small><strong className="num">{race.result.time.toFixed(2)}s</strong></span>
                {race.result.rival != null && <span><small>Sprinty</small><strong className="num">{race.result.rival.toFixed(2)}s</strong></span>}
                <span><small>{race.result.newBest ? "New best!" : "Best"}</small><strong className="num">{race.result.best?.toFixed(2)}s</strong></span>
              </div>
              <em>+{race.result.coins} coins</em>
            </div>
          )}

          {hud.carCard && (
            <div className="kw-carcard" style={{ ["--cc" as string]: hud.carCard.color }}>
              <span className="kw-kicker">Pick a ride</span>
              <b>{hud.carCard.name}</b>
              <span className="kw-tag">{hud.carCard.tag}</span>
              {(["Speed", "Grip", "Air"] as const).map((l, i) => (
                <span key={l} className="kw-stat">
                  <small>{l}</small>
                  <span>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= hud.carCard!.stats[i] ? "on" : ""} />)}</span>
                </span>
              ))}
              {hud.carCard.best != null && <span className="kw-tag">Best lap {hud.carCard.best.toFixed(2)}s</span>}
            </div>
          )}

          {hud.prompt && !bubble && !paused && <div className="kw-hint">{hud.prompt}</div>}
          {hud.toast && <div className="kw-toast">{hud.toast}</div>}

          {mobile && !paused && !bubble && (
            <>
              <div className="kw-dpad">
                <HoldBtn className="kw-pad arrow" label="Left" on={(v) => game.current?.press("left", v)}>◀</HoldBtn>
                <HoldBtn className="kw-pad arrow" label="Right" on={(v) => game.current?.press("right", v)}>▶</HoldBtn>
              </div>
              <div className="kw-pads">
                {hud.use && (
                  <button type="button" className={`kw-pad use ${hud.use === "GO!" ? "go" : ""}`} onClick={() => game.current?.go()}>
                    {hud.use}
                  </button>
                )}
                <HoldBtn className="kw-pad jump" label={hud.mode === "car" ? "Boost" : "Jump"} on={(v) => game.current?.press("jump", v)}>
                  {hud.mode === "car" ? "Boost" : "Jump"}
                </HoldBtn>
              </div>
            </>
          )}
          {mobile && <div className="kw-rotate">Turn your phone sideways for the best view</div>}
        </>
      )}

      {paused && (
        <div className="kw-modal-bg">
          <div className="kw-modal" role="dialog" aria-modal="true" aria-label="Paused">
            <span className="kw-kicker">Paused</span>
            <h3>Take a breather</h3>
            <dl className="kw-help">
              <dt>{mobile ? "◀ ▶" : "← →  or  A D"}</dt><dd>Walk · drive · tilt in the air</dd>
              <dt>{mobile ? "Jump" : "Space"}</dt><dd>Jump (hold for higher) · boost in a car</dd>
              <dt>{mobile ? "Drive" : "E"}</dt><dd>Get in / out of a car</dd>
              <dt>Tip</dt><dd>Bounce on the café awning to reach the roof</dd>
            </dl>
            <div className="kw-modal-row">
              <button type="button" className="btn lime" onClick={resume} autoFocus>Resume</button>
              <button type="button" className="btn ghost" onClick={toggleSound}>Sound: {sound ? "on" : "off"}</button>
              <button type="button" className="btn ghost" onClick={onExit}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {bubble && (
        <div className="kw-modal-bg">
          <div className="kw-modal" role="dialog" aria-modal="true" aria-label="Knowledge bubble">
            <span className="kw-kicker">Knowledge bubble</span>
            <h3>{bubble.t.q}</h3>
            <div className="kw-opts">
              {bubble.t.options.map((o, i) => {
                const state = bubble.pick == null ? "" : i === bubble.t.a ? "ok" : i === bubble.pick ? "no" : "dim";
                return (
                  <button key={o} type="button" className={`kw-opt ${state}`} disabled={bubble.pick != null} onClick={() => {
                    setBubble({ ...bubble, pick: i });
                    if (i === bubble.t.a) game.current?.sfx.right();
                    else game.current?.sfx.wrong();
                  }} autoFocus={i === 0}>
                    <span>{"ABCD"[i]}</span> {o}
                  </button>
                );
              })}
            </div>
            {bubble.pick != null && (
              <div className={`kw-why ${bubble.pick === bubble.t.a ? "ok" : "no"}`}>
                <b>{bubble.pick === bubble.t.a ? "Correct! +50 coins" : "Not quite · +10 coins for trying"}</b>
                <p>{bubble.t.why}</p>
                <button type="button" className="btn lime block" onClick={closeBubble} autoFocus>Keep exploring</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Thin paper strip showing the whole street: districts, bubbles, start/finish, you and Sprinty. */
function RouteMap({ hud }: { hud: Hud }) {
  const pct = (x: number) => `${(x / WORLD_W) * 100}%`;
  const racing = hud.race.state === "running" || hud.race.state === "countdown";
  return (
    <div className="kw-route" aria-hidden="true">
      <div className="kw-route-bar">
        {DISTRICTS.map((d) => (
          <i key={d.name} style={{ left: pct(d.x0), width: pct(d.x1 - d.x0), background: d.color }} />
        ))}
        {BUBBLES.map((b, i) => <span key={i} className="kw-r-bub" style={{ left: pct(b.x) }} />)}
        <span className="kw-r-flag start" style={{ left: pct(START_X) }} />
        <span className="kw-r-flag finish" style={{ left: pct(FINISH_X) }} />
        {racing && <span className="kw-r-dot rival" style={{ left: `${hud.rival * 100}%` }} />}
        <span className="kw-r-dot me" style={{ left: `${hud.progress * 100}%` }} />
      </div>
      <span className="kw-route-name">{DISTRICTS[hud.district]?.name}</span>
    </div>
  );
}

function HoldBtn({ className, label, on, children }: { className: string; label: string; on: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        on(true);
      }}
      onPointerUp={() => on(false)}
      onPointerCancel={() => on(false)}
      onPointerLeave={() => on(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function SpeakerOn() {
  return (<svg viewBox="0 0 24 24" {...P}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>);
}
function SpeakerOff() {
  return (<svg viewBox="0 0 24 24" {...P}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>);
}
function PauseIc() {
  return (<svg viewBox="0 0 24 24" {...P}><path d="M9 5v14M15 5v14" /></svg>);
}
