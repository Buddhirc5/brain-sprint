/* Admin → Polls: list of live polls (present, open/close, export) and the slide
   editor with a live phone / big-screen preview. Hosts can present but not edit. */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { useAdmin } from "../admin/Admin";
import { href } from "../app/router";
import { blankPoll } from "../api/engine";
import { Seg } from "../components/ui";
import { Sprinty } from "../components/Chibi";
import { clamp, fmtDT, newId, randHex } from "../lib/util";
import type { Poll, Slide, SlideResults, SlideType } from "../types";
import { Ico, Results, SLIDE_TYPES, TYPE_META, TypeIcon, fetchResults, fmtCode, sampleResults, stageVars } from "./shared";
import { SlideInput } from "./VotePage";

const MAX_SLIDES = 30;
const MAX_OPTS: Partial<Record<SlideType, number>> = { mc: 10, rank: 8 };

export function PollsTab() {
  const { d, can, tid, api, approve, run, slug } = useApp();
  const { exportCSV } = useAdmin();
  const [editing, setEditing] = useState<Poll | null>(null);
  const polls = useMemo(() => Object.values(d.polls).sort((a, b) => b.updatedAt - a.updatedAt), [d.polls]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // respondents per poll (most people on any one slide) — a quick one-off read, refreshed when a poll changes
  const sig = polls.slice(0, 24).map((p) => p.id + ":" + p.updatedAt + ":" + p.slides.length).join("|");
  useEffect(() => {
    let live = true;
    (async () => {
      for (const p of polls.slice(0, 24)) {
        const rs = await Promise.all(p.slides.map((s) => fetchResults(api, p.id, s.id, 3000)));
        if (!live) return;
        setCounts((c) => ({ ...c, [p.id]: Math.max(0, ...rs.map((r) => r?.n || 0)) }));
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, sig]);

  if (editing) return <PollEditor initial={editing} onClose={() => setEditing(null)} />;

  const duplicate = (p: Poll) => {
    const copy: Poll = {
      ...structuredClone(p), id: newId("poll"), code: "", title: `Copy of ${p.title}`.slice(0, 120), status: "draft", current: 0, locked: false,
      createdAt: Date.now(), updatedAt: Date.now(), createdBy: undefined,
    };
    void run(() => api.savePoll(tid, copy), "Poll duplicated");
  };

  const exportPoll = async (p: Poll) => {
    const rs = await Promise.all(p.slides.map((s) => fetchResults(api, p.id, s.id)));
    exportCSV(`poll-${p.title.replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.csv`, `results of poll "${p.title}"`, pollCsv(p, rs));
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <h1>Live polls</h1>
        {can("editor") && (
          <button className="btn primary small" onClick={() => setEditing(blankPoll(newId("poll"), tid, ""))}>
            <Ico.plus /> New poll
          </button>
        )}
      </div>
      <p className="fine">
        Mentimeter-style polls: word clouds, multiple choice, scales, rankings, open text and Q&A. The audience joins on their phones at{" "}
        <b>#/vote</b> with the poll's 6-digit code — no account needed, answers are anonymous.
        {!can("editor") && " Your role (Host) can present and open/close polls, but not edit them."}
      </p>
      {!polls.length ? (
        <div className="empty stack" style={{ justifyItems: "center" }}>
          <Sprinty mood="idle" size={100} />
          <b>No polls yet.</b>
          {can("editor") && <span>Create one with “New poll”.</span>}
        </div>
      ) : (
        <div className="gcards">
          {polls.map((p) => (
            <article key={p.id} className="gcard pa-card">
              <div className={`top ${p.status === "open" ? "open" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className={`st ${p.status === "open" ? "live" : ""}`}>{p.status === "open" ? "● Open" : p.status === "draft" ? "Draft" : "Closed"}</span>
                  <span className="pa-code num" title="Join code">{fmtCode(p.code)}</span>
                </div>
                <h3>{p.title}</h3>
                <div className="pa-types" aria-label="Slides">
                  {p.slides.map((s, i) => (
                    <span key={s.id} title={`${i + 1}. ${TYPE_META[s.type].label}: ${s.prompt}`} className={p.status === "open" && i === p.current ? "cur" : ""}>
                      <TypeIcon t={s.type} />
                    </span>
                  ))}
                </div>
              </div>
              <div className="body">
                <div className="nums">
                  <div>
                    <b className="num">{p.slides.length}</b>slides
                  </div>
                  <div>
                    <b className="num">{counts[p.id] ?? "–"}</b>people
                  </div>
                  <div>
                    <b style={{ fontSize: 14, paddingTop: 5 }}>{fmtDT(p.updatedAt)}</b>updated
                  </div>
                </div>
                <div className="acts">
                  <a className="btn lime small" href={href({ r: "present", slug, id: p.id })}>
                    <Ico.play /> Present
                  </a>
                  {p.status === "open" ? (
                    <button className="btn ghost small" onClick={() => void run(() => api.pollControl(p.id, { status: "closed" }), "Poll closed")}>
                      Close
                    </button>
                  ) : (
                    <button className="btn ghost small" onClick={() => void run(() => api.pollControl(p.id, { status: "open" }), `Poll open — code ${fmtCode(p.code)}`)}>
                      Open
                    </button>
                  )}
                  {can("editor") && (
                    <button className="btn ghost small" onClick={() => setEditing(structuredClone(p))}>
                      <Ico.edit /> Edit
                    </button>
                  )}
                </div>
                <div className="acts pa-minor">
                  <button className="link" onClick={() => void exportPoll(p)}>
                    Export CSV
                  </button>
                  {can("editor") && (
                    <>
                      <button className="link" onClick={() => duplicate(p)}>
                        Duplicate
                      </button>
                      <button
                        className="link danger"
                        onClick={() =>
                          approve({
                            label: `Delete the poll “${p.title}” and all its responses? This can't be undone.`,
                            yes: "Delete poll",
                            danger: true,
                            run: () => api.deletePoll(tid, p.id),
                          })
                        }
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- CSV ---------------- */
function pollCsv(p: Poll, rs: (SlideResults | null)[]): (string | number)[][] {
  const rows: (string | number)[][] = [["Poll", "Slide", "Type", "Question", "Answer", "Count / score", "Share of respondents %", "Respondents", "Extra"]];
  p.slides.forEach((s, i) => {
    const r = rs[i];
    const n = r?.n || 0;
    const base = [p.title, i + 1, TYPE_META[s.type].label, s.prompt];
    if (!r) return rows.push([...base, "(no data)", "", "", "", ""]);
    if (s.type === "mc") (s.options || []).forEach((o, k) => rows.push([...base, o, r.counts?.[k] || 0, pct(r.counts?.[k] || 0, n), n, s.multi ? "multiple answers allowed" : ""]));
    else if (s.type === "word") (r.words || []).forEach((w) => rows.push([...base, w.w, w.n, pct(w.n, n), n, ""]));
    else if (s.type === "scale") {
      const lo = s.scaleMin ?? 1;
      (r.dist || []).forEach((c, k) => rows.push([...base, String(lo + k), c, pct(c, n), n, ""]));
      rows.push([...base, "Average", r.avg ?? 0, "", n, s.scaleLabels ? s.scaleLabels.join(" → ") : ""]);
    } else if (s.type === "rank") (r.rank || []).forEach((x, k) => rows.push([...base, s.options?.[x.i] || "", x.score, "", n, `rank ${k + 1} (Borda points)`]));
    else (r.texts || []).forEach((t) => rows.push([...base, "text" in t.value ? t.value.text : "", s.type === "qa" ? t.votes || 0 : "", "", n, [s.type === "qa" && t.answered ? "answered" : "", new Date(t.at).toISOString()].filter(Boolean).join(" · ")]));
    if (!n && s.type !== "scale") rows.push([...base, "(no responses)", 0, "", 0, ""]);
  });
  return rows;
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/* ---------------- validation ---------------- */
function slideProblem(s: Slide): string | null {
  if (!s.prompt.trim()) return "Write the question";
  if (s.prompt.length > 200) return "Keep the question under 200 characters";
  if (s.type === "mc" || s.type === "rank") {
    const o = s.options || [];
    if (o.length < 2) return "Add at least 2 options";
    if (o.some((x) => !x.trim())) return "Fill in or remove empty options";
    if (new Set(o.map((x) => x.trim().toLowerCase())).size !== o.length) return "Options must be different";
  }
  if (s.type === "scale") {
    const [a, b] = s.scaleLabels || ["", ""];
    if (a.length > 30 || b.length > 30) return "End labels: 30 characters at most";
  }
  return null;
}

/* ---------------- editor ---------------- */
const sid = () => "s" + randHex(4);
function defaultsFor(t: SlideType, prev?: Slide): Slide {
  const base = { id: prev?.id || sid(), type: t, prompt: prev?.prompt || "" };
  const keepOpts = prev?.options?.length ? prev.options : undefined;
  switch (t) {
    case "mc":
      return { ...base, options: keepOpts || ["", "", ""], multi: false };
    case "rank":
      return { ...base, options: (keepOpts || ["", "", ""]).slice(0, 8) };
    case "word":
      return { ...base, maxWords: 1 };
    case "scale":
      return { ...base, scaleMin: 1, scaleMax: 5, scaleLabels: ["Strongly disagree", "Strongly agree"] };
    default:
      return base;
  }
}

function PollEditor({ initial, onClose }: { initial: Poll; onClose: () => void }) {
  const { api, tid, run, approve, d, slug, pub } = useApp();
  const [poll, setPoll] = useState<Poll>(initial);
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(!d.polls[initial.id]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"phone" | "screen">("phone");
  const [showErr, setShowErr] = useState(false);
  const live = d.polls[poll.id];
  const slide = poll.slides[clamp(sel, 0, poll.slides.length - 1)];

  const upd = (p: Poll) => {
    setPoll(p);
    setDirty(true);
  };
  const updSlide = (patch: Partial<Slide>) => upd({ ...poll, slides: poll.slides.map((s, i) => (i === sel ? { ...s, ...patch } : s)) });
  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= poll.slides.length) return;
    const sl = poll.slides.slice();
    const [x] = sl.splice(from, 1);
    sl.splice(to, 0, x);
    upd({ ...poll, slides: sl });
    setSel(to);
  };
  const addSlide = (t: SlideType) => {
    if (poll.slides.length >= MAX_SLIDES) return;
    const sl = poll.slides.slice();
    sl.splice(sel + 1, 0, defaultsFor(t));
    upd({ ...poll, slides: sl });
    setSel(sel + 1);
    setAdding(false);
  };
  const dupSlide = (i: number) => {
    if (poll.slides.length >= MAX_SLIDES) return;
    const sl = poll.slides.slice();
    sl.splice(i + 1, 0, { ...structuredClone(sl[i]), id: sid() });
    upd({ ...poll, slides: sl });
    setSel(i + 1);
  };
  const delSlide = (i: number) => {
    if (poll.slides.length <= 1) return;
    upd({ ...poll, slides: poll.slides.filter((_, k) => k !== i) });
    setSel(Math.max(0, i - 1));
  };

  const problems = poll.slides.map(slideProblem);
  const firstBad = problems.findIndex(Boolean);
  const titleBad = !poll.title.trim() ? "Give the poll a title" : null;

  const save = async () => {
    if (titleBad || firstBad >= 0) {
      setShowErr(true);
      if (firstBad >= 0) setSel(firstBad);
      return;
    }
    setBusy(true);
    // keep the presenter's live state (slide, open/closed…) — the editor only changes content
    const cur = d.polls[poll.id];
    const clean: Poll = {
      ...poll,
      title: poll.title.trim(),
      slides: poll.slides.map((s) => ({ ...s, prompt: s.prompt.trim(), options: s.options?.map((o) => o.trim()) })),
      ...(cur ? { status: cur.status, locked: cur.locked, showResults: cur.showResults, current: clamp(cur.current, 0, poll.slides.length - 1) } : {}),
      updatedAt: Date.now(),
    };
    const ok = await run(async () => {
      await api.savePoll(tid, clean);
      return true;
    }, "Poll saved");
    setBusy(false);
    if (ok) setDirty(false);
  };
  const back = () => (dirty ? approve({ label: "Leave without saving your changes?", yes: "Discard changes", danger: true, run: onClose }) : onClose());

  const opts = slide.options || [];
  const maxO = MAX_OPTS[slide.type] || 10;

  return (
    <div className="stack pe">
      <div className="toolbar pe-bar">
        <button className="icon-btn" onClick={back} aria-label="Back to polls" title="Back to polls">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <label className="sr" htmlFor="pe-title">Poll title</label>
        <input id="pe-title" className="inp pe-title" value={poll.title} maxLength={120} onChange={(e) => upd({ ...poll, title: e.target.value })} placeholder="Poll title" aria-invalid={showErr && !!titleBad} />
        <span className="fine pe-meta">
          {live ? (
            <>
              Code <b className="num">{fmtCode(live.code)}</b> · {live.status}
            </>
          ) : (
            "Not saved yet"
          )}
        </span>
        {live && (
          <a className="btn lime small" href={href({ r: "present", slug, id: poll.id })} onClick={(e) => dirty && (e.preventDefault(), approve({ label: "You have unsaved changes. Present the last saved version?", yes: "Present anyway", run: () => void (location.hash = href({ r: "present", slug, id: poll.id })) }))}>
            <Ico.play /> Present
          </a>
        )}
        <button className="btn primary small" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? "Saving…" : dirty ? "Save" : "Saved ✓"}
        </button>
      </div>
      {showErr && (titleBad || firstBad >= 0) && (
        <p className="banner red" role="alert">
          {titleBad || `Slide ${firstBad + 1}: ${problems[firstBad]}`}
        </p>
      )}
      {live?.status === "open" && <p className="banner blue">This poll is open. Saved changes reach the audience straight away — answers already given stay on their slides.</p>}

      <div className="pe-grid">
        {/* slides */}
        <aside className="panel pe-slides" aria-label="Slides">
          <div className="panel-h">
            <h2>Slides</h2>
            <span className="fine num">{poll.slides.length}/{MAX_SLIDES}</span>
          </div>
          <ol className="pe-list">
            {poll.slides.map((s, i) => (
              <li key={s.id} className={`${i === sel ? "on" : ""} ${showErr && problems[i] ? "bad" : ""}`}>
                <button type="button" className="pe-item" onClick={() => setSel(i)} aria-current={i === sel}>
                  <span className="n num">{i + 1}</span>
                  <span className="ic"><TypeIcon t={s.type} /></span>
                  <span className="t">
                    <b>{s.prompt || <i>Untitled</i>}</b>
                    <small>{TYPE_META[s.type].label}</small>
                  </span>
                </button>
                {i === sel && (
                  <div className="pe-acts">
                    <button type="button" onClick={() => moveSlide(i, i - 1)} disabled={i === 0} aria-label="Move slide up" title="Move up"><Ico.up /></button>
                    <button type="button" onClick={() => moveSlide(i, i + 1)} disabled={i === poll.slides.length - 1} aria-label="Move slide down" title="Move down"><Ico.down /></button>
                    <button type="button" onClick={() => dupSlide(i)} disabled={poll.slides.length >= MAX_SLIDES} aria-label="Duplicate slide" title="Duplicate"><Ico.copy /></button>
                    <button type="button" onClick={() => delSlide(i)} disabled={poll.slides.length <= 1} aria-label="Delete slide" title="Delete"><Ico.trash /></button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {adding ? (
            <div className="pe-add">
              {SLIDE_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => addSlide(t)}>
                  <TypeIcon t={t} />
                  {TYPE_META[t].label}
                </button>
              ))}
              <button type="button" className="link" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn ghost small" onClick={() => setAdding(true)} disabled={poll.slides.length >= MAX_SLIDES}>
              <Ico.plus /> Add slide
            </button>
          )}
        </aside>

        {/* slide editor */}
        <section className="panel pe-edit" aria-label={`Slide ${sel + 1}`}>
          <div className="panel-h">
            <h2>Slide {sel + 1}</h2>
            {showErr && problems[sel] && <span className="err">{problems[sel]}</span>}
          </div>
          <div className="pe-types" role="radiogroup" aria-label="Slide type">
            {SLIDE_TYPES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={slide.type === t} className={slide.type === t ? "on" : ""} onClick={() => slide.type !== t && upd({ ...poll, slides: poll.slides.map((s, i) => (i === sel ? defaultsFor(t, s) : s)) })}>
                <TypeIcon t={t} />
                <b>{TYPE_META[t].label}</b>
                <small>{TYPE_META[t].hint}</small>
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="pe-prompt">Question</label>
            <textarea id="pe-prompt" className="inp" rows={2} maxLength={200} value={slide.prompt} onChange={(e) => updSlide({ prompt: e.target.value })} placeholder={slide.type === "qa" ? "Ask the leadership team anything" : "What would you like to ask?"} />
          </div>

          {(slide.type === "mc" || slide.type === "rank") && (
            <div className="field">
              <span className="flabel">Options</span>
              <div className="stack" style={{ gap: 8 }}>
                {opts.map((o, i) => (
                  <div className="optrow" key={i}>
                    <span className="radio">{slide.type === "rank" ? i + 1 : String.fromCharCode(65 + i)}</span>
                    <input className="inp" value={o} maxLength={80} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} onChange={(e) => updSlide({ options: opts.map((x, k) => (k === i ? e.target.value : x)) })} />
                    <button type="button" className="x" aria-label={`Move option ${i + 1} up`} disabled={i === 0} onClick={() => { const o2 = opts.slice(); [o2[i - 1], o2[i]] = [o2[i], o2[i - 1]]; updSlide({ options: o2 }); }}><Ico.up /></button>
                    <button type="button" className="x" aria-label={`Remove option ${i + 1}`} disabled={opts.length <= 2} onClick={() => updSlide({ options: opts.filter((_, k) => k !== i) })}>×</button>
                  </div>
                ))}
              </div>
              <div className="row">
                <button type="button" className="btn ghost tiny" disabled={opts.length >= maxO} onClick={() => updSlide({ options: [...opts, ""] })}>
                  <Ico.plus /> Add option
                </button>
                <span className="fine">{opts.length}/{maxO}</span>
              </div>
              {slide.type === "mc" && (
                <label className="check">
                  <input type="checkbox" checked={!!slide.multi} onChange={(e) => updSlide({ multi: e.target.checked })} />
                  <span>
                    <b>Allow several answers</b>
                    <br />
                    <span className="fine">People can tick more than one option.</span>
                  </span>
                </label>
              )}
              {slide.type === "rank" && <p className="fine">Results use Borda points: 1st place earns {opts.length} points, last place 1.</p>}
            </div>
          )}

          {slide.type === "word" && (
            <div className="field">
              <span className="flabel">Words per person</span>
              <Seg className="narrow" value={String(slide.maxWords || 1) as "1" | "2" | "3"} options={[["1", "1 word"], ["2", "2 words"], ["3", "3 words"]]} onChange={(v) => updSlide({ maxWords: Number(v) })} label="Words per person" />
              <p className="fine">Words are grouped case-insensitively; common filler words (the, and, of…) are left out.</p>
            </div>
          )}

          {slide.type === "scale" && (
            <div className="field">
              <span className="flabel">Scale</span>
              <Seg className="narrow" value={String(slide.scaleMax ?? 5) as "5" | "10"} options={[["5", "1 – 5"], ["10", "1 – 10"]]} onChange={(v) => updSlide({ scaleMin: 1, scaleMax: Number(v) })} label="Scale range" />
              <div className="row2">
                <div className="field">
                  <label htmlFor="pe-l0">Label at {slide.scaleMin ?? 1}</label>
                  <input id="pe-l0" className="inp" maxLength={30} value={slide.scaleLabels?.[0] || ""} onChange={(e) => updSlide({ scaleLabels: [e.target.value, slide.scaleLabels?.[1] || ""] })} placeholder="Not at all" />
                </div>
                <div className="field">
                  <label htmlFor="pe-l1">Label at {slide.scaleMax ?? 5}</label>
                  <input id="pe-l1" className="inp" maxLength={30} value={slide.scaleLabels?.[1] || ""} onChange={(e) => updSlide({ scaleLabels: [slide.scaleLabels?.[0] || "", e.target.value] })} placeholder="Completely" />
                </div>
              </div>
            </div>
          )}
          {slide.type === "open" && <p className="fine">People write up to 280 characters. Answers appear on the screen as sticky notes, newest first.</p>}
          {slide.type === "qa" && <p className="fine">Everyone can ask (up to 5 questions each) and upvote. While presenting you can mark questions answered or hide them.</p>}
        </section>

        {/* preview */}
        <aside className="panel pe-prev" aria-label="Preview">
          <div className="panel-h">
            <h2>Preview</h2>
            <Seg value={view} options={[["phone", "Phone"], ["screen", "Big screen"]]} onChange={setView} label="Preview" />
          </div>
          {view === "phone" ? (
            <div className="pe-phone">
              <div className="scr">
                <div className="pv-q">
                  <span className="pv-kind">
                    <TypeIcon t={slide.type} />
                    {TYPE_META[slide.type].label}
                  </span>
                  <h1>{slide.prompt || "Your question"}</h1>
                </div>
                {slide.type === "qa" ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <textarea className="inp" rows={2} placeholder="Type your question…" readOnly />
                    <button className="btn primary block" type="button">Ask</button>
                  </div>
                ) : (
                  <SlideInput key={slide.id + slide.type} slide={slide} onSubmit={() => undefined} preview />
                )}
              </div>
            </div>
          ) : (
            <div className="pe-screen pl-dark" style={stageVars(pub.branding)}>
              <div className="pl-kind"><TypeIcon t={slide.type} />{TYPE_META[slide.type].label} · sample data</div>
              <div className="pl-prompt">{slide.prompt || "Your question"}</div>
              <div className={`pl-res t-${slide.type}`}>
                <Results slide={slide} r={sampleResults(slide)} compact={slide.type === "rank" || slide.type === "open" || slide.type === "qa"} />
              </div>
            </div>
          )}
          <p className="fine">Preview only — nothing is sent.</p>
        </aside>
      </div>
    </div>
  );
}
