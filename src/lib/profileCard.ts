/* Profile card: a light 1080×1350 image of a player's profile — their character on a coloured disc,
   the type and role, and the trait bars — made in the browser. */
import { TRAIT_COLORS, iconPath } from "../components/ProfileIcon";
import { character } from "./awardCard";
import { typeOf } from "./profile";
import type { Branding, Equipped, Game, ProfileResult } from "../types";

const W = 1080, H = 1350, INK = "#161512", PAPER = "#F4F3EE";

function icon(ctx: CanvasRenderingContext2D, name: Parameters<typeof iconPath>[0], x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(iconPath(name)));
  ctx.restore();
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, start: number, min: number) {
  let px = start;
  for (; px > min; px -= 4) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= max) break;
  }
}
/** A colour mixed toward white (0 = colour, 1 = white). */
function tint(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return `rgb(${c.join(",")})`;
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2, rr2 = k % 2 ? r * 0.3 : r;
    ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export async function drawProfileCard(o: { g: Game; r: ProfileResult; name: string; look?: number; equipped?: Equipped; company: string; branding: Branding }): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load('400 100px "Anton"'), document.fonts.load('800 40px "Figtree"'), document.fonts.load('600 40px "Figtree"')]).catch(() => undefined);
  const meta = o.g.profile!;
  const t = typeOf(meta, o.r);
  const [a, b] = o.r.top;
  const ca = TRAIT_COLORS[a % 6], cb = TRAIT_COLORS[b % 6];
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // white card
  rr(ctx, 40, 40, W - 80, H - 80, 56);
  ctx.fillStyle = "#fff";
  ctx.fill();

  // header
  ctx.fillStyle = INK;
  ctx.font = '800 30px "Figtree", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(o.company.toUpperCase().slice(0, 30), 100, 120);
  ctx.textAlign = "right";
  ctx.fillStyle = "#6b6a63";
  ctx.font = '600 28px "Figtree", sans-serif';
  ctx.fillText(o.g.title.slice(0, 38), W - 100, 120);

  // stage: rays, disc, character, trait badges
  const cx = W / 2, cy = 400;
  ctx.save();
  for (let k = 0; k < 18; k++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 225, (k * 2 * Math.PI) / 18, ((k + 0.5) * 2 * Math.PI) / 18);
    ctx.closePath();
    ctx.fillStyle = tint(ca, 0.88);
    ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(cx - 50, cy - 60, 10, cx, cy, 175);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.55, tint(ca, 0.75));
  g.addColorStop(1, tint(cb, 0.6));
  ctx.beginPath();
  ctx.arc(cx, cy + 20, 165, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  if (o.look != null) {
    const ch = await character(o.look, o.equipped, 250).catch(() => null);
    if (ch) ctx.drawImage(ch, cx - 125, cy - 160, 250, 350);
  }
  for (const [x, y, col, nm, s] of [[cx - 250, cy - 20, ca, meta.traits[a].icon, 104], [cx + 250, cy - 90, cb, meta.traits[b].icon, 88]] as const) {
    rr(ctx, x - s / 2, y - s / 2, s, s, 28);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = col;
    ctx.stroke();
    icon(ctx, nm, x, y, s * 0.55, col);
  }
  star(ctx, cx + 230, cy + 110, 22, "#FFD84D");
  star(ctx, cx - 210, cy + 130, 16, ca);
  star(ctx, cx - 170, cy - 190, 13, cb);

  // who and what
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b6a63";
  ctx.font = '700 34px "Figtree", sans-serif';
  ctx.fillText(o.name ? `${o.name.split(" ")[0]} is` : "I'm", cx, 680);
  ctx.fillStyle = INK;
  const nm = t.name.toUpperCase();
  fit(ctx, nm, (px) => `400 ${px}px "Anton", Impact, sans-serif`, W - 180, 104, 56);
  ctx.fillText(nm, cx, 800);
  const role = `Like a ${t.role}`;
  fit(ctx, role, (px) => `800 ${px}px "Figtree", sans-serif`, W - 260, 32, 22);
  const rw = ctx.measureText(role).width + 56;
  rr(ctx, cx - rw / 2, 828, rw, 60, 30);
  ctx.fillStyle = o.branding.primary || "#C6F432";
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(role, cx, 870);

  // trait bars
  const order = o.r.pct.map((_, i) => i).sort((x, y) => o.r.pct[y] - o.r.pct[x]);
  const top = 930, row = Math.min(66, 300 / order.length);
  order.forEach((i, k) => {
    const y = top + k * row;
    const col = TRAIT_COLORS[i % 6];
    icon(ctx, meta.traits[i].icon, 140, y + 20, 34, col);
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = '800 28px "Figtree", sans-serif';
    ctx.fillText(meta.traits[i].name, 180, y + 30);
    const bx = 400, bw = W - 400 - 220, by = y + 12;
    rr(ctx, bx, by, bw, 18, 9);
    ctx.fillStyle = "#EEEDE7";
    ctx.fill();
    rr(ctx, bx, by, Math.max(18, (bw * o.r.pct[i]) / 100), 18, 9);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.textAlign = "right";
    ctx.font = '400 40px "Anton", Impact, sans-serif';
    ctx.fillStyle = o.r.top.includes(i) ? INK : "#8a8980";
    ctx.fillText(`${o.r.pct[i]}%`, W - 110, y + 36);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#8a8980";
  ctx.font = '700 26px "Figtree", sans-serif';
  ctx.fillText(`${o.branding.productName || "Ant Arena"} · Profile`, cx, H - 80);
  return c;
}
