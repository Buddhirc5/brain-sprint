/* Draws a player's character (the same Chibi SVG the app uses everywhere) onto a canvas, so the 3D map
   can show it as a sprite that always faces the camera. Cached per look + outfit. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasTexture, SRGBColorSpace } from "three";
import { Chibi } from "../../components/Chibi";
import type { Equipped } from "../../types";

export const CHIBI_ASPECT = 120 / 162; // width / height of the full-body character

const cache = new Map<string, Promise<CanvasTexture>>();

export function chibiTexture(look: number, equipped: Equipped | undefined, mood: "idle" | "happy" = "idle"): Promise<CanvasTexture> {
  const id = `${look}|${mood}|${JSON.stringify(equipped || {})}`;
  let p = cache.get(id);
  if (!p) {
    p = draw(look, equipped, mood);
    cache.set(id, p);
  }
  return p;
}

async function draw(look: number, equipped: Equipped | undefined, mood: "idle" | "happy"): Promise<CanvasTexture> {
  const W = 180, H = Math.round(W / CHIBI_ASPECT);
  let svg = renderToStaticMarkup(createElement(Chibi, { look, equipped, mood, variant: "full", size: W, still: true }));
  if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  img.decoding = "async";
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode().catch(() => new Promise((r) => (img.onload = r)));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.getContext("2d")!.drawImage(img, 0, 0, W, H);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}
