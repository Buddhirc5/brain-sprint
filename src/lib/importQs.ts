/* Bulk import for the quiz editor: rows pasted from Excel (tab-separated) or typed with | between
   columns. A row may start with a type word (MCQ, TF, MATCH, ORDER, SWIPE, BUCKET); rows without one
   use the original formats (multiple choice with a correct letter, or a TRUE/FALSE statement).
   A case study is a block of rows, from a STORY row to END (or the next question):
     STORY  | topic | title
     INTRO  | where and when it happens
     SCENE  | customer · manager · colleague · narrator | name (optional) | what is said
     CHOICE | Best · Okay · Poor | the reply | what happens next      (2–3 per scene)
     ENDING | Best · Good · Learn | custom ending text                 (optional)
     WHY    | the lesson
     END */
import { blankDraft, draftProblem, LIMITS, type DraftQ, type DraftScene } from "./answers";
import { MOOD_WORDS, parseLook, parseScript, whoOfRole, type CastMember } from "./storyScript";
import type { StoryWho } from "../types";
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
  swipe: "swipe", "swipe sort": "swipe",
  bucket: "bucket", buckets: "bucket", "sort into buckets": "bucket", categories: "bucket",
  story: "story", "case study": "story", scenario: "story",
};
const STORY_ROWS = ["intro", "cast", "scene", "choice", "reply", "ending", "why", "lesson", "end"];
const WHO_WORDS: Record<string, StoryWho> = { customer: "customer", client: "customer", manager: "manager", boss: "manager", colleague: "colleague", coworker: "colleague", teammate: "colleague", narrator: "narrator", narration: "narrator", scene: "narrator" };
const QUALITY: Record<string, 0 | 1 | 2> = { best: 2, great: 2, "2": 2, "✓": 2, okay: 1, ok: 1, good: 1, "1": 1, poor: 0, bad: 0, worst: 0, "0": 0, "✕": 0 };
const ENDING_IX: Record<string, number> = { best: 0, star: 0, good: 1, save: 1, okay: 1, learn: 2, lesson: 2, poor: 2 };
const SIDES = /\s*(?:\/|\bvs\.?(?=\s))\s*/i;
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
  // Story Mode scripts ("Title: …" then "Name (mood): …" scenes) can sit among the rows: each runs from its
  // Title line to the next typed row (MCQ | …, STORY | …)
  const all = text.split(/\r?\n/);
  const isRow = (l: string) => /^\s*(mcq|mc|tf|match|order|swipe|bucket|story|case study|scenario)\s*(\||\t)/i.test(l);
  const scriptLines = new Set<number>();
  const scripts: { from: number; text: string }[] = [];
  for (let i = 0; i < all.length; i++) {
    if (!/^\s*(title\s*:|# )/i.test(all[i])) continue;
    let j = i;
    while (j + 1 < all.length && !isRow(all[j + 1]) && !/^\s*(title\s*:|# )/i.test(all[j + 1])) j++;
    for (let k = i; k <= j; k++) scriptLines.add(k);
    scripts.push({ from: i, text: all.slice(i, j + 1).join("\n") });
    i = j;
  }
  const fromScripts: ImportResult = { drafts: [], skipped: [] };
  for (const sc of scripts) {
    if (live) {
      fromScripts.skipped.push({ line: sc.from + 1, why: "live quizzes use multiple choice and true/false only" });
      continue;
    }
    const r = parseScript(sc.text, topics);
    fromScripts.drafts.push(...r.drafts);
    fromScripts.skipped.push(...r.problems.map((x) => ({ line: x.line + sc.from, why: x.why })));
  }
  if (scripts.length) text = all.map((l, i) => (scriptLines.has(i) ? "" : l)).join("\n");
  const drafts: DraftQ[] = [];
  const skipped: ImportResult["skipped"] = [];
  const topicOf = (s: string) => topics.find((t) => t.toLowerCase() === s.trim().toLowerCase()) || topics[0] || "General Knowledge";
  const extra = live ? { seconds: LIVE.defaultSeconds } : {};
  const q300 = (s: string) => cleanText(s, 300).trim();

  // the case study being read, row by row
  let story: { line: number; d: DraftQ; bad: string } | null = null;
  const closeStory = () => {
    if (!story) return;
    const { line, d, bad } = story;
    story = null;
    const why = bad || draftProblem(d, 1)?.replace(/^Question 1,?\s*/, "").replace(/^:\s*/, "");
    if (why) skipped.push({ line, why: bad && live ? why : `case study: ${why}` });
    else drafts.push(d);
  };

  text.split(/\r?\n/).forEach((raw, ix) => {
    const line = ix + 1;
    if (!raw.trim()) return;
    let c = cells(raw);
    const head = (c[0] || "").toLowerCase();
    // inside a case study: its own rows
    if (story && STORY_ROWS.includes(head)) {
      readStoryRow(story, head, c.slice(1));
      if (head === "end") closeStory();
      return;
    }
    closeStory();
    const kw = TYPE_WORDS[head];
    if (kw) c = c.slice(1);
    const skip = (why: string) => skipped.push({ line, why });
    if (kw === "story") {
      const d = blankDraft("story", topicOf(c[0] || ""), newId("q"));
      d.q = q300(c[1] || "");
      d.story = { intro: "", scenes: [], endings: ["", "", ""] };
      // a live quiz still reads the whole block, so its rows are skipped as one
      story = { line, d, bad: live ? "live quizzes use multiple choice and true/false only" : c.length < 2 ? "write  STORY | topic | title" : "" };
      return;
    }
    if (c.length < 3) return skip("needs a topic, a question and at least one more column");
    const [topicCell, qText] = c;
    const rest = c.slice(2);
    const topic = topicOf(topicCell);

    // which type? the keyword, else guess from the shape (the original two formats)
    const type: DraftQ["type"] = kw || (/^(true|false|t|f)$/i.test(rest[0] || "") && rest.length <= 2 ? "tf" : "mcq");
    if (live && type !== "mcq" && type !== "tf") return skip("live quizzes use multiple choice and true/false only");

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
    if (type === "swipe" || type === "bucket") {
      // the first cell names the sides / buckets ("Risky / Safe"), unless it's already an item
      const named = items[0] && !PAIR.test(items[0]) ? items[0].split(SIDES).map((x) => cleanText(x, 40).trim()).filter(Boolean) : [];
      const labels = named.length ? named : type === "swipe" ? ["Risky", "Safe"] : [];
      const rows = (named.length ? items.slice(1) : items).filter(Boolean).map((x) => x.split(PAIR));
      if (rows.some((r) => r.length !== 2 || !r[0] || !r[1])) return skip(`write each ${type === "swipe" ? "card" : "item"} as  text = ${type === "swipe" ? "side" : "bucket"}`);
      const pick = (v: string) => {
        const t = v.trim().toLowerCase();
        const byName = labels.findIndex((l) => l.toLowerCase() === t);
        if (byName >= 0) return byName;
        if (type === "swipe") return /^(l|left|1|←)$/.test(t) ? 0 : /^(r|right|2|→)$/.test(t) ? 1 : -1;
        if (/^[a-c]$/.test(t)) return t.charCodeAt(0) - 97;
        return /^[1-3]$/.test(t) ? Number(t) - 1 : -1;
      };
      const d = blankDraft(type, topic, newId("q"));
      d.q = q300(qText) || d.q;
      d.explain = q300(why);
      if (type === "swipe") {
        if (labels.length !== 2) return skip("name the two sides, like  Risky / Safe");
        d.sides = [labels[0], labels[1]];
        const cards = rows.map(([t, v]) => ({ t: cleanText(t, 140).trim(), side: pick(v) }));
        const badSide = cards.find((x) => x.side < 0);
        if (badSide) return skip(`"${badSide.t}" — the side must be ${labels[0]}, ${labels[1]}, L or R`);
        d.cards = cards.map((x) => ({ t: x.t, side: x.side as 0 | 1 }));
      } else {
        if (labels.length < LIMITS.buckets[0] || labels.length > LIMITS.buckets[1]) return skip("name 2–3 buckets, like  Public / Internal / Confidential");
        d.buckets = labels;
        const things = rows.map(([t, v]) => ({ t: cleanText(t, 100).trim(), b: pick(v) }));
        const badB = things.find((x) => x.b < 0 || x.b >= labels.length);
        if (badB) return skip(`"${badB.t}" — the bucket must be one of: ${labels.join(", ")} (or A–${"ABC"[labels.length - 1]})`);
        d.things = things;
      }
      const p = draftProblem(d, 1);
      if (p) return skip(p.replace(/^Question 1:\s*/, ""));
      drafts.push(d);
      return;
    }
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
  closeStory();
  return { drafts: [...drafts, ...fromScripts.drafts], skipped: [...skipped, ...fromScripts.skipped].sort((x, y) => x.line - y.line) };
}

/** One row inside a STORY block. Problems are kept so the whole case study is skipped with a reason.
 *  CAST | name | role | look        SCENE | who or role | name | words | mood | look
 *  CHOICE | Best | reply | what happens | mood */
function readStoryRow(st: { d: DraftQ; bad: string; cast?: Map<string, CastMember> }, head: string, c: string[]) {
  const s = st.d.story!;
  const cast = (st.cast ||= new Map());
  const fail = (why: string) => void (st.bad ||= why);
  const scene = s.scenes[s.scenes.length - 1] as DraftScene | undefined;
  const moodOf = (x?: string) => (x ? MOOD_WORDS[x.trim().toLowerCase()] : undefined);
  if (head === "intro") s.intro = cleanText(c.join(" "), 400).trim();
  else if (head === "why" || head === "lesson") st.d.explain = cleanText(c.join(" "), 300).trim();
  else if (head === "cast") {
    if (!c[0]) return fail("CAST rows look like  CAST | name | role | look");
    const m: CastMember = { who: c[1] ? whoOfRole(c[1]) : "customer", ...(c[1] ? { role: c[1].trim() } : {}) };
    if (c[2]) {
      const lk = parseLook(c[2]);
      if (lk == null) return fail(`looks are numbered 1 and up (or wren / puff), not “${c[2]}”`);
      m.look = lk;
    }
    cast.set(c[0].trim().toLowerCase(), m);
  } else if (head === "scene") {
    if (s.scenes.length >= LIMITS.scenes[1]) return fail(`${LIMITS.scenes[1]} scenes at most`);
    const first = (c[0] || "").trim();
    const narr = /^(narrator|narration|scene)$/i.test(first);
    // SCENE | who/role | name | words | mood | look — or SCENE | narrator | words — or SCENE | words
    const known = narr || WHO_WORDS[first.toLowerCase()] != null || c.length >= 3;
    const [name, say, mood, look] = narr
      ? ["", c.slice(1).join(" "), undefined, undefined]
      : known && c.length >= 3
        ? [c[1] || "", c[2] ?? "", c[3], c[4]]
        : known
          ? ["", c[1] ?? "", undefined, undefined]
          : ["", c.join(" "), undefined, undefined];
    const m: CastMember = { ...(cast.get(name.trim().toLowerCase()) || { who: narr ? "narrator" : first ? whoOfRole(first) : "customer", ...(first && !narr && !WHO_WORDS[first.toLowerCase()] ? { role: first } : {}) }) };
    if (mood && !moodOf(mood)) return fail(`unknown mood “${mood}”`);
    if (look) {
      const lk = parseLook(look);
      if (lk == null) return fail(`looks are numbered 1 and up (or wren / puff), not “${look}”`);
      m.look = lk;
    }
    s.scenes.push({
      who: narr ? "narrator" : m.who === "narrator" ? "customer" : m.who,
      name: narr ? "" : cleanText(name, 30).trim(),
      ...(narr || !m.role ? {} : { role: cleanText(m.role, 30) }),
      ...(narr || m.look == null ? {} : { look: m.look }),
      ...(!narr && moodOf(mood) ? { mood: moodOf(mood) } : {}),
      say: cleanText(say, 300).trim(),
      choices: [],
    });
  } else if (head === "choice" || head === "reply") {
    if (!scene) return fail("put a SCENE row before its CHOICE rows");
    const q = QUALITY[(c[0] || "").toLowerCase()];
    if (q === undefined) return fail("start each CHOICE with Best, Okay or Poor");
    if (scene.choices.length >= LIMITS.replies[1]) return fail(`${LIMITS.replies[1]} choices per scene at most`);
    if (c[3] && !moodOf(c[3])) return fail(`unknown mood “${c[3]}”`);
    const mood = moodOf(c[3]);
    scene.choices.push({ q, t: cleanText(c[1] || "", 160).trim(), then: cleanText(c[2] || "", 200).trim(), ...(mood ? { mood } : {}) });
  } else if (head === "ending") {
    const k = ENDING_IX[(c[0] || "").toLowerCase()];
    if (k === undefined) return fail("start each ENDING with Best, Good or Learn");
    s.endings[k] = cleanText(c.slice(1).join(" "), 200).trim();
  }
}
