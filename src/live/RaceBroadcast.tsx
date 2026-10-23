/* Race mode on the big screen, as a live marathon broadcast.
   Everyone runs along one road: their position is how far through the questions they are. A "director" moves the
   camera between broadcast shots (the whole field, the leader, the chasing pack, the finish line) and cuts to big
   moments (a new leader, a finisher). Broadcast graphics carry the facts: the official standings (most right
   answers, then time), call-outs, and a course strip with one dot per player, so a field of 100+ fits on one
   screen without scrolling. Only the ~150 runners that matter are drawn as characters; everyone is a dot. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LiveBoardRow, LiveHostView } from "../types";
import { Chibi } from "../components/Chibi";
import { artUrl, paintedLook } from "../components/Painted";
import { fmtRaceTime } from "./common";
import { sound } from "./sound";

/* the course in world pixels */
const START_X = 360;
const STEP = 560; // one question
const LANES = 7;
const MAX_DRAWN = 150;
const SHOT_MS = 5200; // how long the director holds a shot
const EVENT_MS = 3800; // how long a big moment holds the camera and the call-out

type Shot = "start" | "wide" | "leader" | "pack" | "finish";
interface Callout { id: number; kind: "lead" | "finish" | "half" | "go"; title: string; text: string; look?: number }

/** a stable 0–1 number per player, so each one keeps their lane and their place in the pack */
const hash = (s: string, k = 0) => {
  let h = 2166136261 ^ k;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 1600, h: 800 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function Runner({ look, mood, size }: { look: number; mood: "happy" | "cheer" | "idle"; size: number }) {
  const src = paintedLook(look) ? artUrl(`chars/c${look | 0}-${mood}`) : undefined;
  if (src) return <img className="rb-art" src={src} alt="" draggable={false} style={{ height: size }} />;
  return <Chibi look={look} variant="full" size={Math.round(size * 0.74)} mood={mood} still />;
}

export function RaceBroadcast({ v, title, brand }: { v: LiveHostView; title: string; brand: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { w: W, h: H } = useSize(stageRef);
  const total = Math.max(1, v.session.total);
  const FINISH_X = START_X + total * STEP;
  const players = v.players; // official order: most right answers, then time
  const started = players.some((p) => (p.done || 0) > 0);
  const finishedN = players.filter((p) => p.finished).length;

  /* who is drawn: everyone in the standings top 12, then the front of the road, up to MAX_DRAWN */
  const drawn = useMemo(() => {
    const top = players.slice(0, 12);
    const rest = players.slice(12).sort((a, b) => (b.done || 0) - (a.done || 0) || (a.ms || 0) - (b.ms || 0));
    return [...top, ...rest].slice(0, MAX_DRAWN);
  }, [players]);
  const rankOf = useMemo(() => new Map(players.map((p, i) => [p.id, i + 1])), [players]);
  const finishOrder = useMemo(() => {
    // finishers line up past the arch in the order of the standings
    const m = new Map<string, number>();
    players.filter((p) => p.finished).forEach((p, i) => m.set(p.id, i));
    return m;
  }, [players]);

  /* road geometry in stage pixels */
  const roadTop = H * 0.5;
  const roadH = H * 0.4;
  const placeOf = (p: LiveBoardRow) => {
    const lane = Math.floor(hash(p.id, 1) * LANES);
    const fo = finishOrder.get(p.id);
    let x: number;
    if (fo != null) x = FINISH_X + 120 + (fo % 10) * 46 + Math.floor(fo / 10) * 14;
    else x = START_X + (p.done || 0) * STEP - hash(p.id, 2) * (started ? 150 : 230); // a pack, not a line
    const y = roadTop + ((lane + 0.5) / LANES) * roadH;
    const scale = 0.66 + (lane / (LANES - 1)) * 0.42; // nearer lanes are bigger
    return { x, y, scale, lane };
  };

  /* who just moved (runs with a bob) */
  const prevDone = useRef(new Map<string, number>());
  const movingUntil = useRef(new Map<string, number>());
  const now = Date.now();
  for (const p of players) {
    const was = prevDone.current.get(p.id);
    if (was != null && (p.done || 0) > was) movingUntil.current.set(p.id, now + 1300);
    prevDone.current.set(p.id, p.done || 0);
  }
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 650);
    return () => clearInterval(t);
  }, []);

  /* big moments: a new leader, someone finishing, the leader at halfway */
  const [callout, setCallout] = useState<Callout | null>(null);
  const [eventShot, setEventShot] = useState<{ shot: Shot; until: number; focus?: string } | null>(null);
  const seen = useRef<{ leader?: string; finished: Set<string>; half: boolean; init: boolean }>({ finished: new Set(), half: false, init: false });
  useEffect(() => {
    const s = seen.current;
    const leader = players[0];
    const fresh = players.filter((p) => p.finished && !s.finished.has(p.id));
    fresh.forEach((p) => s.finished.add(p.id));
    if (!s.init) {
      // the first view of a race already in progress: no call-outs for what happened before
      s.init = true;
      s.leader = started ? leader?.id : undefined;
      s.half = players.some((p) => (p.done || 0) >= total / 2);
      return;
    }
    const at = Date.now();
    let c: Callout | null = null;
    if (fresh.length) {
      const p = fresh[0];
      const first = s.finished.size === fresh.length && finishOrder.get(p.id) === 0;
      c = { id: at, kind: "finish", look: p.look, title: first ? "First across the line!" : "Finished", text: `${p.nick} · ${p.correct || 0}/${total} right · ${fmtRaceTime(p.ms || 0)}${fresh.length > 1 ? ` · +${fresh.length - 1} more` : ""}` };
      setEventShot({ shot: "finish", until: at + EVENT_MS });
      sound.pop();
    } else if (started && leader && leader.id !== s.leader && (leader.done || 0) > 0) {
      c = { id: at, kind: "lead", look: leader.look, title: s.leader ? "New leader" : "Out in front", text: `${leader.nick} · ${leader.correct || 0} right` };
      setEventShot({ shot: "leader", until: at + EVENT_MS, focus: leader.id });
      sound.whoosh();
    } else if (!s.half && players.some((p) => (p.done || 0) >= total / 2)) {
      s.half = true;
      const front = [...players].sort((a, b) => (b.done || 0) - (a.done || 0))[0];
      c = { id: at, kind: "half", look: front?.look, title: "Halfway", text: `${front?.nick} reaches question ${Math.ceil(total / 2)}` };
    }
    if (started && leader) s.leader = leader.id;
    if (c) setCallout(c);
  }, [players, started, total, finishOrder]);
  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout((x) => (x?.id === callout.id ? null : x)), EVENT_MS);
    return () => clearTimeout(t);
  }, [callout]);

  /* the countdown when the race opens with nobody moving yet */
  const [count, setCount] = useState<number | null>(started ? null : 3);
  useEffect(() => {
    if (started) return setCount(null);
    const ts = [setTimeout(() => setCount(2), 900), setTimeout(() => setCount(1), 1800), setTimeout(() => setCount(0), 2700), setTimeout(() => setCount(null), 3600)];
    return () => ts.forEach(clearTimeout);
  }, [started]);
  useEffect(() => {
    if (count == null) return;
    if (count > 0) sound.tick(false);
    else sound.go();
  }, [count]);

  /* the director: cycles broadcast shots, big moments take over for a while */
  const [shotIdx, setShotIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setShotIdx((i) => i + 1), SHOT_MS);
    return () => clearInterval(t);
  }, []);
  const CYCLE: Shot[] = ["wide", "leader", "pack", "wide", "leader"];
  const ev = eventShot && eventShot.until > now ? eventShot : null;
  const shot: Shot = !started ? "start" : ev ? ev.shot : finishedN === players.length && players.length ? "finish" : CYCLE[shotIdx % CYCLE.length];

  const places = drawn.map((p) => ({ p, ...placeOf(p) }));
  const xs = places.map((q) => q.x);
  const minX = xs.length ? Math.min(...xs) : START_X;
  const maxX = xs.length ? Math.max(...xs) : START_X;
  const frontRunner = [...places].sort((a, b) => b.x - a.x)[0];
  const focusRunner = ev?.focus ? places.find((q) => q.p.id === ev.focus) : frontRunner;
  const median = [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? START_X;
  const cam = (() => {
    switch (shot) {
      case "start":
        return { x: START_X - 60, z: Math.min(1.25, W / 1100) };
      case "leader":
        return { x: (focusRunner?.x ?? START_X) - 80, z: Math.min(1.35, W / 1050) };
      case "pack":
        return { x: median, z: Math.min(1.25, W / 1150) };
      case "finish":
        return { x: FINISH_X + 160, z: Math.min(1.3, W / 1150) };
      default: {
        const span = Math.max(600, maxX - minX + 420);
        return { x: (minX + maxX) / 2, z: Math.max(0.32, Math.min(1.1, (W * 0.9) / span)) };
      }
    }
  })();
  const horizon = roadTop + roadH * 0.5; // zoom around the middle of the road
  const worldT = `translate(${W / 2 - cam.x * cam.z}px, ${horizon - horizon * cam.z}px) scale(${cam.z})`;
  const parallax = -(cam.x * cam.z) * 0.18;

  /* course markers and billboards */
  const markers = Array.from({ length: total + 1 }, (_, i) => i);
  const boards = Array.from({ length: Math.ceil((FINISH_X + 900) / 1100) }, (_, i) => i);
  const leaderRow = players[0];
  const shotLabel: Record<Shot, string> = { start: "Start line", wide: "Whole field", leader: "Leader cam", pack: "Chasing pack", finish: "Finish line" };

  return (
    <div className="rb" ref={stageRef}>
      {/* sky and stands, drifting slower than the road */}
      <div className="rb-sky" />
      <div className="rb-stands" style={{ backgroundPosition: `${parallax}px 0, ${parallax * 1.4}px 0` }} />

      <div className="rb-world" style={{ transform: worldT }}>
        <div className="rb-road" style={{ top: roadTop, height: roadH, left: -2000, width: FINISH_X + 4000 }}>
          {Array.from({ length: LANES - 1 }, (_, i) => (
            <i key={i} className="rb-lane" style={{ top: `${((i + 1) / LANES) * 100}%` }} />
          ))}
        </div>
        {boards.map((i) => (
          <div key={i} className="rb-board" style={{ left: i * 1100 - 200, top: roadTop - 178 }}>
            <span>{brand}</span>
          </div>
        ))}
        {markers.map((i) => (
          <div key={i} className={`rb-mark ${i === 0 ? "start" : ""}`} style={{ left: START_X + i * STEP, top: roadTop - 50, height: roadH + 50 }}>
            <b>{i === 0 ? "START" : `Q${i}`}</b>
          </div>
        ))}
        <div className="rb-arch" style={{ left: FINISH_X, top: roadTop - 230, height: roadH + 230 }}>
          <span>FINISH</span>
        </div>
        {places.map(({ p, x, y, scale, lane }) => {
          const rank = rankOf.get(p.id) || 0;
          const moving = (movingUntil.current.get(p.id) || 0) > now;
          const named = rank <= 5 || p.id === focusRunner?.p.id;
          return (
            <div
              key={p.id}
              className={`rb-runner ${moving ? "run" : ""} ${p.finished ? "done" : ""} ${rank === 1 ? "lead" : ""}`}
              style={{ transform: `translate(${x}px, ${y}px) scale(${scale})`, zIndex: 10 + lane * 10 + (named ? 5 : 0), "--d": `${hash(p.id, 3) * -0.6}s` } as CSSProperties}
            >
              <span className="rb-body">
                <Runner look={p.look} mood={p.finished ? "cheer" : moving ? "happy" : "idle"} size={150} />
              </span>
              <i className="rb-shadow" />
              {named && (
                <span className="rb-tag">
                  {rank <= 3 && <em className={`m${rank}`}>{rank}</em>}
                  {p.nick}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* broadcast graphics */}
      <div className="rb-live">
        <span className="rb-dot" /> LIVE
        <b>{title}</b>
        <span className="rb-shot">{shotLabel[shot]}</span>
      </div>

      <aside className="rb-stand" aria-label="Standings">
        <h3>Standings</h3>
        <ol>
          {players.slice(0, 6).map((p, i) => (
            <li key={p.id} className={i === 0 ? "first" : ""}>
              <span className="rk num">{i + 1}</span>
              <span className="who">{p.nick}</span>
              <span className="num">{p.correct || 0}/{total}</span>
              <span className="num tm">{p.finished ? fmtRaceTime(p.ms || 0) : `Q${Math.min(total, (p.done || 0) + 1)}`}</span>
            </li>
          ))}
        </ol>
        {players.length > 6 && <p>+ {players.length - 6} more racing</p>}
      </aside>

      {callout && (
        <div key={callout.id} className={`rb-call k-${callout.kind}`}>
          {callout.look != null && (
            <span className="rb-call-face">
              <Chibi look={callout.look} size={64} mood="cheer" still />
            </span>
          )}
          <span>
            <b>{callout.title}</b>
            <em>{callout.text}</em>
          </span>
        </div>
      )}

      <div className="rb-strip" aria-label="Where everyone is on the course">
        <span className="rb-strip-l">START</span>
        <div className="rb-track">
          {Array.from({ length: total - 1 }, (_, i) => (
            <i key={i} className="rb-tick" style={{ left: `${((i + 1) / total) * 100}%` }} />
          ))}
          {players.map((p) => (
            <i
              key={p.id}
              className={`rb-pip ${p.id === leaderRow?.id ? "lead" : ""} ${p.finished ? "done" : ""}`}
              style={{ left: `${(p.finished ? 1 : (p.done || 0) / total) * 100}%`, top: `${20 + hash(p.id, 4) * 60}%` }}
            />
          ))}
        </div>
        <span className="rb-strip-r">FINISH</span>
        <span className="rb-count num">
          <b>{finishedN}</b>/{players.length} finished
        </span>
      </div>

      {count != null && (
        <div key={count} className={`rb-count-big ${count === 0 ? "go" : ""}`}>
          {count === 0 ? "GO!" : count}
        </div>
      )}
      {!started && count == null && (
        <div className="rb-ready">
          <b>{players.length}</b> runners on the line · answer on your phone to run
        </div>
      )}
    </div>
  );
}
