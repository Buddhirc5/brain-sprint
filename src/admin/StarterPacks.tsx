/* Starter library: ready-made content added as drafts. Daily sprints come from the shared library
   (pick several, copy them in one go); certifications, live quizzes and live polls are one-click packs. */
import { useEffect, useState } from "react";
import { useApp } from "../app/ctx";
import { Modal, Seg } from "../components/ui";
import { sealQuestion, type DraftQ } from "../lib/answers";
import { newId, randHex } from "../lib/util";
import { blankPoll, LIVE } from "../api/engine";
import { STARTER_PACKS, type PackQ, type QuizPack, type StarterPack, type StoryPack } from "../data/starterPacks";
import { parseScript } from "../lib/storyScript";
import { todayKey } from "../lib/util";
import type { AnswerKey, Game, LibraryItem, Poll } from "../types";

const KIND_LABEL: Record<StarterPack["kind"], string> = { cert: "Certification", live: "Live quiz", poll: "Live poll", story: "Story Mode" };
type Tab = "sprint" | StarterPack["kind"];
const TAB_LABEL: Record<Tab, string> = { sprint: "Daily sprints", story: "Story Mode", cert: "Certifications", live: "Live quizzes", poll: "Live polls" };

function toDraft(q: PackQ, i: number, topic: string, live: boolean): DraftQ {
  const base = { id: `q${i + 1}-${randHex(3)}`, topic, explain: "", options: ["", "", "", ""], answer: 0, tf: true, pairs: [], steps: [], ...(live ? { seconds: LIVE.defaultSeconds } : {}) };
  if (typeof q[1] === "boolean") {
    const [text, tf, explain] = q as [string, boolean, string];
    return { ...base, type: "tf", q: text, tf, explain };
  }
  const [text, options, answer, explain] = q as [string, string[], number, string];
  return { ...base, type: "mcq", q: text, options, answer, explain };
}

function quizFrom(p: QuizPack): { game: Game; key: AnswerKey } {
  const id = newId("g-");
  const now = Date.now();
  const sealed = p.questions.map((q, i) => sealQuestion(toDraft(q, i, p.topic, p.kind === "live")));
  const game: Game = {
    id, kind: p.kind, title: p.title, desc: p.desc.slice(0, 110), minutes: p.kind === "cert" ? 10 : 0, color: p.kind === "cert" ? "ink" : "orange", status: "draft", order: 0,
    questions: sealed.map((s) => s.q),
    ...(p.kind === "cert" ? { cert: { passPct: 80, attempts: 3, certTitle: p.certTitle || p.title, validMonths: 12, showAnswers: true } } : {}),
    createdAt: now, updatedAt: now,
  };
  return { game, key: { gid: id, answers: Object.fromEntries(sealed.map((s) => [s.q.id, s.canon])), updatedAt: now } };
}

/** A Story Mode pack → one Story Mode quiz (its script read the same way the editor reads it). */
function storyFrom(p: StoryPack, topics: string[]): { game: Game; key: AnswerKey } {
  const d = parseScript(p.script, topics).drafts[0];
  if (!d) throw new Error("This story couldn't be read.");
  // file it under the closest topic the company has
  const topic = p.topics.map((x) => topics.find((t) => t.toLowerCase() === x.toLowerCase())).find(Boolean) || topics[0] || p.topics[0];
  const sealed = sealQuestion({ ...d, topic });
  const id = newId("g-");
  const now = Date.now();
  const game: Game = { id, kind: "story", title: p.title, desc: p.desc.slice(0, 110), minutes: 0, color: "orange", status: "draft", date: todayKey(), order: 0, questions: [sealed.q], createdAt: now, updatedAt: now };
  return { game, key: { gid: id, answers: { [sealed.q.id]: sealed.canon }, updatedAt: now } };
}

export function StarterPacks({ kinds, onClose }: { kinds: Tab[]; onClose: () => void }) {
  const { pub } = useApp();
  const [tab, setTab] = useState<Tab>(kinds[0]);
  const [ind, setInd] = useState<"all" | "bank" | "any">("all");
  return (
    <Modal label="Starter library" onClose={onClose} wide>
      <div className="stack">
        <div className="panel-h">
          <div>
            <h3>Starter library</h3>
            <p className="fine">Ready-made content for {pub.name}. Everything is added as a draft — edit anything before it goes live.</p>
          </div>
          <Seg value={ind} onChange={setInd} label="Industry" options={[["all", "All"], ["bank", "Banking"], ["any", "General"]]} />
        </div>
        {kinds.length > 1 && (
          <div className="chips-row" role="group" aria-label="Type">
            {kinds.map((k) => (
              <button key={k} type="button" className={`chip-tg ${tab === k ? "on" : ""}`} aria-pressed={tab === k} onClick={() => setTab(k)}>
                {TAB_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        {tab === "sprint" ? <LibraryList ind={ind} onClose={onClose} /> : <PackGrid kind={tab} ind={ind} onClose={onClose} />}
      </div>
    </Modal>
  );
}

function PackGrid({ kind, ind, onClose }: { kind: StarterPack["kind"]; ind: "all" | "bank" | "any"; onClose: () => void }) {
  const { api, tid, run, toast, features, d } = useApp();
  const [busy, setBusy] = useState("");
  const on = (k: StarterPack["kind"]) => (k === "cert" ? features.cert : k === "live" ? features.live : k === "story" ? features.sprint : features.polls);
  const packs = STARTER_PACKS.filter((p) => p.kind === kind && (ind === "all" || p.industry === ind));
  const add = async (p: StarterPack) => {
    setBusy(p.id);
    const ok = await run(async () => {
      if (p.kind === "poll") {
        const poll: Poll = { ...blankPoll(newId("poll"), tid, ""), title: p.title, slides: p.slides.map((s, i) => ({ ...s, id: `s${i + 1}${randHex(2)}` }) as Poll["slides"][number]) };
        await api.savePoll(tid, poll);
      } else if (p.kind === "story") await api.saveQuiz(tid, storyFrom(p, d.cfg.topics));
      else await api.saveQuiz(tid, quizFrom(p));
      return true;
    });
    setBusy("");
    if (ok) toast(`“${p.title}” added as a draft — review it, then ${p.kind === "poll" ? "open it" : "publish"}`);
  };
  return (
    <>
      {packs.length ? (
        <div className="sp-grid">
          {packs.map((p) => {
            const n = p.kind === "poll" ? p.slides.length : p.kind === "story" ? (p.script.match(/^\s*- /gm) || []).length : p.questions.length;
            const off = !on(p.kind);
            return (
              <article key={p.id} className={`sp-card k-${p.kind}`}>
                <div className="sp-top">
                  <span className="sp-kind">{KIND_LABEL[p.kind]}</span>
                  <span className={`chip ${p.industry === "bank" ? "bank" : ""}`}>{p.industry === "bank" ? "Banking" : "General"}</span>
                </div>
                <b className="sp-title">{p.title}</b>
                <span className="fine">{p.desc}</span>
                <span className="fine num">{p.kind === "story" ? `3 pages · ${n} replies` : `${n} ${p.kind === "poll" ? "slides" : "questions"}`}</span>
                <button type="button" className="btn primary small" disabled={!!busy || off} onClick={() => void add(p)}>
                  {busy === p.id ? "Adding…" : off ? "Turned off in Settings" : "Add as draft"}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="fine">Nothing here for this filter.</p>
      )}
      <div className="row end">
        <button type="button" className="btn ghost small" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

/** Daily sprints from the shared library (kept up to date by the super admin). */
function LibraryList({ ind, onClose }: { ind: "all" | "bank" | "any"; onClose: () => void }) {
  const { api, tid, run, toast } = useApp();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api.library().then((x) => live && setItems(x), () => live && setItems([]));
    return () => {
      live = false;
    };
  }, [api]);
  const shown = (items || []).filter((x) => ind === "all" || x.industry === ind);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const copy = async () => {
    setBusy(true);
    const n = await run(() => api.importLibrary(tid, sel));
    setBusy(false);
    if (n != null) {
      onClose();
      toast(`${n} quiz${n === 1 ? "" : "zes"} copied as drafts — review, then publish`);
    }
  };
  return (
    <>
      {!items ? (
        <p className="fine">Loading…</p>
      ) : !shown.length ? (
        <p className="fine">Nothing here for this filter.</p>
      ) : (
        <div className="lib-list">
          {shown.map((x) => (
            <label key={x.id} className={`lib-item ${sel.includes(x.id) ? "on" : ""}`}>
              <input type="checkbox" checked={sel.includes(x.id)} onChange={() => toggle(x.id)} />
              <span>
                <b>{x.title}</b>
                <span className="fine">{x.topic} · {x.questions.length} questions</span>
              </span>
              <span className={`chip ${x.industry === "bank" ? "bank" : ""}`}>{x.industry === "bank" ? "Banking" : "General"}</span>
            </label>
          ))}
        </div>
      )}
      <div className="row end">
        <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary small" disabled={!sel.length || busy} onClick={copy}>
          {busy ? "Copying…" : `Copy ${sel.length || ""} as draft${sel.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </>
  );
}
