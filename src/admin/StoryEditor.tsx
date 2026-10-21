/* Story Mode in the admin: write a comic case study as a plain-text script (or with the form), pick each
   character's look and role, and preview it exactly as players see it. Bulk import (many stories, scripts or
   spreadsheet rows) is the editor's Bulk import panel. */
import { useMemo, useRef, useState } from "react";
import { Chibi } from "../components/Chibi";
import { Modal, Seg } from "../components/ui";
import { sealQuestion, WHO, type DraftQ } from "../lib/answers";
import { lookName, MOOD_NAME, parseScript, toScript, whoOfRole } from "../lib/storyScript";
import { LOOK_COUNT } from "../api/engine";
import { StoryQ } from "../player/qtypes";
import type { StoryMood } from "../types";
import { StoryEdit } from "./QTypeEditors";

const MOODS = Object.keys(MOOD_NAME) as StoryMood[];

/** One story in a Story Mode quiz: script or form, the cast, and a preview. */
export function StoryEpisode({ q, i, n, topics, setQ, move, remove }: { q: DraftQ; i: number; n: number; topics: string[]; setQ: (i: number, p: Partial<DraftQ>) => void; move: (i: number, d: -1 | 1) => void; remove: () => void }) {
  const [mode, setMode] = useState<"script" | "form">("script");
  const [text, setText] = useState(() => toScript(q));
  const [problems, setProblems] = useState<{ line: number; why: string }[]>([]);
  const [preview, setPreview] = useState(false);
  const lastSent = useRef(text);

  // the form (or the cast panel) changed the story: rewrite the script to match
  const fromDraft = toScript(q);
  if (mode === "script" && fromDraft !== lastSent.current && !problems.length) {
    lastSent.current = fromDraft;
    if (text !== fromDraft) setText(fromDraft);
  }

  const onText = (t: string) => {
    setText(t);
    const r = parseScript(t, topics, [q.id]);
    setProblems(r.problems);
    const d = r.drafts[0];
    if (d && !r.problems.length) {
      lastSent.current = toScript(d);
      setQ(i, { q: d.q, topic: d.topic, explain: d.explain, story: d.story });
    }
  };

  return (
    <div className="qed story-ep">
      <div className="qed-h">
        <span className="ttl">
          Story {i + 1} · {q.q || "Untitled"}
        </span>
        <button className="x" aria-label={`Move story ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button className="x" aria-label={`Move story ${i + 1} down`} disabled={i === n - 1} onClick={() => move(i, 1)}>↓</button>
        <button className="x" aria-label={`Delete story ${i + 1}`} onClick={remove}>✕</button>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Seg value={mode} onChange={(m) => { if (m === "script") { const t = toScript(q); setText(t); lastSent.current = t; setProblems([]); } setMode(m); }} options={[["script", "Script"], ["form", "Form"]]} label="Edit as" className="narrow" />
        <button type="button" className="btn lime small" onClick={() => setPreview(true)}>
          Preview as a player
        </button>
      </div>

      <Cast q={q} onChange={(p) => setQ(i, p)} />

      {mode === "script" ? (
        <div className="script-ed">
          <textarea className="inp script" rows={18} spellCheck value={text} onChange={(e) => onText(e.target.value)} aria-label={`Script for story ${i + 1}`} />
          {problems.length > 0 ? (
            <div className="banner red" role="alert">
              {problems.slice(0, 3).map((p) => (
                <div key={p.line}>{p.why}</div>
              ))}
            </div>
          ) : (
            <p className="fine ok-line">✓ Script reads fine — {q.story?.scenes.length || 0} pages.</p>
          )}
          <ScriptHelp />
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`st${i}t`}>Story title</label>
            <input className="inp" id={`st${i}t`} value={q.q} maxLength={80} onChange={(e) => setQ(i, { q: e.target.value })} />
          </div>
          <StoryEdit q={q} i={i} setQ={setQ} />
          <div className="row2">
            <div className="field">
              <label htmlFor={`st${i}tp`}>Topic</label>
              <select className="inp" id={`st${i}tp`} value={q.topic} onChange={(e) => setQ(i, { topic: e.target.value })}>
                {[...new Set([...topics, q.topic])].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`st${i}l`}>The lesson (shown with the ending)</label>
              <input className="inp" id={`st${i}l`} value={q.explain} maxLength={300} onChange={(e) => setQ(i, { explain: e.target.value })} />
            </div>
          </div>
        </>
      )}
      {preview && <StoryPreview q={q} onClose={() => setPreview(false)} />}
    </div>
  );
}

/** Everyone in the story: their role label and which character design draws them. */
function Cast({ q, onChange }: { q: DraftQ; onChange: (p: Partial<DraftQ>) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const scenes = q.story?.scenes || [];
  const names = [...new Set(scenes.filter((s) => s.who !== "narrator" && s.name).map((s) => s.name))];
  if (!names.length) return null;
  const set = (name: string, p: { role?: string; look?: number }) =>
    onChange({ story: { ...q.story!, scenes: scenes.map((s) => (s.name === name ? { ...s, ...p, ...(p.role != null ? { who: p.role.trim() ? whoOfRole(p.role) : s.who } : {}) } : s)) } });
  return (
    <div className="cast">
      <span className="flabel">Cast — tap a face to pick their character</span>
      <div className="cast-row">
        {names.map((nm) => {
          const s = scenes.find((x) => x.name === nm)!;
          const look = s.look ?? WHO[s.who].look;
          return (
            <div key={nm} className="cast-m">
              <button type="button" className="cast-face" aria-label={`Choose a character for ${nm}`} aria-expanded={open === nm} onClick={() => setOpen(open === nm ? null : nm)}>
                <Chibi look={look} variant="bust" size={56} mood={s.mood || "idle"} still />
              </button>
              <b>{nm}</b>
              <input className="inp" value={s.role ?? ""} placeholder={WHO[s.who].label} maxLength={30} aria-label={`Role of ${nm}`} onChange={(e) => set(nm, { role: e.target.value })} />
              <span className="fine">look {lookName(look)}</span>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="look-grid" role="listbox" aria-label={`Character for ${open}`}>
          {Array.from({ length: LOOK_COUNT }, (_, k) => (
            <button key={k} type="button" role="option" aria-selected={(scenes.find((x) => x.name === open)?.look ?? -1) === k} className="look-opt" onClick={() => { set(open, { look: k }); setOpen(null); }}>
              <Chibi look={k} variant="bust" size={48} still />
              <span>{lookName(k)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mood-row" aria-label="Moods you can use">
        {MOODS.map((m) => (
          <span key={m} className="mood-chip">
            <Chibi look={scenes.find((x) => x.who !== "narrator")?.look ?? 9} variant="bust" size={34} mood={m} still />
            {MOOD_NAME[m]}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScriptHelp() {
  return (
    <details className="script-help">
      <summary>How to write a script</summary>
      <ul>
        <li><code>Title:</code> starts a story (several stories can go in one bulk paste). <code>Topic:</code>, <code>Intro:</code>, <code>Lesson:</code> are optional lines.</li>
        <li><code>Cast: Nimal = Customer, look 11; Dr. Silva = Doctor, look 3</code> — any role words you like; looks are the numbers in the cast picker (or <code>wren</code> / <code>puff</code>).</li>
        <li>A scene: <code>Nimal (angry): My card is blocked!</code> or <code>Narrator: The system shows…</code>. Moods: calm, happy, excited, worried, thinking, angry, shocked.</li>
        <li>2–3 replies under each scene: <code>- Best: I'm sorry, may I see your ID? -&gt; (calm) He hands it over.</code> Use Best, Okay or Poor; the mood in brackets is their face afterwards.</li>
        <li><code>Ending best:</code> / <code>Ending good:</code> / <code>Ending learn:</code> replace the ending text (optional).</li>
      </ul>
    </details>
  );
}

/** The story exactly as a player sees it — scored here, nothing is saved. */
function StoryPreview({ q, onClose }: { q: DraftQ; onClose: () => void }) {
  const sealed = useMemo(() => sealQuestion(q), [q]);
  const [choice, setChoice] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  return (
    <Modal label="Story preview" onClose={onClose} wide>
      <div className="story-preview">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Preview</h3>
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => { setChoice(null); setRun((x) => x + 1); }}>Start again</button>
            <button type="button" className="btn primary small" onClick={onClose} data-autofocus>Close</button>
          </div>
        </div>
        <div className="qcard comic">
          <StoryQ key={run} q={sealed.q} rv={choice != null} busy={false} canon={choice != null ? sealed.canon : null} choice={choice} onSubmit={setChoice} explain={q.explain} />
        </div>
      </div>
    </Modal>
  );
}
