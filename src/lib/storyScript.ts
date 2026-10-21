/* Story Mode scripts: write a comic case study as plain text, the way you'd write a play.

     Title: The blocked card
     Topic: Customer Experience
     Cast: Nimal = Customer, look 11; Ms. Perera = Branch manager, look 5
     Intro: Monday, 9:05 am. The branch has just opened.

     Nimal (angry): My card got blocked! Fix it NOW!
     - Best: I'm sorry — let's sort this out. May I see your ID? -> (calm) Nimal takes a breath.
     - Okay: Please call our hotline. -> (sad) Nimal sighs.
     - Poor: Cards aren't my department. -> (angry) Nimal asks for your manager.

     Narrator: The system shows three wrong PIN tries last night.
     - Best: Explain, verify him and reset the PIN -> (happy) “That was me!”
     - Poor: Unblock it, no questions -> It works — but you skipped the checks.

     Ending best: Nimal makes his flight — and leaves a 5-star review.
     Lesson: Calm the customer, verify identity, then fix it.

   A line "Name (mood): words" is a scene; the "- Best/Okay/Poor:" lines under it are your replies, with
   "->" before what happens next (a mood in brackets changes their face). Several stories can go in one
   paste: each starts with its own "Title:" line. Looks are numbered as in the cast picker (1 = the first
   character), or "wren" / "puff". */
import { blankDraft, draftProblem, LIMITS, type DraftQ, type DraftScene } from "./answers";
import { cleanText } from "./security";
import { newId } from "./util";
import { LOOK_COUNT } from "../api/engine";
import type { StoryMood, StoryWho } from "../types";

export const MOOD_WORDS: Record<string, StoryMood> = {
  calm: "idle", neutral: "idle", normal: "idle", idle: "idle", fine: "idle", quiet: "idle",
  happy: "happy", glad: "happy", relieved: "happy", smiling: "happy", pleased: "happy", grateful: "happy",
  excited: "cheer", cheering: "cheer", thrilled: "cheer", proud: "cheer", delighted: "cheer", cheer: "cheer",
  sad: "sad", upset: "sad", worried: "sad", nervous: "sad", disappointed: "sad", hurt: "sad", tired: "sad",
  thinking: "think", unsure: "think", confused: "think", curious: "think", doubtful: "think", think: "think", puzzled: "think",
  angry: "angry", furious: "angry", annoyed: "angry", mad: "angry", frustrated: "angry", rude: "angry",
  shocked: "shock", surprised: "shock", scared: "shock", panicked: "shock", shock: "shock", stunned: "shock",
};
/** The word a script uses for each mood. */
export const MOOD_NAME: Record<StoryMood, string> = { idle: "calm", happy: "happy", cheer: "excited", sad: "worried", think: "thinking", angry: "angry", shock: "shocked" };
const ROLE_WHO: Record<string, StoryWho> = {
  customer: "customer", client: "customer", guest: "customer", patient: "customer", visitor: "customer", caller: "customer", member: "customer", student: "customer",
  manager: "manager", boss: "manager", lead: "manager", supervisor: "manager", director: "manager", head: "manager", ceo: "manager",
  colleague: "colleague", coworker: "colleague", "co-worker": "colleague", teammate: "colleague", friend: "colleague", peer: "colleague", intern: "colleague", "new joiner": "colleague",
};
const QUALITY: Record<string, 0 | 1 | 2> = { best: 2, great: 2, right: 2, good: 1, okay: 1, ok: 1, fair: 1, poor: 0, bad: 0, wrong: 0, worst: 0 };
const ENDING: Record<string, 0 | 1 | 2> = { best: 0, star: 0, good: 1, save: 1, okay: 1, learn: 2, lesson: 2, poor: 2, bad: 2 };
const SPECIAL_LOOKS: Record<string, number> = { wren: LOOK_COUNT - 2, explorer: LOOK_COUNT - 2, puff: LOOK_COUNT - 1, bunny: LOOK_COUNT - 1 };

/** Role words → who (for the default character); anything else stays a custom label on a customer. */
export function whoOfRole(role: string): StoryWho {
  const r = role.trim().toLowerCase();
  if (ROLE_WHO[r]) return ROLE_WHO[r];
  const hit = Object.keys(ROLE_WHO).find((k) => r.split(/\s+/).includes(k));
  return hit ? ROLE_WHO[hit] : "customer";
}
/** "look 11" / "11" / "wren" → look index (0-based), or null. */
export function parseLook(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/^look\s*/, "");
  if (SPECIAL_LOOKS[t] != null) return SPECIAL_LOOKS[t];
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= LOOK_COUNT ? n - 1 : null;
}
export const lookName = (i: number) => (i === LOOK_COUNT - 2 ? "wren" : i === LOOK_COUNT - 1 ? "puff" : String(i + 1));

export interface CastMember { role?: string; who: StoryWho; look?: number }
export interface ScriptResult {
  drafts: DraftQ[];
  problems: { line: number; why: string }[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Read a script (one or more stories). `topics` maps a "Topic:" line to the company's topic list. */
export function parseScript(text: string, topics: string[], keepIds: string[] = []): ScriptResult {
  const drafts: DraftQ[] = [];
  const problems: ScriptResult["problems"] = [];
  const topicOf = (s: string) => topics.find((t) => t.toLowerCase() === s.trim().toLowerCase()) || topics[0] || "General Knowledge";
  let cur: { d: DraftQ; line: number; cast: Map<string, CastMember>; bad: string } | null = null;
  const lines = text.split(/\r?\n/);

  const close = () => {
    if (!cur) return;
    const { d, line, bad } = cur;
    cur = null;
    const why = bad || draftProblem(d, 1)?.replace(/^Question 1,?\s*/, "").replace(/^:\s*/, "");
    if (why) problems.push({ line, why: `“${d.q || "Untitled"}”: ${why}` });
    else drafts.push(d);
  };
  const start = (title: string, line: number) => {
    close();
    const d = blankDraft("story", topics[0] || "General Knowledge", keepIds[drafts.length + problems.length] || newId("q"));
    d.q = cleanText(title, 80).trim();
    d.story = { intro: "", scenes: [], endings: ["", "", ""] };
    cur = { d, line, cast: new Map(), bad: "" };
  };
  const fail = (why: string) => {
    if (cur && !cur.bad) cur.bad = why;
  };
  const castLine = (body: string) => {
    for (const part of body.split(/;|\n/)) {
      const [name, rest = ""] = part.split("=").map((x) => x.trim());
      if (!name) continue;
      const bits = rest.split(",").map((x) => x.trim()).filter(Boolean);
      const m: CastMember = cur!.cast.get(name.toLowerCase()) || { who: "customer" };
      for (const b of bits) {
        const lk = /^look\b/i.test(b) || /^\d+$/.test(b) || SPECIAL_LOOKS[b.toLowerCase()] != null ? parseLook(b) : null;
        if (lk != null) m.look = lk;
        else if (MOOD_WORDS[b.toLowerCase()]) continue;
        else {
          m.role = cap(b);
          m.who = whoOfRole(b);
        }
      }
      cur!.cast.set(name.toLowerCase(), m);
    }
  };

  lines.forEach((raw, ix) => {
    const line = ix + 1;
    const l = raw.trim();
    if (!l || l.startsWith("//")) return;
    const head = l.match(/^([A-Za-z][\w .'’-]{0,40}?)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/);
    const key = head?.[1].trim().toLowerCase();
    if (key === "title" || l.startsWith("# ")) return start(head ? head[3] : l.slice(2), line);
    if (!cur) start("", line);
    const c = cur!;
    const s = c.d.story!;
    const scene = s.scenes[s.scenes.length - 1] as DraftScene | undefined;

    // a reply: "- Best: words -> (mood) what happens"
    if (/^[-*•+>]/.test(l)) {
      if (!scene) return fail(`line ${line}: a reply needs a scene line above it`);
      const body = l.replace(/^[-*•+>]+\s*/, "");
      const q = body.match(/^(best|great|right|good|okay|ok|fair|poor|bad|wrong|worst)\s*[:.)-]\s*/i);
      if (!q) return fail(`line ${line}: start each reply with Best, Okay or Poor`);
      if (scene.choices.length >= LIMITS.replies[1]) return fail(`line ${line}: ${LIMITS.replies[1]} replies per scene at most`);
      const [say, then = ""] = body.slice(q[0].length).split(/\s*(?:->|=>|→)\s*/);
      const mm = then.match(/^\(([^)]*)\)\s*/);
      const mood = mm ? MOOD_WORDS[mm[1].trim().toLowerCase()] : undefined;
      if (mm && !mood) return fail(`line ${line}: unknown mood “${mm[1]}”`);
      scene.choices.push({ q: QUALITY[q[1].toLowerCase()], t: cleanText(say, 160).trim(), then: cleanText(mm ? then.slice(mm[0].length) : then, 200).trim(), ...(mood ? { mood } : {}) });
      return;
    }
    if (!head) return fail(`line ${line}: not sure what this is — scenes look like “Name (mood): what they say”`);
    const val = head[3];
    if (key === "topic") return void (c.d.topic = topicOf(val));
    if (key === "intro" || key === "setting" || key === "opening") return void (s.intro = cleanText(val, 400).trim());
    if (key === "lesson" || key === "why" || key === "takeaway") return void (c.d.explain = cleanText(val, 300).trim());
    if (key === "cast") return castLine(val);
    const end = key?.match(/^ending\s*(\w*)$/);
    if (end) {
      const k = ENDING[end[1] || head[2]?.trim().toLowerCase() || "best"];
      if (k == null) return fail(`line ${line}: endings are Best, Good or Learn`);
      s.endings[k] = cleanText(val, 200).trim();
      return;
    }
    // a scene: "Name (role, mood, look 3): words" — or "Narrator: words"
    if (s.scenes.length >= LIMITS.scenes[1]) return fail(`line ${line}: ${LIMITS.scenes[1]} scenes per story at most`);
    const name = head[1].trim();
    const narr = /^(narrator|scene|story|caption)$/i.test(name);
    const m: CastMember = { ...(c.cast.get(name.toLowerCase()) || { who: "customer" }) };
    let mood: StoryMood | undefined;
    for (const b of (head[2] || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const w = b.toLowerCase();
      if (MOOD_WORDS[w]) mood = MOOD_WORDS[w];
      else if (/^look\b/.test(w) || SPECIAL_LOOKS[w] != null) {
        const lk = parseLook(b);
        if (lk == null) return fail(`line ${line}: looks are numbered 1–${LOOK_COUNT} (or wren / puff)`);
        m.look = lk;
      } else {
        m.role = cap(b);
        m.who = whoOfRole(b);
      }
    }
    if (!narr) c.cast.set(name.toLowerCase(), { ...m });
    s.scenes.push({
      who: narr ? "narrator" : m.who,
      name: narr ? "" : cleanText(name, 30),
      ...(narr || !m.role ? {} : { role: cleanText(m.role, 30) }),
      ...(narr || m.look == null ? {} : { look: m.look }),
      ...(mood && !narr ? { mood } : {}),
      say: cleanText(val, 300).trim(),
      choices: [],
    });
  });
  close();
  return { drafts, problems };
}

/** Write a story back as a script (so the form and the script editor stay in step). */
export function toScript(d: DraftQ): string {
  const s = d.story || { intro: "", scenes: [], endings: ["", "", ""] };
  const out: string[] = [`Title: ${d.q}`, `Topic: ${d.topic}`];
  const cast = new Map<string, DraftScene>();
  for (const c of s.scenes) if (c.who !== "narrator" && c.name && !cast.has(c.name)) cast.set(c.name, c);
  if (cast.size)
    out.push(
      `Cast: ${[...cast.values()]
        .map((c) => `${c.name} = ${c.role || cap(c.who)}${c.look != null ? `, look ${lookName(c.look)}` : ""}`)
        .join("; ")}`,
    );
  if (s.intro) out.push(`Intro: ${s.intro}`);
  for (const c of s.scenes) {
    out.push("");
    const name = c.who === "narrator" ? "Narrator" : c.name || cap(c.who);
    out.push(`${name}${c.mood && c.mood !== "idle" && c.who !== "narrator" ? ` (${MOOD_NAME[c.mood]})` : ""}: ${c.say}`);
    for (const x of c.choices) out.push(`- ${["Poor", "Okay", "Best"][x.q]}: ${x.t} -> ${x.mood ? `(${MOOD_NAME[x.mood]}) ` : ""}${x.then}`);
  }
  const ends = ["best", "good", "learn"];
  if (s.endings.some((e) => e.trim())) out.push("");
  s.endings.forEach((e, i) => e.trim() && out.push(`Ending ${ends[i]}: ${e}`));
  if (d.explain) out.push(`Lesson: ${d.explain}`);
  return out.join("\n");
}

/** A starting script for a new story. */
export const SCRIPT_EXAMPLE = `Title: The blocked card
Topic: Customer Experience
Cast: Nimal = Customer, look 11; Ms. Perera = Branch manager, look 5
Intro: Monday, 9:05 am. The branch has just opened. A customer hurries to your counter.

Nimal (angry): My card got blocked and I fly in two hours! Fix it NOW!
- Best: I'm sorry — let's sort this out together. May I see your ID? -> (calm) Nimal takes a breath and hands it over.
- Okay: Please call our hotline, they handle card blocks. -> (worried) Nimal sighs: “I'm already standing here…”
- Poor: Cards aren't my department, sorry. -> (angry) “Then whose department IS it?”

Narrator: The system shows three wrong PIN tries at an ATM last night.
- Best: Explain why, verify him and reset the PIN -> (happy) “That was me — I forgot my new PIN!”
- Poor: Unblock it straight away, no questions -> (thinking) It works — but you skipped the checks.

Ms. Perera (thinking): Everything okay here? I saw a queue building.
- Best: All sorted — I verified him and unblocked the card. -> (excited) “That's exactly how we do it.”
- Okay: I think so — I'm not sure I followed every step. -> (thinking) She walks you through the checklist.
- Poor: It was chaos, the customer was rude. -> (angry) “And what did you do to help him?”

Ending best: Nimal makes his flight — and leaves a 5-star review.
Lesson: Calm the customer first, verify identity, then fix it — and keep your manager in the loop.`;
