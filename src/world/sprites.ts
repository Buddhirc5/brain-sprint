/* =====================================================================
   Sprites for Knowledge World.
   - Characters: the app's own cartoon characters (components/Chibi.tsx)
     rendered to SVG, turned into paper cut-outs (white cut edge + shadow)
     with a real leg-swing walk cycle baked into frames.
   - Cars: drawn live in the same paper style so they can tilt, bounce and
     flip, with the player visible through the window.
   ===================================================================== */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chibi, Sprinty } from "../components/Chibi";
import type { Equipped } from "../types";
import { PAL, SHADOW } from "./paper";
import type { CarSpec } from "./city";

/** A baked cut-out: canvas + the SVG box it came from and where the feet are. */
export interface Sprite {
  c: HTMLCanvasElement;
  vw: number;
  vh: number;
  feet: number; // y of the feet in SVG units
}
export interface CharSprites {
  idle: Sprite;
  walk: Sprite[];
  jump: Sprite;
}
const PAD = 6; // cut-out padding in SVG units

const RES = 3; // bake at 3× so it stays crisp on retina + zoom
const SVG_CSS =
  ".arm{transform-box:view-box}.arm-l{transform-origin:38px 97px}.arm-r{transform-origin:82px 97px}" +
  ".sprinty .arm-l{transform-origin:26px 74px}.sprinty .arm-r{transform-origin:94px 74px}.shadow{display:none}";

function toSvg(markup: string) {
  return markup.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" `).replace(/(<svg[^>]*>)/, `$1<style>${SVG_CSS}</style>`);
}

function loadImg(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("sprite failed to load"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/** White "cut paper" border + a soft drop shadow around an image. */
function cutout(img: HTMLImageElement, w: number, h: number, feet: number): Sprite {
  const pad = PAD * RES;
  const W = w * RES + pad * 2;
  const H = h * RES + pad * 2;
  const sil = document.createElement("canvas");
  sil.width = W;
  sil.height = H;
  const s = sil.getContext("2d")!;
  s.drawImage(img, pad, pad, w * RES, h * RES);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = "#fff";
  s.fillRect(0, 0, W, H);

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // shadow (offset, tinted silhouette)
  g.globalAlpha = 0.2;
  g.filter = "brightness(0)";
  g.drawImage(sil, 3 * RES, 3 * RES);
  g.filter = "none";
  g.globalAlpha = 1;
  // paper edge
  const e = 2.2 * RES;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.drawImage(sil, Math.cos(a) * e, Math.sin(a) * e);
  }
  g.drawImage(img, pad, pad, w * RES, h * RES);
  return { c, vw: w, vh: h, feet };
}

function legs(markup: string, left: number, right: number) {
  return markup
    .replace(/<rect x="44" y="128"/, `<rect transform="rotate(${left} 50 128)" x="44" y="128"`)
    .replace(/<ellipse cx="49" cy="152"/, `<ellipse transform="rotate(${left} 50 128)" cx="49" cy="152"`)
    .replace(/<rect x="63" y="128"/, `<rect transform="rotate(${right} 70 128)" x="63" y="128"`)
    .replace(/<ellipse cx="71" cy="152"/, `<ellipse transform="rotate(${right} 70 128)" cx="71" cy="152"`)
    .replace(/<path d="M40 154 L58 154 M62 154 L80 154"[^>]*\/>/, "");
}

export async function characterSprites(look: number, equipped?: Equipped): Promise<CharSprites> {
  const base = (mood: "idle" | "cheer" | "happy") => renderToStaticMarkup(createElement(Chibi, { look, equipped, variant: "full", mood, still: true, size: 120 }));
  const idleM = base("idle");
  const walkM = base("happy");
  const jumpM = base("cheer");
  const svgs = [
    toSvg(idleM),
    ...[24, 6, -24, -6].map((a) => toSvg(legs(walkM, a, -a))),
    toSvg(legs(jumpM, -28, 22)),
  ];
  const imgs = await Promise.all(svgs.map(loadImg));
  const [idle, w0, w1, w2, w3, jump] = imgs.map((i) => cutout(i, 120, 162, 157));
  return { idle, walk: [w0, w1, w2, w3], jump };
}

export async function sprintySprite(): Promise<Sprite> {
  const img = await loadImg(toSvg(renderToStaticMarkup(createElement(Sprinty, { mood: "cheer", still: true, size: 120 }))));
  return cutout(img, 120, 130, 124);
}

/** Draws a sprite `width` world units wide with its feet at (0,0) of the current transform. */
export function drawSprite(ctx: CanvasRenderingContext2D, sp: Sprite, width: number) {
  const k = width / sp.vw;
  ctx.drawImage(sp.c, -(PAD + sp.vw / 2) * k, -(PAD + sp.feet) * k, (sp.vw + PAD * 2) * k, (sp.vh + PAD * 2) * k);
}

/* ---------------- cars ---------------- */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bodyPath(ctx: CanvasRenderingContext2D, kind: CarSpec["body"]) {
  ctx.beginPath();
  if (kind === "sport") {
    ctx.moveTo(-74, 8);
    ctx.lineTo(-76, -10);
    ctx.lineTo(-40, -16);
    ctx.lineTo(-18, -38);
    ctx.lineTo(24, -38);
    ctx.lineTo(48, -16);
    ctx.lineTo(76, -10);
    ctx.lineTo(78, 8);
  } else if (kind === "buggy") {
    ctx.moveTo(-62, 4);
    ctx.lineTo(-64, -20);
    ctx.lineTo(-30, -22);
    ctx.lineTo(40, -22);
    ctx.lineTo(66, -10);
    ctx.lineTo(66, 4);
  } else {
    ctx.moveTo(-66, 10);
    ctx.lineTo(-68, -22);
    ctx.lineTo(-56, -50);
    ctx.lineTo(18, -50);
    ctx.lineTo(42, -22);
    ctx.lineTo(68, -18);
    ctx.lineTo(70, 10);
  }
  ctx.closePath();
}

function windowPath(ctx: CanvasRenderingContext2D, kind: CarSpec["body"]) {
  ctx.beginPath();
  if (kind === "sport") {
    ctx.moveTo(-14, -34);
    ctx.lineTo(20, -34);
    ctx.lineTo(38, -17);
    ctx.lineTo(-32, -17);
  } else if (kind === "buggy") {
    ctx.moveTo(-40, -22);
    ctx.lineTo(-36, -64);
    ctx.lineTo(22, -64);
    ctx.lineTo(36, -22);
  } else {
    ctx.moveTo(-50, -44);
    ctx.lineTo(14, -44);
    ctx.lineTo(34, -23);
    ctx.lineTo(-56, -23);
  }
  ctx.closePath();
}

export interface CarDraw {
  spec: CarSpec;
  wheels: { x: number; y: number }[]; // wheel centres in the car's local frame (suspension already applied)
  spin: number;
  driver: Sprite | null;
  lights: number; // 0…1 night headlights
  boost: boolean;
  t: number;
}

/** Car in its local frame: facing +x, origin at the body centre. */
export function drawCar(ctx: CanvasRenderingContext2D, d: CarDraw) {
  const { spec } = d;
  // wheels behind the body
  for (const w of d.wheels) drawWheel(ctx, w.x, w.y, spec.wheelR, d.spin, spec.body === "buggy");
  // shadow, body, trim
  ctx.save();
  ctx.translate(4, 4);
  bodyPath(ctx, spec.body);
  ctx.fillStyle = SHADOW;
  ctx.fill();
  ctx.restore();
  if (spec.body === "buggy") {
    // roll cage
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-44, -20);
    ctx.lineTo(-38, -66);
    ctx.lineTo(24, -66);
    ctx.lineTo(40, -20);
    ctx.stroke();
  }
  bodyPath(ctx, spec.body);
  ctx.fillStyle = spec.color;
  ctx.fill();
  // lower trim stripe
  ctx.save();
  bodyPath(ctx, spec.body);
  ctx.clip();
  ctx.fillStyle = spec.trim;
  ctx.fillRect(-90, spec.body === "sport" ? -4 : -6, 180, 5);
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.fillRect(-90, spec.body === "hatch" ? -48 : -36, 180, 6);
  ctx.restore();
  // window + driver
  if (d.driver) {
    ctx.save();
    windowPath(ctx, spec.body);
    ctx.fillStyle = spec.body === "buggy" ? "rgba(163,219,255,.25)" : PAL.glass;
    ctx.fill();
    ctx.clip();
    ctx.translate(-12, spec.body === "sport" ? 16 : spec.body === "buggy" ? 8 : 10);
    drawSprite(ctx, d.driver, 58);
    ctx.restore();
  } else {
    windowPath(ctx, spec.body);
    ctx.fillStyle = spec.body === "buggy" ? "rgba(163,219,255,.25)" : PAL.glass;
    ctx.fill();
  }
  if (spec.body !== "buggy") {
    windowPath(ctx, spec.body);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fill();
  }
  // spoiler / details
  ctx.fillStyle = PAL.ink;
  if (spec.body === "sport") {
    ctx.fillRect(-80, -26, 22, 5);
    ctx.fillRect(-70, -22, 4, 12);
  }
  // lights
  ctx.fillStyle = PAL.light;
  rr(ctx, spec.body === "buggy" ? 58 : 62, -14, 10, 7, 3);
  ctx.fill();
  ctx.fillStyle = "#E5431A";
  rr(ctx, -72, -14, 7, 7, 2);
  ctx.fill();
  if (d.lights > 0.02) {
    const g = ctx.createRadialGradient(80, -10, 2, 150, -2, 120);
    g.addColorStop(0, `rgba(255,236,170,${0.55 * d.lights})`);
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(70, -12);
    ctx.lineTo(240, -70);
    ctx.lineTo(240, 60);
    ctx.closePath();
    ctx.fill();
  }
  if (d.boost) {
    const L = 26 + Math.sin(d.t * 60) * 8;
    ctx.fillStyle = PAL.yellow;
    ctx.beginPath();
    ctx.moveTo(-72, -12);
    ctx.lineTo(-72 - L, -6);
    ctx.lineTo(-72, 0);
    ctx.fill();
    ctx.fillStyle = PAL.orange;
    ctx.beginPath();
    ctx.moveTo(-72, -9);
    ctx.lineTo(-72 - L * 0.6, -6);
    ctx.lineTo(-72, -3);
    ctx.fill();
  }
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, chunky: boolean) {
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.arc(x + 3, y + 3, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (chunky) {
    ctx.strokeStyle = "#3B3A36";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = spin + (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.stroke();
    }
  }
  ctx.fillStyle = PAL.curb;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAL.ink2;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.46, y + Math.sin(a) * r * 0.46);
    ctx.stroke();
  }
}

/** Sprinty's go-kart for the race. */
export function drawKart(ctx: CanvasRenderingContext2D, sprinty: Sprite | null, spin: number) {
  drawWheel(ctx, -34, 10, 13, spin, false);
  drawWheel(ctx, 34, 10, 13, spin, false);
  ctx.fillStyle = SHADOW;
  rr(ctx, -46, -8, 96, 16, 7);
  ctx.fill();
  if (sprinty) {
    ctx.save();
    ctx.translate(-4, 2);
    drawSprite(ctx, sprinty, 56);
    ctx.restore();
  }
  ctx.fillStyle = PAL.lime;
  rr(ctx, -50, -12, 96, 16, 7);
  ctx.fill();
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-50, -2, 96, 4);
  ctx.fillStyle = PAL.ink;
  ctx.font = "900 9px Figtree, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = PAL.ink;
  ctx.fillText("SPRINTY", -2, -3);
}
