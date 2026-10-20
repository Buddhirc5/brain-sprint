/* Bulk import for the quiz editor: rows pasted from Excel (tab-separated) or typed with | between
   columns. A row may start with a type word (MCQ, TF, MATCH, ORDER); rows without one use the
   original formats (multiple choice with a correct letter, or a TRUE/FALSE statement). */
import { blankDraft, type DraftQ } from "./answers";
import { cleanText } from "./security";
import { newId } from "./util";
import { LIVE } from "../api/engine";

export interface ImportResult {
  drafts: DraftQ[];
  skipped: { line: number; why: string }[];
}

const TYPE_WORDS: Record<string, DraftQ["type"]> = {
  mcq: "mcq", mc: "mcq", choice: "mcq", "multiple choice": "mcq",
  tf: "tf", "t/f": "tf", "true/false": "tf", "true false": "tf", truefalse: "tf",
  match: "match", pairs: "match", "match pairs": "match",
  order: "order", steps: "order", sequence: "order", "put in order": "order",
};
const WHY = /^(why|explanation|explain)\s*:\s*/i;
const PAIR = /\s*(?:=|->|→|=>)\s*/;
export const IMPORT_LIMITS = { options: [2, 5], liveOptions: 4, pairs: [2, 6], steps: [3, 6] } as const;

/** Columns of one row: tab-separated when the row has tabs (Excel), otherwise "|"; trailing blanks dropped. */
function cells(line: string) {
  const c = line.split(line.includes("\t") ? "\t" : "|").map((x) => x.trim());
  while (c.length && !c[c.length - 1]) c.pop();
  return c;
}

/** Split off a trailing "Why: …" explanation cell. */
function takeWhy(c: string[]): [string[], string] {
  const last = c[c.length - 1];
  return last && WHY.test(last) ? [c.slice(0, -1), last.replace(WHY, "")] : [c, ""];
}

export function parseImport(text: string, topics: string[], live: boolean): ImportResult {
  const drafts: DraftQ[] = [];
  const skipped: ImportResult["skipped"] = [];
  const topicOf = (s: string) => topics.find((t) => t.toLowerCase() === s.trim().toLowerCase()) || topics[0] || "General Knowledge";
  const extra = live ? { seconds: LIVE.defaultSeconds } : {};
  const q300 = (s: string) => cleanText(s, 300).trim();

  text.split(/\r?\n/).forEach((raw, ix) => {
    const line = ix + 1;
    if (!raw.trim()) return;
    let c = cells(raw);
    const kw = TYPE_WORDS[(c[0] || "").toLowerCase()];
    if (kw) c = c.slice(1);
    const skip = (why: string) => skipped.push({ line, why });
    if (c.length < 3) return skip("needs a topic, a question and at least one more column");
    const [topicCell, qText] = c;
    const rest = c.slice(2);
    const topic = topicOf(topicCell);

    // which type? the keyword, else guess from the shape (the original two formats)
    const type: DraftQ["type"] = kw || (/^(true|false|t|f)$/i.test(rest[0] || "") && rest.length <= 2 ? "tf" : "mcq");
    if (live && (type === "match" || type === "order")) return skip("live quizzes use multiple choice and true/false only");

    if (type === "tf") {
      const v = (rest[0] || "").toLowerCase();
      if (!/^(true|false|t|f)$/.test(v)) return skip("the answer column must be TRUE or FALSE");
      if (q300(qText).length < 5) return skip("write the statement");
      drafts.push({ ...blankDraft("tf", topic, newId("q")), q: q300(qText), tf: v.startsWith("t"), explain: q300((rest[1] || "").replace(WHY, "")), ...extra });
      return;
    }

    if (type === "mcq") {
      // options until the first cell that is just a letter A–E: that's the right answer; anything after is the explanation
      const at = rest.findIndex((x) => /^[a-e]$/i.test(x));
      if (at < 0) return skip("add the correct letter (A, B, C…) after the options");
      const opts = rest.slice(0, at).filter(Boolean).map((o) => cleanText(o, 140).trim());
      const max = live ? IMPORT_LIMITS.liveOptions : IMPORT_LIMITS.options[1];
      if (opts.length < 2) return skip("needs at least 2 options");
      if (opts.length > max) return skip(`${max} options at most${live ? " in a live quiz" : ""}`);
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return skip("options must be different");
      const ans = "ABCDE".indexOf(rest[at].toUpperCase());
      if (ans >= opts.length) return skip(`the correct letter ${rest[at].toUpperCase()} has no option`);
      if (q300(qText).length < 5) return skip("write the question");
      drafts.push({ ...blankDraft("mcq", topic, newId("q")), q: q300(qText), options: opts, answer: ans, explain: q300((rest[at + 1] || "").replace(WHY, "")), ...extra });
      return;
    }

    const [items, why] = takeWhy(rest);
    if (type === "match") {
      // the question cell may itself be a pair when the default wording is fine
      const qIsPair = PAIR.test(qText) && !/[?]$/.test(qText);
      const pairCells = (qIsPair ? [qText, ...items] : items).filter(Boolean);
      const pairs = pairCells.map((x) => x.split(PAIR));
      if (pairs.some((p) => p.length !== 2 || !p[0] || !p[1])) return skip("write each pair as  term = meaning");
      const [lo, hi] = IMPORT_LIMITS.pairs;
      if (pairs.length < lo || pairs.length > hi) return skip(`needs ${lo}–${hi} pairs`);
      if (new Set(pairs.map((p) => p[1].toLowerCase())).size !== pairs.length) return skip("each meaning must be different");
      const d = blankDraft("match", topic, newId("q"));
      drafts.push({ ...d, q: qIsPair ? d.q : q300(qText) || d.q, pairs: pairs.map(([a, b]) => [cleanText(a, 80).trim(), cleanText(b, 120).trim()] as [string, string]), explain: q300(why) });
      return;
    }

    // order: the steps in the right order
    const steps = items.filter(Boolean).map((s) => cleanText(s, 140).trim());
    const [lo, hi] = IMPORT_LIMITS.steps;
    if (steps.length < lo || steps.length > hi) return skip(`needs ${lo}–${hi} steps, in the right order`);
    if (new Set(steps.map((s) => s.toLowerCase())).size !== steps.length) return skip("steps must be different");
    const d = blankDraft("order", topic, newId("q"));
    drafts.push({ ...d, q: q300(qText) || d.q, steps, explain: q300(why) });
  });
  return { drafts, skipped };
}
