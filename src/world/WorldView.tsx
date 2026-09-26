/* Knowledge World — full-screen React shell around the 3D engine:
   HUD, minimap, thumb controls for phones, trivia bubbles and lap results. */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import "./world.css";
import { Icon } from "../components/ui";
import { KnowledgeWorld, type HudState } from "./engine";
import { deck, type Trivia } from "./trivia";

/** Phones and tablets get thumb controls (touch screens without a fine pointer, or small touch screens). */
const coarse = () =>
  typeof matchMedia !== "undefined" &&
  (matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820));

export function WorldView({ look, onExit, brand = "Knowledge World" }: { look: number; onExit: () => void; brand?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const world = useRef<KnowledgeWorld | null>(null);
  const cards = useRef<Trivia[]>(deck());
  const [mobile] = useState(coarse);
  const [hud, setHud] = useState<HudState | null>(null);
  const [fail, setFail] = useState("");
  const [bubble, setBubble] = useState<{ id: number; t: Trivia; pick: number | null } | null>(null);
  const [lap, setLap] = useState<{ t: number; best: boolean } | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    let w: KnowledgeWorld;
    try {
      w = new KnowledgeWorld({
        canvas: canvas.current,
        minimap: mini.current,
        look,
        mobile,
        onHud: setHud,
        onOrb: (id) => {
          if (!cards.current.length) cards.current = deck();
          setBubble({ id, t: cards.current.pop()!, pick: null });
        },
        onRaceDone: (t, best) => {
          setLap({ t, best });
          window.setTimeout(() => setLap(null), 4500);
        },
      });
    } catch {
      setFail("Your browser couldn't start 3D graphics (WebGL). Try another browser or device.");
      return;
    }
    world.current = w;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      w.dispose();
      world.current = null;
    };
  }, [look, mobile]);

  // Esc leaves the world (unless a bubble is open)
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && !bubble && onExit();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [bubble, onExit]);

  const fullscreen = () => {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  const close = () => {
    if (!bubble) return;
    world.current?.answer(bubble.id, bubble.pick === bubble.t.a);
    setBubble(null);
  };

  const race = hud?.race;
  return (
    <div className={`kw ${mobile ? "touch" : ""}`} ref={wrap}>
      <canvas ref={canvas} className="kw-canvas" aria-label="Knowledge World 3D view" />
      {fail && (
        <div className="kw-fail">
          <p>{fail}</p>
          <button className="btn lime" onClick={onExit}>Back</button>
        </div>
      )}

      <div className="kw-top">
        <button type="button" className="kw-btn" onClick={onExit} aria-label="Leave Knowledge World">
          <Icon.back />
        </button>
        <div className="kw-title">
          <b>{brand}</b>
          <span className="kw-stats">
            <span className="kw-pill"><span className="coin-ic" /> {hud?.coins.toLocaleString() ?? 0}</span>
            <span className="kw-pill kw-orb">? {hud ? `${hud.orbs}/${hud.orbsTotal}` : "0/12"}</span>
          </span>
        </div>
        <button type="button" className="kw-btn kw-fs" onClick={fullscreen} aria-label="Full screen">
          <Icon.full />
        </button>
      </div>

      <div className="kw-map">
        <canvas ref={mini} aria-hidden="true" />
        {hud?.mode === "car" && <span className="kw-speed num">{hud.speed}<small>km/h</small></span>}
      </div>

      {race?.state === "running" && (
        <div className="kw-race" role="timer">
          <span className="num">{race.t.toFixed(1)}s</span>
          <small>CP {race.cp}/{race.cpTotal}{race.best != null ? ` · best ${race.best.toFixed(2)}s` : ""}</small>
        </div>
      )}
      {lap && (
        <div className="kw-lap" role="status">
          <b>{lap.best ? "New best lap!" : "Lap complete"}</b>
          <span className="num">{lap.t.toFixed(2)}s</span>
          <small>+{lap.best ? 100 : 40} coins</small>
        </div>
      )}

      {hud?.hint && !bubble && <div className="kw-hint">{hud.hint}</div>}

      {!mobile && (
        <div className="kw-keys" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> move</span>
          <span><kbd>Space</kbd> {hud?.mode === "car" ? "drift" : "jump"}</span>
          <span><kbd>E</kbd> {hud?.mode === "car" ? "get out" : "drive"}</span>
          <span><kbd>Esc</kbd> leave</span>
        </div>
      )}
      {!mobile && hud?.useLabel && (
        <button type="button" className="kw-use-desk" onClick={() => world.current?.use()}>
          <kbd>E</kbd> {hud.useLabel}
        </button>
      )}

      {mobile && (
        <>
          <Stick onMove={(x, y) => world.current?.setStick(x, y)} />
          <div className="kw-pads">
            {hud?.useLabel && (
              <button type="button" className="kw-pad use" onClick={() => world.current?.use()}>
                {hud.useLabel}
              </button>
            )}
            <button
              type="button"
              className="kw-pad jump"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                world.current?.setJump(true);
              }}
              onPointerUp={() => world.current?.setJump(false)}
              onPointerCancel={() => world.current?.setJump(false)}
            >
              {hud?.mode === "car" ? "Drift" : "Jump"}
            </button>
          </div>
        </>
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
                  <button key={o} type="button" className={`kw-opt ${state}`} disabled={bubble.pick != null} onClick={() => setBubble({ ...bubble, pick: i })} autoFocus={i === 0}>
                    <span>{"ABCD"[i]}</span> {o}
                  </button>
                );
              })}
            </div>
            {bubble.pick != null && (
              <div className={`kw-why ${bubble.pick === bubble.t.a ? "ok" : "no"}`}>
                <b>{bubble.pick === bubble.t.a ? "Correct! +50 coins" : "Not quite · +10 coins for trying"}</b>
                <p>{bubble.t.why}</p>
                <button type="button" className="btn lime block" onClick={close} autoFocus>
                  Keep exploring
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Virtual thumb stick: up/down = forward/back, left/right = turn. */
function Stick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const R = 46;
  const move = (e: RPointerEvent) => {
    if (id.current !== e.pointerId || !base.current) return;
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    onMove(dead(dx / R), dead(-dy / R));
  };
  const end = () => {
    id.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={base}
      className="kw-stick"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Movement stick"
      role="application"
    >
      <span className="kw-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
