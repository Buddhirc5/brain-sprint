/* Arena Map: the player's journey through the company's quizzes (see lib/arenaMap.ts for how it's built).
   Drawn as 3D isometric floating islands: one island per land, a stone path that zigzags up across
   them and wooden bridges between. The world is one SVG; stops, tags and characters are HTML on top. */
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Icon } from "../components/ui";
import { buildMap, type CastleState, type Deco, type Land, type MapCastle, type MapChest, type MapStop, type Theme } from "../lib/arenaMap";
import { fmtDate, todayKey } from "../lib/util";
import type { Player } from "../types";
import { Avatar, certInfo, CoinPill, TopBar } from "./common";
import "../styles/map.css";

const XB = 5; // the path stays within |u − v| ≤ XB, turning at the edges
const XI = 3; // stops sit only where |u − v| ≤ XI, away from the turns
const GAP = 7; // path tiles between stops, at least
const BRIDGE = 8;
const TOP = 210; // clouds over the lands still to come
const BOTTOM = 80;

type Spot = MapStop | MapCastle | MapChest;
interface Tile { u: number; v: number; kind: "ground" | "path" | "bridge"; land: number; spot?: Spot; prop?: Deco }
interface World {
  tiles: Tile[];
  spots: { spot: Spot; land: Land; u: number; v: number }[];
  banners: { land: Land; u: number; v: number }[];
  start: { u: number; v: number };
  steps: number;
}

/** Small stable hash so scenery stays put between visits. */
const hash = (u: number, v: number, s = 0) => {
  let h = (u * 374761393 + v * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const key = (u: number, v: number) => `${u},${v}`;

function buildWorld(lands: Land[]): World {
  let u = 0, v = 0, dir = -1, step = 0;
  const path: { u: number; v: number; step: number; seg: "start" | "bridge" | "land" | "tail"; land: number }[] = [{ u, v, step, seg: "start", land: -1 }];
  const go = (seg: (typeof path)[number]["seg"], land: number) => {
    const xi = u - v;
    if (dir < 0 && xi - 1 < -XB) dir = 1;
    else if (dir > 0 && xi + 1 > XB) dir = -1;
    if (dir < 0) u -= 1;
    else v -= 1;
    step += 1;
    const t = { u, v, step, seg, land };
    path.push(t);
    return t;
  };
  go("start", -1);
  const spots: World["spots"] = [];
  const banners: World["banners"] = [];
  const range: [number, number][] = [];
  lands.forEach((land, li) => {
    for (let i = 0; i < BRIDGE; i++) {
      const t = go("bridge", li);
      if (i === Math.floor(BRIDGE / 2)) banners.push({ land, u: t.u, v: t.v });
    }
    const from = step + 1;
    let since = -2;
    for (const item of land.items) {
      if (item.kind === "gate") continue;
      for (;;) {
        const t = go("land", li);
        since += 1;
        // where the path doubles back, the next stop must sit well above or well to the side of the last one
        const prev = spots[spots.length - 1];
        const apart = !prev || -(t.u + t.v) + (prev.u + prev.v) >= 9 || Math.abs(t.u - t.v - (prev.u - prev.v)) >= 4;
        if (since >= GAP && Math.abs(t.u - t.v) <= XI && apart) {
          spots.push({ spot: item, land, u: t.u, v: t.v });
          since = 0;
          break;
        }
      }
    }
    go("land", li);
    go("land", li);
    range.push([from, step]);
  });
  for (let i = 0; i < 7; i++) go("tail", lands.length);

  const tiles = new Map<string, Tile>();
  const add = (t: Tile) => {
    const k = key(t.u, t.v);
    if (!tiles.has(k) || t.kind !== "ground") tiles.set(k, t);
  };
  // islands: the land's path widened by one tile, and by two in places for an uneven coastline
  const grow = (own: (typeof path)[number][], li: number, lo: number, hi: number) => {
    for (const t of own) {
      const r = hash(t.u, t.v, 7) < 0.45 ? 2 : 1;
      for (let du = -r; du <= r; du++)
        for (let dv = -r; dv <= r; dv++) {
          if (Math.abs(du) + Math.abs(dv) > r + 1) continue;
          const a = t.u + du, b = t.v + dv, s = -(a + b);
          if (Math.abs(a - b) > XB + 1 || s < lo || s > hi) continue;
          add({ u: a, v: b, kind: "ground", land: li });
        }
    }
  };
  grow(path.filter((t) => t.seg === "start"), 0, -1, 2);
  lands.forEach((_, li) => grow(path.filter((t) => t.seg === "land" && t.land === li), li, range[li][0] - 1, range[li][1] + 1));
  for (const t of path) add({ u: t.u, v: t.v, kind: t.seg === "bridge" || t.seg === "tail" ? "bridge" : "path", land: Math.max(0, Math.min(lands.length - 1, t.land)) });
  for (const s of spots) tiles.get(key(s.u, s.v))!.spot = s.spot;

  // scenery on open ground, kept clear of stops
  const onPath = new Set(path.map((t) => key(t.u, t.v)));
  const near = (a: number, b: number) =>
    spots.some((s) => Math.abs(s.u - a) <= 2 && Math.abs(s.v - b) <= 2) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([du, dv]) => onPath.has(key(a + du, b + dv)));
  for (const t of tiles.values()) {
    if (t.kind !== "ground" || near(t.u, t.v) || hash(t.u, t.v, 3) > 0.34) continue;
    const deco = lands[t.land]?.theme.deco || ["tree"];
    t.prop = deco[Math.floor(hash(t.u, t.v, 5) * deco.length)];
  }
  return { tiles: [...tiles.values()].sort((a, b) => a.u + a.v - (b.u + b.v) || a.u - b.u), spots, banners, start: { u: 0, v: 0 }, steps: step };
}

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
  const world = useMemo(() => (map ? buildWorld(map.lands) : null), [map]);

  const geo = useMemo(() => {
    if (!world || !W) return null;
    const tw = Math.min(64, W / 7.4);
    const hw = tw / 2, hh = tw / 4, D = tw * 0.46, k = tw / 54;
    const H = TOP + BOTTOM + world.steps * hh;
    const base = H - BOTTOM;
    const at = (u: number, v: number) => ({ x: W / 2 + (u - v) * hw, y: base + (u + v) * hh });
    return { tw, hw, hh, D, k, H, at };
  }, [world, W]);

  // open the map on the player's spot
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!geo || scrolled.current) return;
    scrolled.current = true;
    const el = wrap.current?.querySelector<HTMLElement>(".am-node.cur") || wrap.current?.querySelector<HTMLElement>(".am-start");
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - innerHeight * 0.55) });
  }, [geo]);

  if (!me || !map || !world) return null;
  const curLand = map.lands.find((l) => l.stops.some((s) => s.g.id === map.current)) || map.lands[0];
  const findMe = () => wrap.current?.querySelector<HTMLElement>(".am-node.cur")?.scrollIntoView({ block: "center", behavior: "smooth" });
  const has = new Set(world.tiles.filter((t) => t.kind !== "bridge").map((t) => key(t.u, t.v)));
  const hasAny = new Set(world.tiles.map((t) => key(t.u, t.v)));

  return (
    <div className="phone am-page">
      <TopBar title="Arena Map" back={() => go({ v: "lobby" })} right={<CoinPill />} />
      <section className="am-hud" style={{ ["--ink-l" as string]: curLand.theme.ink, ["--sky" as string]: curLand.theme.soft }}>
        <div className="am-hud-l">
          <span className="am-hud-k">Land {curLand.idx + 1} of {map.lands.length}</span>
          <b className="am-hud-n">{curLand.name}</b>
          <div className="am-hud-bar" role="progressbar" aria-label="Quizzes finished" aria-valuenow={map.done} aria-valuemin={0} aria-valuemax={map.total}>
            <span style={{ width: `${map.total ? (map.done / map.total) * 100 : 0}%` }} />
          </div>
          <span className="am-hud-s num">
            {map.done} of {map.total} stops · <Star on /> {map.stars}/{map.total * 3}
          </span>
        </div>
        <button type="button" className="am-me" onClick={findMe} aria-label="Find my spot on the map">
          <Avatar p={me} size={46} />
          <span>Find me</span>
        </button>
      </section>

      <div className="am" ref={wrap} style={{ height: geo?.H || 600 }}>
        {geo && (
          <>
            <svg className="am-svg" width={W} height={geo.H} viewBox={`0 0 ${W} ${geo.H}`} aria-hidden="true">
              <defs>
                <linearGradient id="am-fog" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="1" />
                  <stop offset=".7" stopColor="#fff" stopOpacity=".7" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* distant clouds in the sky between islands */}
              {Array.from({ length: Math.ceil(geo.H / 260) }, (_, i) => (
                <Cloud key={i} x={hash(i, 1) < 0.5 ? W * (0.05 + hash(i, 2) * 0.15) : W * (0.8 + hash(i, 2) * 0.15)} y={TOP + i * 260 + hash(i, 3) * 120} s={0.6 + hash(i, 4) * 0.5} o={0.55} />
              ))}
              {/* island shadows on the sky */}
              <g fill="#5B8FBF" opacity=".10">
                {world.tiles.map((t) => {
                  if (t.kind === "bridge") return null;
                  const p = geo.at(t.u, t.v);
                  const y = p.y + geo.D + 26;
                  return <path key={key(t.u, t.v)} d={`M${p.x} ${y - geo.hh}L${p.x + geo.hw} ${y}L${p.x} ${y + geo.hh}L${p.x - geo.hw} ${y}Z`} />;
                })}
              </g>
              {world.tiles.map((t) => (
                <TileArt key={key(t.u, t.v)} t={t} geo={geo} theme={map.lands[t.land]?.theme || map.lands[0].theme} open={{ r: !has.has(key(t.u + 1, t.v)), l: !has.has(key(t.u, t.v + 1)), rb: !hasAny.has(key(t.u + 1, t.v)), lb: !hasAny.has(key(t.u, t.v + 1)) }} />
              ))}
              <rect x="0" y="0" width={W} height={TOP + 70} fill="url(#am-fog)" />
              <Cloud x={W * 0.2} y={70} s={1.15} />
              <Cloud x={W * 0.8} y={112} s={0.95} />
              <Cloud x={W * 0.5} y={176} s={0.85} />
              <Cloud x={W * 0.08} y={190} s={0.7} />
              <Cloud x={W * 0.94} y={210} s={0.7} />
            </svg>

            <p className="am-fogtext" style={{ top: 34 }}>
              <b>More lands ahead</b>
              New stops appear as new quizzes go live.
            </p>

            {world.banners.map(({ land, u, v }) => {
              const p = geo.at(u, v);
              return (
                // the sign floats in the sky beside its bridge
                <div key={land.idx} className="am-gate" style={{ left: Math.min(W - 104, Math.max(104, p.x + (p.x > W / 2 ? -1 : 1) * (geo.hw + 104))), top: p.y, ["--ink-l" as string]: land.theme.ink, ["--rib" as string]: land.theme.side }}>
                  <span className="am-gate-k">Land {land.idx + 1}</span>
                  <b>{land.name}</b>
                  <span className="am-gate-s num">
                    <Star on /> {land.stars}/{land.stops.length * 3} · {land.done}/{land.stops.length} done
                  </span>
                </div>
              );
            })}

            {world.spots.map(({ spot, land, u, v }) => {
              const p = geo.at(u, v);
              return <SpotUi key={key(u, v)} spot={spot} land={land} x={p.x} y={p.y} W={W} current={map.current} mates={map.mates} me={me} go={go} toast={toast} />;
            })}

            <div className="am-start" style={{ left: geo.at(0, 0).x, top: geo.at(0, 0).y + 30 }}>
              <span>START</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- HTML on the map ---------------- */
function SpotUi({ spot, land, x, y, W, current, mates, me, go, toast }: { spot: Spot; land: Land; x: number; y: number; W: number; current: string | null; mates: Record<string, Player[]>; me: Player; go: ReturnType<typeof useApp>["go"]; toast: (m: string) => void }) {
  const inward = x > W / 2 ? "l" : "r";

  if (spot.kind === "chest") {
    return (
      <button
        type="button"
        className={`am-chest ${spot.open ? "open" : ""}`}
        style={{ left: x, top: y - 30 }}
        onClick={() => toast(spot.open ? `${land.name} complete! ${land.stars} stars collected.` : `Finish every stop in ${land.name} to open this chest.`)}
        aria-label={spot.open ? `${land.name} chest, opened` : `${land.name} chest, locked`}
      >
        <span className="am-tag">{spot.open ? "Land cleared!" : spot.full ? "Finish the land" : "More stops soon"}</span>
      </button>
    );
  }

  if (spot.kind === "castle") {
    const label: Record<CastleState, string> = { passed: "Certified ✓", open: "Exam open", out: "No tries left", locked: "Exam" };
    return (
      <button type="button" className={`am-castle c-${spot.state}`} style={{ left: x, top: y - 86 }} onClick={() => go({ v: "certs" })} aria-label={`${spot.g.title}: ${label[spot.state]}`}>
        <span className="am-tag">{label[spot.state]}</span>
      </button>
    );
  }

  const cur = spot.g.id === current;
  const here = mates[spot.g.id] || [];
  const click = () => {
    if (spot.state === "done") go({ v: "results", gid: spot.g.id });
    else if (spot.state === "play") go({ v: "play", gid: spot.g.id });
    else if (spot.state === "locked") toast(`Opens ${spot.g.date ? fmtDate(spot.g.date) : "soon"}`);
    else toast(`“${spot.g.title}” has closed — keep going on the next stop!`);
  };
  const what = { done: `finished, ${spot.stars} stars`, play: "ready to play", missed: "missed", locked: "locked" }[spot.state];
  const top = y - (cur ? 40 : 34);
  return (
    <>
      <button type="button" className={`am-node s-${spot.state} ${cur ? "cur" : ""}`} style={{ left: x, top }} onClick={click} aria-label={`Stop ${spot.n}: ${spot.g.title}, ${what}`}>
        <span className="am-disc">{spot.state === "locked" ? <Icon.lock /> : <b className="num">{spot.n}</b>}</span>
        {spot.state === "done" && (
          <span className="am-stars" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <Star key={i} on={i <= spot.stars} />
            ))}
          </span>
        )}
        {spot.state === "play" && <span className="am-tag go">{cur ? "PLAY" : "Play"}</span>}
        {spot.state === "missed" && <span className="am-tag">Missed</span>}
        {spot.state === "locked" && spot.g.date && <span className="am-tag">{fmtDate(spot.g.date)}</span>}
      </button>
      {cur && (
        <div className={`am-hero ${inward}`} style={{ left: Math.min(W - 34, Math.max(34, x + (inward === "r" ? 62 : -62))), top: y + 10 }} aria-hidden="true">
          <Chibi look={me.look} equipped={me.equipped} variant="full" size={58} mood={spot.state === "play" ? "happy" : "idle"} />
          <span className="am-you">You</span>
          {here.length > 0 && <span className="am-here num">+{here.length} here</span>}
        </div>
      )}
      {!cur && here.length > 0 && (
        <div className={`am-mates ${inward}`} style={{ left: x, top }} title={here.map((m) => m.name).join(", ")}>
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

function Star({ on }: { on?: boolean }) {
  return (
    <svg className={`am-star ${on ? "on" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" />
    </svg>
  );
}

/* ---------------- the isometric world ---------------- */
interface Geo { tw: number; hw: number; hh: number; D: number; k: number; at: (u: number, v: number) => { x: number; y: number } }
const pts = (...p: [number, number][]) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

/** A box standing on (x, y): top diamond plus the two faces toward the viewer. */
function IsoBox({ x, y, a, h, top, left, right, stroke }: { x: number; y: number; a: number; h: number; top: string; left: string; right: string; stroke?: string }) {
  const b = a / 2;
  const sp = stroke ? { stroke, strokeWidth: 1, strokeLinejoin: "round" as const } : {};
  return (
    <g {...sp}>
      <polygon points={pts([x - a, y - h], [x, y - h + b], [x, y + b], [x - a, y])} fill={left} />
      <polygon points={pts([x, y - h + b], [x + a, y - h], [x + a, y], [x, y + b])} fill={right} />
      <polygon points={pts([x, y - h - b], [x + a, y - h], [x, y - h + b], [x - a, y - h])} fill={top} />
    </g>
  );
}

function TileArt({ t, geo, theme, open }: { t: Tile; geo: Geo; theme: Theme; open: { r: boolean; l: boolean; rb: boolean; lb: boolean } }) {
  const { x, y } = geo.at(t.u, t.v);
  const { hw, hh, D } = geo;
  const topD = pts([x, y - hh], [x + hw, y], [x, y + hh], [x - hw, y]);
  const face = (side: "l" | "r", depth: number, lip: string, mid: string, low: string) => {
    const sx = side === "r" ? hw : -hw;
    const band = (from: number, to: number, fill: string) => <polygon points={pts([x + sx, y + from], [x, y + hh + from], [x, y + hh + to], [x + sx, y + to])} fill={fill} />;
    return (
      <g key={side}>
        {band(0, Math.min(4, depth), lip)}
        {depth > 4 && band(4, depth * 0.62, mid)}
        {depth > 4 && band(depth * 0.62, depth, low)}
        {side === "r" && <polygon points={pts([x + sx, y], [x, y + hh], [x, y + hh + depth], [x + sx, y + depth])} fill="#000" opacity=".16" />}
      </g>
    );
  };

  if (t.kind === "bridge") {
    const dep = D * 0.28;
    return (
      <g>
        {open.lb && face("l", dep, "#9C6A3C", "#8A5A30", "#7A4E28")}
        {open.rb && face("r", dep, "#9C6A3C", "#8A5A30", "#7A4E28")}
        <polygon points={topD} fill="#C99358" />
        {[-0.5, 0, 0.5].map((f) => (
          <line key={f} x1={x - hw / 2 + (f * hw) / 1} y1={y - hh / 2 + (f * hh) / 1} x2={x + hw / 2 + (f * hw) / 1} y2={y + hh / 2 + (f * hh) / 1} stroke="#8E5E32" strokeWidth="1.4" opacity=".7" />
        ))}
        <polygon points={topD} fill="none" stroke="#8E5E32" strokeWidth="1" opacity=".6" />
      </g>
    );
  }

  const tone = hash(t.u, t.v, 1) < 0.5 ? theme.top : theme.top2;
  return (
    <g>
      {open.l && face("l", D, theme.lip, theme.side, theme.side2)}
      {open.r && face("r", D, theme.lip, theme.side, theme.side2)}
      <polygon points={topD} fill={tone} />
      {t.kind === "path" && (
        <>
          <polygon points={pts([x, y - hh * 0.86], [x + hw * 0.86, y], [x, y + hh * 0.86], [x - hw * 0.86, y])} fill="#E7D2A0" />
          <polygon points={pts([x, y - hh * 0.62], [x + hw * 0.62, y], [x, y + hh * 0.62], [x - hw * 0.62, y])} fill="#F5E7C4" />
        </>
      )}
      {t.spot?.kind === "stop" && <Pedestal x={x} y={y} geo={geo} state={t.spot.state} />}
      {t.spot?.kind === "castle" && <CastleArt x={x} y={y} geo={geo} state={t.spot.state} />}
      {t.spot?.kind === "chest" && <ChestArt x={x} y={y} geo={geo} open={t.spot.open} />}
      {t.prop && <Prop kind={t.prop} x={x + (hash(t.u, t.v, 9) - 0.5) * hw * 0.4} y={y + 2} k={geo.k} />}
    </g>
  );
}

const PED: Record<MapStop["state"], [string, string]> = {
  done: ["#D8F57A", "#8FBF12"],
  play: ["#FFB08C", "#C23C0C"],
  missed: ["#E4E1D9", "#B9B5AA"],
  locked: ["#F2F0EA", "#C9C5BA"],
};
function Pedestal({ x, y, geo, state }: { x: number; y: number; geo: Geo; state: MapStop["state"] }) {
  const rx = geo.hw * 0.78, ry = rx / 2, h = 9 * geo.k, cy = y - 3;
  const [top, side] = PED[state];
  return (
    <g>
      <ellipse cx={x} cy={cy + h + 2} rx={rx + 2} ry={ry + 1} fill="#000" opacity=".12" />
      <path d={`M${x - rx} ${cy} V${cy + h} A${rx} ${ry} 0 0 0 ${x + rx} ${cy + h} V${cy} Z`} fill={side} />
      <ellipse cx={x} cy={cy} rx={rx} ry={ry} fill={top} />
      <ellipse cx={x} cy={cy} rx={rx * 0.72} ry={ry * 0.72} fill="#fff" opacity=".35" />
    </g>
  );
}

function CastleArt({ x, y, geo, state }: { x: number; y: number; geo: Geo; state: CastleState }) {
  const k = geo.k;
  const c = {
    passed: { top: "#FFF3D1", left: "#F3DEA2", right: "#D7BC77", roof: "#FF5A1F", roof2: "#C9441A" },
    open: { top: "#EEF3FF", left: "#D3DFFB", right: "#AFC2EC", roof: "#3D7BFF", roof2: "#2B5FD0" },
    out: { top: "#F1EFEA", left: "#DAD7CE", right: "#BEBAB0", roof: "#A9A69C", roof2: "#8E8B82" },
    locked: { top: "#F1EFEA", left: "#DAD7CE", right: "#BEBAB0", roof: "#A9A69C", roof2: "#8E8B82" },
  }[state];
  const a = 17 * k, h = 26 * k;
  const tower = (tx: number, ty: number) => {
    const ta = 7 * k, th = 40 * k;
    return (
      <g>
        <IsoBox x={tx} y={ty} a={ta} h={th} top={c.top} left={c.left} right={c.right} stroke="#3A372F" />
        <polygon points={pts([tx - ta - 1, ty - th], [tx, ty - th + ta / 2 + 1], [tx, ty - th - 20 * k])} fill={c.roof} stroke="#3A372F" strokeWidth="1" strokeLinejoin="round" />
        <polygon points={pts([tx, ty - th + ta / 2 + 1], [tx + ta + 1, ty - th], [tx, ty - th - 20 * k])} fill={c.roof2} stroke="#3A372F" strokeWidth="1" strokeLinejoin="round" />
      </g>
    );
  };
  return (
    <g>
      <ellipse cx={x} cy={y + 4} rx={a * 1.7} ry={a * 0.8} fill="#000" opacity=".12" />
      {(state === "open" || state === "passed") && <ellipse className="am-glow" cx={x} cy={y} rx={a * 2} ry={a} fill={state === "open" ? "#BFD3FF" : "#FFE27A"} opacity=".55" />}
      {tower(x, y - a * 0.5)}
      <IsoBox x={x} y={y} a={a} h={h} top={c.top} left={c.left} right={c.right} stroke="#3A372F" />
      {/* door on the front-left wall */}
      <path d={`M${x - a * 0.62} ${y - a * 0.19} l0 ${-h * 0.42} q${a * 0.2} ${-a * 0.32} ${a * 0.4} ${-a * 0.02} l0 ${h * 0.42} z`} fill="#3A372F" />
      {tower(x - a, y)}
      {tower(x + a, y)}
      <path d={`M${x} ${y - h - a / 2} v${-22 * k}`} stroke="#3A372F" strokeWidth={1.6 * k} />
      <path d={`M${x} ${y - h - a / 2 - 22 * k} l${13 * k} ${4 * k} l${-13 * k} ${4 * k} z`} fill={state === "passed" ? "#FFD84D" : c.roof} stroke="#3A372F" strokeWidth="1" />
      {state === "passed" && (
        <g transform={`translate(${x + a * 1.25} ${y - h * 0.3})`}>
          <circle r={10 * k} fill="#2E9E4F" stroke="#fff" strokeWidth={2.5 * k} />
          <path d={`M${-4.5 * k} 0 l${3 * k} ${3 * k} l${6 * k} ${-6 * k}`} stroke="#fff" strokeWidth={2.6 * k} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

function ChestArt({ x, y, geo, open }: { x: number; y: number; geo: Geo; open: boolean }) {
  const k = geo.k, a = 12 * k, h = 11 * k;
  return (
    <g className={open ? "am-chest-art open" : "am-chest-art"}>
      <ellipse cx={x} cy={y + 3} rx={a * 1.6} ry={a * 0.75} fill="#000" opacity=".14" />
      {open && <ellipse className="am-glow" cx={x} cy={y - h} rx={a * 2.2} ry={a * 1.4} fill="#FFE27A" opacity=".6" />}
      <IsoBox x={x} y={y} a={a} h={h} top="#B9783F" left="#A5662F" right="#874F22" stroke="#4A2A10" />
      {/* gold band */}
      <polygon points={pts([x - a, y - h * 0.55], [x, y - h * 0.55 + a / 2], [x, y - h * 0.3 + a / 2], [x - a, y - h * 0.3])} fill="#E8B21A" />
      <polygon points={pts([x, y - h * 0.55 + a / 2], [x + a, y - h * 0.55], [x + a, y - h * 0.3], [x, y - h * 0.3 + a / 2])} fill="#C99A12" />
      {open ? (
        <>
          <circle cx={x - 4 * k} cy={y - h - 2 * k} r={4 * k} fill="#FFD84D" stroke="#C99A12" />
          <circle cx={x + 4 * k} cy={y - h - 4 * k} r={4 * k} fill="#FFD84D" stroke="#C99A12" />
          <circle cx={x} cy={y - h + 1 * k} r={4 * k} fill="#FFE680" stroke="#C99A12" />
          {/* lid tipped back */}
          <polygon points={pts([x - a, y - h], [x, y - h - a / 2], [x, y - h - a / 2 - 10 * k], [x - a, y - h - 10 * k])} fill="#C98A4E" stroke="#4A2A10" strokeWidth="1" />
          <polygon points={pts([x, y - h - a / 2], [x + a, y - h], [x + a, y - h - 10 * k], [x, y - h - a / 2 - 10 * k])} fill="#A86C35" stroke="#4A2A10" strokeWidth="1" />
        </>
      ) : (
        <>
          <IsoBox x={x} y={y - h} a={a + 0.5} h={6 * k} top="#C98A4E" left="#B4753C" right="#93592A" stroke="#4A2A10" />
          <rect x={x - 3 * k} y={y - h * 0.7 + a / 2 - 4 * k} width={6 * k} height={7 * k} rx={1.5 * k} fill="#FFD84D" stroke="#4A2A10" strokeWidth=".8" />
        </>
      )}
    </g>
  );
}

function Cloud({ x, y, s = 1, o = 0.95 }: { x: number; y: number; s?: number; o?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={o}>
      <ellipse cx="0" cy="0" rx="38" ry="15" />
      <circle cx="-15" cy="-9" r="15" />
      <circle cx="10" cy="-14" r="20" />
      <circle cx="26" cy="-4" r="11" />
    </g>
  );
}

/** Upright scenery, lit from the upper left. */
function Prop({ kind, x, y, k }: { kind: Deco; x: number; y: number; k: number }) {
  const g = (c: ReactElement) => <g transform={`translate(${x} ${y}) scale(${k})`}>{c}</g>;
  const shadow = <ellipse cx="2" cy="0" rx="13" ry="5" fill="#000" opacity=".16" />;
  switch (kind) {
    case "tree":
      return g(<>{shadow}<rect x="-2.5" y="-14" width="5" height="14" rx="2" fill="#7A5230" /><circle cx="2" cy="-22" r="13" fill="#3F8F2C" /><circle cx="-1" cy="-24" r="12" fill="#5BB43F" /><circle cx="-5" cy="-28" r="5" fill="#8BD86A" /></>);
    case "pine":
    case "snowpine": {
      const snow = kind === "snowpine";
      return g(<>{shadow}<rect x="-2.5" y="-9" width="5" height="9" fill="#6B4528" />
        {[0, 1, 2].map((i) => {
          const ty = -10 - i * 10, w = 13 - i * 3;
          return (
            <g key={i}>
              <polygon points={pts([0, ty - 16], [w, ty], [-w, ty])} fill={snow ? "#5F8FA0" : "#2C7A52"} />
              <polygon points={pts([0, ty - 16], [0, ty], [-w, ty])} fill={snow ? "#7FB0C0" : "#3E9C6B"} />
              {snow && <polygon points={pts([0, ty - 16], [w * 0.45, ty - 9], [-w * 0.45, ty - 9])} fill="#fff" />}
            </g>
          );
        })}</>);
    }
    case "flower":
      return g(<><path d="M-6 0 V-9 M3 0 V-12 M9 0 V-7" stroke="#4F9E2E" strokeWidth="2" /><circle cx="-6" cy="-11" r="3.5" fill="#FF7EB6" /><circle cx="3" cy="-14" r="3.5" fill="#fff" /><circle cx="9" cy="-9" r="3" fill="#FFD84D" /></>);
    case "palm":
      return g(<>{shadow}<path d="M0 0 Q-5 -18 4 -36" stroke="#9A6B3C" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M4 -36 Q-12 -44 -22 -30 Q-10 -38 4 -36 Q20 -46 26 -30 Q16 -38 4 -36 Q2 -52 -9 -55 Q7 -50 4 -36 Q14 -52 22 -50 Q12 -46 4 -36" fill="#2FA36B" /></>);
    case "cactus":
      return g(<>{shadow}<rect x="-5" y="-32" width="10" height="32" rx="5" fill="#3E9A57" /><rect x="0" y="-32" width="5" height="32" rx="2.5" fill="#2E7D44" /><path d="M-5 -14 h-4 a4 4 0 0 1 -4 -4 v-7" stroke="#3E9A57" strokeWidth="6" fill="none" strokeLinecap="round" /><path d="M5 -20 h4 a4 4 0 0 0 4 -4 v-5" stroke="#2E7D44" strokeWidth="6" fill="none" strokeLinecap="round" /></>);
    case "rock":
      return g(<>{shadow}<polygon points={pts([-13, 0], [-10, -11], [0, -16], [11, -9], [13, 0])} fill="#9A958B" /><polygon points={pts([0, -16], [11, -9], [13, 0], [2, 0])} fill="#7D786F" /><polygon points={pts([-10, -11], [0, -16], [2, -9], [-6, -6])} fill="#C6C1B7" /></>);
    case "crystal":
      return g(<>{shadow}<polygon points={pts([-9, 0], [-12, -16], [-5, -28], [1, -15], [-2, 0])} fill="#B5A1FF" /><polygon points={pts([-5, -28], [1, -15], [-2, 0], [-5, 0])} fill="#8C70F0" /><polygon points={pts([0, 0], [3, -22], [10, -36], [16, -20], [11, 0])} fill="#D2C6FF" /><polygon points={pts([10, -36], [16, -20], [11, 0], [8, 0], [8, -20])} fill="#9F86F7" /></>);
    case "lava":
      return g(<><ellipse cx="0" cy="-2" rx="16" ry="7" fill="#FF7A1A" opacity=".35" /><polygon points={pts([-12, 0], [-8, -10], [2, -14], [11, -7], [12, 0])} fill="#4A3633" /><path d="M-6 -6 L0 -10 L6 -5" stroke="#FF8A1F" strokeWidth="2" fill="none" /><circle cx="4" cy="-20" r="4" fill="#fff" opacity=".5" /><circle cx="7" cy="-28" r="5.5" fill="#fff" opacity=".4" /></>);
  }
}
