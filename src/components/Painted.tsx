/* The painted character set (3D vinyl-toy renders, src/assets/art). One layout function places the body or
   mood portrait, the store items and the shadow in the same viewBox the vector Chibi used, so every avatar,
   leaderboard, comic panel and live-game spot keeps its size; the 3D map draws the same parts onto a canvas. */
import type { CSSProperties } from "react";
import type { Equipped } from "../types";
import { ART_SIZE } from "./artSizes";

export type PaintMood = "idle" | "happy" | "sad" | "cheer" | "think" | "angry" | "shock";

const urls = import.meta.glob("../assets/art/**/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const URL_OF: Record<string, string> = {};
for (const [k, v] of Object.entries(urls)) URL_OF[k.replace("../assets/art/", "").replace(/\.webp$/, "")] = v;

export const artUrl = (key: string): string | undefined => URL_OF[key];
export const hasArt = (key: string) => !!URL_OF[key];
export const PAINTED_LOOKS = 18;
export const paintedLook = (look: number) => (look | 0) >= 0 && (look | 0) < PAINTED_LOOKS;

export interface Part {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  cls?: string;
  /** show only the top clipH units (a mood head laid over the body) */
  clipH?: number;
}

/** Fit an image of the given art key inside a w×h box, anchored at the bottom centre. */
function fit(key: string, cx: number, bottom: number, maxW: number, maxH: number): Part | null {
  const src = URL_OF[key];
  const sz = ART_SIZE[key];
  if (!src || !sz) return null;
  const s = Math.min(maxW / sz[0], maxH / sz[1]);
  const w = sz[0] * s,
    h = sz[1] * s;
  return { src, x: cx - w / 2, y: bottom - h, w, h };
}

/** An item sized to a width, centred on (cx, cy). */
function item(id: string, cx: number, cy: number, w: number, rot = 0, cls = ""): Part | null {
  const src = URL_OF[`items/${id}`];
  const sz = ART_SIZE[`items/${id}`];
  if (!src || !sz) return null;
  const h = (w * sz[1]) / sz[0];
  return { src, x: cx - w / 2, y: cy - h / 2, w, h, rot, cls };
}

/** Hats, glasses and earrings around a head box (centre x, top, width, height). */
function accessoryParts(eq: Equipped, hx: number, ht: number, hw: number, hh: number): Part[] {
  const out: (Part | null)[] = [];
  const earY = ht + hh * 0.7;
  if (eq.ears === "hearts" || eq.ears === "hoops" || eq.ears === "studs") {
    const w = hw * (eq.ears === "hoops" ? 0.16 : eq.ears === "hearts" ? 0.1 : 0.12);
    out.push(item(eq.ears, hx - hw * 0.46, earY + (eq.ears === "hearts" ? hh * 0.06 : 0), w, 0, "acc-ear"));
    out.push(item(eq.ears, hx + hw * 0.46, earY + (eq.ears === "hearts" ? hh * 0.06 : 0), w, 0, "acc-ear"));
  }
  if (eq.face === "specs" || eq.face === "shades") out.push(item(eq.face, hx, ht + hh * 0.56, hw * 0.68, 0, "acc-face"));
  switch (eq.head) {
    case "phones":
      out.push(item("phones", hx, ht + hh * 0.42, hw * 1.36, 0, "acc-head"));
      break;
    case "cap": {
      const p = item("cap", hx, 0, hw * 0.98, 0, "acc-head");
      if (p) out.push({ ...p, y: ht + hh * 0.28 - p.h });
      break;
    }
    case "beanie": {
      const p = item("beanie", hx, 0, hw * 0.96, 0, "acc-head");
      if (p) out.push({ ...p, y: ht + hh * 0.31 - p.h });
      break;
    }
    case "crown": {
      const p = item("crown", hx, 0, hw * 0.56, 0, "acc-head");
      if (p) out.push({ ...p, y: ht + hh * 0.1 - p.h });
      break;
    }
    case "bow":
      out.push(item("bow", hx + hw * 0.3, ht + hh * 0.08, hw * 0.44, 14, "acc-head"));
      break;
  }
  return out.filter((p): p is Part => !!p);
}

/** Every image of a character, in viewBox units: full = 0 0 120 162 (feet on y 156), bust = 14 12 92 92 (circle r46 at 60,58). */
export function paintedParts(look: number, variant: "full" | "bust", mood: PaintMood, eq: Equipped = {}): Part[] {
  const i = look | 0;
  if (variant === "full") {
    const body = fit(`chars/c${i}`, 60, 156, 112, 150);
    if (!body) return [];
    const hh = body.h * 0.4,
      hw = Math.min(body.w * 0.92, hh * 0.95);
    const parts: Part[] = [{ ...body, cls: "pt-body" }];
    // a mood other than calm: the matching portrait's head goes over the body's head (clipped at the chin)
    const mk = `moods/c${i}-${mood}`;
    if (mood !== "idle" && URL_OF[mk] && ART_SIZE[mk]) {
      const [mw, mh] = ART_SIZE[mk];
      const s = (hh * 1.04) / (mh * 0.78);
      parts.push({ src: URL_OF[mk], x: 60 - (mw * s) / 2, y: body.y - hh * 0.02, w: mw * s, h: mh * s, cls: "pt-face", clipH: hh * 1.0 });
    }
    return [...parts, ...accessoryParts(eq, 60, body.y, hw, hh)];
  }
  const face = fit(`moods/c${i}-${mood}`, 60, 108, 82, 86) || fit(`moods/c${i}-idle`, 60, 108, 82, 86);
  if (!face) return [];
  const hh = face.h * 0.78,
    hw = Math.min(face.w * 0.95, hh * 0.95);
  return [{ ...face, cls: "pt-face" }, ...accessoryParts(eq, 60, face.y, hw, hh)];
}

export function PaintedChibi({
  look,
  equipped = {},
  mood = "idle",
  variant = "bust",
  size,
  still,
  className = "",
  style,
  title,
  bg,
  uid,
}: {
  look: number;
  equipped?: Equipped;
  mood?: PaintMood;
  variant?: "full" | "bust";
  size?: number;
  still?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  bg: string;
  uid: string;
}) {
  const parts = paintedParts(look, variant, mood, equipped);
  const vb = variant === "bust" ? "14 12 92 92" : "0 0 120 162";
  const w = size ?? (variant === "bust" ? 48 : 120);
  const h = variant === "bust" ? w : Math.round((w * 162) / 120);
  return (
    <svg
      viewBox={vb}
      width={w}
      height={h}
      className={`chibi painted m-${mood} ${variant} ${still ? "still" : ""} ${className}`}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={`${uid}c`}>
          <circle cx="60" cy="58" r="46" />
        </clipPath>
      </defs>
      {variant === "bust" && <circle cx="60" cy="58" r="46" fill={bg} />}
      {variant === "full" && <ellipse cx="60" cy="156" rx="30" ry="4.5" fill="#000" opacity=".14" className="shadow" />}
      <g clipPath={variant === "bust" ? `url(#${uid}c)` : undefined}>
        <g className="body">
          {parts.map((p, k) => (
            <g key={k} clipPath={p.clipH ? `url(#${uid}h${k})` : undefined}>
              {p.clipH && (
                <clipPath id={`${uid}h${k}`}>
                  <ellipse cx={p.x + p.w / 2} cy={p.y + p.clipH / 2} rx={p.w * 0.47} ry={p.clipH / 2} />
                </clipPath>
              )}
            <image
              href={p.src}
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              className={p.cls}
              preserveAspectRatio="xMidYMax meet"
              transform={p.rot ? `rotate(${p.rot} ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined}
            />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

/** Draws a full-body character (with store items) onto a canvas of the given size — used by the 3D map. */
export async function drawPainted(ctx: CanvasRenderingContext2D, look: number, eq: Equipped | undefined, W: number) {
  const parts = paintedParts(look, "full", "idle", eq);
  const s = W / 120;
  const imgs = await Promise.all(parts.map((p) => loadImage(p.src).catch(() => null)));
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(60 * s, 156 * s, 30 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  parts.forEach((p, k) => {
    const im = imgs[k];
    if (!im) return;
    ctx.save();
    if (p.rot) {
      ctx.translate((p.x + p.w / 2) * s, (p.y + p.h / 2) * s);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.drawImage(im, (-p.w / 2) * s, (-p.h / 2) * s, p.w * s, p.h * s);
    } else ctx.drawImage(im, p.x * s, p.y * s, p.w * s, p.h * s);
    ctx.restore();
  });
  ctx.restore();
}
