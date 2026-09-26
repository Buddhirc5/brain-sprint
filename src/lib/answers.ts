/* =====================================================================
   Questions & answers.
   Players receive questions only. The canonical answer (mcq index "2",
   true/false "T"/"F", match/order comma-joined indices) is kept in the
   admin-only answer key and checked by the server when someone answers.
   ===================================================================== */
import type { Question, QType } from "../types";
import { shuffle } from "./util";

export const TYPE_LABEL: Record<QType, string> = { mcq: "Pick one", tf: "True or false?", match: "Match the pairs", order: "Put in order" };
export const TYPE_NAME: Record<QType, string> = { mcq: "Multiple choice", tf: "True / False", match: "Match pairs", order: "Put in order" };

/** Editable (unsealed) form of a question — only ever held by admins. */
export interface DraftQ {
  id: string;
  type: QType;
  topic: string;
  q: string;
  explain: string;
  options: string[];
  answer: number;
  tf: boolean;
  pairs: [string, string][];
  steps: string[];
  seconds?: number; // live quiz: time limit for this question
  img?: string; // optional picture (data: URL)
}

function notIdentity<T>(orig: T[]): T[] {
  if (orig.length < 2) return orig.slice();
  let s = shuffle(orig);
  let guard = 0;
  while (s.every((v, i) => v === orig[i]) && guard++ < 10) s = shuffle(orig);
  return s;
}
const sameSet = (a?: string[], b?: string[]) => !!a && !!b && a.length === b.length && [...a].sort().join("\u0001") === [...b].sort().join("\u0001");

/** Turn an admin's draft into the player-facing question plus its canonical answer.
 *  Match meanings and order steps are shuffled once and kept stable across edits. */
export function sealQuestion(d: DraftQ, prev?: Question): { q: Question; canon: string } {
  const base = { id: d.id, type: d.type, topic: d.topic, q: d.q, explain: d.explain || "", ...(d.seconds ? { seconds: d.seconds } : {}), ...(d.img ? { img: d.img } : {}) };
  if (d.type === "mcq") return { q: { ...base, options: d.options.slice() }, canon: String(d.answer) };
  if (d.type === "tf") return { q: { ...base }, canon: d.tf ? "T" : "F" };
  if (d.type === "match") {
    const left = d.pairs.map((p) => p[0]);
    const rights = d.pairs.map((p) => p[1]);
    const right = prev?.type === "match" && sameSet(prev.right, rights) ? prev.right!.slice() : notIdentity(rights);
    return { q: { ...base, left, right }, canon: rights.map((r) => right.indexOf(r)).join(",") };
  }
  const items = prev?.type === "order" && sameSet(prev.items, d.steps) ? prev.items!.slice() : notIdentity(d.steps);
  return { q: { ...base, items }, canon: d.steps.map((s) => items.indexOf(s)).join(",") };
}

export function unseal(q: Question, canon: string | undefined): DraftQ {
  const d: DraftQ = { id: q.id, type: q.type, topic: q.topic, q: q.q, explain: q.explain || "", options: ["", "", "", ""], answer: 0, tf: true, pairs: [], steps: [], seconds: q.seconds, ...(q.img ? { img: q.img } : {}) };
  const idx = (canon || "").split(",").map(Number);
  if (q.type === "mcq") {
    d.options = (q.options || []).slice();
    d.answer = Number(canon) || 0;
  } else if (q.type === "tf") d.tf = canon !== "F";
  else if (q.type === "match") d.pairs = (q.left || []).map((l, i) => [l, q.right?.[idx[i]] ?? ""]);
  else d.steps = idx.map((i) => q.items?.[i] ?? "");
  return d;
}

/** Human-readable version of a canonical answer or choice. */
export function choiceText(q: Question | undefined, c: string | null | undefined): string {
  if (c == null) return "Ran out of time";
  if (!q) return "—";
  if (q.type === "mcq") return q.options?.[Number(c)] ?? "—";
  if (q.type === "tf") return c === "T" ? "True" : "False";
  const idx = c.split(",").map(Number);
  if (q.type === "match") return (q.left || []).map((l, i) => `${l} → ${q.right?.[idx[i]] ?? "?"}`).join("; ");
  return idx.map((v, k) => `${k + 1}. ${q.items?.[v] ?? "?"}`).join("; ");
}

export function blankDraft(type: QType, topic: string, id: string): DraftQ {
  const d: DraftQ = { id, type, topic, q: "", explain: "", options: ["", "", "", ""], answer: 0, tf: true, pairs: [], steps: [] };
  if (type === "match") {
    d.q = "Match each term to its meaning";
    d.pairs = [["", ""], ["", ""], ["", ""]];
  }
  if (type === "order") {
    d.q = "Put these steps in the right order";
    d.steps = ["", "", "", ""];
  }
  return d;
}

/** Returns a problem description, or null when the draft can be saved. */
export function draftProblem(d: DraftQ, n: number): string | null {
  const at = `Question ${n}`;
  if (d.q.trim().length < 5) return `${at}: write the question text.`;
  if (d.type === "mcq") {
    const opts = d.options.map((o) => o.trim());
    if (opts.filter(Boolean).length < 2 || opts.some((o) => !o)) return `${at}: fill in every option.`;
    if (new Set(opts).size !== opts.length) return `${at}: options must be different from each other.`;
  }
  if (d.type === "match") {
    if (d.pairs.some((p) => !p[0].trim() || !p[1].trim())) return `${at}: fill in both sides of every pair.`;
    if (new Set(d.pairs.map((p) => p[1].trim())).size !== d.pairs.length) return `${at}: each meaning must be different.`;
  }
  if (d.type === "order") {
    if (d.steps.some((s) => !s.trim())) return `${at}: fill in every step.`;
    if (new Set(d.steps.map((s) => s.trim())).size !== d.steps.length) return `${at}: steps must be different.`;
  }
  return null;
}
