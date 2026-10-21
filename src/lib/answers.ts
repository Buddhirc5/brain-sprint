/* =====================================================================
   Questions & answers.
   Players receive questions only. The canonical answer is kept in the
   admin-only answer key and checked by the server when someone answers:
     mcq "2" · tf "T"/"F" · match/order comma-joined indices
     swipe  side per card, in card order: "0,1,1,0" (0 = left, 1 = right)
     bucket bucket per thing, in thing order: "0,2,1"
     story  per scene, how good each reply is (2 best, 1 okay, 0 poor): "2,1,0;0,2,1"
   Swipe, bucket and story score partially (see partialScore).
   ===================================================================== */
import type { Question, QType, Story, StoryMood, StoryWho } from "../types";
import { shuffle } from "./util";

export const TYPE_LABEL: Record<QType, string> = {
  mcq: "Pick one", tf: "True or false?", match: "Match the pairs", order: "Put in order",
  swipe: "Swipe to sort", bucket: "Sort into buckets", story: "Case study",
};
export const TYPE_NAME: Record<QType, string> = {
  mcq: "Multiple choice", tf: "True / False", match: "Match pairs", order: "Put in order",
  swipe: "Swipe sort", bucket: "Buckets", story: "Case study",
};
/** Question types that score partially (a share of the points for a share right). */
export const PARTIAL: QType[] = ["swipe", "bucket", "story"];
export const LIMITS = { cards: [4, 12], things: [3, 12], buckets: [2, 3], scenes: [2, 5], replies: [2, 3] } as const;
export const WHO: Record<StoryWho, { label: string; look: number }> = {
  customer: { label: "Customer", look: 9 },
  manager: { label: "Manager", look: 5 },
  colleague: { label: "Colleague", look: 11 },
  narrator: { label: "Narrator", look: -1 },
};
export const SWIPE_PRESETS: [string, string][] = [["Risky", "Safe"], ["False", "True"], ["Don't", "Do"], ["Not allowed", "Allowed"], ["Myth", "Fact"]];

/** A scene being edited: the reply quality (2 best · 1 okay · 0 poor) stays with the admin. */
export interface DraftScene {
  who: StoryWho;
  name: string;
  role?: string; // shown label ("Patient"); none = the who's label
  look?: number; // character design (Chibi look); none = the role's default
  mood?: StoryMood;
  say: string;
  choices: { t: string; then: string; q: 0 | 1 | 2; mood?: StoryMood }[];
}

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
  sides?: [string, string]; // swipe: left / right labels
  cards?: { t: string; side: 0 | 1 }[]; // swipe
  buckets?: string[]; // bucket
  things?: { t: string; b: number }[]; // bucket
  story?: { intro: string; scenes: DraftScene[]; endings: [string, string, string] };
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
  if (d.type === "swipe") {
    const cards = d.cards || [];
    return { q: { ...base, options: (d.sides || ["Left", "Right"]).slice(), items: cards.map((c) => c.t) }, canon: cards.map((c) => c.side).join(",") };
  }
  if (d.type === "bucket") {
    const things = d.things || [];
    return { q: { ...base, options: (d.buckets || []).slice(), items: things.map((x) => x.t) }, canon: things.map((x) => x.b).join(",") };
  }
  if (d.type === "story") {
    const s = d.story || { intro: "", scenes: [], endings: ["", "", ""] };
    const story: Story = {
      intro: s.intro,
      steps: s.scenes.map((c) => ({
        who: c.who,
        ...(c.name.trim() ? { name: c.name.trim() } : {}),
        ...(c.role?.trim() && c.who !== "narrator" ? { role: c.role.trim() } : {}),
        ...(c.look != null && c.who !== "narrator" ? { look: c.look } : {}),
        ...(c.mood && c.mood !== "idle" ? { mood: c.mood } : {}),
        say: c.say,
        choices: c.choices.map((x) => ({ t: x.t, then: x.then, ...(x.mood ? { mood: x.mood } : {}) })),
      })),
      ...(s.endings.some((e) => e.trim()) ? { endings: s.endings.map((e) => e.trim()) as [string, string, string] } : {}),
    };
    return { q: { ...base, story }, canon: s.scenes.map((c) => c.choices.map((x) => x.q).join(",")).join(";") };
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
  else if (q.type === "swipe") {
    d.sides = [q.options?.[0] ?? "Left", q.options?.[1] ?? "Right"];
    d.cards = (q.items || []).map((t, i) => ({ t, side: idx[i] === 1 ? 1 : 0 }));
  } else if (q.type === "bucket") {
    d.buckets = (q.options || []).slice();
    d.things = (q.items || []).map((t, i) => ({ t, b: Number.isFinite(idx[i]) ? idx[i] : 0 }));
  } else if (q.type === "story") {
    const qual = (canon || "").split(";").map((s) => s.split(",").map(Number));
    const st = q.story || { intro: "", steps: [] };
    d.story = {
      intro: st.intro,
      scenes: st.steps.map((s, i) => ({
        who: s.who, name: s.name || "", ...(s.role ? { role: s.role } : {}), ...(s.look != null ? { look: s.look } : {}), ...(s.mood ? { mood: s.mood } : {}), say: s.say,
        choices: s.choices.map((c, k) => ({ t: c.t, then: c.then, q: (qual[i]?.[k] ?? 0) as 0 | 1 | 2, ...(c.mood ? { mood: c.mood } : {}) })),
      })),
      endings: st.endings ? [...st.endings] : ["", "", ""],
    };
  } else d.steps = idx.map((i) => q.items?.[i] ?? "");
  return d;
}

/** Share right (0–1) for the partially scored types; null for the others (they're right or wrong). */
export function partialScore(type: QType, canon: string | null | undefined, choice: string | null | undefined): number | null {
  if (!PARTIAL.includes(type)) return null;
  if (canon == null || choice == null) return 0;
  if (type === "story") {
    const qual = canon.split(";").map((s) => s.split(",").map(Number));
    const picks = choice.split(",").map(Number);
    if (!qual.length || picks.length !== qual.length) return 0;
    const got = qual.reduce((s, row, i) => s + (row[picks[i]] ?? 0), 0);
    return Math.round((got / (2 * qual.length)) * 100) / 100;
  }
  const want = canon.split(","), got = choice.split(",");
  if (!want.length || got.length !== want.length) return 0;
  return Math.round((want.filter((w, i) => w === got[i]).length / want.length) * 100) / 100;
}

/** Human-readable version of a canonical answer or choice. */
export function choiceText(q: Question | undefined, c: string | null | undefined): string {
  if (c == null) return "Ran out of time";
  if (!q) return "—";
  if (q.type === "mcq") return q.options?.[Number(c)] ?? "—";
  if (q.type === "tf") return c === "T" ? "True" : "False";
  if (q.type === "story") {
    // a choice is one reply per scene; a key is the reply quality per scene
    if (c.includes(";")) return (q.story?.steps || []).map((s, i) => `${i + 1}. ${s.choices[c.split(";")[i]?.split(",").indexOf("2") ?? -1]?.t ?? "?"}`).join("; ");
    return c.split(",").map((v, i) => `${i + 1}. ${q.story?.steps[i]?.choices[Number(v)]?.t ?? "?"}`).join("; ");
  }
  const idx = c.split(",").map(Number);
  if (q.type === "swipe" || q.type === "bucket") return (q.items || []).map((t, i) => `${t} → ${q.options?.[idx[i]] ?? "?"}`).join("; ");
  if (q.type === "match") return (q.left || []).map((l, i) => `${l} → ${q.right?.[idx[i]] ?? "?"}`).join("; ");
  return idx.map((v, k) => `${k + 1}. ${q.items?.[v] ?? "?"}`).join("; ");
}

const blankScene = (who: StoryWho = "customer"): DraftScene => ({ who, name: "", say: "", choices: [{ t: "", then: "", q: 2 }, { t: "", then: "", q: 1 }, { t: "", then: "", q: 0 }] });

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
  if (type === "swipe") {
    d.q = "Swipe each card: risky or safe?";
    d.sides = ["Risky", "Safe"];
    d.cards = [{ t: "", side: 0 }, { t: "", side: 1 }, { t: "", side: 0 }, { t: "", side: 1 }];
  }
  if (type === "bucket") {
    d.q = "Sort each item into the right bucket";
    d.buckets = ["", ""];
    d.things = [{ t: "", b: 0 }, { t: "", b: 1 }, { t: "", b: 0 }, { t: "", b: 1 }];
  }
  if (type === "story") {
    d.q = "";
    d.story = { intro: "", scenes: [blankScene("customer"), blankScene("customer")], endings: ["", "", ""] };
  }
  return d;
}
export { blankScene };

/** Returns a problem description, or null when the draft can be saved. */
export function draftProblem(d: DraftQ, n: number): string | null {
  const at = `Question ${n}`;
  if (d.q.trim().length < 5) return `${at}: write the ${d.type === "story" ? "case study title" : "question text"}.`;
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
  if (d.type === "swipe") {
    const c = d.cards || [];
    if (!d.sides || d.sides.some((s) => !s.trim()) || d.sides[0].trim() === d.sides[1].trim()) return `${at}: give the two swipe sides different names.`;
    if (c.length < LIMITS.cards[0] || c.length > LIMITS.cards[1]) return `${at}: use ${LIMITS.cards[0]}–${LIMITS.cards[1]} cards.`;
    if (c.some((x) => !x.t.trim())) return `${at}: fill in every card.`;
    if (new Set(c.map((x) => x.t.trim().toLowerCase())).size !== c.length) return `${at}: cards must be different.`;
  }
  if (d.type === "bucket") {
    const b = d.buckets || [], t = d.things || [];
    if (b.length < LIMITS.buckets[0] || b.length > LIMITS.buckets[1] || b.some((x) => !x.trim())) return `${at}: name ${LIMITS.buckets[0]}–${LIMITS.buckets[1]} buckets.`;
    if (new Set(b.map((x) => x.trim().toLowerCase())).size !== b.length) return `${at}: bucket names must be different.`;
    if (t.length < LIMITS.things[0] || t.length > LIMITS.things[1]) return `${at}: use ${LIMITS.things[0]}–${LIMITS.things[1]} items.`;
    if (t.some((x) => !x.t.trim() || x.b < 0 || x.b >= b.length)) return `${at}: fill in every item and pick its bucket.`;
    if (new Set(t.map((x) => x.t.trim().toLowerCase())).size !== t.length) return `${at}: items must be different.`;
  }
  if (d.type === "story") {
    const s = d.story;
    if (!s || !s.intro.trim()) return `${at}: write the case study intro (where and when it happens).`;
    if (s.scenes.length < LIMITS.scenes[0] || s.scenes.length > LIMITS.scenes[1]) return `${at}: use ${LIMITS.scenes[0]}–${LIMITS.scenes[1]} scenes.`;
    for (const [k, c] of s.scenes.entries()) {
      const sc = `${at}, scene ${k + 1}`;
      if (!c.say.trim()) return `${sc}: write what happens or what is said.`;
      if (c.choices.length < LIMITS.replies[0] || c.choices.length > LIMITS.replies[1]) return `${sc}: give ${LIMITS.replies[0]}–${LIMITS.replies[1]} replies.`;
      if (c.choices.some((x) => !x.t.trim() || !x.then.trim())) return `${sc}: every reply needs its text and what happens next.`;
      if (!c.choices.some((x) => x.q === 2)) return `${sc}: mark one reply as Best.`;
    }
  }
  return null;
}
