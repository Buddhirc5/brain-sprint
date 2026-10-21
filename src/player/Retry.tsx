/* Second chance: after a daily quiz, each missed question can be tried once more — untimed, for a
   capped fix bonus (scoring.ts retryPoints), so a first-try right answer always stays worth more. */
import { useMemo, useState } from "react";
import { errMsg } from "../app/ApiCtx";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { confetti, Icon } from "../components/ui";
import { choiceText, TYPE_LABEL } from "../lib/answers";
import { RULES, retryable } from "../lib/scoring";
import { finishCache, TopBar } from "./common";
import { freshQ, QBody, RightAnswer, useRevealSheet, type Last, type QState } from "./Play";

export function Retry({ gid }: { gid: string }) {
  const { api, tid, d, me, go, toast } = useApp();
  const g = d.games[gid];
  const run = me?.runs?.[gid] || (me ? finishCache.get(`${tid}|${me.uid}|${gid}`)?.run : undefined);
  // the misses to fix, fixed when the screen opens (answers drop off the list as they're retried)
  const [todo] = useState(() => retryable(run));
  const [k, setK] = useState(-1); // -1 intro · 0..n-1 question · n summary
  const [qs, setQs] = useState<QState | null>(null);
  const [last, setLast] = useState<Last | null>(null);
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<{ fixed: number; pts: number }>({ fixed: 0, pts: 0 });
  const n = todo.length;
  const qi = k >= 0 && k < n ? todo[k] : -1;
  const q = g?.questions[qi];
  const { pageRef, sheetRef } = useRevealSheet(!!last, k);
  const first = run?.ans[qi];
  const firstText = useMemo(() => (q && first ? (first.sk ? "Not answered" : choiceText(q, first.c)) : ""), [q, first]);

  if (!g || !me || g.kind === "cert" || !run)
    return (
      <div className="phone">
        <TopBar title="Second chance" back={() => go({ v: "lobby" })} />
        <div className="empty">Nothing to retry here.</div>
      </div>
    );

  const open = (i: number) => {
    setK(i);
    setLast(null);
    if (i < n) setQs(freshQ(g.questions[todo[i]]));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (choice: string) => {
    if (busy || last || qi < 0) return;
    setBusy(true);
    try {
      const r = await api.retryAnswer(tid, gid, qi, choice);
      setLast({ ok: r.fixed, canon: r.canon, choice, pts: r.rp, explain: r.explain });
      setGot((s) => ({ fixed: s.fixed + (r.fixed ? 1 : 0), pts: s.pts + r.rp }));
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const back = () => go({ v: "results", gid });

  /* ---- intro ---- */
  if (k < 0)
    return (
      <div className="phone">
        <TopBar title="Second chance" back={back} />
        <section className="sc-hero">
          <span className="sc-ribbon">🎯 Second chance</span>
          <h2>
            Fix {n === 1 ? "your miss" : `your ${n} misses`}
          </h2>
          <p>Every question you missed gets one more try — no timer, no rush. Get it right for up to +{RULES.retry} points.</p>
          <ul className="sc-rules">
            <li>One retry per question</li>
            <li>No speed bonus — take your time</li>
            <li>Right first time always scores more</li>
          </ul>
          <div className="sc-char" aria-hidden="true">
            <Chibi look={me.look} equipped={me.equipped} variant="full" size={104} mood="think" />
          </div>
        </section>
        {n ? (
          <button type="button" className="btn lime block" onClick={() => open(0)} data-autofocus>
            Start — {n} question{n > 1 ? "s" : ""}
          </button>
        ) : (
          <div className="empty">All done — nothing left to fix.</div>
        )}
        <button type="button" className="btn ghost block" onClick={back}>
          Back to my scorecard
        </button>
      </div>
    );

  /* ---- summary ---- */
  if (k >= n || !q || !qs)
    return (
      <div className="phone">
        <TopBar title="Second chance" back={back} />
        <section className="sc-hero done">
          <span className="sc-ribbon">🎯 Second chance</span>
          <h2>{got.fixed === n ? "All fixed!" : got.fixed ? "Nice comeback!" : "Lessons learned"}</h2>
          <p>
            You fixed <b>{got.fixed}</b> of {n} · <b>+{got.pts}</b> points added to this quiz.
          </p>
          <div className="sc-char" aria-hidden="true">
            <Chibi look={me.look} equipped={me.equipped} variant="full" size={104} mood={got.fixed ? "cheer" : "happy"} />
          </div>
        </section>
        <button type="button" className="btn primary block" onClick={back} data-autofocus>
          See my scorecard
        </button>
        <button type="button" className="btn ghost block" onClick={() => go({ v: "lobby" })}>
          Back to the lobby
        </button>
      </div>
    );

  /* ---- a question ---- */
  const isLast = k === n - 1;
  const done = () => {
    if (isLast && got.fixed) setTimeout(() => confetti(), 150);
    open(k + 1);
  };
  return (
    <div ref={pageRef} className={`phone play sc ${last ? "has-sheet" : ""}`} onCopy={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
      <div className="play-top">
        <button type="button" className="icon-btn" aria-label="Leave second chance" onClick={back}>
          <Icon.close />
        </button>
        <div className="prog" role="img" aria-label={`Retry ${k + 1} of ${n}`}>
          {todo.map((_, i) => (
            <i key={i} className={i < k || (i === k && last) ? "ok" : i === k ? "cur" : ""} />
          ))}
        </div>
        <span className="qnum num">
          {k + 1}/{n}
        </span>
      </div>
      <div className="sc-bar">
        <span className="sc-ribbon">🎯 Second chance</span>
        <span>No timer · up to +{RULES.retry}</span>
      </div>

      <section className="qcard" aria-live="polite">
        <div className="qhead">
          <span className="qtype">{TYPE_LABEL[q.type]}</span>
          <span className="chip">{q.topic}</span>
        </div>
        <h2 className="qtext">{q.q}</h2>
        {q.img && <img className="qimg" src={q.img} alt="" />}
        {firstText && q.type !== "story" && q.type !== "swipe" && q.type !== "bucket" && (
          <p className="sc-first">
            First try: <s>{firstText}</s>
          </p>
        )}
        <QBody key={q.id + k} q={q} qs={qs} setQs={setQs} rv={!!last} busy={busy} last={last} onSubmit={submit} />
      </section>

      {last && (
        <section ref={sheetRef} className={`reveal sheet ${last.ok ? "ok" : "no"}`}>
          <div className="top">
            <Chibi look={me.look} equipped={me.equipped} variant="full" size={72} mood={last.ok ? "happy" : "sad"} />
            <div className="big">{last.ok ? "Fixed it!" : "Not this time"}</div>
            <span className="pts num">+{last.pts}</span>
          </div>
          <RightAnswer q={q} right={last.canon} ok={!!last.ok} choice={last.choice} />
          {last.explain && <p className="why">{last.explain}</p>}
          <button type="button" className={`btn ${last.ok ? "primary" : "lime"} block`} onClick={done}>
            {isLast ? "Finish" : "Next miss"}
          </button>
        </section>
      )}
    </div>
  );
}
