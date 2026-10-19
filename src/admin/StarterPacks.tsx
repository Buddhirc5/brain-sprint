/* Starter packs: add a ready-made certification, live quiz or live poll as a draft in one click. */
import { useState } from "react";
import { useApp } from "../app/ctx";
import { Modal, Seg } from "../components/ui";
import { sealQuestion, type DraftQ } from "../lib/answers";
import { newId, randHex } from "../lib/util";
import { blankPoll, LIVE } from "../api/engine";
import { STARTER_PACKS, type PackQ, type QuizPack, type StarterPack } from "../data/starterPacks";
import type { AnswerKey, Game, Poll } from "../types";

const KIND_LABEL: Record<StarterPack["kind"], string> = { cert: "Certification", live: "Live quiz", poll: "Live poll" };

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

export function StarterPacks({ kinds, onClose }: { kinds: StarterPack["kind"][]; onClose: () => void }) {
  const { api, tid, run, toast, pub, features } = useApp();
  const [ind, setInd] = useState<"all" | "bank" | "any">("all");
  const [busy, setBusy] = useState("");
  const on = (k: StarterPack["kind"]) => (k === "cert" ? features.cert : k === "live" ? features.live : features.polls);
  const packs = STARTER_PACKS.filter((p) => kinds.includes(p.kind) && (ind === "all" || p.industry === ind));
  const add = async (p: StarterPack) => {
    setBusy(p.id);
    const ok = await run(async () => {
      if (p.kind === "poll") {
        const poll: Poll = { ...blankPoll(newId("poll"), tid, ""), title: p.title, slides: p.slides.map((s, i) => ({ ...s, id: `s${i + 1}${randHex(2)}` }) as Poll["slides"][number]) };
        await api.savePoll(tid, poll);
      } else await api.saveQuiz(tid, quizFrom(p));
      return true;
    });
    setBusy("");
    if (ok) toast(`“${p.title}” added as a draft — review it, then ${p.kind === "poll" ? "open it" : "publish"}`);
  };
  return (
    <Modal label="Starter packs" onClose={onClose} wide>
      <div className="stack">
        <div className="panel-h">
          <div>
            <h3>Starter packs</h3>
            <p className="fine">Ready-made content you can add in one click. Each is added as a draft for {pub.name} — edit anything before it goes live.</p>
          </div>
          <Seg value={ind} onChange={setInd} label="Industry" options={[["all", "All"], ["bank", "Banking"], ["any", "General"]]} />
        </div>
        <div className="sp-grid">
          {packs.map((p) => {
            const n = p.kind === "poll" ? p.slides.length : p.questions.length;
            const off = !on(p.kind);
            return (
              <article key={p.id} className={`sp-card k-${p.kind}`}>
                <div className="sp-top">
                  <span className="sp-kind">{KIND_LABEL[p.kind]}</span>
                  <span className={`chip ${p.industry === "bank" ? "bank" : ""}`}>{p.industry === "bank" ? "Banking" : "General"}</span>
                </div>
                <b className="sp-title">{p.title}</b>
                <span className="fine">{p.desc}</span>
                <span className="fine num">{n} {p.kind === "poll" ? "slides" : "questions"}</span>
                <button type="button" className="btn primary small" disabled={!!busy || off} onClick={() => void add(p)}>
                  {busy === p.id ? "Adding…" : off ? "Turned off in Settings" : "Add as draft"}
                </button>
              </article>
            );
          })}
        </div>
        <div className="row end">
          <button type="button" className="btn ghost small" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
