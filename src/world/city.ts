/* =====================================================================
   The map of Knowledge World — one long street, left to right:

     Welcome Park → Downtown → Pick-a-ride lot → Harbour Bridge
       → Hill Raceway (race start … finish) → Lighthouse Point

   World units are pixels at zoom 1, y grows downwards, and the street
   surface is y = 0. This file holds the terrain height function, the
   gameplay data (platforms, bubbles, coins, cars) and bakes every
   parallax layer out of paper shapes.
   ===================================================================== */
import { Builder, PAL, PaperLayer, clamp, rng, smooth } from "./paper";

export const WORLD_W = 21940;
export const START_X = 4520;
export const FINISH_X = 20600;
const HILL_END = 20490; // raceway terrain ends here
const LH = 20900; // Lighthouse Point starts here
export const SPAWN_X = 260;

export const DISTRICTS: { name: string; sub: string; x0: number; x1: number; color: string }[] = [
  { name: "Welcome Park", sub: "Stretch your legs", x0: 0, x1: 700, color: PAL.grass },
  { name: "Downtown", sub: "Jump the rooftops for bubbles", x0: 700, x1: 2960, color: PAL.pink },
  { name: "Pick a Ride", sub: "Three cars, one race", x0: 2960, x1: 3420, color: PAL.yellow },
  { name: "Harbour Bridge", sub: "Mind the gulls", x0: 3420, x1: 4400, color: PAL.water },
  { name: "Hill Raceway", sub: "Beat Sprinty to the flag", x0: 4400, x1: LH, color: PAL.orange },
  { name: "Lighthouse Point", sub: "You made it — enjoy the view", x0: LH, x1: WORLD_W, color: PAL.blue },
];
export const districtAt = (x: number) => DISTRICTS.find((d) => x >= d.x0 && x < d.x1) || DISTRICTS[DISTRICTS.length - 1];

/* ---------------- terrain ---------------- */
const RAMPS = [5560, 6760, 9000, 11800, 14500, 17200, 19300]; // kicker ramps: rise then a sharp drop = big air
function rawGround(x: number): number {
  if (x < 4700 || x > HILL_END) return 0;
  const t = x - 4700;
  const len = HILL_END - 4700;
  const env = smooth(0, 380, t) * (1 - smooth(len - 380, len, t));
  // long swells + medium hills + small bumps; the swell grows along the course
  const grow = 0.7 + 0.5 * smooth(0, len * 0.6, t);
  const base = -160 * Math.sin((Math.PI * t) / 5250) ** 2 * grow;
  const waves = 46 * Math.sin((2 * Math.PI * t) / 1150) + 18 * Math.sin((2 * Math.PI * t) / 540 + 1.3) + 6 * Math.sin((2 * Math.PI * t) / 270 + 2.1);
  let y = (base + waves) * env;
  for (const r of RAMPS) if (x > r - 170 && x <= r) y -= 58 * Math.pow((x - (r - 170)) / 170, 1.4);
  return y;
}
const STEP = 2;
const GROUND = new Float32Array(Math.ceil(WORLD_W / STEP) + 2);
for (let i = 0; i < GROUND.length; i++) GROUND[i] = rawGround(i * STEP);

/** Height of the ground surface at x (y down). */
export function ground(x: number): number {
  const f = clamp(x, 0, WORLD_W) / STEP;
  const i = Math.floor(f);
  const a = GROUND[i] ?? 0;
  const b = GROUND[i + 1] ?? a;
  return a + (b - a) * (f - i);
}
/** dy/dx of the ground. */
export const slope = (x: number) => (ground(x + 3) - ground(x - 3)) / 6;

/* ---------------- gameplay data ---------------- */
export interface Platform { x0: number; x1: number; y: number; bounce?: number }
export const PLATFORMS: Platform[] = [
  { x0: 978, x1: 1062, y: -30 }, // bench
  { x0: 1412, x1: 1588, y: -112 }, // bus stop roof
  { x0: 1832, x1: 1896, y: -62 }, // crate
  { x0: 1872, x1: 1936, y: -124 }, // crate on crate
  { x0: 2228, x1: 2338, y: -96, bounce: 1180 }, // café awning (trampoline!)
  { x0: 2196, x1: 2468, y: -214 }, // café roof terrace
  { x0: 2610, x1: 2672, y: -62 }, // crate
  { x0: 2640, x1: 2702, y: -124 }, // crate
  { x0: 2720, x1: 2936, y: -178 }, // billboard catwalk
  { x0: LH + 280, x1: LH + 380, y: -30 }, // picnic table
];

export interface BubbleSpot { x: number; y: number }
const onHill = (x: number, h: number) => ({ x, y: ground(x) - h });
export const BUBBLES: BubbleSpot[] = [
  { x: 520, y: -110 },
  { x: 1500, y: -178 },
  { x: 1904, y: -196 },
  { x: 2380, y: -276 },
  { x: 2830, y: -244 },
  { x: 3860, y: -118 },
  onHill(6300, 118),
  onHill(10300, 130),
  onHill(13300, 118),
  onHill(16200, 124),
  onHill(19000, 118),
  { x: LH + 500, y: -120 },
];

/** Coin trails: [x, count, arc height, spacing]. */
const COIN_TRAILS: [number, number, number, number][] = [
  [380, 5, 40, 34], [760, 6, 0, 34], [1180, 5, 60, 32], [1450, 4, 0, 34], [2010, 6, 70, 32], [2250, 5, 0, 30],
  [3530, 8, 0, 40], [4080, 6, 50, 36], [4900, 8, 30, 46], [5575, 7, 90, 44], [6000, 8, 20, 46], [6775, 7, 110, 44],
  [7150, 8, 30, 46], [7700, 6, 20, 46], [8400, 8, 30, 46], [9015, 7, 110, 44], [9900, 8, 20, 46], [10900, 8, 40, 46],
  [11815, 7, 110, 44], [12700, 8, 30, 46], [13800, 8, 20, 46], [14515, 7, 110, 44], [15400, 8, 30, 46], [16600, 8, 40, 46],
  [17215, 7, 110, 44], [18200, 8, 20, 46], [19315, 7, 110, 44], [20000, 6, 30, 46], [LH + 160, 6, 50, 34],
];
export interface CoinSpot { x: number; y: number }
export const COINS: CoinSpot[] = [];
for (const [x0, n, arc, gap] of COIN_TRAILS)
  for (let i = 0; i < n; i++) {
    const x = x0 + i * gap;
    const t = n > 1 ? i / (n - 1) : 0.5;
    const base = x0 === 2250 ? -214 : ground(x); // that trail runs along the café roof
    COINS.push({ x, y: base - 42 - Math.sin(t * Math.PI) * arc });
  }

export interface CarSpec {
  id: string;
  name: string;
  tag: string;
  color: string;
  trim: string;
  accel: number; // px/s² of drive force
  top: number; // px/s
  wheelR: number;
  travel: number; // suspension travel
  air: number; // air-control strength
  body: "hatch" | "sport" | "buggy";
  stats: [number, number, number]; // speed, grip, air (1–5) for the showroom card
}
export const CARS: CarSpec[] = [
  { id: "zippy", name: "Zippy", tag: "All-rounder hatchback", color: PAL.lime, trim: PAL.ink, accel: 1300, top: 780, wheelR: 17, travel: 22, air: 6.5, body: "hatch", stats: [3, 4, 3] },
  { id: "blaze", name: "Blaze", tag: "Low, loud and fast", color: PAL.orange, trim: PAL.ink, accel: 1450, top: 940, wheelR: 16, travel: 16, air: 4.8, body: "sport", stats: [5, 3, 2] },
  { id: "rocky", name: "Rocky", tag: "Big-wheel hill hopper", color: PAL.blue, trim: PAL.yellow, accel: 1400, top: 700, wheelR: 23, travel: 30, air: 8.5, body: "buggy", stats: [2, 5, 5] },
];
export const CAR_SPOTS = [3030, 3200, 3370];

/* ---------------- baking the layers ---------------- */
export interface Layers {
  sky: PaperLayer[]; // behind everything (clouds handled live)
  back: PaperLayer[]; // parallax planes, far → near
  play: PaperLayer; // f = 1, drawn behind entities
  front: PaperLayer; // foreground silhouettes, drawn over entities
  signs: { x: number; y: number; w: number; h: number; text: string; bg: string; fg: string; font: number; f: number }[];
  lamps: { x: number; y: number }[];
}

const BUILDING_COLORS = [PAL.pink, PAL.blue, PAL.orange, PAL.yellow, PAL.lime, "#8C7BFF", "#5EEAD4", PAL.cream];

function windows(b: Builder, r: () => number, x: number, y: number, w: number, h: number, z: number, cols: number, litChance = 0.55) {
  const pad = 10;
  const cw = (w - pad * 2) / cols;
  const rows = Math.max(1, Math.floor((h - pad * 2) / 30));
  const ch = (h - pad * 2) / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const wx = x + pad + i * cw + cw * 0.18;
      const wy = y + pad + j * ch + ch * 0.2;
      const ww = cw * 0.64;
      const wh = ch * 0.58;
      b.rect(wx, wy, ww, wh, PAL.window, z, { jitter: 0.5 });
      if (r() < litChance) b.rect(wx, wy, ww, wh, PAL.light, z + 0.1, { jitter: 0.5, light: true });
    }
}

function tree(b: Builder, r: () => number, x: number, gy: number, s: number, z: number, tones = [PAL.grassDeep, PAL.grass, "#9BDB5E"]) {
  b.rect(x - 5 * s, gy - 46 * s, 10 * s, 48 * s, "#7A5234", z, { shadow: 0.6 });
  b.blob(x, gy - 104 * s, 84 * s, 74 * s, tones[0], z + 0.1, { shadow: true, lumps: 4 });
  b.blob(x - 6 * s, gy - 112 * s, 64 * s, 56 * s, tones[1], z + 0.2, { lumps: 3 });
  b.circle(x - 14 * s, gy - 122 * s, 9 * s * (0.8 + r() * 0.4), tones[2], z + 0.3);
}

export function bakeCity(): Layers {
  const r = rng(2026);
  const signs: Layers["signs"] = [];
  const lamps: Layers["lamps"] = [];

  /* ---- far mountains (f 0.12) ---- */
  const mountains = new PaperLayer(0.12, 0.12, 11, 600);
  for (let x = -1400; x < WORLD_W * 0.12 + 1400; x += 170 + r() * 120) {
    const w = 380 + r() * 300;
    const h = 170 + r() * 150;
    const tone = r() < 0.5 ? "#A9D8CF" : "#93CBBF";
    mountains.add(x - w / 2, x + w / 2, (b) => {
      b.poly([x - w / 2, 60, x - w * 0.08, 60 - h * 0.96, x, 60 - h, x + w * 0.1, 60 - h * 0.9, x + w / 2, 60, x + w / 2, 420, x - w / 2, 420], tone, 0, { shadow: 0.8 });
      if (h > 250) b.poly([x - w * 0.12, 60 - h * 0.8, x, 60 - h, x + w * 0.12, 60 - h * 0.78, x + w * 0.04, 60 - h * 0.84, x - w * 0.04, 60 - h * 0.8], PAL.cream, 0.2);
    });
  }
  mountains.finish();

  /* ---- skyline + far hills (f 0.32) ---- */
  const skyline = new PaperLayer(0.32, 0.3, 23, 500);
  for (let x = -900; x < WORLD_W * 0.32 + 900; x += 60 + r() * 40) {
    const wx = x / 0.32; // world x this sits behind
    const inTown = wx > 500 && wx < 4300;
    if (inTown) {
      const w = 50 + r() * 60;
      const h = 90 + r() * 170;
      skyline.add(x, x + w, (b) => {
        b.rect(x, 40 - h, w, h + 380, r() < 0.5 ? "#BDB6EE" : "#A9C4F2", 0, { shadow: 0.7 });
        for (let i = 0; i < 6; i++) if (r() < 0.5) b.rect(x + 8 + r() * (w - 20), 40 - h + 12 + r() * (h - 30), 6, 8, PAL.light, 0.2, { light: true, jitter: 0 });
        if (r() < 0.3) b.rect(x + w / 2 - 2, 40 - h - 26, 4, 26, "#8E88C8", 0.1);
      });
    } else {
      const w = 260 + r() * 200;
      const h = 60 + r() * 60;
      skyline.add(x - w / 2, x + w / 2, (b) => {
        b.blob(x, 40 - h, w, h * 2, "#9ED58A", 0, { shadow: 0.7, lumps: 5 });
        b.rect(x - w * 0.4, 40, w * 0.8, 380, "#9ED58A", 0, { jitter: 0 });
        if (r() < 0.5) {
          // paper windmill
          const mx = x + (r() - 0.5) * w * 0.4;
          b.poly([mx - 6, 40 - h * 0.9, mx + 6, 40 - h * 0.9, mx + 3, 40 - h * 0.9 - 70, mx - 3, 40 - h * 0.9 - 70], PAL.cream, 0.3);
          for (let k = 0; k < 3; k++) {
            const a = k * ((Math.PI * 2) / 3) + 0.4;
            const cx = mx;
            const cy = 40 - h * 0.9 - 70;
            b.poly([cx, cy, cx + Math.cos(a) * 38 - Math.sin(a) * 5, cy + Math.sin(a) * 38 + Math.cos(a) * 5, cx + Math.cos(a) * 38, cy + Math.sin(a) * 38], PAL.cream, 0.4, { jitter: 0 });
          }
        }
      });
    }
  }
  skyline.finish();

  /* ---- mid city (f 0.6) ---- */
  const mid = new PaperLayer(0.6, 0.55, 37, 480);
  for (let lx = -500; lx < WORLD_W * 0.6 + 900; ) {
    const wx = lx / 0.6;
    if (wx > 600 && wx < 3300) {
      const w = 90 + r() * 90;
      const h = 150 + r() * 230;
      const col = BUILDING_COLORS[Math.floor(r() * BUILDING_COLORS.length)];
      const x = lx;
      mid.add(x, x + w, (b) => {
        b.rect(x, 30 - h, w, h + 400, col, 0, { shadow: true });
        b.rect(x - 4, 30 - h - 8, w + 8, 10, PAL.ink2, 0.1, { jitter: 0.6 });
        windows(b, r, x, 30 - h + 6, w, h - 30, 0.2, w > 140 ? 4 : 3);
        if (r() < 0.35) {
          // water tank
          b.rect(x + w * 0.2, 30 - h - 44, 30, 34, "#9A6B45", 0.3, { shadow: 0.5 });
          b.poly([x + w * 0.2 - 3, 30 - h - 44, x + w * 0.2 + 15, 30 - h - 60, x + w * 0.2 + 33, 30 - h - 44], "#7A5234", 0.35);
        }
      });
      lx += w + 6 + r() * 16;
    } else if ((wx >= 3300 && wx < 4450) || wx >= LH - 200) {
      // harbour: sea with boats
      const x = lx;
      mid.add(x, x + 200, (b) => {
        b.rect(x, -10, 206, 420, PAL.waterDeep, 0, { jitter: 0 });
        if (r() < 0.6) {
          const bx = x + 40 + r() * 100;
          b.poly([bx - 40, -16, bx + 40, -16, bx + 30, 2, bx - 30, 2], r() < 0.5 ? PAL.cream : PAL.orange, 0.3, { shadow: 0.5 });
          b.poly([bx - 2, -18, bx - 2, -86, bx + 34, -22], PAL.cream, 0.35);
          b.poly([bx - 6, -18, bx - 6, -74, bx - 36, -22], PAL.pink, 0.35);
        }
      });
      lx += 200;
    } else {
      // rolling hills with trees
      const w = 220 + r() * 160;
      const h = 80 + r() * 90;
      const x = lx;
      mid.add(x - 40, x + w + 40, (b) => {
        const hc = r() < 0.5 ? "#8CCB6B" : "#7DBE5C";
        b.blob(x + w / 2, 60 - h, w + 80, h * 2, hc, 0, { shadow: true, lumps: 4 });
        b.rect(x - 20, 60, w + 40, 380, hc, 0, { jitter: 0 });
        const n = 1 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) tree(b, r, x + 30 + r() * (w - 60), 60 - h * 0.7, 0.55, 0.3);
      });
      lx += w * 0.7;
    }
  }
  mid.finish();

  /* ---- back street (f 0.85): shop fronts behind the pavement, downtown only ---- */
  const backStreet = new PaperLayer(0.85, 0.85, 51, 480);
  for (let lx = 700 * 0.85; lx < 2960 * 0.85; ) {
    const w = 110 + r() * 70;
    const h = 120 + r() * 90;
    const col = BUILDING_COLORS[Math.floor(r() * BUILDING_COLORS.length)];
    const x = lx;
    backStreet.add(x, x + w, (b) => {
      b.rect(x, -h + 4, w, h + 30, col, 0, { shadow: true });
      b.rect(x, -h + 4, w, 12, PAL.ink2, 0.1, { jitter: 0.5 });
      windows(b, r, x, -h + 20, w, h - 70, 0.2, 3, 0.6);
      b.rect(x + w / 2 - 14, -50, 28, 54, PAL.ink2, 0.3); // door
      b.rect(x + 10, -54, w / 2 - 30, 40, PAL.glass, 0.3);
      b.rect(x + 12, -52, w / 2 - 34, 36, PAL.light, 0.35, { light: true, jitter: 0 });
    });
    lx += w + 4;
  }
  backStreet.finish();

  /* ---- play layer (f 1): ground, street furniture, landmarks ---- */
  const play = new PaperLayer(1, 1, 71, 400);
  const DEPTH = 900;
  // ground, 40 px slices so slopes stay smooth
  for (let x = -600; x < WORLD_W + 600; x += 40) {
    const x1 = x + 40;
    const g0 = ground(x);
    const g1 = ground(x1);
    const town = x < 4480 && x > -600;
    const bridge = x >= 3440 && x < 4400;
    play.add(x, x1, (b) => {
      if (bridge) {
        b.rect(x, 0, 41, 20, PAL.ink2, 1, { jitter: 0 });
        b.rect(x, 20, 41, 50, PAL.water, 0, { jitter: 0 });
        b.rect(x, 70, 41, DEPTH, PAL.waterDeep, 0.1, { jitter: 0 });
        return;
      }
      if (town && x > 640 && x < 3440) {
        b.rect(x, -3, 41, 9, PAL.curb, 1, { jitter: 0 });
        b.rect(x, 6, 41, 44, PAL.road, 1, { jitter: 0 });
        if ((x / 40) % 2 === 0) b.rect(x + 6, 26, 26, 4, PAL.yellow, 1.1, { jitter: 0 });
        b.rect(x, 50, 41, DEPTH, "#8A7A66", 0.9, { jitter: 0 });
        return;
      }
      // grassy land with paper strata — bands butt against each other (no overlap),
      // so slice seams never show anti-aliasing lines
      const band = (y0: number, y1: number, fill: string, z: number) =>
        b.poly([x, g0 + y0, x1 + 0.6, g1 + y0, x1 + 0.6, g1 + y1, x, g0 + y1], fill, z, { jitter: 0 });
      band(-2, 16, PAL.grass, 1);
      band(16, 52, PAL.dirt, 0.9);
      band(52, 120, PAL.dirt2, 0.85);
      band(120, DEPTH, PAL.dirt3, 0.8);
      // grass tufts
      if (r() < 0.7) {
        const tx = x + r() * 30;
        const ty = ground(tx);
        b.poly([tx, ty, tx + 5, ty - 11, tx + 8, ty, tx + 11, ty - 8, tx + 14, ty], PAL.grassDeep, 1.1, { jitter: 0.4 });
      }
    });
  }
  // ramp faces (the drop side) get a darker edge
  for (const rx of RAMPS) play.add(rx - 4, rx + 4, (b) => b.poly([rx - 2, ground(rx - 2), rx + 3, ground(rx + 3), rx + 3, ground(rx + 3) + 30, rx - 2, ground(rx - 2) + 30], PAL.dirt3, 1.2, { jitter: 0 }));

  // Welcome Park
  for (const [tx, s] of [[90, 1], [170, 0.8], [600, 1.1], [660, 0.75]] as [number, number][]) play.add(tx - 50, tx + 50, (b) => tree(b, r, tx, 0, s, 0));
  play.add(300, 520, (b) => {
    b.rect(330, -150, 8, 150, PAL.ink, 0.5);
    b.rect(492, -150, 8, 150, PAL.ink, 0.5);
    b.round(310, -206, 210, 76, 10, PAL.ink, 0.6, { shadow: true });
  });
  signs.push({ x: 415, y: -168, w: 190, h: 60, text: "KNOWLEDGE WORLD", bg: PAL.ink, fg: PAL.lime, font: 26, f: 1 });
  play.add(430, 600, (b) => {
    // fountain
    b.poly([450, 0, 590, 0, 575, -30, 465, -30], PAL.curb, 0.4, { shadow: true });
    b.rect(470, -28, 100, 8, PAL.water, 0.5, { jitter: 0 });
    b.rect(512, -70, 16, 42, PAL.curb, 0.5);
    b.blob(520, -88, 46, 24, "#A6DDF9", 0.6, { lumps: 3 });
  });
  for (let x = 20; x < 700; x += 26) play.add(x, x + 20, (b) => b.poly([x, 0, x + 4, -16, x + 8, 0], PAL.grassDeep, 0.2, { jitter: 0.5 }));

  // Downtown street furniture
  for (let x = 820; x < 4400; x += 260) {
    if (x > 3000 && x < 3420) continue;
    const bridge = x >= 3440;
    const lx = x;
    play.add(lx - 30, lx + 30, (b) => {
      b.rect(lx - 3, -150, 6, 150, PAL.ink, 0.4, { shadow: 0.6 });
      b.round(lx - 22, -160, 44, 12, 6, PAL.ink, 0.45);
      b.rect(lx - 14, -150, 28, 6, PAL.light, 0.46, { light: true, jitter: 0 });
    });
    lamps.push({ x: lx, y: -146 + (bridge ? 0 : 0) });
  }
  play.add(970, 1070, (b) => {
    // bench
    b.round(978, -34, 84, 8, 3, "#9A6B45", 0.5, { shadow: true });
    b.round(978, -56, 84, 8, 3, "#9A6B45", 0.5);
    b.rect(986, -26, 6, 26, PAL.ink, 0.45);
    b.rect(1048, -26, 6, 26, PAL.ink, 0.45);
  });
  play.add(1400, 1600, (b) => {
    // bus stop
    b.rect(1418, -110, 8, 110, PAL.ink, 0.4);
    b.rect(1576, -110, 8, 110, PAL.ink, 0.4);
    b.rect(1426, -104, 150, 84, "rgba(163,219,255,0.55)", 0.35, { jitter: 0.4 });
    b.round(1406, -122, 190, 14, 5, PAL.orange, 0.5, { shadow: true });
    b.round(1440, -46, 100, 8, 3, PAL.ink2, 0.45);
  });
  signs.push({ x: 1470, y: -86, w: 60, h: 22, text: "BUS", bg: PAL.yellow, fg: PAL.ink, font: 14, f: 1 });
  const crate = (b: Builder, x: number, y: number) => {
    b.rect(x, y, 64, 62, "#C8945C", 0.5, { shadow: true });
    b.rect(x + 4, y + 4, 56, 54, "#B07C45", 0.55);
    b.poly([x + 6, y + 8, x + 12, y + 4, x + 58, y + 54, x + 52, y + 58], "#C8945C", 0.6, { jitter: 0.3 });
  };
  play.add(1830, 1940, (b) => {
    crate(b, 1832, -62);
    crate(b, 1872, -124);
  });
  play.add(2600, 2710, (b) => {
    crate(b, 2610, -62);
    crate(b, 2640, -124);
  });
  play.add(2190, 2480, (b) => {
    // café: front, window, door, awning, roof terrace railing
    b.rect(2196, -214, 272, 216, "#FFE2D4", 0.3, { shadow: true });
    b.rect(2190, -222, 284, 12, PAL.ink2, 0.35);
    b.rect(2360, -86, 48, 88, PAL.ink2, 0.4);
    b.rect(2226, -170, 110, 60, PAL.glass, 0.35);
    b.rect(2230, -166, 102, 52, PAL.light, 0.36, { light: true, jitter: 0 });
    for (let i = 0; i < 5; i++) b.poly([2228 + i * 22, -106, 2250 + i * 22, -106, 2250 + i * 22, -88, 2239 + i * 22, -82, 2228 + i * 22, -88], i % 2 ? PAL.cream : PAL.pink, 0.5, { jitter: 0.4 });
    for (let x = 2200; x < 2468; x += 24) b.rect(x, -250, 4, 36, PAL.ink, 0.25);
    b.rect(2196, -252, 272, 5, PAL.ink, 0.26);
  });
  signs.push({ x: 2330, y: -196, w: 120, h: 26, text: "BREAK CAFÉ", bg: PAL.ink, fg: PAL.pink, font: 16, f: 1 });
  play.add(2710, 2950, (b) => {
    // billboard on a pole with a catwalk
    b.rect(2822, -178, 12, 178, PAL.ink, 0.3);
    b.rect(2716, -186, 224, 8, PAL.ink, 0.45, { shadow: true });
    b.round(2724, -300, 208, 110, 8, PAL.lime, 0.4, { shadow: true });
  });
  signs.push({ x: 2828, y: -262, w: 188, h: 40, text: "LEARN · PLAY · WIN", bg: PAL.lime, fg: PAL.ink, font: 20, f: 1 });
  signs.push({ x: 2828, y: -222, w: 188, h: 24, text: "2 minutes a day", bg: PAL.lime, fg: PAL.ink2, font: 14, f: 1 });

  // Pick-a-ride lot
  play.add(2980, 3420, (b) => {
    b.rect(2990, -6, 420, 10, PAL.yellow, 0.2, { jitter: 0 });
    for (let x = 3000; x < 3410; x += 140) b.rect(x, -4, 6, 8, PAL.cream, 0.25, { jitter: 0 });
    b.rect(3000, -236, 10, 236, PAL.ink, 0.3);
    b.round(2984, -292, 200, 62, 10, PAL.orange, 0.35, { shadow: true });
    // flags
    for (let x = 3040; x < 3400; x += 44) b.poly([x, -200, x + 22, -200, x + 11, -182], [PAL.lime, PAL.pink, PAL.blue, PAL.yellow][(x / 44) % 4 | 0], 0.2, { jitter: 0.4 });
    b.rect(3020, -202, 380, 2, PAL.ink, 0.19);
  });
  signs.push({ x: 3084, y: -261, w: 180, h: 50, text: "PICK A RIDE", bg: PAL.orange, fg: PAL.cream, font: 26, f: 1 });

  // Harbour Bridge
  play.add(3420, 4420, (b) => {
    for (const tx of [3640, 4180]) {
      b.rect(tx - 14, -300, 28, 1000, "#E5431A", 0.2, { shadow: true });
      b.rect(tx - 22, -306, 44, 12, "#B8340F", 0.25);
      b.rect(tx - 22, -200, 44, 10, "#B8340F", 0.25);
    }
    for (let x = 3440; x < 4400; x += 30) b.rect(x, -34, 4, 34, PAL.ink2, 0.6, { jitter: 0.3 });
    b.rect(3440, -38, 960, 5, PAL.ink2, 0.61);
  });
  // cables (thin strips following a catenary)
  play.add(3440, 4400, (b) => {
    const cable = (x0: number, x1: number, sag: number) => {
      const pts: number[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = x0 + (x1 - x0) * t;
        const y = -300 + Math.sin(t * Math.PI) * sag;
        pts.push(x, y);
      }
      for (let i = 20; i >= 0; i--) pts.push(pts[i * 2], pts[i * 2 + 1] + 4);
      b.poly(pts, "#B8340F", 0.15, { jitter: 0 });
    };
    cable(3440, 3640, 170);
    cable(3640, 4180, 250);
    cable(4180, 4400, 170);
    for (let x = 3660; x < 4170; x += 36) {
      const t = (x - 3640) / 540;
      const y = -300 + Math.sin(t * Math.PI) * 250;
      b.rect(x, y, 2, -y - 36, "#B8340F", 0.14, { jitter: 0 });
    }
  });

  // Raceway: start + finish gantries, trees, marshal flags
  const gantry = (x: number, label: string, color: string) => {
    const g = ground(x);
    play.add(x - 110, x + 110, (b) => {
      b.rect(x - 100, g - 190, 12, 190, PAL.ink, 0.3, { shadow: true });
      b.rect(x + 88, g - 190, 12, 190, PAL.ink, 0.3, { shadow: true });
      b.round(x - 110, g - 222, 220, 48, 8, color, 0.35, { shadow: true });
      for (let i = 0; i < 10; i++) b.rect(x - 100 + i * 20, g - 176, 10, 10, i % 2 ? PAL.cream : PAL.ink, 0.36, { jitter: 0 });
      for (let i = 0; i < 10; i++) b.rect(x - 90 + i * 20, g - 166, 10, 10, i % 2 ? PAL.ink : PAL.cream, 0.36, { jitter: 0 });
      for (let i = 0; i < 4; i++) b.rect(x - 4, g + 2 + i * 0, 8, 4, PAL.cream, 1.3, { jitter: 0 });
    });
    signs.push({ x, y: g - 198, w: 200, h: 40, text: label, bg: color, fg: PAL.ink, font: 24, f: 1 });
  };
  gantry(START_X, "START", PAL.lime);
  gantry(FINISH_X, "FINISH", PAL.yellow);
  for (let x = 4700; x < HILL_END; x += 150 + r() * 200) {
    const s = 0.6 + r() * 0.5;
    const tx = x;
    if (Math.abs(tx - START_X) < 140 || Math.abs(tx - FINISH_X) < 140 || RAMPS.some((rx) => Math.abs(tx - rx) < 200)) continue;
    play.add(tx - 50, tx + 50, (b) => tree(b, r, tx, ground(tx) + 6, s, -0.2, ["#3E9A46", "#58B653", "#8ED06A"]));
  }
  for (const rx of RAMPS) {
    const sx = rx - 230;
    const gy = ground(sx);
    play.add(sx - 40, sx + 40, (b) => {
      b.rect(sx - 3, gy - 70, 6, 72, PAL.ink, 0.3);
      b.round(sx - 38, gy - 96, 76, 32, 6, PAL.orange, 0.35, { shadow: true });
    });
    signs.push({ x: sx, y: gy - 80, w: 70, h: 26, text: "JUMP!", bg: PAL.orange, fg: PAL.cream, font: 18, f: 1 });
  }

  // Lighthouse Point
  play.add(21440, 21660, (b) => {
    b.poly([21500, 0, 21600, 0, 21584, -300, 21516, -300], PAL.cream, 0.2, { shadow: true });
    for (let i = 0; i < 4; i++) {
      const y0 = -40 - i * 70;
      const w0 = 50 - (i * 70 + 40) * 0.055;
      b.poly([21550 - w0, y0, 21550 + w0, y0, 21550 + w0 - 2, y0 - 30, 21550 - w0 + 2, y0 - 30], "#E5431A", 0.25, { jitter: 0.5 });
    }
    b.rect(21510, -348, 80, 48, PAL.glass, 0.3);
    b.rect(21516, -342, 68, 36, PAL.light, 0.31, { light: true, jitter: 0 });
    b.poly([21502, -348, 21598, -348, 21550, -392], "#E5431A", 0.35, { shadow: true });
  });
  play.add(21170, 21290, (b) => {
    b.round(21176, -34, 108, 8, 3, "#9A6B45", 0.5, { shadow: true });
    b.rect(21186, -26, 6, 26, PAL.ink, 0.45);
    b.rect(21268, -26, 6, 26, PAL.ink, 0.45);
  });
  for (const [tx, s] of [[20980, 0.9], [21100, 0.7], [21760, 1]] as [number, number][]) play.add(tx - 50, tx + 50, (b) => tree(b, r, tx, 0, s, 0));
  // fence at the end of the world
  play.add(21820, 21940, (b) => {
    for (let x = 21820; x < 21940; x += 20) b.rect(x, -44, 8, 44, PAL.cream, 0.6, { shadow: 0.5 });
    b.rect(21816, -36, 124, 6, PAL.cream, 0.61);
  });
  signs.push({ x: 21340, y: -200, w: 170, h: 40, text: "YOU MADE IT!", bg: PAL.blue, fg: PAL.cream, font: 20, f: 1 });
  play.add(21260, 21420, (b) => {
    b.rect(21336, -180, 8, 180, PAL.ink, 0.3);
    b.round(21252, -222, 176, 48, 8, PAL.blue, 0.35, { shadow: true });
  });
  play.finish();

  /* ---- foreground (f 1.3): dark bushes & posts that sweep past ---- */
  const front = new PaperLayer(1.3, 1, 91, 500);
  for (let lx = -200; lx < WORLD_W * 1.3 + 400; lx += 300 + r() * 500) {
    const x = lx;
    const gy = ground(x / 1.3) + 150; // hug the terrain the player is on
    const kind = r();
    front.add(x - 90, x + 90, (b) => {
      if (kind < 0.6) b.blob(x, gy, 180 + r() * 80, 110, "#2E5E2A", 0, { lumps: 5 });
      else if (kind < 0.85) {
        for (let i = 0; i < 5; i++) b.poly([x + i * 16, gy + 40, x + i * 16 + 5, gy - 40 + r() * 30, x + i * 16 + 10, gy + 40], "#27502A", 0, { jitter: 0.6 });
      } else {
        b.rect(x, gy - 90, 14, 300, "#1D1C19", 0);
        b.rect(x - 30, gy - 60, 74, 10, "#1D1C19", 0.1);
      }
    });
  }
  front.finish();

  return { sky: [mountains], back: [skyline, mid, backStreet], play, front, signs, lamps };
}
