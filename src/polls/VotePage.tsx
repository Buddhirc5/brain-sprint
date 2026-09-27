/* Audience page for live polls (mobile-first): enter the 6-digit code, then follow
   the presenter — answer the current slide, change the answer, see results when
   the presenter shares them, ask and upvote questions in Q&A. Anonymous. */
import { LogoMark } from "../components/Logo";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useApi, errMsg } from "../app/ApiCtx";
import { applyBranding, setTitle } from "../app/theme";
import { isDemo } from "../api/demo/guard";
import { GRID_MAX, POINTS_TOTAL, guessRange, isContentSlide, pollValueProblem } from "../api/engine";
import { Icon } from "../components/ui";
import { Mascot } from "../components/Chibi";
import { LS, clamp } from "../lib/util";
import type { Poll, PollValue, Slide, TenantPublic } from "../types";
import { StageModeToggle, useStageMode } from "../app/stageTheme";
import { ContentSlide, Ico, Results, SlideImage, TYPE_META, TypeIcon, fmtCode, stageVars, useResults } from "./shared";

/** "?fresh=1&t=harbor" after the hash path. */
function hashQuery() {
  const q = location.hash.split("?")[1] || "";
  return new URLSearchParams(q);
}

export function VotePage({ code }: { code?: string }) {
  const { api } = useApi();
  const query = useMemo(hashQuery, [code]);
  const qs = query.toString() ? "?" + query.toString() : "";
  const [pub, setPub] = useState<TenantPublic | null>(null);

  // default look until we know whose poll this is
  useEffect(() => {
    applyBranding(undefined);
    setTitle("Vote · Ant Arena");
  }, []);

  // a company link (?t=slug, used by the presenter's QR code) brands the page
  const slugHint = query.get("t") || "";
  useEffect(() => {
    if (!slugHint) return;
    let live = true;
    api.tenantBySlug(slugHint).then((p) => live && setPub(p), () => undefined);
    return () => {
      live = false;
    };
  }, [api, slugHint]);

  if (!code || !/^\d{6}$/.test(code)) return <CodeEntry initial={code} qs={qs} pub={pub} />;
  return <VoteSession code={code} qs={qs} pub={pub} setPub={setPub} fresh={query.get("fresh") === "1"} />;
}

/* ---------------- code entry ---------------- */
function CodeEntry({ initial, qs, pub, error }: { initial?: string; qs: string; pub: TenantPublic | null; error?: string }) {
  const [v, setV] = useState((initial || "").replace(/\D/g, "").slice(0, 6));
  const go = (e: FormEvent) => {
    e.preventDefault();
    const c = v.replace(/\D/g, "");
    if (c.length === 6) location.hash = `#/vote/${c}${qs}`;
  };
  return (
    <div className="phone pv">
      <VoteHead pub={pub} />
      <form className="card pv-code stack" onSubmit={go}>
        <div className="pv-hero">
          <Mascot mood="happy" size={96} />
          <div>
            <h1>Join a poll</h1>
            <p className="fine">Enter the code on the presenter's screen.</p>
          </div>
        </div>
        <label className="sr" htmlFor="pv-code">6-digit code</label>
        <input
          id="pv-code"
          className="inp pv-codein num"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123 456"
          value={fmtCode(v)}
          onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={!!error}
          autoFocus
        />
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary block" disabled={v.length !== 6}>
          Join
        </button>
      </form>
      <p className="fine pv-links">
        <a className="link" href="#/">Home</a> · <a className="link" href="#/join">Join a live game</a>
      </p>
      <Anon />
    </div>
  );
}

function VoteHead({ pub, title }: { pub: TenantPublic | null; title?: string }) {
  const [mode, toggleMode] = useStageMode();
  const name = pub?.branding.productName || "Ant Arena";
  const mark = pub?.branding.logo ? <img src={pub.branding.logo} alt="" className="pv-logo" /> : pub ? <span className="pv-mark" aria-hidden="true">{name.slice(0, 1)}</span> : <LogoMark size={40} />;
  return (
    <header className="pv-head">
      {pub ? mark : <a href="#/" aria-label="Ant Arena home">{mark}</a>}
      <div className="pv-hname">
        <b>{name}</b>
        {title && <span>{title}</span>}
      </div>
      {title && <StageModeToggle mode={mode} onToggle={toggleMode} className="pv-mode" />}
    </header>
  );
}

function Anon() {
  return (
    <p className="pv-anon">
      <Icon.lock /> Your answers are anonymous
    </p>
  );
}

/* ---------------- a joined session ---------------- */
type Found = { s: "loading" } | { s: "none"; msg: string } | { s: "ok"; pollId: string; title: string };

function VoteSession({ code, qs, pub, setPub, fresh }: { code: string; qs: string; pub: TenantPublic | null; setPub: (p: TenantPublic | null) => void; fresh: boolean }) {
  const { api, user } = useApi();
  const [found, setFound] = useState<Found>({ s: "loading" });
  const [poll, setPoll] = useState<Poll | null>(null);

  // identity (anonymous) then find the poll
  useEffect(() => {
    let live = true;
    setFound({ s: "loading" });
    (async () => {
      try {
        let freshDone = false;
        try {
          freshDone = sessionStorage.getItem("bs.vote.fresh") === "1";
        } catch {
          /* ignore */
        }
        if (fresh && isDemo(api) && !freshDone) {
          await api.demoFreshTab();
          try {
            sessionStorage.setItem("bs.vote.fresh", "1");
          } catch {
            /* ignore */
          }
        } else if (!api.user()) await api.signInAnonymous();
        const f = await api.pollFind(code);
        if (!live) return;
        if (!f) setFound({ s: "none", msg: "No open poll has that code. Check the code on the screen — the poll may have ended." });
        else {
          setFound({ s: "ok", ...f });
          // a future API may return the company's web address; use it to brand the page
          const slug = (f as { slug?: string }).slug;
          if (slug && !pub) api.tenantBySlug(slug).then((p) => live && setPub(p), () => undefined);
        }
      } catch (e) {
        if (live) setFound({ s: "none", msg: errMsg(e) });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, code, fresh]);

  const pollId = found.s === "ok" ? found.pollId : undefined;
  useEffect(() => {
    if (!pollId) return;
    return api.watchPoll(pollId, setPoll);
  }, [api, pollId]);

  // brand only when the hinted company really owns this poll
  const brand = pub && poll && pub.id === poll.tenantId ? pub : null;
  useEffect(() => {
    if (brand) {
      applyBranding(brand.branding);
      setTitle(`${poll?.title || "Vote"} · ${brand.branding.productName}`);
    } else if (poll) setTitle(`${poll.title} · Vote`);
  }, [brand, poll?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (found.s === "none") return <CodeEntry initial={code} qs={qs} pub={pub} error={found.msg} />;
  if (found.s === "loading" || !poll || !user)
    return (
      <div className="phone pv">
        <VoteHead pub={brand} />
        <div className="card pv-center">
          <Mascot mood="think" size={96} />
          <b>Joining {fmtCode(code)}…</b>
        </div>
      </div>
    );

  const slide = poll.status === "open" ? poll.slides[poll.current] : undefined;
  return (
    <div className="phone pv">
      <VoteHead pub={brand} title={poll.title} />
      {poll.status !== "open" ? (
        <div className="card pv-center stack">
          <Mascot mood="cheer" size={110} />
          <h2>This poll has ended</h2>
          <p className="fine">Thanks for taking part!</p>
          <a className="btn ghost small" href={`#/vote${qs}`}>
            Join another poll
          </a>
        </div>
      ) : !slide ? (
        <div className="card pv-center">
          <Mascot mood="idle" size={96} />
          <b>Waiting for the presenter…</b>
        </div>
      ) : (
        <VoteSlide key={slide.id} poll={poll} slide={slide} uid={user.id} brand={brand} />
      )}
      <Anon />
    </div>
  );
}

/* ---------------- one slide ---------------- */
function VoteSlide({ poll, slide, uid, brand }: { poll: Poll; slide: Slide; uid: string; brand: TenantPublic | null }) {
  const { api } = useApi();
  const [mode] = useStageMode();
  const [mine, setMine] = useState<PollValue | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const content = isContentSlide(slide.type);
  useEffect(() => {
    let live = true;
    if (slide.type === "qa" || content) {
      setLoaded(true);
      return;
    }
    api.pollMyResponses(poll.id).then(
      (m) => {
        if (!live) return;
        setMine(m[slide.id]);
        setLoaded(true);
      },
      () => live && setLoaded(true),
    );
    return () => {
      live = false;
    };
  }, [api, poll.id, slide.id, slide.type, content]);

  const submitted = !!mine && !editing;
  const showRes = poll.showResults && (submitted || poll.locked || slide.type === "qa");
  const r = useResults(api, poll.id, slide.id, !content && (showRes || slide.type === "qa"));

  const submit = async (v: PollValue): Promise<boolean> => {
    const bad = pollValueProblem(slide, v);
    if (bad) {
      setErr(bad);
      return false;
    }
    setErr("");
    setBusy(true);
    try {
      await api.pollRespond(poll.id, slide.id, v);
      if (slide.type !== "qa") setMine(v);
      setEditing(false);
      return true;
    } catch (e) {
      setErr(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <div className="pv-q">
      <span className="pv-kind">
        <TypeIcon t={slide.type} />
        {TYPE_META[slide.type].label}
        {slide.type === "mc" && slide.multi ? " · pick any" : ""}
        {slide.type === "word" && (slide.maxWords || 1) > 1 ? ` · up to ${slide.maxWords} words` : ""}
      </span>
      {(slide.prompt || slide.type !== "image") && <h1>{slide.prompt || "…"}</h1>}
      <SlideImage slide={slide} />
    </div>
  );

  if (content)
    return (
      <div className="card stack pv-card">
        {head}
        <div className="pv-content">
          <ContentSlide slide={slide} />
          <span className="fine">👀 Look at the screen — the next question will appear here.</span>
        </div>
      </div>
    );

  if (slide.type === "qa") return <QaVote poll={poll} slide={slide} uid={uid} head={head} r={r} submit={submit} busy={busy} err={err} brand={brand} />;
  if (!loaded) return <div className="card">{head}</div>;

  return (
    <>
      <div className="card stack pv-card">
        {head}
        {poll.locked && !submitted ? (
          <div className="pv-state closed">
            <Icon.lock />
            <div>
              <b>Voting is closed for this question</b>
              <span>Wait for the next one.</span>
            </div>
          </div>
        ) : submitted ? (
          <div className="pv-state ok" role="status">
            <span className="tick">
              <Icon.check />
            </span>
            <div>
              <b>Submitted ✓</b>
              <span>{poll.locked ? "Voting is now closed." : "You can change your answer. Waiting for the presenter…"}</span>
            </div>
            {!poll.locked && (
              <button type="button" className="btn ghost tiny" onClick={() => setEditing(true)}>
                Change
              </button>
            )}
          </div>
        ) : (
          <SlideInput slide={slide} initial={mine} busy={busy} onSubmit={submit} err={err} onCancel={mine ? () => setEditing(false) : undefined} />
        )}
      </div>
      {showRes && (
        <section className="pv-res pl-st" style={stageVars(brand?.branding, mode)} aria-label="Live results">
          <div className="pv-res-h">
            <span>Live results</span>
            <span className="num">{r?.n ?? 0} {r?.n === 1 ? "response" : "responses"}</span>
          </div>
          <Results slide={slide} r={r} compact />
        </section>
      )}
      {!poll.showResults && submitted && <p className="pv-note">Results will show on the big screen.</p>}
    </>
  );
}

/* ---------------- Q&A ---------------- */
function QaVote({
  poll, slide, uid, head, r, submit, busy, err, brand,
}: {
  poll: Poll; slide: Slide; uid: string; head: JSX.Element; r: ReturnType<typeof useResults>;
  submit: (v: PollValue) => Promise<boolean>; busy: boolean; err: string; brand: TenantPublic | null;
}) {
  const { api, toast } = useApi();
  const [mode] = useStageMode();
  const [text, setText] = useState("");
  const key = `bs.qa.${poll.id}.${uid}`;
  const [voted, setVoted] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(LS.get(key) || "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const vote = useCallback(
    async (id: string) => {
      const next = new Set(voted);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setVoted(next);
      try {
        await api.qaVote(poll.id, id);
        LS.set(key, JSON.stringify([...next]));
      } catch (e) {
        setVoted(voted);
        toast(errMsg(e));
      }
    },
    [api, poll.id, voted, key, toast],
  );
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await submit({ text: text.trim() });
    if (ok) {
      setText("");
      toast("Question sent — others can upvote it");
    }
  };
  return (
    <>
      <form className="card stack pv-card" onSubmit={ask}>
        {head}
        {poll.locked ? (
          <div className="pv-state closed">
            <Icon.lock />
            <div>
              <b>Questions are closed</b>
              <span>You can still upvote below.</span>
            </div>
          </div>
        ) : (
          <>
            <label className="sr" htmlFor="pv-ask">Your question</label>
            <textarea id="pv-ask" className="inp" rows={3} maxLength={280} placeholder="Type your question…" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="pv-count">
              <span className="fine">Up to 5 questions each</span>
              <span className="fine num">{text.length}/280</span>
            </div>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary block" disabled={busy || text.trim().length < 2}>
              {busy ? "Sending…" : "Ask"}
            </button>
          </>
        )}
      </form>
      <section className="pv-res pl-st" style={stageVars(brand?.branding, mode)} aria-label="Questions">
        <div className="pv-res-h">
          <span>Questions</span>
          <span className="num">{r?.texts?.length ?? 0}</span>
        </div>
        <Results slide={slide} r={r} compact qa={{ onVote: poll.status === "open" ? vote : undefined, voted }} />
      </section>
    </>
  );
}

/* ---------------- inputs per slide type (also used by the editor preview) ---------------- */
export function SlideInput({
  slide, initial, busy, onSubmit, err, onCancel, preview,
}: {
  slide: Slide; initial?: PollValue; busy?: boolean; onSubmit: (v: PollValue) => unknown; err?: string; onCancel?: () => void; preview?: boolean;
}) {
  const opts = slide.options || [];
  const [choice, setChoice] = useState<number[]>(initial && "choice" in initial ? initial.choice : []);
  const nWords = clamp(slide.maxWords || 1, 1, 3);
  const [words, setWords] = useState<string[]>(() => {
    const w = initial && "words" in initial ? initial.words : [];
    return Array.from({ length: nWords }, (_, i) => w[i] || "");
  });
  const [score, setScore] = useState<number | null>(initial && "score" in initial ? initial.score : null);
  const [text, setText] = useState(initial && "text" in initial ? initial.text : "");
  const [order, setOrder] = useState<number[]>(() => (initial && "order" in initial && initial.order.length === opts.length ? initial.order : opts.map((_, i) => i)));
  const [num, setNum] = useState<string>(initial && "num" in initial ? String(initial.num) : "");
  const [alloc, setAlloc] = useState<number[]>(() => (initial && "alloc" in initial && initial.alloc.length === opts.length ? initial.alloc : opts.map(() => 0)));
  const [xy, setXy] = useState<[number, number][]>(() => (initial && "xy" in initial && initial.xy.length === opts.length ? initial.xy : opts.map(() => [5, 5] as [number, number])));
  const [pin, setPin] = useState<[number, number] | null>(initial && "pin" in initial ? initial.pin : null);
  useEffect(() => {
    // editor preview: keep in step with option edits
    if (preview) {
      setOrder(opts.map((_, i) => i));
      setWords(Array.from({ length: nWords }, () => ""));
      setAlloc(opts.map(() => 0));
      setXy(opts.map(() => [5, 5]));
    }
  }, [preview, opts.length, nWords]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = (): PollValue => {
    switch (slide.type) {
      case "mc":
        return { choice: choice.slice().sort((a, b) => a - b) };
      case "word":
        return { words: words.map((w) => w.trim()).filter(Boolean) };
      case "scale":
        return { score: score ?? NaN };
      case "rank":
        return { order };
      case "guess":
        return { num: num.trim() === "" ? NaN : Number(num) };
      case "points":
        return { alloc };
      case "grid":
        return { xy };
      case "pin":
        return { pin: pin || [-1, -1] };
      default:
        return { text: text.trim() };
    }
  };
  const spent = alloc.reduce((a, b) => a + b, 0);
  const ready =
    slide.type === "mc" ? choice.length > 0
    : slide.type === "word" ? words.some((w) => w.trim())
    : slide.type === "scale" ? score != null
    : slide.type === "rank" || slide.type === "grid" ? true
    : slide.type === "guess" ? num.trim() !== "" && Number.isFinite(Number(num))
    : slide.type === "points" ? spent > 0 && spent <= POINTS_TOTAL
    : slide.type === "pin" ? !!pin
    : text.trim().length >= 2;
  const [gLo, gHi] = guessRange(slide);

  const lo = slide.scaleMin ?? 1;
  const hi = slide.scaleMax ?? 5;
  return (
    <form
      className="pv-input stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!preview) void onSubmit(value());
      }}
    >
      {slide.type === "mc" && (
        <div className="pv-opts" role={slide.multi ? "group" : "radiogroup"} aria-label="Options">
          {opts.map((o, i) => {
            const on = choice.includes(i);
            return (
              <button
                key={i}
                type="button"
                role={slide.multi ? "checkbox" : "radio"}
                aria-checked={on}
                className={`pv-opt ${on ? "on" : ""} ${slide.multi ? "multi" : ""}`}
                onClick={() => setChoice(slide.multi ? (on ? choice.filter((x) => x !== i) : [...choice, i]) : [i])}
              >
                <span className="mk">{on ? <Icon.check /> : String.fromCharCode(65 + i)}</span>
                <span className="t">{o || `Option ${i + 1}`}</span>
              </button>
            );
          })}
        </div>
      )}
      {slide.type === "word" && (
        <div className="pv-words">
          {words.map((w, i) => (
            <input
              key={i}
              className="inp"
              maxLength={25}
              aria-label={`Word ${i + 1}`}
              placeholder={i === 0 ? "Type a word" : "Another word (optional)"}
              value={w}
              onChange={(e) => setWords(words.map((x, k) => (k === i ? e.target.value : x)))}
            />
          ))}
        </div>
      )}
      {slide.type === "scale" && (
        <div className="pv-scale">
          <div className={`pv-scale-btns ${hi - lo + 1 > 5 ? "ten" : ""}`} role="radiogroup" aria-label={`Rate from ${lo} to ${hi}`}>
            {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={score === v} className={score === v ? "on" : ""} onClick={() => setScore(v)}>
                {v}
              </button>
            ))}
          </div>
          <div className="pv-scale-ends">
            <span>{slide.scaleLabels?.[0] || lo}</span>
            <span>{slide.scaleLabels?.[1] || hi}</span>
          </div>
        </div>
      )}
      {slide.type === "open" && (
        <div className="stack" style={{ gap: 6 }}>
          <label className="sr" htmlFor="pv-open">Your answer</label>
          <textarea id="pv-open" className="inp" rows={4} maxLength={280} placeholder="Type your answer…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="pv-count">
            <span />
            <span className={`fine num ${text.length > 260 ? "warn" : ""}`}>{text.length}/280</span>
          </div>
        </div>
      )}
      {slide.type === "rank" && <RankInput options={opts} order={order} setOrder={setOrder} />}
      {slide.type === "guess" && (
        <div className="pv-guess">
          <label className="sr" htmlFor="pv-num">Your guess</label>
          <input id="pv-num" className="inp num" type="number" inputMode="decimal" min={gLo} max={gHi} step="any" placeholder={`${gLo} – ${gHi}`} value={num} onChange={(e) => setNum(e.target.value)} />
          {gHi - gLo <= 1000 && (
            <input type="range" min={gLo} max={gHi} step={1} value={num === "" ? Math.round((gLo + gHi) / 2) : Number(num)} onChange={(e) => setNum(e.target.value)} aria-label="Your guess (slider)" />
          )}
          <div className="pv-scale-ends"><span className="num">{gLo}</span><span className="num">{gHi}</span></div>
        </div>
      )}
      {slide.type === "points" && (
        <div className="pv-points">
          <p className={`pv-left ${spent > POINTS_TOTAL ? "over" : ""}`} aria-live="polite">
            <b className="num">{POINTS_TOTAL - spent}</b> of {POINTS_TOTAL} points left
          </p>
          {opts.map((o, i) => (
            <div key={i} className="pv-pt">
              <span className="t">{o || `Option ${i + 1}`}</span>
              <button type="button" aria-label={`Fewer points for ${o}`} disabled={alloc[i] <= 0} onClick={() => setAlloc(alloc.map((x, k) => (k === i ? Math.max(0, x - 10) : x)))}>−</button>
              <input className="inp num" type="number" inputMode="numeric" min={0} max={POINTS_TOTAL} aria-label={`Points for ${o}`} value={alloc[i]} onChange={(e) => setAlloc(alloc.map((x, k) => (k === i ? clamp(Math.round(Number(e.target.value) || 0), 0, POINTS_TOTAL) : x)))} />
              <button type="button" aria-label={`More points for ${o}`} disabled={spent >= POINTS_TOTAL} onClick={() => setAlloc(alloc.map((x, k) => (k === i ? x + Math.min(10, POINTS_TOTAL - spent) : x)))}>+</button>
            </div>
          ))}
        </div>
      )}
      {slide.type === "grid" && (
        <div className="pv-gridin">
          {opts.map((o, i) => (
            <fieldset key={i} className="pv-gi">
              <legend>{o || `Item ${i + 1}`}</legend>
              {([0, 1] as const).map((ax) => (
                <label key={ax} className="pv-gs">
                  <span>{slide.axes?.[ax] || (ax ? "Up" : "Across")}</span>
                  <input type="range" min={1} max={GRID_MAX} step={1} value={xy[i]?.[ax] ?? 5} onChange={(e) => setXy(xy.map((p, k) => (k === i ? (ax ? [p[0], Number(e.target.value)] : [Number(e.target.value), p[1]]) : p)))} />
                  <b className="num">{xy[i]?.[ax] ?? 5}</b>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      {slide.type === "pin" && (
        <div className="pv-pin">
          {slide.img ? (
            <button
              type="button"
              className="frame"
              aria-label="Tap the picture to drop your pin"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setPin([clamp(Math.round(((e.clientX - r.left) / r.width) * 1000), 0, 1000), clamp(Math.round(((e.clientY - r.top) / r.height) * 1000), 0, 1000)]);
              }}
            >
              <img src={slide.img} alt="" draggable={false} />
              {pin && <i style={{ left: `${pin[0] / 10}%`, top: `${pin[1] / 10}%` }} />}
            </button>
          ) : (
            <p className="fine">Add a picture to this slide.</p>
          )}
          <span className="fine">{pin ? "Tap somewhere else to move your pin." : "Tap the picture to drop your pin."}</span>
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn primary" style={{ flex: 1 }} disabled={busy || !ready}>
          {busy ? "Sending…" : initial ? "Update answer" : "Submit"}
        </button>
      </div>
    </form>
  );
}

/** Drag-and-drop ranking (mouse & touch) with up/down buttons and arrow keys for accessibility. */
function RankInput({ options, order, setOrder }: { options: string[]; order: number[]; setOrder: (o: number[]) => void }) {
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ opt: number; dy: number } | null>(null);
  const st = useRef({ y: 0, from: 0, rowH: 60 });
  const [say, setSay] = useState("");
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const o = order.slice();
    const [x] = o.splice(from, 1);
    o.splice(to, 0, x);
    setOrder(o);
    setSay(`${options[x]} moved to position ${to + 1}`);
  };
  const onDown = (e: React.PointerEvent, k: number) => {
    const row = (e.currentTarget as HTMLElement).closest("li");
    const next = row?.nextElementSibling as HTMLElement | null;
    const h = row ? (next ? next.getBoundingClientRect().top - row.getBoundingClientRect().top : row.getBoundingClientRect().height + 8) : 60;
    st.current = { y: e.clientY, from: k, rowH: h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ opt: order[k], dy: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { y, from, rowH } = st.current;
    const dy = e.clientY - y;
    const to = clamp(from + Math.round(dy / rowH), 0, order.length - 1);
    const cur = order.indexOf(drag.opt);
    if (to !== cur) {
      const o = order.filter((x) => x !== drag.opt);
      o.splice(to, 0, drag.opt);
      setOrder(o);
    }
    setDrag({ opt: drag.opt, dy: dy - (to - from) * rowH });
  };
  const onUp = () => {
    if (drag) setSay(`${options[drag.opt]} placed at position ${order.indexOf(drag.opt) + 1}`);
    setDrag(null);
  };
  return (
    <>
      <p className="fine">Drag to reorder, or use the arrows. Top = most important.</p>
      <ol className="pv-rank" ref={listRef}>
        {order.map((opt, k) => (
          <li key={opt} className={drag?.opt === opt ? "dragging" : ""} style={drag?.opt === opt ? { transform: `translateY(${drag.dy}px)` } : undefined}>
            <span
              className="grip"
              role="button"
              tabIndex={0}
              aria-label={`Drag ${options[opt]}; position ${k + 1} of ${order.length}. Use arrow keys to move.`}
              onPointerDown={(e) => onDown(e, k)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(k, k - 1);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(k, k + 1);
                }
              }}
            >
              <Ico.grip />
            </span>
            <span className="pos num">{k + 1}</span>
            <span className="t">{options[opt] || `Option ${opt + 1}`}</span>
            <span className="ud">
              <button type="button" aria-label={`Move ${options[opt]} up`} disabled={k === 0} onClick={() => move(k, k - 1)}>
                <Ico.up />
              </button>
              <button type="button" aria-label={`Move ${options[opt]} down`} disabled={k === order.length - 1} onClick={() => move(k, k + 1)}>
                <Ico.down />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <span className="sr" aria-live="polite">
        {say}
      </span>
    </>
  );
}
