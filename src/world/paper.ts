/* =====================================================================
   Papercraft drawing kit for Knowledge World.
   Every scenery shape is a flat piece of "cut paper": a solid colour with
   slightly hand-cut (jittered) edges and a crisp offset shadow on the layer
   behind it. Shapes are baked once into Path2D objects grouped by colour, in
   horizontal chunks, so a frame only fills a few dozen paths.
   ===================================================================== */

export const PAL = {
  ink: "#161512",
  ink2: "#2B2A26",
  cream: "#FFFEFA",
  paper: "#F4F1E8",
  lime: "#C6F432",
  limeDeep: "#8FBF12",
  orange: "#FF5A1F",
  orangeDeep: "#C23C0C",
  pink: "#FF7EB6",
  blue: "#3D7BFF",
  yellow: "#FFD84D",
  grass: "#7CCB45",
  grassDeep: "#5FAE36",
  dirt: "#C98A55",
  dirt2: "#A66E43",
  dirt3: "#7A4E2F",
  road: "#3B3A36",
  curb: "#E4E1D8",
  water: "#4FB3F2",
  waterDeep: "#2F8FD0",
  glass: "#23313E",
  window: "#2B3A4A",
  light: "#FFE7A3",
} as const;

export const SHADOW = "rgba(22,21,18,0.16)";

/** Deterministic random numbers, so the world is the same on every visit. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface Op {
  z: number;
  fill: string;
  path: Path2D;
  light: boolean; // drawn after the night tint, fades in at dusk
}

interface ShapeOpts {
  shadow?: boolean | number; // true = default offset, number = offset scale
  light?: boolean;
  jitter?: number;
}

/** Collects shapes into one Path2D per (z, colour). */
export class Builder {
  private ops = new Map<string, Op>();
  constructor(private r: () => number, private jitterAmt = 1.3) {}

  private op(z: number, fill: string, light = false): Path2D {
    const k = `${z}|${fill}|${light ? 1 : 0}`;
    let o = this.ops.get(k);
    if (!o) {
      o = { z, fill, path: new Path2D(), light };
      this.ops.set(k, o);
    }
    return o.path;
  }
  private j(amt: number) {
    return (this.r() - 0.5) * 2 * amt;
  }

  /** Polygon from a flat [x0,y0,x1,y1,…] list, edges hand-cut. */
  poly(pts: number[], fill: string, z = 0, o: ShapeOpts = {}) {
    const ja = o.jitter ?? this.jitterAmt;
    const q = pts.map((v) => v + this.j(ja));
    this.trace(this.op(z, fill, o.light), q, 0, 0);
    if (o.shadow) {
      const k = typeof o.shadow === "number" ? o.shadow : 1;
      this.trace(this.op(z - 0.5, SHADOW), q, 5 * k, 5 * k);
    }
  }
  private trace(p: Path2D, q: number[], dx: number, dy: number) {
    p.moveTo(q[0] + dx, q[1] + dy);
    for (let i = 2; i < q.length; i += 2) p.lineTo(q[i] + dx, q[i + 1] + dy);
    p.closePath();
  }
  rect(x: number, y: number, w: number, h: number, fill: string, z = 0, o: ShapeOpts = {}) {
    this.poly([x, y, x + w, y, x + w, y + h, x, y + h], fill, z, o);
  }
  round(x: number, y: number, w: number, h: number, r: number, fill: string, z = 0, o: ShapeOpts = {}) {
    const add = (p: Path2D, dx: number, dy: number) => {
      const rr = Math.min(r, w / 2, h / 2);
      p.moveTo(x + rr + dx, y + dy);
      p.arcTo(x + w + dx, y + dy, x + w + dx, y + h + dy, rr);
      p.arcTo(x + w + dx, y + h + dy, x + dx, y + h + dy, rr);
      p.arcTo(x + dx, y + h + dy, x + dx, y + dy, rr);
      p.arcTo(x + dx, y + dy, x + w + dx, y + dy, rr);
      p.closePath();
    };
    add(this.op(z, fill, o.light), 0, 0);
    if (o.shadow) {
      const k = typeof o.shadow === "number" ? o.shadow : 1;
      add(this.op(z - 0.5, SHADOW), 5 * k, 5 * k);
    }
  }
  circle(x: number, y: number, r: number, fill: string, z = 0, o: ShapeOpts = {}) {
    const p = this.op(z, fill, o.light);
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, Math.PI * 2);
    if (o.shadow) {
      const k = typeof o.shadow === "number" ? o.shadow : 1;
      const s = this.op(z - 0.5, SHADOW);
      s.moveTo(x + r + 5 * k, y + 5 * k);
      s.arc(x + 5 * k, y + 5 * k, r, 0, Math.PI * 2);
    }
  }
  /** A lumpy paper blob (clouds, bushes, tree crowns). */
  blob(x: number, y: number, w: number, h: number, fill: string, z = 0, o: ShapeOpts & { lumps?: number } = {}) {
    const n = o.lumps ?? 5;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const cx = x - w / 2 + w * (0.18 + 0.64 * t);
      const bump = Math.sin(t * Math.PI);
      const rr = (h / 2) * (0.62 + 0.38 * bump) * (0.9 + this.r() * 0.2);
      this.circle(cx, y + h / 2 - rr, rr, fill, z, o);
    }
    this.rect(x - w * 0.36, y + h / 2 - h * 0.3, w * 0.72, h * 0.3, fill, z, { ...o, jitter: 0 });
  }

  done(): Op[] {
    return [...this.ops.values()].sort((a, b) => a.z - b.z);
  }
}

interface Chunk {
  x0: number;
  x1: number;
  b: Builder;
  ops: Op[];
}

/**
 * One parallax plane. Shapes live in "layer space": a layer with factor f
 * scrolls f times as fast as the play layer (f = 1). fy does the same vertically.
 */
export class PaperLayer {
  private chunks = new Map<number, Chunk>();
  private list: Chunk[] = [];
  constructor(public f: number, public fy: number, private seed: number, private cw = 480) {}

  /** Adds an item spanning [x0, x1] in layer space. */
  add(x0: number, x1: number, draw: (b: Builder) => void) {
    const i = Math.floor(x0 / this.cw);
    let c = this.chunks.get(i);
    if (!c) {
      c = { x0: i * this.cw, x1: (i + 1) * this.cw, b: new Builder(rng(this.seed + i * 977)), ops: [] };
      this.chunks.set(i, c);
    }
    c.x0 = Math.min(c.x0, x0 - 12);
    c.x1 = Math.max(c.x1, x1 + 12);
    draw(c.b);
  }
  finish() {
    this.list = [...this.chunks.values()].sort((a, b) => a.x0 - b.x0);
    for (const c of this.list) c.ops = c.b.done();
    return this;
  }
  draw(ctx: CanvasRenderingContext2D, lx0: number, lx1: number, pass: "base" | "light", nightAlpha: number) {
    if (pass === "light" && nightAlpha <= 0.01) return;
    for (const c of this.list) {
      if (c.x1 < lx0 || c.x0 > lx1) continue;
      for (const o of c.ops) {
        if (o.light !== (pass === "light")) continue;
        if (o.light) ctx.globalAlpha = nightAlpha;
        ctx.fillStyle = o.fill;
        ctx.fill(o.path);
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Soft paper-fibre texture, tiled over the whole screen at low opacity. */
export function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d");
  if (!g) return null;
  const r = rng(99);
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + r() * 135;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // a few fibres
  g.strokeStyle = "rgba(0,0,0,.16)";
  g.lineWidth = 0.6;
  for (let i = 0; i < 40; i++) {
    const x = r() * 160;
    const y = r() * 160;
    const a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    g.stroke();
  }
  return ctx.createPattern(c, "repeat");
}
