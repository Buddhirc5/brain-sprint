/* Award card: a 1080×1350 image (the 4:5 shape social apps show best) made in the browser for a Hall of Fame win.
   The winner and admins can download it or share it from their phone. Nothing is uploaded anywhere. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chibi } from "../components/Chibi";
import { drawPainted, loadImage, paintedLook } from "../components/Painted";
import chibiCss from "../styles/chibi.css?raw";
import type { Branding, Equipped, Gift } from "../types";

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardInput {
  gift: Gift;
  name: string; // player name, or the branch / department for a team win
  unit?: string;
  look?: number; // character (players only)
  equipped?: Equipped;
  company: string;
  branding: Branding;
}

const TITLE: Record<Gift["kind"], string> = { weekly: "Champion", improved: "Most improved", branch: "Team champion" };
/** "Champion" for #1, "#2 of the week" for the others; team and most improved by kind. */
export function awardTitle(g: Gift) {
  if (g.kind !== "weekly") return TITLE[g.kind];
  const r = Number(/#(\d+)/.exec(g.label)?.[1] || 1);
  return r === 1 ? "Champion" : `#${r} of the week`;
}

async function character(look: number, eq: Equipped | undefined, W: number): Promise<CanvasImageSource | null> {
  const H = Math.round(W * 1.4);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  if (paintedLook(look)) {
    await drawPainted(c.getContext("2d")!, look, eq, W, "cheer");
    return c;
  }
  let svg = renderToStaticMarkup(createElement(Chibi, { look, equipped: eq, mood: "happy", variant: "full", size: W, still: true }));
  if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  svg = svg.replace(/(<svg[^>]*>)/, `$1<style>${chibiCss.replace(/</g, "")}</style>`);
  const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)).catch(() => null);
  if (!img) return null;
  c.getContext("2d")!.drawImage(img, 0, 0, W, H);
  return c;
}

/** Shrink the font until the text fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, start: number, min: number) {
  let px = start;
  for (; px > min; px -= 4) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= max) break;
  }
  return px;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2, rr = k % 2 ? r * 0.32 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = "#161512";
  ctx.stroke();
  ctx.restore();
}

/** Draws the card. Returns the canvas (call toBlob / toDataURL on it). */
export async function drawAwardCard(o: CardInput): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load('400 100px "Anton"'), document.fonts.load('800 40px "Figtree"'), document.fonts.load('600 40px "Figtree"')]).catch(() => undefined);
  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext("2d")!;
  const ink = "#161512", accent = o.branding.primary || "#C6F432", orange = "#FF5A1F";
  const team = o.gift.kind === "branch";

  // paper, then the big accent panel with soft rings behind the hero
  ctx.fillStyle = "#F4F3EE";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = team ? ink : accent;
  roundRect(ctx, 48, 48, CARD_W - 96, 860, 56);
  ctx.fill();
  ctx.save();
  roundRect(ctx, 48, 48, CARD_W - 96, 860, 56);
  ctx.clip();
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.arc(540, 560, 180 + k * 110, 0, Math.PI * 2);
    ctx.strokeStyle = team ? "rgba(255,255,255,.07)" : "rgba(22,21,18,.07)";
    ctx.lineWidth = 34;
    ctx.stroke();
  }
  ctx.restore();

  // top line: company, then the award title
  ctx.fillStyle = team ? "#fff" : ink;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = '800 34px "Figtree", sans-serif';
  ctx.fillText(o.company.toUpperCase().slice(0, 34), 100, 128);
  ctx.textAlign = "right";
  ctx.font = '600 34px "Figtree", sans-serif';
  ctx.fillText(o.gift.period.slice(0, 26), CARD_W - 100, 128);
  ctx.textAlign = "center";
  const title = awardTitle(o.gift).toUpperCase();
  ctx.fillStyle = team ? accent : ink;
  fit(ctx, title, (px) => `400 ${px}px "Anton", Impact, sans-serif`, CARD_W - 200, 132, 70);
  ctx.fillText(title, 540, 270);

  // hero: the character (or a trophy for a team win)
  if (!team && o.look != null) {
    const ch = await character(o.look, o.equipped, 400);
    if (ch) ctx.drawImage(ch, 340, 300, 400, 560);
  } else {
    trophy(ctx, 540, 600, accent);
  }
  star(ctx, 236, 420, 44, "#FFD84D");
  star(ctx, 860, 360, 34, team ? accent : "#fff");
  star(ctx, 880, 760, 52, "#FFD84D");
  star(ctx, 200, 780, 28, orange);

  // the name and what they did
  ctx.fillStyle = ink;
  const nm = o.name.toUpperCase();
  fit(ctx, nm, (px) => `400 ${px}px "Anton", Impact, sans-serif`, CARD_W - 140, 120, 56);
  ctx.fillText(nm, 540, 1040);
  ctx.font = '700 40px "Figtree", sans-serif';
  ctx.fillStyle = "#3b3a35";
  const sub = [o.gift.label, !team && o.unit ? o.unit : ""].filter(Boolean).join(" · ");
  fit(ctx, sub, (px) => `700 ${px}px "Figtree", sans-serif`, CARD_W - 160, 40, 26);
  ctx.fillText(sub, 540, 1104);
  if (o.gift.prize) {
    ctx.font = '800 34px "Figtree", sans-serif';
    const w = Math.min(CARD_W - 200, ctx.measureText(o.gift.prize).width + 64);
    ctx.fillStyle = accent;
    roundRect(ctx, 540 - w / 2, 1140, w, 64, 32);
    ctx.fill();
    ctx.fillStyle = ink;
    fit(ctx, o.gift.prize, (px) => `800 ${px}px "Figtree", sans-serif`, w - 48, 34, 22);
    ctx.fillText(o.gift.prize, 540, 1184);
  }

  // footer: logo + product
  ctx.fillStyle = "rgba(22,21,18,.55)";
  ctx.font = '700 28px "Figtree", sans-serif';
  const foot = `${o.branding.productName || "Ant Arena"} · Hall of Fame`;
  let fx = 540;
  if (o.branding.logo) {
    const lg = await loadImage(o.branding.logo).catch(() => null);
    if (lg) {
      const h = 44, w = Math.min(160, (lg.width / lg.height) * h);
      const tw = ctx.measureText(foot).width;
      ctx.drawImage(lg, 540 - (tw + w + 16) / 2, 1258, w, h);
      fx = 540 + (w + 16) / 2;
    }
  }
  ctx.fillText(foot, fx, 1290);
  return c;
}

function trophy(ctx: CanvasRenderingContext2D, x: number, y: number, accent: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#161512";
  ctx.fillStyle = "#FFD84D";
  ctx.beginPath();
  ctx.moveTo(-150, -200);
  ctx.lineTo(150, -200);
  ctx.quadraticCurveTo(150, 40, 0, 70);
  ctx.quadraticCurveTo(-150, 40, -150, -200);
  ctx.fill();
  ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 150, -120, 60, s < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, s < 0 ? Math.PI * 1.5 : Math.PI * 0.5, s > 0);
    ctx.stroke();
  }
  ctx.fillRect(-26, 70, 52, 80);
  ctx.strokeRect(-26, 70, 52, 80);
  ctx.fillStyle = accent;
  roundRect(ctx, -110, 150, 220, 60, 14);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't make the image"))), "image/png"));
export const cardFileName = (o: CardInput) => `${(o.name || "award").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${o.gift.period.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;

export async function downloadCard(c: HTMLCanvasElement, name: string) {
  const url = URL.createObjectURL(await toBlob(c));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Phone share sheet (WhatsApp, Instagram…); false if this browser can't share files. */
export async function shareCard(c: HTMLCanvasElement, name: string, text: string): Promise<boolean> {
  const file = new File([await toBlob(c)], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], text });
  } catch {
    /* they closed the sheet */
  }
  return true;
}
