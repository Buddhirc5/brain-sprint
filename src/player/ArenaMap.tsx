/* Arena Map: the player's journey through the company's quizzes (see lib/arenaMap.ts for how it's built).
   Background, road and scenery are one SVG; stops, castles, chests and characters are HTML on top. */
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Icon } from "../components/ui";
import { buildMap, type CastleState, type Deco, type Land, type MapItem, type Theme } from "../lib/arenaMap";
import { fmtDate, todayKey } from "../lib/util";
import { Avatar, certInfo, CoinPill, TopBar } from "./common";
import "../styles/map.css";

const ROW: Record<MapItem["kind"], number> = { gate: 112, stop: 116, castle: 138, chest: 112 };
const TOP = 190; // fog of the lands still to come
const BOTTOM = 92; // start flag

interface Placed { item: MapItem; land: Land; x: number; y: number; k: number }

export function ArenaMap() {
  const { d, me, players, go, toast } = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setW(el.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const map = useMemo(() => {
    if (!me) return null;
    const castle = (g: (typeof d.games)[string]): CastleState => {
      const c = certInfo(me, g);
      if (c.passed) return "passed";
      if (g.status === "live" && (!g.date || g.date <= todayKey())) return c.left > 0 ? "open" : "out";
      return "locked";
    };
    return buildMap(Object.values(d.games), me, players, d.dq, todayKey(), castle);
  }, [d.games, d.dq, me, players]);

  // lay the items out bottom → top along a winding road
  const layout = useMemo(() => {
    if (!map || !W) return null;
    const amp = Math.min(W * 0.26, 118);
    const items = map.lands.flatMap((land) => land.items.map((item) => ({ item, land })));
    const H = TOP + BOTTOM + items.reduce((s, x) => s + ROW[x.item.kind], 0);
    let y = H - BOTTOM;
    const placed: Placed[] = items.map(({ item, land }, k) => {
      y -= ROW[item.kind] / 2;
      const x = item.kind === "gate" ? W / 2 : W / 2 + amp * Math.sin(k * 0.95 + 0.4);
      const p = { item, land, x, y, k };
      y -= ROW[item.kind] / 2;
      return p;
    });
    // land bands: from the gate's lower edge up to the next land's gate
    const bands = map.lands.map((land) => {
      const own = placed.filter((p) => p.land === land);
      const bottom = own[0].y + ROW.gate / 2;
      const last = own[own.length - 1];
      return { land, bottom, top: last.y - ROW[last.item.kind] / 2 };
    });
    bands[bands.length - 1].top = 0;
    return { H, placed, bands };
  }, [map, W]);

  // open the map on the player's spot
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!layout || scrolled.current) return;
    scrolled.current = true;
    const el = wrap.current?.querySelector<HTMLElement>(".am-node.cur") || wrap.current?.querySelector<HTMLElement>(".am-start");
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - innerHeight * 0.55) });
  }, [layout]);

  if (!me || !map) return null;
  const curLand = map.lands.find((l) => l.stops.some((s) => s.g.id === map.current)) || map.lands[0];
  const findMe = () => {
    const el = wrap.current?.querySelector<HTMLElement>(".am-node.cur");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div className="phone am-page">
      <TopBar title="Arena Map" back={() => go({ v: "lobby" })} right={<CoinPill />} />
      <section className="am-hud" style={{ ["--ink-l" as string]: curLand.theme.ink, ["--sky" as string]: curLand.theme.ground }}>
        <div className="am-hud-l">
          <span className="am-hud-k">Land {curLand.idx + 1} of {map.lands.length}</span>
          <b className="am-hud-n">{curLand.name}</b>
          <div className="am-hud-bar" role="progressbar" aria-label="Quizzes finished" aria-valuenow={map.done} aria-valuemin={0} aria-valuemax={map.total}>
            <span style={{ width: `${map.total ? (map.done / map.total) * 100 : 0}%` }} />
          </div>
          <span className="am-hud-s num">{map.done} of {map.total} stops · <Star on /> {map.stars}/{map.total * 3}</span>
        </div>
        <button type="button" className="am-me" onClick={findMe} aria-label="Find my spot on the map">
          <Avatar p={me} size={46} />
          <span>Find me</span>
        </button>
      </section>

      <div className="am" ref={wrap} style={{ height: layout?.H || 600 }}>
        {layout && (
          <>
            <svg className="am-svg" width={W} height={layout.H} viewBox={`0 0 ${W} ${layout.H}`} aria-hidden="true">
              <defs>
                {layout.bands.map(({ land }) => (
                  <linearGradient key={land.idx} id={`am-g${land.idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={land.theme.sky} />
                    <stop offset="1" stopColor={land.theme.ground} />
                  </linearGradient>
                ))}
                <linearGradient id="am-fog" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="1" />
                  <stop offset=".75" stopColor="#fff" stopOpacity=".55" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {layout.bands.map(({ land, top, bottom }) => (
                <g key={land.idx}>
                  <rect x="0" y={top} width={W} height={bottom - top + 2} fill={`url(#am-g${land.idx})`} />
                  <Hills W={W} y={bottom} t={land.theme} />
                </g>
              ))}
              {layout.placed.map((p) => (p.item.kind === "gate" ? null : <Scenery key={p.k} p={p} W={W} />))}
              <Road pts={[{ x: W / 2, y: layout.H }, ...layout.placed, { x: W / 2, y: 0 }]} upTo={layout.placed.findIndex((p) => p.item.kind === "stop" && p.item.g.id === map.current) + 1} />
              <rect x="0" y="0" width={W} height={TOP + 40} fill="url(#am-fog)" />
              <Cloud x={W * 0.2} y={58} s={1.1} />
              <Cloud x={W * 0.78} y={96} s={0.9} />
              <Cloud x={W * 0.52} y={150} s={0.7} />
            </svg>

            <p className="am-fogtext" style={{ top: 34 }}>
              <b>More lands ahead</b>
              New stops appear as new quizzes go live.
            </p>

            {layout.placed.map((p) => (
              <Item key={p.k} p={p} W={W} current={map.current} mates={map.mates} me={me} go={go} toast={toast} />
            ))}

            <div className="am-start" style={{ top: layout.H - BOTTOM / 2 - 6 }}>
              <span>START</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- items ---------------- */
function Item({ p, W, current, mates, me, go, toast }: { p: Placed; W: number; current: string | null; mates: Record<string, import("../types").Player[]>; me: import("../types").Player; go: ReturnType<typeof useApp>["go"]; toast: (m: string) => void }) {
  const { item, x, y, land } = p;
  const pos = { left: x, top: y };
  const inward = x > W / 2 ? "l" : "r";

  if (item.kind === "gate") {
    return (
      <div className="am-gate" style={{ ...pos, ["--ink-l" as string]: land.theme.ink, ["--rib" as string]: land.theme.hill2 }}>
        <span className="am-gate-k">Land {land.idx + 1}</span>
        <b>{land.name}</b>
        <span className="am-gate-s num">
          <Star on /> {land.stars}/{land.stops.length * 3} · {land.done}/{land.stops.length} done
        </span>
      </div>
    );
  }

  if (item.kind === "chest") {
    return (
      <button
        type="button"
        className={`am-chest ${item.open ? "open" : ""}`}
        style={pos}
        onClick={() => toast(item.open ? `${land.name} complete! ${land.stars} stars collected.` : `Finish every stop in ${land.name} to open this chest.`)}
        aria-label={item.open ? `${land.name} chest, opened` : `${land.name} chest, locked`}
      >
        <ChestArt open={item.open} />
        <span className="am-tag">{item.open ? "Land cleared!" : item.full ? "Finish the land" : "More stops soon"}</span>
      </button>
    );
  }

  if (item.kind === "castle") {
    const label: Record<CastleState, string> = { passed: "Certified ✓", open: "Exam open", out: "No tries left", locked: "Exam" };
    return (
      <button type="button" className={`am-castle c-${item.state}`} style={pos} onClick={() => go({ v: "certs" })} aria-label={`${item.g.title}: ${label[item.state]}`}>
        <CastleArt state={item.state} />
        <span className="am-tag">{label[item.state]}</span>
        <span className="am-castle-t">{item.g.title}</span>
      </button>
    );
  }

  // a quiz stop
  const cur = item.g.id === current;
  const here = mates[item.g.id] || [];
  const click = () => {
    if (item.state === "done") go({ v: "results", gid: item.g.id });
    else if (item.state === "play") go({ v: "play", gid: item.g.id });
    else if (item.state === "locked") toast(`Opens ${item.g.date ? fmtDate(item.g.date) : "soon"}`);
    else toast(`“${item.g.title}” has closed — keep going on the next stop!`);
  };
  const what = { done: `finished, ${item.stars} stars`, play: "ready to play", missed: "missed", locked: "locked" }[item.state];
  return (
    <>
      <button type="button" className={`am-node s-${item.state} ${cur ? "cur" : ""}`} style={pos} onClick={click} aria-label={`Stop ${item.n}: ${item.g.title}, ${what}`}>
        <span className="am-disc">
          {item.state === "locked" ? <Icon.lock /> : <b className="num">{item.n}</b>}
        </span>
        {item.state === "done" && (
          <span className="am-stars" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <Star key={i} on={i <= item.stars} />
            ))}
          </span>
        )}
        {item.state === "play" && <span className="am-tag go">{cur ? "PLAY" : "Play"}</span>}
        {item.state === "missed" && <span className="am-tag">Missed</span>}
        {item.state === "locked" && item.g.date && <span className="am-tag">{fmtDate(item.g.date)}</span>}
      </button>
      {cur && (
        <div className={`am-hero ${inward}`} style={{ left: Math.min(W - 34, Math.max(34, x + (inward === "r" ? 66 : -66))), top: y + 34 }} aria-hidden="true">
          <Chibi look={me.look} equipped={me.equipped} variant="full" size={62} mood={item.state === "play" ? "happy" : "idle"} />
          <span className="am-you">You</span>
          {here.length > 0 && <span className="am-here num">+{here.length} here</span>}
        </div>
      )}
      {!cur && here.length > 0 && (
        <div className={`am-mates ${inward}`} style={pos} title={here.map((m) => m.name).join(", ")}>
          {here.slice(0, 3).map((m) => (
            <span key={m.uid} className="am-mate">
              <Avatar p={m} size={30} />
            </span>
          ))}
          {here.length > 3 && <span className="am-more num">+{here.length - 3}</span>}
        </div>
      )}
    </>
  );
}

/* ---------------- art ---------------- */
function Star({ on }: { on?: boolean }) {
  return (
    <svg className={`am-star ${on ? "on" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" />
    </svg>
  );
}

function Road({ pts, upTo }: { pts: { x: number; y: number }[]; upTo: number }) {
  const d = (ps: { x: number; y: number }[]) =>
    ps.reduce((s, p, i) => {
      if (!i) return `M${p.x} ${p.y}`;
      const a = ps[i - 1], my = (a.y + p.y) / 2;
      return `${s} C${a.x} ${my} ${p.x} ${my} ${p.x} ${p.y}`;
    }, "");
  const all = d(pts);
  const trail = upTo > 0 ? d(pts.slice(0, upTo + 1)) : "";
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={all} stroke="rgba(0,0,0,.10)" strokeWidth="40" transform="translate(0 5)" />
      <path d={all} stroke="#E9D3A1" strokeWidth="38" />
      <path d={all} stroke="#FFF6DD" strokeWidth="30" />
      <path d={all} stroke="#EBD9AE" strokeWidth="4" strokeDasharray="2 16" />
      {trail && <path d={trail} stroke="#FF5A1F" strokeWidth="7" strokeDasharray="0.1 15" />}
    </g>
  );
}

function Hills({ W, y, t }: { W: number; y: number; t: Theme }) {
  return (
    <g>
      <path d={`M0 ${y} L0 ${y - 34} Q${W * 0.22} ${y - 78} ${W * 0.45} ${y - 40} T${W} ${y - 52} L${W} ${y} Z`} fill={t.hill} opacity=".75" />
      <path d={`M0 ${y} L0 ${y - 18} Q${W * 0.3} ${y - 44} ${W * 0.62} ${y - 20} T${W} ${y - 26} L${W} ${y} Z`} fill={t.hill2} opacity=".8" />
    </g>
  );
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity=".95">
      <ellipse cx="0" cy="0" rx="34" ry="16" />
      <circle cx="-14" cy="-10" r="15" />
      <circle cx="10" cy="-14" r="19" />
    </g>
  );
}

/** One or two bits of scenery on the side of the road away from this stop. */
function Scenery({ p, W }: { p: Placed; W: number }) {
  const t = p.land.theme;
  const left = p.x > W / 2;
  const sx = left ? W * (0.1 + ((p.k * 37) % 9) / 100) : W * (0.88 - ((p.k * 53) % 9) / 100);
  const kind = t.deco[p.k % t.deco.length];
  const out: ReactElement[] = [<DecoArt key="a" kind={kind} x={sx} y={p.y + 18} t={t} s={1} />];
  if (p.k % 2 === 0) out.push(<DecoArt key="b" kind={t.deco[(p.k + 1) % t.deco.length]} x={left ? sx + 34 : sx - 34} y={p.y + 40} t={t} s={0.7} />);
  return <g>{out}</g>;
}

function DecoArt({ kind, x, y, t, s }: { kind: Deco; x: number; y: number; t: Theme; s: number }) {
  const g = (c: ReactElement) => <g transform={`translate(${x} ${y}) scale(${s})`}>{c}</g>;
  const shade = "rgba(0,0,0,.10)";
  switch (kind) {
    case "tree":
      return g(<><ellipse cx="0" cy="2" rx="16" ry="5" fill={shade} /><rect x="-3" y="-14" width="6" height="16" rx="2" fill="#8A5A2B" /><circle cx="0" cy="-26" r="17" fill="#5DBB3A" /><circle cx="-7" cy="-31" r="7" fill="#7FD957" /></>);
    case "pine":
      return g(<><ellipse cx="0" cy="2" rx="15" ry="5" fill={shade} /><rect x="-3" y="-10" width="6" height="12" fill="#7A5230" /><path d="M0 -50 L16 -10 L-16 -10 Z" fill="#2F7D5B" /><path d="M0 -50 L9 -30 L-9 -30 Z" fill="#fff" /></>);
    case "flower":
      return g(<><path d="M0 0 V-16" stroke="#4F9E2E" strokeWidth="3" /><circle cx="0" cy="-20" r="7" fill="#FF7EB6" /><circle cx="0" cy="-20" r="3" fill="#FFD84D" /><path d="M14 0 V-10" stroke="#4F9E2E" strokeWidth="3" /><circle cx="14" cy="-13" r="5" fill="#fff" /><circle cx="14" cy="-13" r="2" fill="#FFD84D" /></>);
    case "palm":
      return g(<><ellipse cx="0" cy="2" rx="16" ry="5" fill={shade} /><path d="M0 0 Q-4 -22 4 -42" stroke="#9A6B3C" strokeWidth="6" fill="none" strokeLinecap="round" /><path d="M4 -42 Q-14 -50 -26 -36 Q-12 -44 4 -42 Q22 -52 30 -34 Q18 -44 4 -42 Q2 -58 -10 -62 Q8 -56 4 -42" fill="#2FA36B" /></>);
    case "wave":
      return g(<path d="M-22 -6 q6 -8 12 0 t12 0 t12 0 t12 0" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".9" />);
    case "cactus":
      return g(<><ellipse cx="0" cy="2" rx="14" ry="4" fill={shade} /><rect x="-6" y="-38" width="12" height="40" rx="6" fill="#3E9A57" /><path d="M-6 -18 h-6 a5 5 0 0 1 -5 -5 v-8" stroke="#3E9A57" strokeWidth="8" fill="none" strokeLinecap="round" /><path d="M6 -24 h6 a5 5 0 0 0 5 -5 v-6" stroke="#3E9A57" strokeWidth="8" fill="none" strokeLinecap="round" /></>);
    case "rock":
      return g(<><ellipse cx="0" cy="2" rx="18" ry="5" fill={shade} /><path d="M-18 2 L-12 -14 L2 -20 L16 -10 L18 2 Z" fill={t.hill2} /><path d="M-12 -14 L2 -20 L4 -8 Z" fill="#fff" opacity=".35" /></>);
    case "crystal":
      return g(<><ellipse cx="0" cy="2" rx="14" ry="4" fill={shade} /><path d="M-8 2 L-12 -18 L-4 -34 L4 -18 Z" fill="#9B7BFF" /><path d="M2 2 L4 -26 L12 -40 L18 -24 L12 2 Z" fill="#C4B2FF" /><path d="M4 -26 L12 -40 L10 -22 Z" fill="#fff" opacity=".6" /></>);
    case "snow":
      return g(<g stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M0 -26 v20 M-9 -21 l18 10 M9 -21 l-18 10" /></g>);
    case "smoke":
      return g(<g fill="#fff" opacity=".7"><circle cx="0" cy="-10" r="8" /><circle cx="8" cy="-22" r="10" /><circle cx="-2" cy="-36" r="12" /></g>);
  }
}

function ChestArt({ open }: { open: boolean }) {
  return (
    <svg className="am-chest-art" viewBox="0 0 80 72" aria-hidden="true">
      {open && <circle cx="40" cy="34" r="34" fill="#FFD84D" opacity=".45" className="am-glow" />}
      <ellipse cx="40" cy="66" rx="28" ry="5" fill="rgba(0,0,0,.15)" />
      <rect x="12" y="32" width="56" height="32" rx="6" fill={open ? "#B86B2A" : "#9C6A43"} stroke="#5C3714" strokeWidth="3" />
      <rect x="12" y="40" width="56" height="6" fill="#E0A400" stroke="#5C3714" strokeWidth="2" />
      {open ? (
        <>
          <path d="M14 32 L18 10 L62 10 L66 32 Z" fill="#C97B36" stroke="#5C3714" strokeWidth="3" />
          <circle cx="30" cy="30" r="6" fill="#FFD84D" stroke="#C99A12" strokeWidth="2" />
          <circle cx="42" cy="27" r="6" fill="#FFD84D" stroke="#C99A12" strokeWidth="2" />
          <circle cx="52" cy="31" r="5" fill="#FFD84D" stroke="#C99A12" strokeWidth="2" />
        </>
      ) : (
        <path d="M12 34 Q12 16 40 16 Q68 16 68 34 Z" fill="#B07A4E" stroke="#5C3714" strokeWidth="3" />
      )}
      <rect x="35" y="38" width="10" height="12" rx="2" fill="#FFD84D" stroke="#5C3714" strokeWidth="2" />
    </svg>
  );
}

function CastleArt({ state }: { state: CastleState }) {
  const wall = state === "passed" ? "#FFE9A8" : state === "open" ? "#DCE7FF" : "#E3E1DA";
  const roof = state === "passed" ? "#FF5A1F" : state === "open" ? "#3D7BFF" : "#A9A69C";
  const line = "#2A2925";
  return (
    <svg className="am-castle-art" viewBox="0 0 100 96" aria-hidden="true">
      {state === "open" && <circle cx="50" cy="52" r="46" fill="#fff" opacity=".55" className="am-glow" />}
      <ellipse cx="50" cy="90" rx="40" ry="6" fill="rgba(0,0,0,.15)" />
      <rect x="18" y="40" width="64" height="48" fill={wall} stroke={line} strokeWidth="3" />
      <path d="M18 40 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h0" fill={wall} stroke={line} strokeWidth="3" strokeLinejoin="round" />
      <rect x="8" y="30" width="18" height="58" fill={wall} stroke={line} strokeWidth="3" />
      <rect x="74" y="30" width="18" height="58" fill={wall} stroke={line} strokeWidth="3" />
      <path d="M5 31 L17 12 L29 31 Z" fill={roof} stroke={line} strokeWidth="3" strokeLinejoin="round" />
      <path d="M71 31 L83 12 L95 31 Z" fill={roof} stroke={line} strokeWidth="3" strokeLinejoin="round" />
      <path d="M40 88 v-16 a10 10 0 0 1 20 0 v16 Z" fill={line} />
      <path d="M50 32 V6" stroke={line} strokeWidth="3" />
      <path d={state === "passed" ? "M50 6 L70 11 L50 17 Z" : "M50 6 L66 10 L50 14 Z"} fill={state === "passed" ? "#FFD84D" : roof} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      {state === "passed" && (
        <g transform="translate(76 64)">
          <circle r="13" fill="#2E9E4F" stroke="#fff" strokeWidth="3" />
          <path d="M-6 0 l4 4 l8 -8" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {(state === "locked" || state === "out") && (
        <g transform="translate(50 58)">
          <rect x="-9" y="-3" width="18" height="14" rx="3" fill={line} />
          <path d="M-5 -3 v-4 a5 5 0 0 1 10 0 v4" stroke={line} strokeWidth="3" fill="none" />
        </g>
      )}
    </svg>
  );
}
