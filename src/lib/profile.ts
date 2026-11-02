/* Profile quizzes: personality / work-style tests with no right answers.

   Written as plain text and pasted in (bulk import), like a Story Mode script:

     Title: Which Banking Role Matches You?
     Intro: 16 everyday questions. No right or wrong answers. Go with your first instinct.

     Traits:
     Explorer | compass | Curious, loves new ideas
     Planner | clipboard | Organised, accurate, careful

     Profiles:
     Explorer + Planner | The Product Architect | Product & Strategy Manager | Designs new products, built properly
       Strengths: Sees the big picture; Turns ideas into plans
       Watch: Can over-plan new ideas
       Work: Give them the why, then room to design the how

     Check: 3 & 12 | Planner vs Explorer

     Questions:
     Q: Your perfect Sunday morning:
     A) Trying a café you've never been to | Explorer
     B) Getting chores done early | Planner
     Q*: Pick a colour you're drawn to:            ← Q* = a light question (counts half)
     A) Electric purple | Explorer
     B) Navy blue | Planner, Anchor                ← first trait gets the most, the others less
     C) Soft green | Harmoniser 2, Anchor 1        ← or set the weights yourself
     Scale: I like to have a plan before I start. | Planner      ← 5-point agree/disagree
     Scale: I get bored doing the same thing twice. | Planner -  ← "-" = reversed (agreeing counts against)

   Weights are kept in the answer key, which players never receive. Scores are worked out on the server. */
import type { AnswerKey, Game, ProfileIconName, ProfileMeta, ProfileResult, ProfileTrait, ProfileType, Question } from "../types";
import { cleanText } from "./security";
import { newId, todayKey } from "./util";

export const ICONS: ProfileIconName[] = ["compass", "clipboard", "bolt", "hands", "anchor", "star", "heart", "flame", "leaf", "eye", "shield", "rocket", "puzzle", "crown", "wave", "target"];
export const SCALE = ["Strongly disagree", "Disagree", "Not sure", "Agree", "Strongly agree"];
export const isScale = (q: Question) => q.options?.length === 5 && q.options.every((o, i) => o === SCALE[i]);

/** Default weights (stored ×2 so a light question can count half): first trait, then the rest. */
const CORE = [4, 2];
const LIGHT = [2, 1];
const SCALE_W = [0, 1, 2, 3, 4];

export interface ParsedProfile {
  title: string;
  intro: string;
  meta: ProfileMeta;
  questions: { q: string; options: string[]; weights: [number, number][][] }[]; // weights per option: [trait, weight]
}
export interface ParseOut {
  data: ParsedProfile | null;
  errors: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function parseProfileScript(text: string): ParseOut {
  const errors: string[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let title = "";
  let intro = "";
  const traits: ProfileTrait[] = [];
  const typesRaw: { line: number; a: string; b: string; t: ProfileType }[] = [];
  const checksRaw: { line: number; q: [number, number]; t: [string, string] }[] = [];
  const qs: { line: number; q: string; light: boolean; scale?: { trait: string; rev: boolean }; opts: { line: number; t: string; spec: string }[] }[] = [];
  let sec: "" | "traits" | "profiles" | "questions" = "";
  let lastType: ProfileType | null = null;

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^title\s*:\s*(.+)$/i))) return void (title = m[1].trim());
    if ((m = line.match(/^intro\s*:\s*(.+)$/i))) return void (intro = m[1].trim());
    if (/^traits\s*:?\s*$/i.test(line)) return void (sec = "traits");
    if (/^(profiles|types)\s*:?\s*$/i.test(line)) return void (sec = "profiles");
    if (/^questions\s*:?\s*$/i.test(line)) return void (sec = "questions");
    if ((m = line.match(/^check\s*:\s*(\d+)\s*(?:&|and|,)\s*(\d+)\s*\|\s*(.+?)\s+vs\.?\s+(.+)$/i)))
      return void checksRaw.push({ line: n, q: [Number(m[1]) - 1, Number(m[2]) - 1], t: [m[3], m[4]] });
    if ((m = line.match(/^(strengths|watch(?:-outs?)?|work(?: with them)?)\s*:\s*(.+)$/i))) {
      if (!lastType) return void errors.push(`Line ${n}: "${m[1]}" needs a profile line above it.`);
      const list = m[2].split(";").map((x) => cleanText(x, 140).trim()).filter(Boolean).slice(0, 4);
      const k = norm(m[1]).startsWith("strength") ? "strengths" : norm(m[1]).startsWith("watch") ? "watch" : "work";
      lastType[k] = list;
      return;
    }
    if ((m = line.match(/^(q\*?|scale)\s*:\s*(.+)$/i))) {
      sec = "questions";
      const kind = norm(m[1]);
      if (kind === "scale") {
        const [stmt, tr = ""] = m[2].split("|").map((x) => x.trim());
        const rev = /-\s*$/.test(tr);
        qs.push({ line: n, q: stmt, light: false, scale: { trait: tr.replace(/-\s*$/, "").trim(), rev }, opts: [] });
      } else qs.push({ line: n, q: m[2].trim(), light: kind === "q*", opts: [] });
      return;
    }
    if ((m = line.match(/^([A-Fa-f])[).]\s*(.+)$/)) && sec === "questions") {
      const cur = qs[qs.length - 1];
      if (!cur || cur.scale) return void errors.push(`Line ${n}: an answer needs a "Q:" line above it.`);
      const bar = m[2].lastIndexOf("|");
      if (bar < 0) return void errors.push(`Line ${n}: add the trait after "|", e.g. "${m[2]} | Explorer".`);
      cur.opts.push({ line: n, t: m[2].slice(0, bar).trim(), spec: m[2].slice(bar + 1).trim() });
      return;
    }
    if (sec === "traits") {
      const [name, icon = "", desc = ""] = line.split("|").map((x) => x.trim());
      const ic = norm(icon) as ProfileIconName;
      if (!name) return;
      if (!ICONS.includes(ic)) errors.push(`Line ${n}: icon "${icon}" — use one of ${ICONS.join(", ")}.`);
      traits.push({ name: cleanText(name, 30), icon: ICONS.includes(ic) ? ic : "star", desc: cleanText(desc, 120) });
      return;
    }
    if (sec === "profiles") {
      const [pair, name = "", role = "", one = ""] = line.split("|").map((x) => x.trim());
      const ab = pair.split("+").map((x) => x.trim());
      if (ab.length !== 2 || !name) return void errors.push(`Line ${n}: write a profile as "Trait + Trait | Name | Like a… | One line".`);
      lastType = { a: -1, b: -1, name: cleanText(name, 50), role: cleanText(role, 70), line: cleanText(one, 160) };
      typesRaw.push({ line: n, a: ab[0], b: ab[1], t: lastType });
      return;
    }
    errors.push(`Line ${n}: not sure what this is — "${line.slice(0, 50)}".`);
  });

  if (!title) errors.push('Add a "Title:" line.');
  if (traits.length < 2 || traits.length > 6) errors.push(`A profile quiz needs 2–6 traits (found ${traits.length}).`);
  const tIdx = (name: string) => traits.findIndex((t) => norm(t.name) === norm(name));
  const types: ProfileType[] = [];
  for (const r of typesRaw) {
    const a = tIdx(r.a), b = tIdx(r.b);
    if (a < 0 || b < 0) errors.push(`Line ${r.line}: unknown trait "${a < 0 ? r.a : r.b}".`);
    else if (a === b) errors.push(`Line ${r.line}: a profile needs two different traits.`);
    else types.push({ ...r.t, a, b });
  }
  const questions: ParsedProfile["questions"] = [];
  for (const q of qs) {
    if (!q.q) {
      errors.push(`Line ${q.line}: the question is empty.`);
      continue;
    }
    if (q.scale) {
      const t = tIdx(q.scale.trait);
      if (t < 0) errors.push(`Line ${q.line}: unknown trait "${q.scale.trait}" — write "Scale: statement | Trait".`);
      const w = q.scale.rev ? [...SCALE_W].reverse() : SCALE_W;
      questions.push({ q: cleanText(q.q, 200), options: [...SCALE], weights: w.map((x) => (x ? [[Math.max(0, t), x]] : [])) });
      continue;
    }
    if (q.opts.length < 2 || q.opts.length > 6) errors.push(`Line ${q.line}: a question needs 2–6 answers.`);
    const weights = q.opts.map((o) => {
      const parts = o.spec.split(",").map((x) => x.trim()).filter(Boolean);
      const def = q.light ? LIGHT : CORE;
      return parts.map((p, k): [number, number] => {
        const mm = p.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
        const name = mm ? mm[1] : p;
        const t = tIdx(name);
        if (t < 0) errors.push(`Line ${o.line}: unknown trait "${name}".`);
        const w = mm ? Math.round(Number(mm[2]) * 2) : def[Math.min(k, 1)];
        return [Math.max(0, t), Math.max(0, Math.min(20, w))];
      });
    });
    questions.push({ q: cleanText(q.q, 200), options: q.opts.map((o) => cleanText(o.t, 120)), weights });
  }
  if (questions.length < 4 || questions.length > 40) errors.push(`A profile quiz needs 4–40 questions (found ${questions.length}).`);
  const checks: ProfileMeta["checks"] = [];
  for (const c of checksRaw) {
    const x = tIdx(c.t[0]), y = tIdx(c.t[1]);
    if (x < 0 || y < 0) errors.push(`Line ${c.line}: unknown trait in the check.`);
    else if (c.q.some((k) => k < 0 || k >= questions.length)) errors.push(`Line ${c.line}: there's no question ${c.q.map((k) => k + 1).join(" or ")}.`);
    else checks.push({ q: c.q, t: [x, y] });
  }
  if (errors.length) return { data: null, errors: errors.slice(0, 12) };
  return { data: { title: cleanText(title, 80), intro: cleanText(intro, 300), meta: { traits, types, checks, intro: cleanText(intro, 300) || undefined }, questions }, errors: [] };
}

/** Weights → the key string the server reads: "0:4,3:2;1:4;…" */
export const keyOf = (w: [number, number][][]) => w.map((o) => o.map(([t, x]) => `${t}:${x}`).join(",")).join(";");
export const weightsOf = (key: string): [number, number][][] =>
  key.split(";").map((o) => (o ? o.split(",").map((e) => e.split(":").map(Number) as [number, number]) : []));

/** A parsed script → a quiz draft (kind "profile") and its key. */
export function profileDraft(p: ParsedProfile, base?: Partial<Game>): { game: Game; key: AnswerKey } {
  const now = Date.now();
  const id = base?.id || newId("g");
  const qids = p.questions.map((_, i) => base?.questions?.[i]?.id || newId("q"));
  const game: Game = {
    id, kind: "profile", title: p.title, desc: p.intro.slice(0, 110), minutes: 0, color: base?.color || "blue", status: base?.status || "draft",
    date: base?.date ?? todayKey(), until: base?.until || "", order: base?.order ?? 0, createdAt: base?.createdAt || now, updatedAt: now,
    questions: p.questions.map((q, i) => ({ id: qids[i], type: "pick", topic: "Profile", q: q.q, options: q.options })),
    profile: p.meta,
  };
  return { game, key: { gid: id, answers: Object.fromEntries(p.questions.map((q, i) => [qids[i], keyOf(q.weights)])), updatedAt: now } };
}

/** A saved quiz → its script again, for editing. */
export function toProfileScript(g: Game, key?: AnswerKey): string {
  const m = g.profile;
  if (!m) return "";
  const T = (i: number) => m.traits[i]?.name || "?";
  const out = [`Title: ${g.title}`];
  if (m.intro || g.desc) out.push(`Intro: ${m.intro || g.desc}`);
  out.push("", "Traits:", ...m.traits.map((t) => `${t.name} | ${t.icon} | ${t.desc}`), "", "Profiles:");
  for (const t of m.types) {
    out.push(`${T(t.a)} + ${T(t.b)} | ${t.name} | ${t.role} | ${t.line}`);
    if (t.strengths?.length) out.push(`  Strengths: ${t.strengths.join("; ")}`);
    if (t.watch?.length) out.push(`  Watch: ${t.watch.join("; ")}`);
    if (t.work?.length) out.push(`  Work: ${t.work.join("; ")}`);
  }
  if (m.checks?.length) out.push("", ...m.checks.map((c) => `Check: ${c.q[0] + 1} & ${c.q[1] + 1} | ${T(c.t[0])} vs ${T(c.t[1])}`));
  out.push("", "Questions:");
  for (const q of g.questions) {
    const w = weightsOf(key?.answers[q.id] || "");
    if (isScale(q)) {
      const t = w.flat()[0]?.[0] ?? 0;
      const rev = (w[0]?.[0]?.[1] || 0) > (w[4]?.[0]?.[1] || 0);
      out.push(`Scale: ${q.q} | ${T(t)}${rev ? " -" : ""}`);
      continue;
    }
    const light = w.every((o) => Math.max(0, ...o.map((x) => x[1])) <= 2);
    out.push(`${light ? "Q*" : "Q"}: ${q.q}`);
    (q.options || []).forEach((o, i) => out.push(`${"ABCDEF"[i]}) ${o} | ${(w[i] || []).map(([t, x]) => `${T(t)} ${x / 2}`).join(", ")}`));
  }
  return out.join("\n");
}

/** Same sums as the server (private.profile_compute) — used by the demo and the admin preview. */
export function computeProfile(meta: ProfileMeta, weights: [number, number][][][], choices: number[]): ProfileResult {
  const nt = meta.traits.length;
  const score = Array(nt).fill(0), mx = Array(nt).fill(0), hits = Array(nt).fill(0);
  const dom: number[] = [];
  weights.forEach((opts, i) => {
    const qmax = Array(nt).fill(0);
    opts.forEach((o, k) => {
      let best = 0, d = -1;
      for (const [t, w] of o) {
        if (t < 0 || t >= nt) continue;
        qmax[t] = Math.max(qmax[t], w);
        if (k === choices[i]) {
          score[t] += w;
          if (w > best) (best = w), (d = t);
        }
      }
      if (k === choices[i]) {
        dom[i] = d;
        if (d >= 0) hits[d]++;
      }
    });
    qmax.forEach((v, t) => (mx[t] += v));
  });
  const pct = score.map((s, t) => (mx[t] > 0 ? Math.round((100 * s) / mx[t]) : 0));
  const ord = pct.map((_, i) => i).sort((a, b) => pct[b] - pct[a] || a - b);
  const [a, b] = ord;
  const type = meta.types.findIndex((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));
  const mixed = (meta.checks || []).some((c) => {
    const [x, y] = c.t, p = dom[c.q[0]], q = dom[c.q[1]];
    return (p === x && q === y) || (p === y && q === x);
  });
  return { pct, hits, top: [a, b], type, mixed, n: weights.length };
}

/** "How we worked it out" — plain lines, no weights. */
export function whyLines(meta: ProfileMeta, r: ProfileResult): string[] {
  const [a, b] = r.top;
  const T = meta.traits;
  const order = r.pct.map((_, i) => i).sort((x, y) => r.pct[y] - r.pct[x]);
  const low = order[order.length - 1];
  const lines = [
    `${r.hits[a]} of your ${r.n} answers leaned ${T[a].name} — your strongest trait at ${r.pct[a]}%.`,
    `${T[b].name} came next: ${r.hits[b]} answer${r.hits[b] === 1 ? "" : "s"}, ${r.pct[b]}% overall.`,
  ];
  if (low !== a && low !== b) lines.push(`${T[low].name} showed least (${r.pct[low]}%) — a trait you use less, not one you lack.`);
  lines.push(r.mixed ? "A couple of your answers pointed in opposite directions, so treat this as a first read." : "Your answers were consistent across similar situations.");
  return lines;
}

/** The type to show: the matching profile, or one built from the top trait. */
export function typeOf(meta: ProfileMeta, r: ProfileResult): ProfileType {
  const t = meta.types[r.type];
  if (t) return t;
  const [a, b] = r.top;
  return { a, b, name: `The ${meta.traits[a].name}`, role: `${meta.traits[a].name} with a ${meta.traits[b].name.toLowerCase()} side`, line: meta.traits[a].desc };
}
