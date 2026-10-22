/* Shared bits of the live quiz ("Sprint Arena"): answer cards (colour + icon + letter),
   the question clock, and small formatting helpers. */
import { useEffect, useState, type CSSProperties } from "react";
import type { LiveSession, Question } from "../types";

/** "Sprint Arena" answer cards: brand colours + a unique icon + a letter, so colour is never the only cue.
 *  0–3 are the four multiple-choice cards, 4–5 are True / False. `ink` is the text colour on that card. */
export const TILES = [
  { key: "bolt", color: "#C6F432", ink: "#161512", glyph: "bolt", letter: "A", name: "Lightning" },
  { key: "star", color: "#FF5A1F", ink: "#161512", glyph: "star", letter: "B", name: "Star" },
  { key: "heart", color: "#3D7BFF", ink: "#161512", glyph: "heart", letter: "C", name: "Heart" },
  { key: "moon", color: "#FF7EB6", ink: "#161512", glyph: "moon", letter: "D", name: "Moon" },
  { key: "true", color: "#C6F432", ink: "#161512", glyph: "check", letter: "T", name: "True" },
  { key: "false", color: "#FF5A1F", ink: "#161512", glyph: "cross", letter: "F", name: "False" },
] as const;

const STAR = (() => {
  let d = "";
  for (let k = 0; k < 10; k++) {
    const a = (Math.PI / 5) * k - Math.PI / 2;
    const r = k % 2 ? 7.5 : 17;
    d += `${k ? "L" : "M"}${(20 + Math.cos(a) * r).toFixed(1)} ${(21 + Math.sin(a) * r).toFixed(1)} `;
  }
  return d + "Z";
})();

/** The icon on an answer card. */
export function Shape({ i, size = 28 }: { i: number; size?: number }) {
  const g = TILES[((i % TILES.length) + TILES.length) % TILES.length].glyph;
  return (
    <svg className="lv-shape" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      {g === "bolt" && <path d="M24 2 L7 23 H18.5 L15 38 L33 15 H21.5 Z" fill="currentColor" strokeLinejoin="round" />}
      {g === "star" && <path d={STAR} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
      {g === "heart" && <path d="M20 35 C8 26.5 3 19.5 3 12.8 C3 7.6 7 4 11.6 4 C15.2 4 18.3 6.2 20 9.3 C21.7 6.2 24.8 4 28.4 4 C33 4 37 7.6 37 12.8 C37 19.5 32 26.5 20 35 Z" fill="currentColor" />}
      {g === "moon" && <path d="M25 3.5 A17 17 0 1 0 37 27 A14 14 0 0 1 25 3.5 Z" fill="currentColor" />}
      {g === "check" && <path d="M7 21 L16 30 L33 10" fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />}
      {g === "cross" && <path d="M10 10 L30 30 M30 10 L10 30" fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />}
    </svg>
  );
}

/** CSS variables for a card in that tile's colours. */
export const tileVars = (t: number, i = 0) => ({ "--c": TILES[t].color, "--t": TILES[t].ink, "--i": i }) as CSSProperties;

/** Answer options as the player sees them. True/false uses T/F choices on two tiles. */
export function optionsOf(q: Question | undefined): { label: string; choice: string }[] {
  if (!q) return [];
  if (q.type === "tf") return [{ label: "True", choice: "T" }, { label: "False", choice: "F" }];
  return (q.options || []).map((label, i) => ({ label, choice: String(i) }));
}
/** Card index for a choice (true/false get their own tick and cross cards). */
export const tileOf = (q: Question | undefined, idx: number) => (q?.type === "tf" ? (idx === 0 ? 4 : 5) : idx);
export const choiceIndex = (q: Question | undefined, c: string) => (q?.type === "tf" ? (c === "T" ? 0 : c === "F" ? 1 : -1) : Number(c));

/** Re-render every `ms` while `on`. */
export function useNow(on: boolean, ms = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return now;
}

/** Remaining ms of the current question (0 when not in a question). */
export function remainingMs(s: LiveSession | undefined, now: number) {
  if (!s || s.state !== "question") return 0;
  const end = s.qStartedAt + s.qSeconds * 1000;
  return Math.max(0, Math.min(s.qSeconds * 1000, end - now));
}

export function ordinal(n: number) {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return n + suf;
}

export const fmtPts = (n: number) => n.toLocaleString();

/** Race mode answering time: 83 400 ms → "1:23" */
export const fmtRaceTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
