/* Admin → Polls: list of live polls (present, open/close, export) and the slide
   editor with a live phone / big-screen preview. Hosts can present but not edit. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/ctx";
import { useAdmin } from "../admin/Admin";
import { href } from "../app/router";
import { blankPoll, cleanSlide, isContentSlide } from "../api/engine";
import { MAX_POLL_IMG_CHARS, MAX_SLIDE_IMG_CHARS, compressImage } from "../lib/image";
import { Seg } from "../components/ui";
import { StageModeToggle, useStageMode } from "../app/stageTheme";
import { Mascot } from "../components/Chibi";
import { clamp, fmtDT, newId, randHex } from "../lib/util";
import type { Poll, Slide, SlideResults, SlideType } from "../types";
import { CONTENT_TYPES, Ico, QUESTION_TYPES, Results, SlideImage, TYPE_META, TypeIcon, fetchResults, fmtCode, sampleResults, stageVars } from "./shared";
import { SlideInput } from "./VotePage";
import { StarterPacks } from "../admin/StarterPacks";

const MAX_SLIDES = 30;
const MAX_OPTS: Partial<Record<SlideType, number>> = { mc: 10, rank: 8, points: 8, grid: 8 };
const HAS_OPTS = new Set<SlideType>(["mc", "rank", "points", "grid"]);

export function PollsTab() {
  const { d, can, tid, api, approve, run, slug } = useApp();
  const { exportCSV } = useAdmin();
  const [editing, setEditing] = useState<Poll | null>(null);
  const [packs, setPacks] = useState(false);
  const polls = useMemo(() => Object.values(d.polls).sort((a, b) => b.updatedAt - a.updatedAt), [d.polls]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // people per poll — one small query, refreshed when a poll changes
  const sig = polls.map((p) => p.id + ":" + p.updatedAt).join("|");
  useEffect(() => {
    let live = true;
    api.pollCounts(tid).then((c) => live && setCounts(c), () => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, tid, sig]);

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
      {packs && <StarterPacks kinds={["poll"]} onClose={() => setPacks(false)} />}
      <div className="toolbar">
        <h1>Live polls</h1>
        {can("editor") && (
          <>
            <button className="btn lime small" onClick={() => setPacks(true)}>
              ✨ Starter library
            </button>
            <button className="btn primary small" onClick={() => setEditing(blankPoll(newId("poll"), tid, ""))}>
              <Ico.plus /> New poll
            </button>
          </>
        )}
      </div>
      <p className="fine">
        Interactive polls: word clouds, multiple choice, scales, rankings, open text, Q&amp;A, guess the number, 100 points, 2 × 2 grids, pins on a
        picture — plus text and picture slides. The audience joins on their phones at{" "}
        <b>#/vote</b> with the poll's 6-digit code — no account needed, answers are anonymous.
        {!can("editor") && " Your role (Host) can present and open/close polls, but not edit them."}
      </p>
      {!polls.length ? (
        <div className="empty stack" style={{ justifyItems: "center" }}>
          <Mascot mood="idle" size={100} />
          <b>No polls yet.</b>
          {can("editor") && <span>Create one with “New poll”, or add a ready-made one from “Starter library”.</span>}
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
    else if (s.type === "guess") {
      (r.bins || []).forEach((b) => rows.push([...base, b.lo === b.hi ? String(b.lo) : `${Math.round(b.lo)}–${Math.round(b.hi)}`, b.n, pct(b.n, n), n, ""]));
      rows.push([...base, "Average", r.avg ?? 0, "", n, s.numAnswer != null ? `right answer ${s.numAnswer}` : ""]);
      rows.push([...base, "Median", r.median ?? 0, "", n, ""]);
    } else if (s.type === "points") (s.options || []).forEach((o, k) => rows.push([...base, o, r.points?.[k] || 0, "", n, "average points (of 100)"]));
    else if (s.type === "grid") (s.options || []).forEach((o, k) => rows.push([...base, o, r.grid?.[k] ? `${r.grid[k]!.x} , ${r.grid[k]!.y}` : "", "", n, `average ${(s.axes || ["x", "y"]).join(" , ")} (1–10)`]));
    else if (s.type === "pin") (r.pins || []).forEach((q) => rows.push([...base, `${(q[0] / 10).toFixed(1)}% , ${(q[1] / 10).toFixed(1)}%`, "", "", n, "pin position (from left , from top)"]));
    else if (isContentSlide(s.type)) return rows.push([...base, "(content slide — no answers)", "", "", "", ""]);
    else (r.texts || []).forEach((t) => rows.push([...base, "text" in t.value ? t.value.text : "", s.type === "qa" ? t.votes || 0 : "", "", n, [s.type === "qa" && t.answered ? "answered" : "", new Date(t.at).toISOString()].filter(Boolean).join(" · ")]));
    if (!n && s.type !== "scale") rows.push([...base, "(no responses)", 0, "", 0, ""]);
  });
  return rows;
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/* ---------------- validation ---------------- */
function slideProblem(s: Slide): string | null {
  if (!s.prompt.trim() && s.type !== "image") return s.type === "text" ? "Write a heading" : "Write the question";
  if (s.prompt.length > 200) return "Keep the question under 200 characters";
  if ((s.type === "pin" || s.type === "image") && !s.img) return "Add a picture";
  if ((s.body || "").length > 600) return "Keep the text under 600 characters";
  if (s.type === "guess") {
    const lo = s.numMin ?? 0, hi = s.numMax ?? 100;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return "The highest number must be above the lowest";
    if (Math.abs(lo) > 1e9 || Math.abs(hi) > 1e9) return "Keep numbers under a billion";
    if (s.numAnswer != null && (!Number.isFinite(s.numAnswer) || s.numAnswer < lo || s.numAnswer > hi)) return "The right answer must be inside the range";
  }
  if (s.type === "grid") {
    const [a, b] = s.axes || ["", ""];
    if (!a.trim() || !b.trim()) return "Name both axes";
    if (a.length > 30 || b.length > 30) return "Axis names: 30 characters at most";
  }
  if (HAS_OPTS.has(s.type)) {
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
    case "points":
      return { ...base, options: (keepOpts || ["", "", ""]).slice(0, 8) };
    case "grid":
      return { ...base, options: (keepOpts || ["", "", ""]).slice(0, 8), axes: ["Effort", "Impact"] };
    case "guess":
      return { ...base, numMin: 0, numMax: 100 };
    case "pin":
    case "image":
      return { ...base, img: prev?.img };
    default:
      return base;
  }
}
const withImg = (next: Slide, prev: Slide): Slide => (prev.img && !next.img ? { ...next, img: prev.img } : next);

function PollEditor({ initial, onClose }: { initial: Poll; onClose: () => void }) {
  const { api, tid, run, approve, d, slug, pub } = useApp();
  const [poll, setPoll] = useState<Poll>(initial);
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(!d.polls[initial.id]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"phone" | "screen">("phone");
  const [mode, toggleMode] = useStageMode();
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

  const imgTotal = poll.slides.reduce((n, s) => n + (s.img?.length || 0), 0);
  const problems = poll.slides.map(slideProblem);
  const firstBad = problems.findIndex(Boolean);
  const titleBad = !poll.title.trim() ? "Give the poll a title" : imgTotal > MAX_POLL_IMG_CHARS ? "The pictures in this poll are too big together — remove one or use smaller pictures" : null;

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
      slides: poll.slides.map((s) =>
        cleanSlide({ ...s, prompt: s.prompt.trim(), body: s.body?.trim(), options: s.options?.map((o) => o.trim()), axes: s.axes?.map((a) => a.trim()) as [string, string] | undefined }),
      ),
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
              {([["Questions", QUESTION_TYPES], ["Content slides", CONTENT_TYPES]] as const).map(([h, ts]) => (
                <div key={h} className="pe-add-g">
                  <span className="pe-add-h">{h}</span>
                  {ts.map((t) => (
                    <button key={t} type="button" onClick={() => addSlide(t)}>
                      <TypeIcon t={t} />
                      {TYPE_META[t].label}
                    </button>
                  ))}
                </div>
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
          {([["Questions", QUESTION_TYPES], ["Content slides", CONTENT_TYPES]] as const).map(([h, ts]) => (
            <div key={h} className="pe-typeg">
              <span className="flabel">{h}</span>
              <div className="pe-types" role="radiogroup" aria-label={`Slide type: ${h.toLowerCase()}`}>
                {ts.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={slide.type === t} className={slide.type === t ? "on" : ""} onClick={() => slide.type !== t && upd({ ...poll, slides: poll.slides.map((s, i) => (i === sel ? withImg(defaultsFor(t, s), s) : s)) })}>
                    <TypeIcon t={t} />
                    <b>{TYPE_META[t].label}</b>
                    <small>{TYPE_META[t].hint}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="field">
            <label htmlFor="pe-prompt">{slide.type === "text" ? "Heading" : slide.type === "image" ? "Caption (optional)" : "Question"}</label>
            <textarea id="pe-prompt" className="inp" rows={2} maxLength={200} value={slide.prompt} onChange={(e) => updSlide({ prompt: e.target.value })} placeholder={slide.type === "qa" ? "Ask the leadership team anything" : slide.type === "text" ? "e.g. Welcome to the town hall" : slide.type === "image" ? "e.g. Our new office" : slide.type === "pin" ? "e.g. Where should the new coffee corner go?" : "What would you like to ask?"} />
          </div>
          {slide.type === "text" && (
            <div className="field">
              <label htmlFor="pe-body">Text</label>
              <textarea id="pe-body" className="inp" rows={5} maxLength={600} value={slide.body || ""} onChange={(e) => updSlide({ body: e.target.value })} placeholder="A short paragraph, agenda or instructions for the room." />
              <span className="fine num">{(slide.body || "").length}/600</span>
            </div>
          )}
          <SlidePicture slide={slide} onChange={(img) => updSlide({ img })} required={slide.type === "pin" || slide.type === "image"} total={imgTotal} />

          {HAS_OPTS.has(slide.type) && (
            <div className="field">
              <span className="flabel">{slide.type === "grid" ? "Items to place" : "Options"}</span>
              <div className="stack" style={{ gap: 8 }}>
                {opts.map((o, i) => (
                  <div className="optrow" key={i}>
                    <span className="radio">{slide.type === "mc" ? String.fromCharCode(65 + i) : i + 1}</span>
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
              {slide.type === "points" && <p className="fine">Everyone shares out up to 100 points. The screen shows the average each option got.</p>}
              {slide.type === "grid" && (
                <div className="row2">
                  <div className="field">
                    <label htmlFor="pe-ax">Across (left → right)</label>
                    <input id="pe-ax" className="inp" maxLength={30} value={slide.axes?.[0] || ""} onChange={(e) => updSlide({ axes: [e.target.value, slide.axes?.[1] || ""] })} placeholder="e.g. Effort" />
                  </div>
                  <div className="field">
                    <label htmlFor="pe-ay">Up (bottom → top)</label>
                    <input id="pe-ay" className="inp" maxLength={30} value={slide.axes?.[1] || ""} onChange={(e) => updSlide({ axes: [slide.axes?.[0] || "", e.target.value] })} placeholder="e.g. Impact" />
                  </div>
                </div>
              )}
            </div>
          )}
          {slide.type === "guess" && (
            <div className="field">
              <div className="row3">
                <div className="field">
                  <label htmlFor="pe-nlo">Lowest</label>
                  <input id="pe-nlo" className="inp num" type="number" value={slide.numMin ?? 0} onChange={(e) => updSlide({ numMin: e.target.value === "" ? 0 : Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label htmlFor="pe-nhi">Highest</label>
                  <input id="pe-nhi" className="inp num" type="number" value={slide.numMax ?? 100} onChange={(e) => updSlide({ numMax: e.target.value === "" ? 100 : Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label htmlFor="pe-nans">Right answer (optional)</label>
                  <input id="pe-nans" className="inp num" type="number" value={slide.numAnswer ?? ""} onChange={(e) => updSlide({ numAnswer: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" />
                </div>
              </div>
              <p className="fine">Phones never see the right answer. On the big screen it appears when you lock voting (L).</p>
            </div>
          )}
          {slide.type === "pin" && <p className="fine">People tap a spot on the picture. The big screen shows every pin as it lands.</p>}

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
            <div className="row" style={{ gap: 6 }}>
              {view === "screen" && <StageModeToggle mode={mode} onToggle={toggleMode} className="icon-btn" />}
              <Seg value={view} options={[["phone", "Phone"], ["screen", "Big screen"]]} onChange={setView} label="Preview" />
            </div>
          </div>
          {view === "phone" ? (
            <div className="pe-phone">
              <div className="scr">
                <div className="pv-q">
                  <span className="pv-kind">
                    <TypeIcon t={slide.type} />
                    {TYPE_META[slide.type].label}
                  </span>
                  {(slide.prompt || slide.type !== "image") && <h1>{slide.prompt || "Your question"}</h1>}
                  <SlideImage slide={slide} />
                </div>
                {isContentSlide(slide.type) ? (
                  <div className="pv-content">
                    {slide.type === "image" && slide.img && <img className="sl-img" src={slide.img} alt="" />}
                    {slide.body && <p>{slide.body}</p>}
                    <span className="fine">👀 Look at the screen</span>
                  </div>
                ) : slide.type === "qa" ? (
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
            <div className={`pe-screen pl-st ${mode}`} style={stageVars(pub.branding, mode)}>
              <div className="pl-kind"><TypeIcon t={slide.type} />{TYPE_META[slide.type].label}{isContentSlide(slide.type) ? "" : " · sample data"}</div>
              <div className="pl-qrow">
                <div className={`pl-prompt ${slide.type === "text" ? "big" : ""}`}>{slide.prompt || (slide.type === "image" ? "" : "Your question")}</div>
                <SlideImage slide={slide} className="pl-qimg" />
              </div>
              <div className={`pl-res t-${slide.type}`}>
                <Results slide={slide} r={sampleResults(slide)} compact={slide.type === "rank" || slide.type === "open" || slide.type === "qa"} reveal />
              </div>
            </div>
          )}
          <p className="fine">Preview only — nothing is sent.</p>
        </aside>
      </div>
    </div>
  );
}

/** A picture on a slide: resized and compressed in the browser before it's saved. */
function SlidePicture({ slide, onChange, required, total }: { slide: Slide; onChange: (img: string | undefined) => void; required: boolean; total: number }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressImage(file, 1280, { maxChars: MAX_SLIDE_IMG_CHARS }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that picture.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const used = Math.round((total / MAX_POLL_IMG_CHARS) * 100);
  return (
    <div className="field">
      <span className="flabel">{required ? "Picture" : "Picture (optional)"}</span>
      <div
        className={`qimg-drop ${slide.img ? "has" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files?.[0]);
        }}
      >
        {slide.img ? <img src={slide.img} alt="Slide picture" /> : <span className="fine">{slide.type === "pin" ? "Drop a map, floor plan, product shot or diagram here." : "Drop a picture here, or choose one. It's resized automatically."}</span>}
        <div className="row">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
          <button type="button" className="btn ghost tiny" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Processing…" : slide.img ? "Replace picture" : "+ Add picture"}</button>
          {slide.img && <button type="button" className="link danger" onClick={() => onChange(undefined)}>Remove</button>}
          {total > 0 && <span className={`fine num ${used > 90 ? "warn" : ""}`}>Pictures in this poll: {used}% of the limit</span>}
        </div>
      </div>
    </div>
  );
}
