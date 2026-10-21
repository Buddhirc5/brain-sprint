/* Draws a player's character (the same Chibi SVG the app uses everywhere) onto a canvas, so the 3D map
   can show it as a sprite that always faces the camera. Cached per look + outfit. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasTexture, SRGBColorSpace } from "three";
import { Chibi } from "../../components/Chibi";
import { companionSvg } from "../../components/Companions";
import type { Equipped } from "../../types";
// the arm, body and head pivots live in this stylesheet, so the drawn image needs it too
import chibiCss from "../../styles/chibi.css?raw";

export const PET_ASPECT = 100 / 80;
export const RIDE_ASPECT = 140 / 60;

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
  svg = svg.replace(/(<svg[^>]*>)/, `$1<style>${chibiCss.replace(/</g, "")}</style>`);
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

/** A pet or ride from the store as a texture (same SVG as in the app). */
export function companionTexture(kind: "pet" | "ride", id: string): Promise<CanvasTexture> | null {
  const el = companionSvg(kind, id);
  if (!el) return null;
  const key = `${kind}:${id}`;
  let p = cache.get(key);
  if (!p) {
    const W = kind === "pet" ? 200 : 280, H = Math.round(W / (kind === "pet" ? PET_ASPECT : RIDE_ASPECT));
    p = (async () => {
      let svg = renderToStaticMarkup(el);
      if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode().catch(() => new Promise((r) => (img.onload = r)));
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      c.getContext("2d")!.drawImage(img, 0, 0, W, H);
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      return t;
    })();
    cache.set(key, p);
  }
  return p;
}
