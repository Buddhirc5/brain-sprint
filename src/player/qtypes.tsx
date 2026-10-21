/* Player screens for the newer question types:
     Swipe sort  — a deck of cards, swipe each left or right (or use the buttons / arrow keys)
     Buckets     — tap (or drag) each item into one of 2–3 coloured buckets
     Case study  — a short illustrated story: scenes, a reply to pick in each, then an ending
   Each one builds its choice string the same way the answer key is written (lib/answers.ts) and hands
   it to onSubmit; after the server marks it (rv), it shows what was right using last.canon. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { WHO } from "../lib/answers";
import { shuffle } from "../lib/util";
import type { Question, StoryMood, StoryWho } from "../types";
import "../styles/qtypes.css";

export interface QTypeProps {
  q: Question;
  rv: boolean; // the answer is back from the server
  busy: boolean;
  canon: string | null; // the right answer (null in certification exams: hidden)
  choice: string | null; // what the player sent
  onSubmit: (c: string) => void;
  explain?: string; // the lesson (case studies show it with the ending)
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
   Case study (story) — a comic book, drawn with the app's own characters:
     cover    an issue cover: title, the opening in a caption box, the cast in their first moods
     pages    one page per scene: their panel (face + speech bubble, shouted when angry) → your pick →
              your panel → their reaction (new mood, a sound effect, what happens)
     ending   a rank stamp (S / A / B), stars, the lesson, and a replay of every page with the better reply
   ===================================================================== */
export const ENDINGS: [string, string, string][] = [
  ["🏆", "Star employee", "Every call was the best one. That's exactly how it's done."],
  ["🙂", "Good save", "You got there — a couple of choices could have been even better."],
  ["📘", "Lesson learned", "A tough one. See below what would have worked better."],
];
/** 0 best · 1 good · 2 learn, from the share of best replies. */
export const endingOf = (f: number) => (f >= 1 ? 0 : f >= 0.5 ? 1 : 2);
const RANK = ["S", "A", "B"];
const QUAL_TAG = ["Poor", "Okay", "Best"];
const SFX: Partial<Record<StoryMood, string>> = { angry: "GRR!", shock: "WHAT?!", happy: "PHEW!", cheer: "YES!", sad: "SIGH…", think: "HMM…" };
const lookOf = (s: { who: StoryWho; look?: number }) => (s.look != null && s.look >= 0 ? s.look : WHO[s.who].look);
const nameOf = (s: { who: StoryWho; name?: string }) => s.name || WHO[s.who].label;

type CPhase = "panel" | "choose" | "reply" | "react" | "ready";
const NEXT: Partial<Record<CPhase, CPhase>> = { reply: "react", react: "ready" };
const BEAT: Partial<Record<CPhase, number>> = { reply: 650, react: 900 };

/** A character drawn in a panel, in a mood. */
function Who({ s, mood, size = 112, full = true }: { s: { who: StoryWho; look?: number }; mood?: StoryMood; size?: number; full?: boolean }) {
  return <Chibi look={lookOf(s)} variant={full ? "full" : "bust"} size={size} mood={mood || "idle"} />;
}

/** Text revealed a few characters at a time; a tap shows it all. */
function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(() => (reduced() ? text.length : 0));
  useEffect(() => {
    if (n >= text.length) {
      onDone?.();
      return;
    }
    const t = window.setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 18);
    return () => window.clearTimeout(t);
  }, [n, text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span onClick={() => setN(text.length)}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      <span className="sr">{text}</span>
    </span>
  );
}

/** A speech bubble: shouted (jagged) when the speaker is angry or shocked. */
function Bubble({ mood, side = "l", children }: { mood?: StoryMood; side?: "l" | "r"; children: ReactNode }) {
  const shout = mood === "angry" || mood === "shock";
  return <div className={`cc-bubble ${side} ${shout ? "shout" : ""} ${mood === "think" ? "thought" : ""}`}>{children}</div>;
}

export function StoryQ({ q, rv, busy, canon, choice, onSubmit, explain }: QTypeProps) {
  const { me } = useApp();
  const st = q.story || { intro: "", steps: [] };
  const steps = st.steps;
  const [stage, setStage] = useState<"cover" | "read">("cover");
  const [scene, setScene] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [phase, setPhase] = useState<CPhase>("panel");
  const end = useRef<HTMLDivElement>(null);
  const step = steps[scene];
  const last = scene === steps.length - 1;
  const meLook = me?.look ?? 0;

  useEffect(() => {
    const to = NEXT[phase];
    if (stage !== "read" || !to) return;
    const t = window.setTimeout(() => setPhase(to), reduced() ? 0 : BEAT[phase] ?? 0);
    return () => window.clearTimeout(t);
  }, [phase, stage]);
  useEffect(() => {
    if (stage !== "read") return;
    const r = requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end", behavior: reduced() ? "auto" : "smooth" }));
    return () => cancelAnimationFrame(r);
  }, [stage, scene, phase]);

  const said = () => setPhase((p) => (p === "panel" ? "choose" : p));
  const pick = (k: number) => {
    if (phase !== "choose") return;
    buzz();
    setPicks((p) => [...p, k]);
    setPhase("reply");
  };
  const turn = () => {
    setScene((x) => x + 1);
    setPhase("panel");
    window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  };
  const skip = () => {
    if (phase === "reply" || phase === "react") setPhase(NEXT[phase]!);
  };

  /* ---------------- the ending ---------------- */
  if (rv) {
    const got = (choice || "").split(",").map(Number);
    const qual = canon ? canon.split(";").map((s) => s.split(",").map(Number)) : null;
    const f = qual ? qual.reduce((s, row, i) => s + (row[got[i]] ?? 0), 0) / (2 * Math.max(1, qual.length)) : null;
    const e = f == null ? null : endingOf(f);
    return (
      <div className="cc-end">
        {e == null ? (
          <div className="cc-final saved">
            <b>Your choices are saved</b>
            <p>You'll see how the story could have gone when the exam ends.</p>
          </div>
        ) : (
          <div className={`cc-final e${e}`}>
            <span className="cc-final-k">The end</span>
            <span className="cc-rank" aria-label={`Rank ${RANK[e]}`}>
              <small>Rank</small>
              {RANK[e]}
            </span>
            <span className="cc-stars" aria-label={`${3 - e} of 3 stars`}>
              {[0, 1, 2].map((k) => (
                <i key={k} className={k < 3 - e ? "on" : ""} style={{ ["--i" as string]: k } as CSSProperties}>
                  ★
                </i>
              ))}
            </span>
            <b className="cc-final-t">{ENDINGS[e][1]}!</b>
            <p>{st.endings?.[e] || ENDINGS[e][2]}</p>
            <span className="cc-final-me" aria-hidden="true">
              <Chibi look={meLook} equipped={me?.equipped} variant="full" size={92} mood={e === 0 ? "cheer" : e === 1 ? "happy" : "think"} />
            </span>
          </div>
        )}
        {explain && (
          <div className="cc-lesson">
            <span>The lesson</span>
            <p>{explain}</p>
          </div>
        )}
        <span className="cc-replay-k">Replay · every page</span>
        <ol className="cc-replay">
          {steps.map((s, i) => {
            const mine = s.choices[got[i]];
            const qv = qual?.[i]?.[got[i]];
            const bestK = qual ? qual[i].indexOf(2) : -1;
            const best = bestK >= 0 ? s.choices[bestK] : null;
            return (
              <li key={i} className={qv == null ? "" : `q${qv}`} style={{ ["--i" as string]: i } as CSSProperties}>
                <span className="cc-replay-n">Page {i + 1}</span>
                <div className="cc-replay-row">
                  {s.who !== "narrator" && (
                    <span className="cc-replay-face">
                      <Who s={s} mood={s.mood} size={44} full={false} />
                    </span>
                  )}
                  <p className={s.who === "narrator" ? "narr" : ""}>
                    {s.who !== "narrator" && <b>{nameOf(s)}: </b>}
                    {s.say}
                  </p>
                </div>
                {mine && (
                  <p className="cc-replay-you">
                    <b>You:</b> {mine.t} {qv != null && <span className={`cc-tag q${qv}`}>{QUAL_TAG[qv]}</span>}
                  </p>
                )}
                {qv != null && qv < 2 && best && (
                  <p className="cc-replay-best">
                    <b>Better:</b> {best.t} <em>— {best.then}</em>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  /* ---------------- the cover ---------------- */
  if (stage === "cover") {
    const castSteps = steps.filter((s, i) => s.who !== "narrator" && steps.findIndex((x) => x.who === s.who && nameOf(x) === nameOf(s)) === i).slice(0, 3);
    const first = steps.find((s) => s.who !== "narrator");
    return (
      <div className="cc-cover">
        <div className="cc-rays" aria-hidden="true" />
        <div className="cc-mast">
          <span className="cc-mast-k">Story Mode</span>
          <span className="cc-mast-n">{steps.length} pages</span>
        </div>
        <h3 className="cc-title">{q.q}</h3>
        {st.intro && <p className="cc-caption">{st.intro}</p>}
        {first && (
          <span className="cc-cover-say">
            <Bubble mood={first.mood}>
              <b>{nameOf(first)}:</b> {first.say.length > 70 ? first.say.slice(0, 68) + "…" : first.say}
            </Bubble>
          </span>
        )}
        <div className="cc-cast">
          {castSteps.map((s, i) => (
            <span key={i} className="cc-cast-who" style={{ ["--i" as string]: i } as CSSProperties}>
              <Who s={s} mood={s.mood} size={86} />
              <small>{nameOf(s)}</small>
            </span>
          ))}
          <span className="cc-cast-who you" style={{ ["--i" as string]: castSteps.length } as CSSProperties}>
            <Chibi look={meLook} equipped={me?.equipped} variant="full" size={86} mood="happy" />
            <small>You</small>
          </span>
        </div>
        <button type="button" className="cc-btn" onClick={() => setStage("read")} data-autofocus>
          Read the story
        </button>
      </div>
    );
  }

  /* ---------------- a page ---------------- */
  const narr = step.who === "narrator";
  const mine = picks[scene];
  const reply = mine != null ? step.choices[mine] : null;
  const showReply = phase === "reply" || phase === "react" || phase === "ready";
  const showReact = phase === "react" || phase === "ready";
  // who reacts on a narrator page: the last character we met
  const reactor = narr ? steps.slice(0, scene).reverse().find((s) => s.who !== "narrator") : step;
  const reactMood: StoryMood = reply?.mood || (reactor === step ? step.mood : undefined) || "idle";
  return (
    <div className="cc" onClick={skip}>
      <div className="cc-top" aria-label={`Page ${scene + 1} of ${steps.length}`}>
        <span className="cc-top-k">Page {scene + 1} of {steps.length}</span>
        <span className="cc-top-bar" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i < scene || (i === scene && showReply) ? "done" : i === scene ? "cur" : ""} />
          ))}
        </span>
      </div>

      <div className="cc-page" key={scene}>
        {narr ? (
          <div className="cc-panel narr">
            <p className="cc-narr">
              <Typed text={step.say} onDone={said} />
            </p>
          </div>
        ) : (
          <div className={`cc-panel speak m-${step.mood || "idle"}`}>
            <span className="cc-tagname">
              {nameOf(step)}
              {step.name && <small> · {step.role || WHO[step.who].label}</small>}
            </span>
            <span className="cc-fig">
              <Who s={step} mood={step.mood} size={108} />
            </span>
            <Bubble mood={step.mood}>
              <Typed text={step.say} onDone={said} />
            </Bubble>
          </div>
        )}

        {showReply && reply && (
          <div className="cc-panel you">
            <Bubble side="r">{reply.t}</Bubble>
            <span className="cc-fig">
              <Chibi look={meLook} equipped={me?.equipped} variant="full" size={96} mood="idle" />
            </span>
            <span className="cc-tagname r">You</span>
          </div>
        )}

        {showReact && reply && (
          <div className={`cc-panel react m-${reactMood}`}>
            <p className="cc-caption">{reply.then}</p>
            {reactor && (
              <span className="cc-fig">
                <Who s={reactor} mood={reactMood} size={96} />
              </span>
            )}
            {SFX[reactMood] && <span className="cc-sfx">{SFX[reactMood]}</span>}
          </div>
        )}
      </div>

      <div className="cc-act" onClick={(e) => e.stopPropagation()}>
        {phase === "choose" && (
          <div className="cc-choices" role="group" aria-label="What do you do?">
            <span className="cc-ask">What do you do?</span>
            {step.choices.map((c, k) => (
              <button key={k} type="button" className="cc-choice" style={{ ["--i" as string]: k } as CSSProperties} onClick={() => pick(k)}>
                <span className="cc-choice-k">{"ABC"[k]}</span>
                <span>{c.t}</span>
              </button>
            ))}
          </div>
        )}
        {phase === "ready" &&
          (last ? (
            <button type="button" className="cc-btn" disabled={busy} onClick={() => onSubmit(picks.join(","))} data-autofocus>
              {busy ? "Drawing the ending…" : "See how it ends"}
            </button>
          ) : (
            <button type="button" className="cc-btn" onClick={turn} data-autofocus>
              Turn the page
            </button>
          ))}
      </div>
      <div ref={end} className="cc-endmark" />
    </div>
  );
}
