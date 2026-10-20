/* Arena Map world: lays the map out on an isometric tile grid (u, v). Shared by the 3D scene and the
   flat fallback. The path climbs by one tile per step (u or v decreases), turning at the edges. */
import type { Deco, Land, MapCastle, MapChest, MapStop } from "./arenaMap";

const XB = 5; // the path stays within |u − v| ≤ XB, turning at the edges
const XI = 3; // stops sit only where |u − v| ≤ XI, away from the turns
const GAP = 7; // path tiles between stops, at least
const BRIDGE = 8;

export type Spot = MapStop | MapCastle | MapChest;
export interface Tile { u: number; v: number; kind: "ground" | "path" | "bridge"; land: number; spot?: Spot; prop?: Deco }
export interface World {
  tiles: Tile[];
  spots: { spot: Spot; land: Land; u: number; v: number }[];
  banners: { land: Land; u: number; v: number }[];
  start: { u: number; v: number };
  steps: number;
  /** every path tile from START to the end, in walking order */
  path: { u: number; v: number; seg: "start" | "bridge" | "land" | "tail"; land: number }[];
}

/** Small stable hash so scenery stays put between visits. */
export const hash = (u: number, v: number, s = 0) => {
  let h = (u * 374761393 + v * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const key = (u: number, v: number) => `${u},${v}`;

export function buildWorld(lands: Land[]): World {
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
  return { tiles: [...tiles.values()].sort((a, b) => a.u + a.v - (b.u + b.v) || a.u - b.u), spots, banners, start: { u: 0, v: 0 }, steps: step, path };
}

