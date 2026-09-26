/* =====================================================================
   Security helpers — all client-side controls live here so they are
   easy to review. Controls that must be server-enforced in production
   are marked [SERVER] and are listed in SECURITY.md.
   ===================================================================== */
import { LS } from "./util";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/** PBKDF2-SHA256 — used for the admin approval code (never stored in plain text). */
export async function pbkdf2(secret: string, saltHex: string, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  return hex(bits);
}
export const PBKDF2_ITER = 210_000; // OWASP 2023 guidance for PBKDF2-SHA256

/** Compare without early exit so timing does not leak how many characters matched. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ---------- approval-code strength ---------- */
export function codeProblems(code: string): string | null {
  if (code.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(code) || !/\d/.test(code)) return "Mix letters and numbers.";
  if (/^(.)\1+$/.test(code) || /12345678|password|sandeepa/i.test(code)) return "That code is too easy to guess.";
  return null;
}

/* ---------- brute-force lockout (per device) [SERVER: also rate-limit at the API] ---------- */
const LOCK_KEY = "bs.lock";
interface LockState {
  fails: number;
  until: number;
}
function readLock(): LockState {
  try {
    return JSON.parse(LS.get(LOCK_KEY) || "") as LockState;
  } catch {
    return { fails: 0, until: 0 };
  }
}
export function lockRemaining(): number {
  return Math.max(0, readLock().until - Date.now());
}
/** Returns ms locked for (0 when not locked yet). 5 free tries, then 1 min, 2, 4 … up to 15 min. */
export function recordFail(): number {
  const s = readLock();
  s.fails += 1;
  if (s.fails >= 5) {
    const step = s.fails - 5;
    const ms = Math.min(15 * 60_000, 60_000 * 2 ** step);
    s.until = Date.now() + ms;
  }
  LS.set(LOCK_KEY, JSON.stringify(s));
  return Math.max(0, s.until - Date.now());
}
export function clearFails() {
  LS.set(LOCK_KEY, null);
}
export const failsSoFar = () => readLock().fails;

/* ---------- input validation ---------- */
export const normEmpId = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
export const validEmpId = (s: string) => /^[A-Z0-9-]{3,12}$/.test(s);
export const cleanName = (s: string) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 40);
export const validName = (s: string) => /^[\p{L}][\p{L} .'-]{1,39}$/u.test(s);
/** Strip control / bidi-override characters that can disguise text, and cap the length. */
export function cleanText(s: string, max = 400): string {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "")
    .slice(0, max);
}

/* ---------- privacy: what other players see ---------- */
export const maskId = (id: string) => (id.length <= 2 ? "••" : "••" + id.slice(-2));
export function publicName(name: string, lastInitialOnly: boolean): string {
  if (!lastInitialOnly) return name;
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

/* ---------- CSV: neutralise spreadsheet formula injection ---------- */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCSV = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/* ---------- activity watch: idle timer ---------- */
export function onIdle(ms: number, fire: () => void): () => void {
  let t = window.setTimeout(fire, ms);
  const reset = () => {
    clearTimeout(t);
    t = window.setTimeout(fire, ms);
  };
  const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
  return () => {
    clearTimeout(t);
    evs.forEach((e) => window.removeEventListener(e, reset));
  };
}
