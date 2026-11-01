/* Profile card: a 1080×1350 image of a player's profile (type, role, trait shape and bars), made in the browser. */
import { TRAIT_COLORS, iconPath } from "../components/ProfileIcon";
import { typeOf } from "./profile";
import type { Branding, Game, ProfileResult } from "../types";

const W = 1080, H = 1350, INK = "#161512";

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

export async function drawProfileCard(o: { g: Game; r: ProfileResult; name: string; company: string; branding: Branding }): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load('400 100px "Anton"'), document.fonts.load('800 40px "Figtree"'), document.fonts.load('600 40px "Figtree"')]).catch(() => undefined);
  const meta = o.g.profile!;
  const t = typeOf(meta, o.r);
  const [a, b] = o.r.top;
  const ca = TRAIT_COLORS[a % 6], cb = TRAIT_COLORS[b % 6];
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // background: deep ink with the two trait colours glowing in the corners
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, col] of [[120, 160, ca], [960, 520, cb]] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 520);
    g.addColorStop(0, col + "AA");
    g.addColorStop(1, col + "00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // header
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.font = '800 32px "Figtree", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(o.company.toUpperCase().slice(0, 34), 80, 110);
  ctx.textAlign = "right";
  ctx.font = '600 30px "Figtree", sans-serif';
  ctx.fillText(o.g.title.slice(0, 40), W - 80, 110);

  // badges
  ctx.textAlign = "center";
  for (const [x, col, nm, r] of [[480, ca, meta.traits[a].icon, 78], [604, cb, meta.traits[b].icon, 64]] as const) {
    ctx.beginPath();
    ctx.arc(x, 250, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.stroke();
    icon(ctx, nm, x, 250, r * 1.05, "#fff");
  }

  // who and what
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.font = '700 38px "Figtree", sans-serif';
  ctx.fillText(o.name ? `${o.name.split(" ")[0]} is` : "I'm", W / 2, 400);
  ctx.fillStyle = "#fff";
  const nm = t.name.toUpperCase();
  fit(ctx, nm, (px) => `400 ${px}px "Anton", Impact, sans-serif`, W - 140, 132, 64);
  ctx.fillText(nm, W / 2, 530);
  ctx.font = '700 38px "Figtree", sans-serif';
  ctx.fillStyle = "#C6F432";
  fit(ctx, `Like a ${t.role}`, (px) => `700 ${px}px "Figtree", sans-serif`, W - 160, 38, 24);
  ctx.fillText(`Like a ${t.role}`, W / 2, 600);

  // trait bars
  const order = o.r.pct.map((_, i) => i).sort((x, y) => o.r.pct[y] - o.r.pct[x]);
  const top = 680, row = Math.min(108, 520 / order.length);
  order.forEach((i, k) => {
    const y = top + k * row;
    const col = TRAIT_COLORS[i % 6];
    rr(ctx, 80, y, W - 160, row - 18, 24);
    ctx.fillStyle = "rgba(255,255,255,.07)";
    ctx.fill();
    icon(ctx, meta.traits[i].icon, 130, y + (row - 18) / 2, 40, col);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = '800 34px "Figtree", sans-serif';
    ctx.fillText(meta.traits[i].name, 180, y + (row - 18) / 2 - 4);
    const bx = 180, bw = W - 160 - 200 - 120, by = y + (row - 18) / 2 + 12;
    rr(ctx, bx, by, bw, 14, 7);
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.fill();
    rr(ctx, bx, by, Math.max(14, (bw * o.r.pct[i]) / 100), 14, 7);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.textAlign = "right";
    ctx.font = '400 52px "Anton", Impact, sans-serif';
    ctx.fillStyle = o.r.top.includes(i) ? "#fff" : "rgba(255,255,255,.6)";
    ctx.fillText(`${o.r.pct[i]}%`, W - 110, y + (row - 18) / 2 + 18);
  });

  // footer
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = '700 28px "Figtree", sans-serif';
  ctx.fillText(`${o.branding.productName || "Ant Arena"} · Profile`, W / 2, H - 60);
  return c;
}
