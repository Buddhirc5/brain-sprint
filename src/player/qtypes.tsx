/* Player screens for the newer question types:
     Swipe sort  — a deck of cards, swipe each left or right (or use the buttons / arrow keys)
     Buckets     — tap (or drag) each item into one of 2–3 coloured buckets
     Case study  — a short illustrated story: scenes, a reply to pick in each, then an ending
   Each one builds its choice string the same way the answer key is written (lib/answers.ts) and hands
   it to onSubmit; after the server marks it (rv), it shows what was right using last.canon. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { WHO } from "../lib/answers";
import { shuffle } from "../lib/util";
import type { Question, StoryWho } from "../types";
import "../styles/qtypes.css";

export interface QTypeProps {
  q: Question;
  rv: boolean; // the answer is back from the server
  busy: boolean;
  canon: string | null; // the right answer (null in certification exams: hidden)
  choice: string | null; // what the player sent
  onSubmit: (c: string) => void;
}

const buzz = () => {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* no vibration on this device */
  }
};
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** "6 of 8 right" style summary for the reveal sheet. */
export function sortSummary(q: Question, canon: string | null, choice: string | null) {
  if (!canon || !choice) return null;
  if (q.type === "story") return null;
  const w = canon.split(","), g = choice.split(",");
  return { right: w.filter((x, i) => x === g[i]).length, of: w.length };
}

/* =====================================================================
   Swipe sort
   ===================================================================== */
export function SwipeQ({ q, rv, busy, canon, choice, onSubmit }: QTypeProps) {
  const cards = q.items || [];
  const [L, R] = [q.options?.[0] || "Left", q.options?.[1] || "Right"];
  const order = useMemo(() => shuffle(cards.map((_, i) => i)), [q.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picks, setPicks] = useState<number[]>([]); // side per position in `order`
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [fly, setFly] = useState<0 | 1 | null>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const pos = picks.length;
  const done = pos >= cards.length;

  const pick = (side: 0 | 1) => {
    if (done || fly !== null || rv || busy) return;
    buzz();
    setFly(side);
    setDrag(null);
    window.setTimeout(() => {
      setPicks((p) => [...p, side]);
      setFly(null);
    }, reduced() ? 0 : 220);
  };
  const undo = () => !rv && !busy && setPicks((p) => p.slice(0, -1));
  const send = () => {
    const bySlot: number[] = [];
    order.forEach((orig, k) => (bySlot[orig] = picks[k]));
    onSubmit(bySlot.join(","));
  };

  useEffect(() => {
    if (rv) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") pick(0);
      if (e.key === "ArrowRight") pick(1);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const down = (e: RPointerEvent) => {
    if (done || rv) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDrag({ x: 0, y: 0 });
  };
  const move = (e: RPointerEvent) => start.current && setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.4 });
  const up = (e: RPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, v = dx / Math.max(1, performance.now() - s.t);
    if (Math.abs(dx) > 90 || Math.abs(v) > 0.6) pick(dx > 0 ? 1 : 0);
    else setDrag(null);
  };

  if (rv) {
    const want = canon?.split(",").map(Number), got = choice?.split(",").map(Number);
    return (
      <div className="sw-review">
        {cards.map((t, i) => {
          const ok = want ? want[i] === got?.[i] : null;
          return (
            <div key={i} className={`swq-row ${ok == null ? "" : ok ? "ok" : "no"}`} style={{ ["--i" as string]: i } as CSSProperties}>
              <span className="swq-row-t">{t}</span>
              <span className={`sw-pill s${got?.[i] ?? 0}`}>{got?.[i] === 1 ? R : L}</span>
              {ok === false && want && <span className="sw-fix">→ {want[i] === 1 ? R : L}</span>}
              {ok != null && <span className="sw-mark" aria-label={ok ? "right" : "wrong"}>{ok ? "✓" : "✕"}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  const dx = drag?.x || 0;
  const lean = fly !== null ? (fly ? 1 : -1) : Math.max(-1, Math.min(1, dx / 110));
  const top = order[pos];
  return (
    <div className="sw">
      <div className="sw-sides" aria-hidden="true">
        <span className={`sw-side l ${lean < -0.25 ? "hot" : ""}`}>← {L}</span>
        <span className="sw-count num">{Math.min(pos + 1, cards.length)} / {cards.length}</span>
        <span className={`sw-side r ${lean > 0.25 ? "hot" : ""}`}>{R} →</span>
      </div>
      <div className="sw-deck" style={{ ["--lean" as string]: lean } as CSSProperties}>
        {!done &&
          order.slice(pos, pos + 3).reverse().map((orig, k, arr) => {
            const depth = arr.length - 1 - k; // 0 = top card
            const isTop = depth === 0;
            const style: CSSProperties = isTop
              ? fly !== null
                ? { transform: `translate(${fly ? 140 : -140}%, -6%) rotate(${fly ? 24 : -24}deg)`, opacity: 0, transition: "transform .22s ease-in, opacity .22s ease-in" }
                : drag
                  ? { transform: `translate(${dx}px, ${drag.y}px) rotate(${dx / 14}deg)`, transition: "none" }
                  : {}
              : { transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.05})` };
            return (
              <div
                key={orig}
                className={`sw-card ${isTop ? "top" : ""}`}
                style={style}
                onPointerDown={isTop ? down : undefined}
                onPointerMove={isTop ? move : undefined}
                onPointerUp={isTop ? up : undefined}
                onPointerCancel={isTop ? () => ((start.current = null), setDrag(null)) : undefined}
                aria-hidden={!isTop}
              >
                {isTop && (
                  <>
                    <span className="sw-stamp l" style={{ opacity: Math.max(0, -lean) }}>{L}</span>
                    <span className="sw-stamp r" style={{ opacity: Math.max(0, lean) }}>{R}</span>
                  </>
                )}
                <p>{cards[orig]}</p>
                {isTop && <span className="sw-hint">Swipe or use the buttons</span>}
              </div>
            );
          })}
        {done && (
          <div className="sw-piles">
            {[0, 1].map((side) => (
              <div key={side} className={`sw-pile s${side}`}>
                <b>{side ? R : L}</b>
                <span className="num">{picks.filter((p) => p === side).length}</span>
                <small>card{picks.filter((p) => p === side).length === 1 ? "" : "s"}</small>
              </div>
            ))}
          </div>
        )}
      </div>
      {!done ? (
        <div className="sw-btns">
          <button type="button" className="sw-btn l" onClick={() => pick(0)} disabled={busy} aria-label={`${L}: ${top != null ? cards[top] : ""}`}>
            ← {L}
          </button>
          <button type="button" className="sw-undo" onClick={undo} disabled={!pos || busy} aria-label="Undo the last card">↶</button>
          <button type="button" className="sw-btn r" onClick={() => pick(1)} disabled={busy} aria-label={`${R}: ${top != null ? cards[top] : ""}`}>
            {R} →
          </button>
        </div>
      ) : (
        <div className="sw-btns">
          <button type="button" className="sw-undo" onClick={undo} disabled={busy} aria-label="Undo the last card">↶</button>
          <button type="button" className="btn primary block" onClick={send} disabled={busy} data-autofocus>
            {busy ? "Checking…" : "Check my sort"}
          </button>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   Buckets
   ===================================================================== */
const BUCKET_COLORS = ["lime", "blue", "pink"];

export function BucketQ({ q, rv, busy, canon, choice, onSubmit }: QTypeProps) {
  const things = q.items || [];
  const buckets = q.options || [];
  const order = useMemo(() => shuffle(things.map((_, i) => i)), [q.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [placed, setPlaced] = useState<Record<number, number>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ i: number; x: number; y: number } | null>(null);
  const [land, setLand] = useState<number | null>(null); // bucket that just got something (bounce)
  const dragFrom = useRef<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  const left = order.filter((i) => placed[i] == null);
  const complete = left.length === 0;

  const drop = (i: number, b: number) => {
    buzz();
    setPlaced((p) => ({ ...p, [i]: b }));
    setSel(null);
    setLand(b);
    window.setTimeout(() => setLand(null), 350);
  };
  const lift = (i: number) => setPlaced((p) => {
    const n = { ...p };
    delete n[i];
    return n;
  });

  const down = (i: number) => (e: RPointerEvent) => {
    if (rv || busy) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragFrom.current = { i, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: RPointerEvent) => {
    const d = dragFrom.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.moved = true;
    if (d.moved) setGhost({ i: d.i, x: e.clientX, y: e.clientY });
  };
  const up = (e: RPointerEvent) => {
    const d = dragFrom.current;
    dragFrom.current = null;
    setGhost(null);
    if (!d) return;
    if (!d.moved) return setSel((s) => (s === d.i ? null : d.i)); // a tap selects
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-bucket]");
    if (el) drop(d.i, Number(el.dataset.bucket));
  };

  const want = rv && canon ? canon.split(",").map(Number) : null;
  const got = rv && choice ? choice.split(",").map(Number) : null;
  const where = (i: number) => (rv ? got?.[i] : placed[i]);

  return (
    <div className="bk">
      {!rv && (
        <div className={`bk-tray ${complete ? "all-in" : ""}`} aria-label="Items to sort">
          {complete ? (
            <span className="bk-done">All sorted — check your buckets!</span>
          ) : (
            left.map((i) => (
              <button
                key={i}
                type="button"
                className={`bk-chip ${sel === i ? "picked" : ""} ${ghost?.i === i ? "dragging" : ""}`}
                aria-pressed={sel === i}
                onPointerDown={down(i)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={() => ((dragFrom.current = null), setGhost(null))}
              >
                {things[i]}
              </button>
            ))
          )}
        </div>
      )}
      {!rv && <p className="bk-hint">{sel != null ? "Now tap a bucket to drop it in" : "Tap an item, then tap its bucket — or drag it"}</p>}
      <div className={`bk-buckets n${buckets.length}`}>
        {buckets.map((name, b) => {
          const inside = (rv ? things.map((_, i) => i) : order).filter((i) => where(i) === b);
          return (
            <div
              key={b}
              role={rv ? undefined : "button"}
              tabIndex={rv || sel == null ? -1 : 0}
              data-bucket={b}
              className={`bk-bucket c-${BUCKET_COLORS[b]} ${sel != null && !rv ? "ready" : ""} ${land === b ? "land" : ""}`}
              onClick={() => sel != null && !rv && drop(sel, b)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && sel != null && drop(sel, b)}
              aria-label={`${name}: ${inside.length} item${inside.length === 1 ? "" : "s"}`}
            >
              <div className="bk-lip">
                <b>{name}</b>
                <span className="num">{inside.length}</span>
              </div>
              <div className="bk-in">
                {inside.map((i) => {
                  const ok = want ? want[i] === got?.[i] : null;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`bk-chip in ${ok == null ? "" : ok ? "ok" : "no"}`}
                      disabled={rv || busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        // with an item picked up, a tap anywhere on the bucket drops it in; otherwise take this one out
                        if (sel != null) drop(sel, b);
                        else lift(i);
                      }}
                      aria-label={rv ? `${things[i]}${ok === false && want ? `, belongs in ${buckets[want[i]]}` : ""}` : `${things[i]} — tap to take it out`}
                    >
                      {things[i]}
                      {ok === false && want && <small>→ {buckets[want[i]]}</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!rv && (
        <button type="button" className="btn primary block" disabled={!complete || busy} onClick={() => onSubmit(things.map((_, i) => placed[i]).join(","))}>
          {busy ? "Checking…" : "Check my buckets"}
        </button>
      )}
      {ghost && (
        <span className="bk-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {things[ghost.i]}
        </span>
      )}
    </div>
  );
}

/* =====================================================================
   Case study (story) — told like a phone conversation (Messages style):
     cover    a "lock screen": the scene-setting lines fade in one by one, then a message notification drops in
     chat     each scene: typing dots → their message → your reply suggestions → you send → what happens next
     reveal   the ending (★★★ / ★★ / ★) and a replay of the chat with every reply rated and the better one shown
   ===================================================================== */
const MOOD: Record<StoryWho, "think" | "idle" | "sad"> = { customer: "sad", manager: "think", colleague: "idle", narrator: "idle" };
export const ENDINGS: [string, string, string][] = [
  ["🏆", "Star employee", "Every call was the best one. That's exactly how it's done."],
  ["🙂", "Good save", "You got there — a couple of choices could have been even better."],
  ["📘", "Lesson learned", "A tough one. See below what would have worked better."],
];
/** 0 best · 1 good · 2 learn, from the share of best replies. */
export const endingOf = (f: number) => (f >= 1 ? 0 : f >= 0.5 ? 1 : 2);
const QUAL_TAG = ["Poor", "Okay", "Best"];

type Phase = "typing" | "said" | "choose" | "compose" | "sent" | "outcome" | "ready";
// how long each beat lasts (ms) — long enough to read, short enough to keep moving; a tap skips ahead
const typingMs = (say: string) => Math.min(2000, 700 + say.length * 14);
const BEAT: Partial<Record<Phase, number>> = { said: 650, compose: 650, sent: 900, outcome: 1100 };
const NEXT: Partial<Record<Phase, Phase>> = { typing: "said", said: "choose", compose: "sent", sent: "outcome", outcome: "ready" };

/** Round avatar: the character's face, or a book for the narrator. */
function Ava({ who, size = 30 }: { who: StoryWho; size?: number }) {
  if (who === "narrator")
    return (
      <span className="im-ava narr" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
        📖
      </span>
    );
  return (
    <span className={`im-ava w-${who}`} style={{ width: size, height: size }} aria-hidden="true">
      <Chibi look={WHO[who].look} variant="bust" size={size} mood={MOOD[who]} still />
    </span>
  );
}
const nameOf = (s: { who: StoryWho; name?: string }) => s.name || WHO[s.who].label;
/** "Monday, 9:05 am. …" → "9:05 am" for the chat's time stamp. */
const timeIn = (t: string) => t.match(/\b\d{1,2}[:.]\d{2}\s?(?:am|pm)?/i)?.[0].replace(".", ":") || "";
const sentences = (t: string) => t.match(/[^.!?…]+[.!?…]+["”’']?\s*|[^.!?…]+$/g)?.map((x) => x.trim()).filter(Boolean) || [t];

function TypingDots() {
  return (
    <span className="im-dots" aria-label="typing">
      <i />
      <i />
      <i />
    </span>
  );
}

export function StoryQ({ q, rv, busy, canon, choice, onSubmit }: QTypeProps) {
  const { me } = useApp();
  const st = q.story || { intro: "", steps: [] };
  const steps = st.steps;
  const [stage, setStage] = useState<"cover" | "chat">("cover");
  const [scene, setScene] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [pending, setPending] = useState<number | null>(null); // reply being "typed" into the message box
  const [phase, setPhase] = useState<Phase>("typing");
  const end = useRef<HTMLDivElement>(null);
  const step = steps[scene];
  const last = scene === steps.length - 1;
  const at = timeIn(st.intro);

  /* the story's clock: each beat moves to the next after a pause (instantly with reduced motion) */
  useEffect(() => {
    if (stage !== "chat" || !step) return;
    const to = NEXT[phase];
    if (!to) return;
    const ms = reduced() ? 0 : phase === "typing" ? (step.who === "narrator" ? 450 : typingMs(step.say)) : BEAT[phase] ?? 0;
    const t = window.setTimeout(() => {
      if (phase === "compose" && pending != null) {
        setPicks((p) => [...p, pending]);
        setPending(null);
      }
      setPhase(to);
    }, ms);
    return () => window.clearTimeout(t);
  }, [phase, stage, scene, step, pending]);

  /* keep the newest message in view */
  useEffect(() => {
    if (stage !== "chat") return;
    const r = requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end", behavior: reduced() ? "auto" : "smooth" }));
    return () => cancelAnimationFrame(r);
  }, [stage, scene, phase]);

  const skip = () => {
    const to = NEXT[phase];
    if (!to || phase === "compose") return;
    setPhase(to);
  };
  const pick = (k: number) => {
    if (phase !== "choose") return;
    buzz();
    setPending(k);
    setPhase("compose");
  };
  const nextScene = () => {
    setScene((x) => x + 1);
    setPhase("typing");
  };

  /* ---------------- the ending ---------------- */
  if (rv) {
    const got = (choice || "").split(",").map(Number);
    const qual = canon ? canon.split(";").map((s) => s.split(",").map(Number)) : null;
    const f = qual ? qual.reduce((s, row, i) => s + (row[got[i]] ?? 0), 0) / (2 * Math.max(1, qual.length)) : null;
    const e = f == null ? null : endingOf(f);
    return (
      <div className="st-end">
        {e == null ? (
          <div className="st-ending saved">
            <span className="st-ending-ic" aria-hidden="true">📝</span>
            <b>Your choices are saved</b>
            <p>You'll see how the story could have gone when the exam ends.</p>
          </div>
        ) : (
          <div className={`st-ending e${e}`}>
            <span className="st-ending-k">The ending</span>
            <span className="st-stars" aria-label={`${3 - e} of 3 stars`}>
              {[0, 1, 2].map((k) => (
                <i key={k} className={k < 3 - e ? "on" : ""} style={{ ["--i" as string]: k } as CSSProperties}>
                  ★
                </i>
              ))}
            </span>
            <b>
              {ENDINGS[e][1]} <span aria-hidden="true">{ENDINGS[e][0]}</span>
            </b>
            <p>{st.endings?.[e] || ENDINGS[e][2]}</p>
            {me && <Chibi look={me.look} equipped={me.equipped} variant="full" size={84} mood={e === 0 ? "cheer" : e === 1 ? "happy" : "think"} className="st-ending-me" />}
          </div>
        )}
        <div className="im replay" aria-label="Replay of the conversation">
          <div className="im-replay-h">Replay · see each choice</div>
          <div className="im-feed">
            {steps.map((s, i) => {
              const mine = s.choices[got[i]];
              const qv = qual?.[i]?.[got[i]];
              const bestK = qual ? qual[i].indexOf(2) : -1;
              const best = bestK >= 0 ? s.choices[bestK] : null;
              return (
                <div key={i} className="im-scene" style={{ ["--i" as string]: i } as CSSProperties}>
                  <span className="im-stamp">Scene {i + 1}</span>
                  {s.who === "narrator" ? (
                    <p className="im-note">{s.say}</p>
                  ) : (
                    <div className="im-row in">
                      <Ava who={s.who} size={26} />
                      <div className="im-col">
                        <span className="im-name">{nameOf(s)}</span>
                        <p className="im-b in tail">{s.say}</p>
                      </div>
                    </div>
                  )}
                  {mine && (
                    <div className="im-row out">
                      <div className="im-col">
                        <p className={`im-b out tail ${qv === 0 ? "poor" : ""}`}>{mine.t}</p>
                        {qv != null && <span className={`im-grade q${qv}`}>{qv === 2 ? "✓ Best reply" : QUAL_TAG[qv]}</span>}
                      </div>
                    </div>
                  )}
                  {mine && <p className="im-then">{mine.then}</p>}
                  {qv != null && qv < 2 && best && (
                    <div className="im-better">
                      <span className="im-better-k">💡 A better reply</span>
                      <p className="im-b out ghost">{best.t}</p>
                      <p className="im-then">{best.then}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- cover: a lock screen with the opening and a message notification ---------------- */
  if (stage === "cover") {
    const lines = sentences(st.intro);
    const first = steps.find((s) => s.who !== "narrator") || steps[0];
    const cast = [...new Set(steps.map((s) => s.who))].filter((w) => w !== "narrator");
    const noteAt = lines.length * 550 + 350;
    return (
      <div className="imc">
        <div className="imc-glow" aria-hidden="true" />
        <span className="imc-k">
          Case study · {steps.length} scenes{at ? ` · ${at}` : ""}
        </span>
        <p className="imc-intro">
          {lines.map((l, k) => (
            <span key={k} style={{ ["--d" as string]: `${k * 550}ms` } as CSSProperties}>
              {l}{" "}
            </span>
          ))}
        </p>
        {first && (
          <button type="button" className="imc-note" style={{ ["--d" as string]: `${noteAt}ms` } as CSSProperties} onClick={() => setStage("chat")} aria-label={`Message from ${nameOf(first)}: ${first.say}. Open the conversation`}>
            <Ava who={first.who} size={38} />
            <span className="imc-note-t">
              <b>{nameOf(first)}</b>
              <small>now</small>
            </span>
            <span className="imc-note-m">{first.say}</span>
          </button>
        )}
        <div className="imc-foot" style={{ ["--d" as string]: `${noteAt + 500}ms` } as CSSProperties}>
          <div className="imc-cast" aria-label="In this story">
            {cast.map((w) => (
              <span key={w} className="imc-who">
                <Ava who={w} size={40} />
                <small>{nameOf(steps.find((s) => s.who === w)!)}</small>
              </span>
            ))}
            {me && (
              <span className="imc-who">
                <span className="im-ava you" style={{ width: 40, height: 40 }} aria-hidden="true">
                  <Chibi look={me.look} equipped={me.equipped} variant="bust" size={40} mood="happy" still />
                </span>
                <small>You</small>
              </span>
            )}
          </div>
          <p className="imc-how">Read each message and pick your reply. No going back — just like real life.</p>
          <button type="button" className="btn primary block" onClick={() => setStage("chat")} data-autofocus>
            Open the conversation →
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- the conversation ---------------- */
  const doneHere = picks.length > scene; // reply sent in this scene
  const head = step.who === "narrator" ? steps.slice(0, scene + 1).reverse().find((s) => s.who !== "narrator") || step : step;
  const replying = phase === "choose" || phase === "compose";
  return (
    <div className="im" onClick={skip}>
      <header className="im-head">
        <span key={head.who + (head.name || "")} className="im-head-who">
          <Ava who={head.who} size={40} />
          <b>{nameOf(head)} ›</b>
        </span>
        <small className="im-head-sub">{phase === "typing" && step.who !== "narrator" ? "typing…" : `${WHO[head.who].label} · scene ${scene + 1} of ${steps.length}`}</small>
        <span className="im-prog" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i < scene || (i === scene && doneHere) ? "done" : i === scene ? "cur" : ""} />
          ))}
        </span>
      </header>

      <div className="im-feed" role="log" aria-live="polite">
        <span className="im-stamp">
          <b>Today</b> {at}
        </span>
        <p className="im-note intro">{st.intro}</p>
        {steps.slice(0, scene + 1).map((s, i) => {
          const cur = i === scene;
          const said = !cur || phase !== "typing";
          const mine = picks[i];
          const showThen = mine != null && (!cur || phase === "outcome" || phase === "ready");
          return (
            <div key={i} className="im-scene">
              {i > 0 && <span className="im-stamp">Scene {i + 1}</span>}
              {s.who === "narrator" ? (
                said && <p className="im-note">{s.say}</p>
              ) : (
                <div className="im-row in">
                  <Ava who={s.who} />
                  <div className="im-col">
                    <span className="im-name">{nameOf(s)}</span>
                    {said ? (
                      <p className="im-b in tail">{s.say}</p>
                    ) : (
                      <p className="im-b in tail typing">
                        <TypingDots />
                      </p>
                    )}
                  </div>
                </div>
              )}
              {mine != null && (
                <div className="im-row out">
                  <div className="im-col">
                    <p className="im-b out tail">{s.choices[mine].t}</p>
                    {cur && <span className="im-receipt">{phase === "sent" ? "Delivered" : "Read"}</span>}
                  </div>
                </div>
              )}
              {showThen && <p className="im-then">{s.choices[mine!].then}</p>}
            </div>
          );
        })}
      </div>

      <div className="im-compose" onClick={(e) => e.stopPropagation()}>
        {replying && (
          <div className={`im-sugg ${phase === "compose" ? "sending" : ""}`} role="group" aria-label="Choose your reply">
            <span className="im-sugg-k">Choose your reply</span>
            {step.choices.map((c, k) => (
              <button key={k} type="button" className={`im-opt ${pending === k ? "chosen" : ""}`} style={{ ["--i" as string]: k } as CSSProperties} onClick={() => pick(k)} disabled={phase !== "choose"}>
                {c.t}
              </button>
            ))}
          </div>
        )}
        {phase === "ready" ? (
          last ? (
            <button type="button" className="btn primary block im-next" disabled={busy} onClick={() => onSubmit(picks.join(","))} data-autofocus>
              {busy ? "Writing the ending…" : "See how it ends →"}
            </button>
          ) : (
            <button type="button" className="btn primary block im-next" onClick={nextScene} data-autofocus>
              Next scene →
            </button>
          )
        ) : (
          <div className={`im-bar ${phase === "compose" ? "full" : ""}`} aria-hidden="true">
            <span className="im-field">{phase === "compose" && pending != null ? <span className="im-draft">{step.choices[pending].t}</span> : <span className="im-ph">{replying ? "Pick a reply above" : "Message"}</span>}</span>
            <span className="im-send">↑</span>
          </div>
        )}
      </div>
      <div ref={end} className="im-end" />
    </div>
  );
}
