/* The painted character set (3D vinyl-toy renders, src/assets/art). Each character has one full-body image per mood
   (the mood face baked onto the same body, so the outfit never changes). One layout places it, the shadow and the
   store items in the viewBox the vector Chibi used; avatar circles frame the head of that same layout, so a portrait
   and a full body always match. Every avatar, leaderboard, comic panel and live-game spot keeps its size, and the
   3D map draws the same parts onto a canvas. */
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

/** Where each character's head is, as fractions of its body image: skull top (where a hat sits), eye line, chin and
    face width (of the height), and the face's centre (of the width). Measured on the renders; Puff's face sits low under his ears. */
interface Geo {
  top: number;
  eye: number;
  chin: number;
  fw: number;
  cx: number;
}
const HUMAN: Geo = { top: 0.02, eye: 0.245, chin: 0.36, fw: 0.33, cx: 0.5 };
const GEO: Record<number, Geo> = { 11: { ...HUMAN, eye: 0.235 }, 16: { ...HUMAN, cx: 0.475 }, 17: { top: 0.3, eye: 0.415, chin: 0.52, fw: 0.44, cx: 0.5 } };
const geoOf = (i: number) => GEO[i] || HUMAN;
/** the part of the full body an avatar circle shows (fractions of the body height) */
const bustWindow = (i: number): [number, number] => (i === 17 ? [0, 0.62] : [-0.02, 0.5]);

/** Hats, glasses and earrings placed on a head: face centre x, skull top, eye line, chin, face width. */
function accessoryParts(eq: Equipped, X: number, T: number, E: number, C: number, FW: number): Part[] {
  const out: (Part | null)[] = [];
  const up = E - T,
    down = C - E;
  if (eq.ears === "hearts" || eq.ears === "hoops" || eq.ears === "studs") {
    const w = FW * (eq.ears === "hoops" ? 0.17 : eq.ears === "hearts" ? 0.11 : 0.12);
    const y = E + down * (eq.ears === "hearts" ? 0.58 : 0.45);
    out.push(item(eq.ears, X - FW * 0.53, y, w, 0, "acc-ear"));
    out.push(item(eq.ears, X + FW * 0.53, y, w, 0, "acc-ear"));
  }
  if (eq.face === "specs" || eq.face === "shades") out.push(item(eq.face, X, E, FW * 0.95, 0, "acc-face"));
  const sitOn = (id: string, w: number, bottom: number) => {
    const p = item(id, X, 0, w, 0, "acc-head");
    return p ? { ...p, y: bottom - p.h } : null;
  };
  switch (eq.head) {
    case "phones":
      out.push(sitOn("phones", FW * 1.42, E + down * 0.8));
      break;
    case "cap":
      out.push(sitOn("cap", FW * 1.3, T + up * 0.62));
      break;
    case "beanie":
      out.push(sitOn("beanie", FW * 1.26, T + up * 0.68));
      break;
    case "crown":
      out.push(sitOn("crown", FW * 0.62, T + up * 0.22));
      break;
    case "bow":
      out.push(item("bow", X + FW * 0.4, T + up * 0.18, FW * 0.46, 14, "acc-head"));
      break;
  }
  return out.filter((p): p is Part => !!p);
}

/** Every image of a full-body character in the 0 0 120 162 viewBox (feet on y 156): the body for this mood (the
    face is baked in, the outfit never changes) and the store items on its head. */
export function paintedParts(look: number, mood: PaintMood, eq: Equipped = {}): Part[] {
  const i = look | 0;
  const body = fit(`chars/c${i}-${mood}`, 60, 156, 112, 150) || fit(`chars/c${i}-idle`, 60, 156, 112, 150);
  if (!body) return [];
  const g = geoOf(i);
  const Y = (f: number) => body.y + f * body.h;
  return [{ ...body, cls: "pt-body" }, ...accessoryParts(eq, body.x + g.cx * body.w, Y(g.top), Y(g.eye), Y(g.chin), g.fw * body.h)];
}

/** The transform that frames the head and shoulders of the full-body layout in the avatar circle (viewBox 14 12 92 92).
    A hat taller than the window widens it upward, so it is never cut off by the circle. */
function bustTransform(look: number, eq: Equipped): string {
  const i = look | 0;
  const body = fit(`chars/c${i}-idle`, 60, 156, 112, 150);
  if (!body) return "";
  const g = geoOf(i);
  const [w0, f1] = bustWindow(i);
  const hatTop = Math.min(...paintedParts(i, "idle", eq).filter((p) => p.cls === "acc-head").map((p) => p.y));
  const f0 = Math.min(w0, (hatTop - body.y) / body.h - 0.02);
  const k = 92 / ((f1 - f0) * body.h);
  return `translate(60 12) scale(${k.toFixed(4)}) translate(${(-(body.x + g.cx * body.w)).toFixed(3)} ${(-(body.y + f0 * body.h)).toFixed(3)})`;
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
  const parts = paintedParts(look, mood, equipped);
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
          <g transform={variant === "bust" ? bustTransform(look, equipped) : undefined}>
            {parts.map((p, k) => (
              <image
                key={k}
                href={p.src}
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                className={p.cls}
                preserveAspectRatio="xMidYMax meet"
                transform={p.rot ? `rotate(${p.rot} ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined}
              />
            ))}
          </g>
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
export async function drawPainted(ctx: CanvasRenderingContext2D, look: number, eq: Equipped | undefined, W: number, mood: PaintMood = "idle") {
  const parts = paintedParts(look, mood, eq);
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
