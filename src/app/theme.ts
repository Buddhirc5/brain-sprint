/* White-label theming: a tenant's brand colours become the CSS variables the whole UI uses.
   --lime* = primary (light, dark text on it), --orange* = accent (dark enough for white text). */
import type { Branding } from "../types";
import { DEFAULT_BRANDING } from "../api/engine";
import { mix } from "../lib/util";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const okHex = (s: string) => HEX.test(s);

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Problems with a brand palette (null = fine). Keeps text readable whatever colours a client picks. */
export function brandProblems(b: Branding): string | null {
  for (const k of ["primary", "accent", "ink", "paper"] as const) if (!okHex(b[k])) return `${k} must be a colour like #1A2B3C`;
  if (contrast(b.primary, b.ink) < 4.5) return "Primary colour is too dark for dark text on it — pick a lighter shade.";
  if (contrast(b.accent, "#FFFFFF") < 3) return "Accent colour is too light for white text on it — pick a deeper shade.";
  if (contrast(b.ink, b.paper) < 7) return "Ink and background need more contrast.";
  if (contrast(b.ink, "#FFFFFF") < 10) return "Ink should be a very dark colour.";
  return null;
}

export function applyBranding(b: Partial<Branding> | undefined) {
  const x = { ...DEFAULT_BRANDING, ...(b || {}) };
  const ok = !brandProblems(x);
  const v = ok ? x : DEFAULT_BRANDING;
  const r = document.documentElement.style;
  r.setProperty("--lime", v.primary);
  r.setProperty("--lime-2", mix(v.primary, "#000000", 0.08));
  r.setProperty("--lime-deep", mix(v.primary, "#000000", 0.25));
  r.setProperty("--lime-soft", mix(v.primary, "#FFFFFF", 0.7));
  r.setProperty("--orange", v.accent);
  r.setProperty("--orange-soft", mix(v.accent, "#FFFFFF", 0.82));
  r.setProperty("--orange-deep", mix(v.accent, "#000000", 0.25));
  r.setProperty("--ink", v.ink);
  r.setProperty("--ink-2", mix(v.ink, "#FFFFFF", 0.18));
  r.setProperty("--paper", v.paper);
  r.setProperty("--paper-2", mix(v.paper, v.ink, 0.06));
  r.setProperty("--line", mix(v.paper, v.ink, 0.12));
  const meta = document.querySelector('meta[name="theme-color"]') || Object.assign(document.head.appendChild(document.createElement("meta")), { name: "theme-color" });
  meta.setAttribute("content", v.paper);
}

export function setTitle(t: string) {
  document.title = t;
}
