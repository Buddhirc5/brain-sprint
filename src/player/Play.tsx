import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, type AnswerResult } from "../api/Api";
import { errMsg } from "../app/ApiCtx";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Icon, Modal } from "../components/ui";
import { TYPE_LABEL } from "../lib/answers";
import { limitMs, RULES, untimed } from "../lib/scoring";
import { fmtClock, shuffle } from "../lib/util";
import { runKey, type Question, type Run } from "../types";
import { finishCache } from "./common";
import { BucketQ, ENDINGS, endingOf, sortSummary, StoryQ, SwipeQ } from "./qtypes";
import { partialScore } from "../lib/answers";

export interface QState {
  optOrder: number[]; // mcq display order (stored indices)
  rightOrder: number[]; // match: right side display order
  pool: number[]; // order: display order of stored items
  map: Record<number, number>; // match: left index → stored right index
  sel: number | null; // match: selected left
  picked: number[]; // order: stored indices in the player's order
}
export function freshQ(q: Question): QState {
  const n = (q.type === "match" ? q.right : q.items)?.length ?? 0;
  return {
    optOrder: shuffle((q.options || []).map((_, i) => i)),
    rightOrder: shuffle(Array.from({ length: n }, (_, i) => i)),
    pool: shuffle(Array.from({ length: n }, (_, i) => i)),
    map: {},
    sel: q.type === "match" ? 0 : null,
    picked: [],
  };
}

/** What the player sees after answering. `ok`/`canon` are null in certification exams (hidden). */
export interface Last {
  ok: boolean | null;
  canon: string | null;
  choice: string | null;
  pts: number;
  explain?: string;
  timeUp?: boolean;
}

const HEADS_OK = ["Nailed it!", "Spot on!", "Sharp!", "That's it!"];
const HEADS_NO = ["Not quite…", "Close one!", "Good try!"];
const HEADS_PART = ["So close!", "Almost there!"]; // swipe / bucket / case study, partly right

/* Server-scored play. The flow per question:
     showQuestion(i)  → the server stamps when question i was shown (the clock)
     answer(i, c)     → the server checks it and returns right answer + why (sprint only)
   and finishRun() at the end (or on time-up). Refreshing resumes on the same question with
   the clock still running, because the server remembers qAt. */
export function Play({ gid }: { gid: string }) {
  const { api, tid, d, me, go, toast } = useApp();
  const g = d.games[gid];
  const cert = g?.kind === "cert";
  const story = g?.kind === "story"; // Story Mode: no timer, the comic is the whole screen
  const noClock = !!g && untimed(g); // no timer bar (Story Mode, or a sprint set to "no time limit")
  const [run, setRun] = useState<Run | null>(null);
  const [phase, setPhase] = useState<"load" | "q" | "sending" | "reveal" | "saving">("load");
  const [qi, setQi] = useState(0); // question on screen
  const [qs, setQs] = useState<QState | null>(null);
  const [qStart, setQStart] = useState(Date.now());
  const [last, setLast] = useState<Last | null>(null);
  const [now, setNow] = useState(Date.now());
  const [quit, setQuit] = useState(false);
  const [fatal, setFatal] = useState("");
  const busy = useRef(false);
  const blur = useRef(0);
  const timedOut = useRef(false);
  const qsRef = useRef(g?.questions);
  qsRef.current = g?.questions;

  const finish = useCallback(async () => {
    setPhase("saving");
    try {
      const res = await api.finishRun(tid, gid);
      if (me) finishCache.set(`${tid}|${me.uid}|${runKey(gid, res.run.attempt || 1)}`, res);
      go({ v: "results", gid, fresh: true });
    } catch (e) {
      toast(errMsg(e));
      setPhase("reveal");
      busy.current = false;
    }
  }, [api, tid, gid, go, toast, me]);

  /** Show question i: the server starts its clock (or keeps the one already running). */
  const show = useCallback(
    async (i: number, resumedAt?: number) => {
      const qsNow = qsRef.current || [];
      const r = await api.showQuestion(tid, gid, i);
      // resuming after a refresh: the clock kept running since the question was first shown
      const elapsed = resumedAt ? Math.max(0, Date.now() - resumedAt) : 0;
      const t = Date.now() - elapsed;
      setRun(r);
      setQi(i);
      setQs(freshQ(qsNow[i]));
      setQStart(t);
      setNow(Date.now());
      setLast(null);
      setPhase("q");
    },
    [api, tid, gid],
  );

  /* start or resume — once per mount. (A ref, not state, guards it: data pushes can re-run
     this effect before our own state commits, which once froze the quiz.) */
  const started = useRef(false);
  useEffect(() => {
    if (!g || !me || started.current) return;
    started.current = true;
    (async () => {
      try {
        const r = await api.startRun(tid, gid);
        blur.current = r.blur || 0;
        setRun(r);
        if (r.status === "done") {
          go({ v: "results", gid });
          return;
        }
        if (r.ans.length >= g.questions.length) {
          busy.current = true;
          await finish();
          return;
        }
        await show(r.ans.length, r.qAt);
      } catch (e) {
        if (e instanceof ApiError && e.code === "conflict") go({ v: "results", gid });
        else setFatal(errMsg(e));
      }
    })();
  }, [g, me, api, tid, gid, go, show, finish]);

  /* clock */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  /* leaving the tab mid-question is counted (never blocked) */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && phase === "q") blur.current += 1;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  const lim = g ? limitMs(g) : 0;
  const used = run ? run.ans.reduce((s, a) => s + (a.ms || 0), 0) : 0;
  const left = Math.max(0, lim - used - (phase === "q" || phase === "sending" ? now - qStart : 0));
  const n = g?.questions.length || 0;

  const applyResult = (res: AnswerResult, choice: string | null, timeUp?: boolean) => {
    setRun(res.run);
    setLast({ ok: res.ok, canon: res.canon, choice: res.run.ans[qi]?.c ?? choice, pts: res.pts, explain: res.explain, timeUp });
    setPhase("reveal");
  };

  const submit = async (choice: string) => {
    if (!run || !g || phase !== "q" || busy.current) return;
    busy.current = true;
    setPhase("sending");
    try {
      const res = await api.answer(tid, gid, qi, choice, blur.current);
      applyResult(res, choice);
    } catch (e) {
      if (e instanceof ApiError && e.code === "closed") {
        await finish();
        return;
      }
      if (e instanceof ApiError && e.code === "invalid") {
        // already answered (another tab?) — resync with the server
        try {
          const r = await api.startRun(tid, gid);
          setRun(r);
          if (r.status === "done" || r.ans.length >= n) await finish();
          else await show(r.ans.length, r.qAt);
        } catch (e2) {
          toast(errMsg(e2));
        }
      } else {
        toast(errMsg(e));
        setPhase("q");
      }
    } finally {
      busy.current = false;
    }
  };

  const timeUp = useCallback(async () => {
    if (!run || !g || busy.current || timedOut.current) return;
    busy.current = true;
    timedOut.current = true;
    setPhase("sending");
    try {
      const res = await api.answer(tid, gid, qi, null, blur.current);
      if (cert) {
        await finish();
        return;
      }
      applyResult(res, null, true);
    } catch {
      await finish();
    } finally {
      busy.current = false;
    }
  }, [run, g, api, tid, gid, qi, cert, finish]);

  useEffect(() => {
    if (phase === "q" && run && g && left <= 0 && run.ans.length < g.questions.length) timeUp();
  }, [left, phase, run, g, timeUp]);

  const next = async () => {
    if (!run || !g || busy.current) return;
    busy.current = true;
    try {
      if (timedOut.current || run.ans.length >= n) await finish();
      else {
        setPhase("saving");
        await show(run.ans.length);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e) {
      toast(errMsg(e));
      setPhase("reveal");
    } finally {
      busy.current = false;
    }
  };

  const sheetOpen = phase === "reveal" || (phase === "saving" && !!last);
  const { pageRef, sheetRef } = useRevealSheet(sheetOpen, qi);

  if (!g || !me)
    return (
      <div className="phone">
        <div className="empty">This quiz isn't available.</div>
        <button type="button" className="btn ghost block" onClick={() => go({ v: "lobby" })}>
          Back
        </button>
      </div>
    );
  if (fatal)
    return (
      <div className="phone">
        <div className="card stack" style={{ textAlign: "center" }}>
          <h2>Can't start this {cert ? "exam" : "quiz"}</h2>
          <p className="fine">{fatal}</p>
          <button type="button" className="btn primary block" onClick={() => go({ v: cert ? "certs" : "lobby" })}>
            Back
          </button>
        </div>
      </div>
    );
  const q = g.questions[qi];
  if (!run || !q || !qs || phase === "load")
    return (
      <div className="phone">
        <div className="card" role="status">
          Getting your {cert ? "exam" : "quiz"} ready…
        </div>
      </div>
    );

  const rv = phase === "reveal" || (phase === "saving" && !!last);
  const isLast = timedOut.current || run.ans.length >= n;
  const unanswered = n - run.ans.length;

  return (
    <div ref={pageRef} className={`phone play ${rv ? "has-sheet" : ""}`} onCopy={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
      <div className="play-top">
        <button type="button" className="icon-btn" aria-label={cert ? "Leave exam" : "Leave quiz"} onClick={() => setQuit(true)}>
          <Icon.close />
        </button>
        <div className="prog" role="img" aria-label={`Question ${qi + 1} of ${n}`}>
          {g.questions.map((_, i) => {
            const a = run.ans[i];
            return <i key={i} className={a ? (cert ? "saved" : a.ok ? "ok" : "no") : i === qi ? "cur" : ""} />;
          })}
        </div>
        <span className="qnum num">
          {qi + 1}/{n}
        </span>
      </div>
      {!noClock && (
      <div className={`gtimer ${rv ? "paused" : ""}`} role="timer" aria-label={`Time left ${fmtClock(left)}`}>
        <Icon.clock />
        <div className="tbar">
          <span className={left < 15000 ? "low" : ""} style={{ width: `${lim ? (left / lim) * 100 : 0}%` }} />
        </div>
        <b className="num">{fmtClock(left)}</b>
      </div>
      )}
      {cert && g.cert && (
        <p className="fine" style={{ textAlign: "center" }}>
          {g.title} · attempt {run.attempt || 1} of {g.cert.attempts} · pass mark {g.cert.passPct}%
        </p>
      )}

      <section className={`qcard ${story ? "comic" : ""}`} aria-live="polite">
        {story ? (
          <h2 className="sr">{q.q}</h2>
        ) : (
          <>
            <div className="qhead">
              <span className="qtype">{TYPE_LABEL[q.type]}</span>
              <span className="chip">{q.topic}</span>
            </div>
            <h2 className="qtext">{q.q}</h2>
          </>
        )}
        {q.img && <img className="qimg" src={q.img} alt="" />}
        <QBody key={q.id + qi} q={q} qs={qs} setQs={setQs} rv={rv} busy={phase === "sending"} last={last} onSubmit={submit} />
      </section>

      {rv && last && cert && (
        <section ref={sheetRef} className="reveal saved sheet">
          <div className="top">
            <span className="saved-ic" aria-hidden="true">
              <Icon.check />
            </span>
            <div className="big">{last.timeUp ? "Time's up" : "Answer saved"}</div>
          </div>
          <p className="why">Results are shown when you finish the exam.</p>
          <button type="button" className="btn primary block" onClick={next} disabled={phase === "saving"} data-autofocus>
            {phase === "saving" ? "Saving…" : isLast ? "Finish exam" : "Next question"}
          </button>
        </section>
      )}

      {rv && last && story && (
        <section ref={sheetRef} className="reveal sheet story-bar">
          <span className="pts num">+{last.pts} points</span>
          <button type="button" className="btn primary" onClick={next} disabled={phase === "saving"}>
            {phase === "saving" ? "Saving…" : isLast ? "See my scorecard" : "Next story"}
          </button>
        </section>
      )}

      {rv && last && !cert && !story && (
        <section ref={sheetRef} className={`reveal sheet ${last.ok ? "ok" : "no"}`}>
          <div className="top">
            <Chibi look={me.look} equipped={me.equipped} variant="full" size={72} mood={last.ok ? "happy" : "sad"} />
            <div>
              <div className="big">{last.timeUp ? "Time's up!" : last.ok ? HEADS_OK[qi % 4] : last.pts > 0 ? HEADS_PART[qi % 2] : HEADS_NO[qi % 3]}</div>
              {last.ok && last.pts > RULES.base ? (
                <div className="fine" style={{ color: "inherit", fontWeight: 700 }}>
                  +{last.pts - RULES.base} speed bonus
                </div>
              ) : null}
            </div>
            <span className="pts num">+{last.pts}</span>
          </div>
          <RightAnswer q={q} right={last.canon} ok={!!last.ok} choice={last.choice} />
          {last.explain && <p className="why">{last.explain}</p>}
          {last.timeUp && unanswered > 0 && (
            <p className="why">
              <b>
                {unanswered} question{unanswered > 1 ? "s" : ""} left unanswered.
              </b>
            </p>
          )}
          <button type="button" className={`btn ${last.ok ? "primary" : "lime"} block`} onClick={next} disabled={phase === "saving"}>
            {phase === "saving" ? "Saving…" : isLast ? "See my scorecard" : "Next question"}
          </button>
        </section>
      )}

      {quit && (
        <Modal label={cert ? "Leave the exam?" : "Leave the quiz?"} onClose={() => setQuit(false)}>
          <h3>{cert ? "Leave the exam?" : "Leave the quiz?"}</h3>
          <p>
            {cert
              ? "Your answers so far are saved, but the exam clock keeps running while you're away."
              : story
                ? "You can come back later — the story starts again from its cover."
                : noClock
                ? "You only get one try at this quiz."
                : "You only get one try, and the clock keeps running while you're away."}
          </p>
          <div className="row end">
            <button type="button" className="btn ghost small" onClick={() => setQuit(false)} data-autofocus>
              Keep going
            </button>
            <button type="button" className="btn orange small" onClick={() => go({ v: cert ? "certs" : "lobby" })}>
              Leave
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** On phones the answer result is a bottom sheet (player.css): pad the page by its height so nothing
    hides behind it, and nudge the answers into view above it. Toasts move to the top while playing. */
export function useRevealSheet(sheetOpen: boolean, qi: number) {
  const pageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.body.classList.add("in-play");
    return () => document.body.classList.remove("in-play");
  }, []);
  useLayoutEffect(() => {
    const page = pageRef.current, sheet = sheetRef.current;
    if (!page) return;
    if (!sheetOpen || !sheet || getComputedStyle(sheet).position !== "fixed") {
      page.style.removeProperty("--sheet-h");
      return;
    }
    const fit = () => page.style.setProperty("--sheet-h", `${sheet.offsetHeight}px`);
    fit();
    const card = page.querySelector(".qcard");
    if (card) {
      const r = card.getBoundingClientRect();
      const hidden = r.bottom - (window.innerHeight - sheet.offsetHeight) + 8;
      if (hidden > 0) window.scrollBy({ top: Math.min(hidden, Math.max(0, r.top - 8)), behavior: "smooth" });
    }
    const ro = new ResizeObserver(fit);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [sheetOpen, qi]);
  return { pageRef, sheetRef };
}

export function RightAnswer({ q, right, ok, choice }: { q?: Question; right: string | null; ok: boolean; choice?: string | null }) {
  if (!q || right == null) return null;
  if (q.type === "story") {
    const e = endingOf(partialScore("story", right, choice ?? null) ?? 0);
    return (
      <p className="ans">
        Ending: <b>{ENDINGS[e][0]} {ENDINGS[e][1]}</b> — see the replay above.
      </p>
    );
  }
  if (q.type === "swipe" || q.type === "bucket") {
    const s = sortSummary(q, right, choice ?? null);
    return s ? (
      <p className="ans">
        <b>{s.right} of {s.of}</b> {q.type === "swipe" ? "cards" : "items"} in the right place{s.right < s.of ? " — fixes are shown above." : "!"}
      </p>
    ) : null;
  }
  if (q.type === "mcq")
    return (
      <p className="ans">
        {ok ? "Correct answer:" : "Right answer:"} <b>{q.options?.[Number(right)]}</b>
      </p>
    );
  if (q.type === "tf")
    return (
      <p className="ans">
        {ok ? "Correct:" : "Right answer:"} <b>{right === "T" ? "True" : "False"}</b>
      </p>
    );
  if (ok) return null;
  return <p className="ans">{q.type === "match" ? "The correct pairs are shown above." : "The correct order is shown above."}</p>;
}

export function QBody({ q, qs, setQs, rv, busy, last, onSubmit }: { q: Question; qs: QState; setQs: (s: QState) => void; rv: boolean; busy: boolean; last: Last | null; onSubmit: (c: string) => void }) {
  const right = rv ? last?.canon ?? null : null;
  if (q.type === "swipe" || q.type === "bucket" || q.type === "story") {
    const C = q.type === "swipe" ? SwipeQ : q.type === "bucket" ? BucketQ : StoryQ;
    return <C q={q} rv={rv} busy={busy} canon={right} choice={rv ? last?.choice ?? null : null} onSubmit={onSubmit} explain={rv ? last?.explain : undefined} />;
  }
  const mine = rv ? last?.choice ?? null : null;
  const hidden = rv && right == null; // certification: show what you picked, not whether it was right
  const lock = rv || busy;

  if (q.type === "mcq") {
    return (
      <div className="opts">
        {qs.optOrder.map((oi, k) => {
          let cls = "";
          if (hidden) cls = String(oi) === mine ? "saved" : "dim";
          else if (rv) cls = String(oi) === right ? "right" : String(oi) === mine ? "wrong" : "dim";
          return (
            <button type="button" key={oi} className={`opt ${cls}`} disabled={lock} onClick={() => onSubmit(String(oi))}>
              <span className="k">{"ABCDEFGH"[k]}</span>
              <span>{q.options![oi]}</span>
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === "tf") {
    return (
      <div className="tf">
        {(["T", "F"] as const).map((v) => {
          let cls = "";
          if (hidden) cls = v === mine ? "saved" : "dim";
          else if (rv) cls = v === right ? "right" : v === mine ? "wrong" : "dim";
          return (
            <button type="button" key={v} className={`opt ${cls}`} disabled={lock} onClick={() => onSubmit(v)}>
              {v === "T" ? "TRUE" : "FALSE"}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === "match") {
    const L = q.left || [],
      R = q.right || [];
    if (rv) {
      const got = (mine || "").split(",").map(Number);
      if (hidden)
        return (
          <div className="opts">
            {L.map((l, i) => (
              <div key={i} className="opt saved" style={{ animation: "none" }}>
                <span className="k">{i + 1}</span>
                <span>
                  <b>{l}</b> → {mine != null ? R[got[i]] : "—"}
                </span>
              </div>
            ))}
          </div>
        );
      const corr = (right || "").split(",").map(Number);
      return (
        <div className="opts">
          {L.map((l, i) => {
            const ok = mine != null && got[i] === corr[i];
            return (
              <div key={i} className={`opt ${ok ? "right" : "wrong"}`} style={{ animation: "none" }}>
                <span className="k">{ok ? "✓" : "✕"}</span>
                <span>
                  <b>{l}</b> → {R[corr[i]]}
                  {!ok && mine != null && (
                    <span className="fine" style={{ display: "block" }}>
                      You matched: {R[got[i]]}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    const leftOf = (ri: number) =>
      Object.keys(qs.map)
        .map(Number)
        .find((k) => qs.map[k] === ri);
    const colorIdx = (li: number) =>
      Object.keys(qs.map)
        .map(Number)
        .sort((a, b) => a - b)
        .indexOf(li);
    const pickLeft = (i: number) => {
      if (qs.map[i] !== undefined) {
        const m = { ...qs.map };
        delete m[i];
        setQs({ ...qs, map: m, sel: i });
      } else setQs({ ...qs, sel: i });
    };
    const pickRight = (ri: number) => {
      const owner = leftOf(ri);
      const m = { ...qs.map };
      if (owner !== undefined) {
        delete m[owner];
        setQs({ ...qs, map: m, sel: owner });
        return;
      }
      if (qs.sel == null) return;
      m[qs.sel] = ri;
      const nextSel = L.findIndex((_, k) => m[k] === undefined);
      setQs({ ...qs, map: m, sel: nextSel < 0 ? null : nextSel });
    };
    const complete = Object.keys(qs.map).length === L.length;
    return (
      <>
        <p className="hint">Tap a term, then tap its match. Tap a matched item to undo.</p>
        <div className="match">
          <div className="col">
            {L.map((l, i) => {
              const m = qs.map[i] !== undefined;
              const c = colorIdx(i);
              return (
                <button type="button" key={i} className={`mi ${m ? "c" + (c % 6) : ""} ${qs.sel === i ? "sel" : ""}`} onClick={() => pickLeft(i)} aria-pressed={qs.sel === i}>
                  {m && <span className="n">{c + 1}</span>}
                  {l}
                </button>
              );
            })}
          </div>
          <div className="col">
            {qs.rightOrder.map((ri) => {
              const li = leftOf(ri);
              const c = li !== undefined ? colorIdx(li) : -1;
              return (
                <button type="button" key={ri} className={`mi ${li !== undefined ? "c" + (c % 6) : ""}`} onClick={() => pickRight(ri)}>
                  {li !== undefined && <span className="n">{c + 1}</span>}
                  {R[ri]}
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="btn primary block" disabled={!complete || busy} onClick={() => onSubmit(L.map((_, i) => qs.map[i]).join(","))}>
          {busy ? "Checking…" : "Check my matches"}
        </button>
      </>
    );
  }
  /* order */
  const items = q.items || [];
  if (rv) {
    const got = (mine || "").split(",").map(Number);
    if (hidden)
      return (
        <div className="opts">
          {(mine != null ? got : []).map((v, k) => (
            <div key={k} className="opt saved" style={{ animation: "none" }}>
              <span className="k">{k + 1}</span>
              <span>{items[v]}</span>
            </div>
          ))}
        </div>
      );
    const corr = (right || "").split(",").map(Number);
    return (
      <div className="opts">
        {corr.map((v, k) => {
          const ok = mine != null && got[k] === v;
          return (
            <div key={k} className={`opt ${ok ? "right" : "wrong"}`} style={{ animation: "none" }}>
              <span className="k">{k + 1}</span>
              <span>{items[v]}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <>
      <p className="hint">Tap the steps in the right order. Tap a placed step to take it back.</p>
      <div className="order-picked" aria-label="Your order">
        {qs.picked.length ? (
          qs.picked.map((v, k) => (
            <button type="button" key={v} className="oi" onClick={() => setQs({ ...qs, picked: qs.picked.filter((x) => x !== v) })}>
              <span className="n">{k + 1}</span>
              {items[v]}
            </button>
          ))
        ) : (
          <span className="hint" style={{ textAlign: "center", padding: 10 }}>
            Your order builds here
          </span>
        )}
      </div>
      <div className="opts">
        {qs.pool
          .filter((v) => !qs.picked.includes(v))
          .map((v) => (
            <button type="button" key={v} className="oi" onClick={() => setQs({ ...qs, picked: [...qs.picked, v] })}>
              <span className="n" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                ·
              </span>
              {items[v]}
            </button>
          ))}
      </div>
      <button type="button" className="btn primary block" disabled={qs.picked.length < items.length || busy} onClick={() => onSubmit(qs.picked.join(","))}>
        {busy ? "Checking…" : "Check my order"}
      </button>
    </>
  );
}
