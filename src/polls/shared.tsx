/* Live polls — shared pieces: slide-type meta & icons, brand-safe stage colours,
   and the result visualisations used by the presenter, the audience phones and
   the editor preview (all drawn with SVG/CSS, no chart library). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Api } from "../api/Api";
import type { Branding, PollResponse, Slide, SlideResults, SlideType } from "../types";
import { DEFAULT_BRANDING } from "../api/engine";
import { brandProblems, contrast } from "../app/theme";
import { mix } from "../lib/util";
import "../styles/polls.css";

/* ---------------- slide types ---------------- */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const TypeIcons: Record<SlideType, () => JSX.Element> = {
  mc: () => (<svg viewBox="0 0 24 24" {...P}><path d="M5 20V12M10 20V5M15 20v-9M20 20v-5" /></svg>),
  word: () => (<svg viewBox="0 0 24 24" {...P}><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 0 9.5H7z" /><path d="M9 14h6" /></svg>),
  scale: () => (<svg viewBox="0 0 24 24" {...P}><path d="M3 12h18" /><circle cx="14" cy="12" r="3" fill="currentColor" /><path d="M3 8v8M21 8v8" /></svg>),
  open: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8 9h8M8 12h5" /></svg>),
  rank: () => (<svg viewBox="0 0 24 24" {...P}><path d="M10 6h10M10 12h7M10 18h4" /><path d="M4 5l1.5-1v5M3.5 13.5a1.5 1.5 0 1 1 2.5 1.2L3.5 17H6" /></svg>),
  qa: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 5h16v11h-7l-5 4v-4H4V5z" /><path d="M10 9a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.2M12 14h.01" /></svg>),
};
export function TypeIcon({ t }: { t: SlideType }) {
  const I = TypeIcons[t];
  return <I />;
}
export const TYPE_META: Record<SlideType, { label: string; hint: string }> = {
  mc: { label: "Multiple choice", hint: "Pick one (or several) options" },
  word: { label: "Word cloud", hint: "1–3 words each, grows as people type" },
  scale: { label: "Scale", hint: "Rate from 1–5 or 1–10" },
  open: { label: "Open text", hint: "Short free-text answers" },
  rank: { label: "Ranking", hint: "Put options in order" },
  qa: { label: "Q&A", hint: "Audience asks, everyone upvotes" },
};
export const SLIDE_TYPES: SlideType[] = ["mc", "word", "scale", "open", "rank", "qa"];

export const Ico = {
  prev: () => (<svg viewBox="0 0 24 24" {...P}><path d="M15 5l-7 7 7 7" /></svg>),
  next: () => (<svg viewBox="0 0 24 24" {...P}><path d="M9 5l7 7-7 7" /></svg>),
  up: () => (<svg viewBox="0 0 24 24" {...P}><path d="M6 15l6-6 6 6" /></svg>),
  down: () => (<svg viewBox="0 0 24 24" {...P}><path d="M6 9l6 6 6-6" /></svg>),
  thumb: () => (<svg viewBox="0 0 24 24" {...P}><path d="M7 11v9H4v-9h3zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" /></svg>),
  eyeOff: () => (<svg viewBox="0 0 24 24" {...P}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.3-.5 4.7-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
  phone: () => (<svg viewBox="0 0 24 24" {...P}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>),
  play: () => (<svg viewBox="0 0 24 24" {...P}><path d="M7 4.5v15l12-7.5-12-7.5z" /></svg>),
  stop: () => (<svg viewBox="0 0 24 24" {...P}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>),
  copy: () => (<svg viewBox="0 0 24 24" {...P}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>),
  trash: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>),
  edit: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>),
  plus: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>),
  grip: () => (<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>),
  download: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>),
  qr: () => (<svg viewBox="0 0 24 24" {...P}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2M20 14v6h-4M16 20v-2" /></svg>),
};

export const fmtCode = (c: string) => (c && c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c);
export const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/* ---------------- brand-safe colours for the dark "stage" ---------------- */
/** A brand colour lightened until text in `ink` on it (and it on `ink`) is readable. */
function lift(c: string, ink: string, min: number) {
  let t = 0;
  let x = c;
  while (contrast(x, ink) < min && t < 1) {
    t += 0.06;
    x = mix(c, "#FFFFFF", Math.min(1, t));
  }
  return x;
}
/** CSS variables for results drawn on an ink background. Only colours that pass
 *  contrast checks against ink are used, whatever palette a company picked. */
export function stageVars(b0?: Partial<Branding>): CSSProperties {
  const x = { ...DEFAULT_BRANDING, ...(b0 || {}) };
  const b = brandProblems(x) ? DEFAULT_BRANDING : x;
  const acc = lift(b.accent, b.ink, 5);
  return {
    "--st-bg": b.ink,
    "--st-1": b.primary,
    "--st-2": acc,
    "--st-3": mix(b.primary, "#FFFFFF", 0.55),
    "--st-4": mix(acc, "#FFFFFF", 0.55),
    "--st-5": "#F4F3EE",
    "--st-ink": b.ink,
    "--st-dim": mix(b.ink, "#FFFFFF", 0.62),
    "--st-line": mix(b.ink, "#FFFFFF", 0.16),
    "--st-panel": mix(b.ink, "#FFFFFF", 0.07),
  } as CSSProperties;
}
export const SERIES = ["var(--st-1)", "var(--st-2)", "var(--st-3)", "var(--st-4)", "var(--st-5)"];

/* ---------------- hooks ---------------- */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Subscribe to results for one slide (null while loading / hidden). */
export function useResults(api: Api, pollId: string | undefined, slideId: string | undefined, on = true) {
  const [r, setR] = useState<SlideResults | null>(null);
  useEffect(() => {
    setR(null);
    if (!pollId || !slideId || !on) return;
    return api.watchPollResults(pollId, slideId, setR);
  }, [api, pollId, slideId, on]);
  return r && r.slideId === slideId ? r : null;
}

/** One-shot read of a slide's results (for exports and list counts). */
export function fetchResults(api: Api, pollId: string, slideId: string, ms = 5000): Promise<SlideResults | null> {
  return new Promise((res) => {
    let done = false;
    let un: (() => void) | undefined;
    const finish = (v: SlideResults | null) => {
      if (done) return;
      done = true;
      setTimeout(() => un?.(), 0);
      res(v);
    };
    un = api.watchPollResults(pollId, slideId, (r) => finish(r));
    if (done) un();
    setTimeout(() => finish(null), ms);
  });
}

/* ---------------- word cloud ---------------- */
const CLOUD_FONT = `"Anton", Impact, "Arial Narrow", sans-serif`;
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(w: string, size: number) {
  measureCtx ||= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return w.length * size * 0.5;
  measureCtx.font = `400 ${size}px ${CLOUD_FONT}`;
  return measureCtx.measureText(w).width;
}
interface Placed { w: string; n: number; x: number; y: number; size: number; color: number }
/** Deterministic spiral placement: biggest word in the middle, no overlaps, all inside the box.
 *  Shrinks every word a little and tries again if something doesn't fit. */
export function layoutCloud(words: { w: string; n: number }[], W: number, H: number): Placed[] {
  if (!W || !H || !words.length) return [];
  const max = words[0].n;
  const min = words[words.length - 1].n;
  const few = words.length <= 3;
  let hi = Math.min(H * (few ? 0.4 : words.length <= 20 ? 0.33 : 0.26), W * (few ? 0.22 : 0.18));
  const lo0 = Math.max(13, Math.min(H * 0.065, 34));
  for (let attempt = 0; attempt < 10; attempt++) {
    const lo = Math.min(lo0, hi * 0.45);
    const out: Placed[] = [];
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    let fail = false;
    const ar = W / H;
    for (let i = 0; i < words.length; i++) {
      const { w, n } = words[i];
      const k = max === min ? (few ? 1 : 0.55) : Math.pow((n - min) / (max - min), 0.75);
      const size = Math.round(lo + (hi - lo) * k);
      const tw = measure(w.toUpperCase(), size) + size * 0.22;
      const th = size * 1.08;
      if (tw > W - 4) {
        fail = true;
        break;
      }
      let placed = false;
      for (let t = 0; t < 900; t += 0.14) {
        const r = t * Math.max(2, size * 0.09);
        const cx = W / 2 + r * Math.cos(t) * Math.sqrt(ar);
        const cy = H / 2 + (r * Math.sin(t)) / Math.sqrt(ar);
        const b = { x0: cx - tw / 2, y0: cy - th / 2, x1: cx + tw / 2, y1: cy + th / 2 };
        if (b.x0 < 2 || b.y0 < 2 || b.x1 > W - 2 || b.y1 > H - 2) {
          if (r > Math.max(W, H)) break;
          continue;
        }
        if (boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) continue;
        boxes.push(b);
        out.push({ w, n, x: cx, y: cy, size, color: i % 5 });
        placed = true;
        break;
      }
      if (!placed) {
        fail = true;
        break;
      }
    }
    if (!fail) return out;
    hi *= 0.86;
  }
  // last resort: whatever fits at the smallest size
  return [];
}

function useFontReady() {
  const [ok, setOk] = useState(() => !("fonts" in document) || document.fonts.check(`40px ${CLOUD_FONT}`));
  useEffect(() => {
    if (ok || !("fonts" in document)) return;
    let live = true;
    document.fonts.load(`40px ${CLOUD_FONT}`).then(() => live && setOk(true), () => live && setOk(true));
    return () => {
      live = false;
    };
  }, [ok]);
  return ok;
}

export function WordCloud({ words, className = "" }: { words: { w: string; n: number }[]; className?: string }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const fontOk = useFontReady();
  const placed = useMemo(() => (fontOk ? layoutCloud(words, w, h) : []), [words, w, h, fontOk]);
  return (
    <div ref={ref} className={`pl-cloud ${className}`} role="img" aria-label={`Word cloud: ${words.slice(0, 12).map((x) => `${x.w} (${x.n})`).join(", ")}`}>
      {placed.map((p) => (
        <span
          key={p.w}
          className="pl-word"
          title={`${p.w} · ${p.n}`}
          style={{ left: p.x, top: p.y, fontSize: p.size, color: SERIES[p.color] }}
        >
          {p.w}
        </span>
      ))}
    </div>
  );
}

/* ---------------- multiple choice ---------------- */
export function McChart({ slide, r, layout = "auto" }: { slide: Slide; r: SlideResults | null; layout?: "auto" | "col" | "row" }) {
  const opts = slide.options || [];
  const counts = r?.counts || opts.map(() => 0);
  const n = r?.n || 0;
  const top = Math.max(1, ...counts);
  const lay = layout === "auto" ? (opts.length > 6 || opts.some((o) => o.length > 34) ? "row" : "col") : layout;
  const lead = counts.length ? counts.indexOf(Math.max(...counts)) : -1;
  if (lay === "row")
    return (
      <div className="pl-hbars">
        {opts.map((o, i) => (
          <div key={i} className={`pl-hbar ${counts[i] && i === lead ? "lead" : ""}`}>
            <div className="pl-l">{o}</div>
            <div className="trk">
              <span style={{ width: `${(counts[i] / top) * 100}%`, background: SERIES[i % 5] }} />
            </div>
            <div className="val num">
              <b>{pctOf(counts[i], n)}%</b> <small>{counts[i]}</small>
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <div className="pl-cols" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
      {opts.map((o, i) => (
        <div key={i} className={`pl-col ${counts[i] && i === lead ? "lead" : ""}`}>
          <div className="well">
            <div className="fill" style={{ height: `${(counts[i] / top) * 100}%`, background: SERIES[i % 5] }}>
              <div className="val num">
                <b>{pctOf(counts[i], n)}%</b>
                <small>{counts[i]}</small>
              </div>
            </div>
          </div>
          <div className="pl-l">{o}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- scale ---------------- */
export function ScaleChart({ slide, r, compact }: { slide: Slide; r: SlideResults | null; compact?: boolean }) {
  const lo = slide.scaleMin ?? 1;
  const hi = slide.scaleMax ?? 5;
  const dist = r?.dist || Array.from({ length: hi - lo + 1 }, () => 0);
  const top = Math.max(1, ...dist);
  const avg = r?.avg || 0;
  const pos = r?.n ? ((avg - lo) / (hi - lo)) * 100 : 0;
  const [l0, l1] = slide.scaleLabels || ["", ""];
  return (
    <div className={`pl-scale ${compact ? "compact" : ""}`}>
      <div className="avg">
        <div className="label">Average</div>
        <div className="big num">
          {r?.n ? avg.toFixed(1) : "–"}
          <small>/{hi}</small>
        </div>
        <div className="track">
          <span className="fill" style={{ width: `${pos}%` }} />
          {r?.n ? <span className="dot" style={{ left: `${pos}%` }} /> : null}
        </div>
        <div className="ends">
          <span>{lo}{l0 ? ` · ${l0}` : ""}</span>
          <span>{l1 ? `${l1} · ` : ""}{hi}</span>
        </div>
      </div>
      <div className="dist" style={{ gridTemplateColumns: `repeat(${dist.length}, minmax(0, 1fr))` }}>
        {dist.map((c, i) => (
          <div key={i} className="d">
            <div className="well">
              <div className="fill" style={{ height: `${(c / top) * 100}%` }}>
                {c > 0 && <span className="num">{c}</span>}
              </div>
            </div>
            <div className="pl-l num">{lo + i}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- ranking (Borda) ---------------- */
export function RankChart({ slide, r, compact }: { slide: Slide; r: SlideResults | null; compact?: boolean }) {
  const opts = slide.options || [];
  const rank = r?.rank || opts.map((_, i) => ({ i, score: 0 }));
  const top = Math.max(1, ...rank.map((x) => x.score));
  const rowH = compact ? 50 : opts.length <= 4 ? 96 : opts.length <= 6 ? 80 : 62;
  const pos = new Map(rank.map((x, k) => [x.i, k]));
  return (
    <div className={`pl-rank ${compact ? "compact" : ""}`} style={{ height: opts.length * rowH }}>
      {opts.map((o, i) => {
        const k = pos.get(i) ?? i;
        const sc = rank.find((x) => x.i === i)?.score || 0;
        return (
          <div key={i} className={`pl-rrow ${k === 0 && sc ? "lead" : ""}`} style={{ transform: `translateY(${k * rowH}px)`, height: rowH - (compact ? 8 : 12), fontSize: !compact && rowH >= 96 ? "1.15em" : undefined }}>
            <div className="pos">{k + 1}</div>
            <div className="body">
              <div className="pl-l">{o}</div>
              <div className="trk">
                <span style={{ width: `${(sc / top) * 100}%`, background: SERIES[i % 5] }} />
              </div>
            </div>
            <div className="val num">
              {sc}
              <small> pts</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- open text wall ---------------- */
const NOTE_TILT = [-1.6, 1.1, -0.6, 1.8, -1.2, 0.5, 1.4, -1.9];
export function OpenWall({ r, compact, max = 40 }: { r: SlideResults | null; compact?: boolean; max?: number }) {
  const list = (r?.texts || []).slice(0, max);
  if (!list.length) return <Waiting text="Answers will appear here" />;
  return (
    <div className={`pl-wall ${compact ? "compact" : ""}`}>
      {list.map((t, i) => (
        <div key={t.id} className="pl-note" style={{ background: SERIES[hashIdx(t.id) % 5], rotate: compact ? undefined : `${NOTE_TILT[hashIdx(t.id) % NOTE_TILT.length]}deg`, animationDelay: `${Math.min(i, 8) * 30}ms` }}>
          {"text" in t.value ? t.value.text : ""}
        </div>
      ))}
    </div>
  );
}
function hashIdx(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ---------------- Q&A ---------------- */
export interface QaHandlers {
  onVote?: (id: string) => void;
  voted?: Set<string>;
  onAnswered?: (q: PollResponse) => void;
  onHide?: (q: PollResponse) => void;
}
export function QaList({ r, compact, h = {}, spotlight }: { r: SlideResults | null; compact?: boolean; h?: QaHandlers; spotlight?: boolean }) {
  const list = r?.texts || [];
  if (!list.length) return <Waiting text={compact ? "No questions yet — be the first to ask" : "Questions will appear here"} />;
  return (
    <ol className={`pl-qa ${compact ? "compact" : ""}`}>
      {list.map((q, i) => {
        const mine = h.voted?.has(q.id);
        return (
          <li key={q.id} className={`pl-q ${q.answered ? "done" : ""} ${spotlight && i === 0 && !q.answered ? "spot" : ""}`}>
            {h.onVote ? (
              <button type="button" className={`votes ${mine ? "on" : ""}`} aria-pressed={!!mine} aria-label={`${mine ? "Remove upvote" : "Upvote"} (${q.votes || 0} votes)`} onClick={() => h.onVote!(q.id)} disabled={q.answered}>
                <Ico.thumb />
                <b className="num">{q.votes || 0}</b>
              </button>
            ) : (
              <div className="votes" aria-label={`${q.votes || 0} votes`}>
                <Ico.thumb />
                <b className="num">{q.votes || 0}</b>
              </div>
            )}
            <div className="txt">
              {"text" in q.value ? q.value.text : ""}
              {q.answered && <span className="ans">Answered</span>}
            </div>
            {(h.onAnswered || h.onHide) && (
              <div className="mod">
                {h.onAnswered && (
                  <button type="button" className={`pl-mbtn ${q.answered ? "on" : ""}`} onClick={() => h.onAnswered!(q)} title={q.answered ? "Mark as not answered" : "Mark as answered"}>
                    <svg viewBox="0 0 24 24" {...P}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    <span>{q.answered ? "Answered" : "Answer"}</span>
                  </button>
                )}
                {h.onHide && (
                  <button type="button" className="pl-mbtn" onClick={() => h.onHide!(q)} title="Hide this question from everyone">
                    <Ico.eyeOff />
                    <span>Hide</span>
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Waiting({ text }: { text: string }) {
  return (
    <div className="pl-waiting">
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {text}
    </div>
  );
}

/** Results for any slide type. */
export function Results({ slide, r, compact, qa, spotlight }: { slide: Slide; r: SlideResults | null; compact?: boolean; qa?: QaHandlers; spotlight?: boolean }): ReactNode {
  switch (slide.type) {
    case "mc":
      return <McChart slide={slide} r={r} layout={compact ? "row" : "auto"} />;
    case "word":
      return r?.words?.length ? <WordCloud words={r.words} className={compact ? "compact" : ""} /> : <Waiting text="Words will appear here" />;
    case "scale":
      return <ScaleChart slide={slide} r={r} compact={compact} />;
    case "rank":
      return <RankChart slide={slide} r={r} compact={compact} />;
    case "open":
      return <OpenWall r={r} compact={compact} max={compact ? 12 : 40} />;
    case "qa":
      return <QaList r={r} compact={compact} h={qa} spotlight={spotlight} />;
  }
}

/* ---------------- sample data for the editor preview ---------------- */
const SAMPLE_WORDS = ["teamwork", "growth", "busy", "exciting", "focus", "learning", "fast", "fun", "clarity", "energy", "support", "change"];
const SAMPLE_TEXT = ["More time for coaching.", "Clearer weekly priorities.", "Shorter meetings, please!", "Celebrate small wins more often.", "Better tools for the branch team."];
export function sampleResults(s: Slide): SlideResults {
  const out: SlideResults = { slideId: s.id, n: 24 };
  const opts = s.options || [];
  if (s.type === "mc") out.counts = opts.map((_, i) => [11, 7, 4, 2, 5, 3, 1, 2, 1, 1][i] ?? 1);
  else if (s.type === "word") out.words = SAMPLE_WORDS.map((w, i) => ({ w, n: Math.max(1, 9 - i) }));
  else if (s.type === "scale") {
    const lo = s.scaleMin ?? 1;
    const hi = s.scaleMax ?? 5;
    out.dist = Array.from({ length: hi - lo + 1 }, (_, i) => Math.round(8 * Math.exp(-(((i - (hi - lo) * 0.65) / ((hi - lo) / 3 || 1)) ** 2))) + 1);
    const tot = out.dist.reduce((a, b) => a + b, 0);
    out.avg = Math.round((out.dist.reduce((a, c, i) => a + c * (lo + i), 0) / tot) * 10) / 10;
    out.n = tot;
  } else if (s.type === "rank") out.rank = opts.map((_, i) => ({ i, score: Math.max(0, (opts.length - i) * 20 - (i === 1 ? 25 : 0)) })).sort((a, b) => b.score - a.score);
  else if (s.type === "open" || s.type === "qa")
    out.texts = SAMPLE_TEXT.map((t, i) => ({ id: "x" + i, pollId: "", slideId: s.id, who: "", value: { text: t }, at: i, votes: s.type === "qa" ? 9 - i * 2 : undefined }));
  return out;
}
