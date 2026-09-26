/* Shared bits of the live quiz: answer tiles (colour + shape, so colour is never the only cue),
   the question clock, and small formatting helpers. */
import { useEffect, useState } from "react";
import type { LiveSession, Question } from "../types";

/** Fixed, accessible tile palette — white text/shapes on every colour (≥ 4.5:1). */
export const TILES = [
  { key: "red", color: "#C8102E", shape: "tri", name: "Triangle" },
  { key: "blue", color: "#1459C7", shape: "dia", name: "Diamond" },
  { key: "gold", color: "#A15C00", shape: "cir", name: "Circle" },
  { key: "green", color: "#17803A", shape: "sq", name: "Square" },
] as const;

export function Shape({ i, size = 28 }: { i: number; size?: number }) {
  const s = TILES[i % 4].shape;
  return (
    <svg className="lv-shape" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      {s === "tri" && <path d="M20 4 L37 34 H3 Z" fill="currentColor" />}
      {s === "dia" && <path d="M20 2 L37 20 L20 38 L3 20 Z" fill="currentColor" />}
      {s === "cir" && <circle cx="20" cy="20" r="17" fill="currentColor" />}
      {s === "sq" && <rect x="4" y="4" width="32" height="32" rx="3" fill="currentColor" />}
    </svg>
  );
}

/** Answer options as the player sees them. True/false uses T/F choices on two tiles. */
export function optionsOf(q: Question | undefined): { label: string; choice: string }[] {
  if (!q) return [];
  if (q.type === "tf") return [{ label: "True", choice: "T" }, { label: "False", choice: "F" }];
  return (q.options || []).map((label, i) => ({ label, choice: String(i) }));
}
/** Tile index for a choice (tf: True = blue diamond, False = red triangle, like the classic). */
export const tileOf = (q: Question | undefined, idx: number) => (q?.type === "tf" ? (idx === 0 ? 1 : 0) : idx);
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
