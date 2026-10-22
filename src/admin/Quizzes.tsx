import { useMemo, useRef, useState } from "react";
import { useApp } from "../app/ctx";
import { useApi } from "../app/ApiCtx";
import { Icon, Modal, Seg } from "../components/ui";
import { blankDraft, draftProblem, sealQuestion, TYPE_NAME, unseal, type DraftQ } from "../lib/answers";
import { COLOR_HEX, COLORS, MINUTE_OPTS, sortGames, statusOf } from "../lib/games";

const CERT_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180]; // exams: 1–180 min (server clamps the same)
import { limitMs, runCorrect, untimed } from "../lib/scoring";
import { cleanText } from "../lib/security";
import { compressImage } from "../lib/image";
import { parseImport } from "../lib/importQs";
import { cleanCert } from "../lib/cert";
import { CertDesign } from "./CertDesign";
import { StarterPacks } from "./StarterPacks";
import { fmtDate, fmtMin, newId, pct, todayKey } from "../lib/util";
import { LIVE } from "../api/engine";
import type { AnswerKey, CardColor, CertSettings, Game, GameStatus, QType, QuizKind } from "../types";
import { useAdmin } from "./Admin";
import { BucketEdit, StoryEdit, SwipeEdit } from "./QTypeEditors";
import { StoryEpisode } from "./StoryEditor";
import { parseScript, SCRIPT_EXAMPLE } from "../lib/storyScript";
import { KIND } from "./common";

const MAX_Q_HARD = 50; // backend limit
const SECONDS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const VALID_MONTHS: [number, string][] = [[0, "Never expires"], [3, "3 months"], [6, "6 months"], [12, "1 year"], [24, "2 years"], [36, "3 years"]];
const DEFAULT_CERT: CertSettings = { passPct: 80, attempts: 3, certTitle: "", validMonths: 12, showAnswers: true };

/* ================= list ================= */
export function Quizzes() {
  const { d, players, approve, run, api, tid, can, features, superUser } = useApp();
  const { user } = useApi();
  const { setTab } = useAdmin();
  const [kind, setKind] = useState<"all" | QuizKind>("all");
  const [picker, setPicker] = useState(false);
  const [packs, setPacks] = useState(false);
  const all = sortGames(Object.values(d.games));
  const gs = all.filter((g) => kind === "all" || (g.kind || "sprint") === kind);
  const count = (k: QuizKind) => all.filter((g) => (g.kind || "sprint") === k).length;
  const t = todayKey();
  const me = user?.email || "";
  const mc = d.cfg.makerChecker;

  const publish = (g: Game) =>
    run(async () => {
      await api.setQuizStatus(tid, g.id, "live");
    }, mc && g.kind !== "live" ? "Sent for approval — another admin must approve it" : g.kind === "live" ? "Ready to host" : "Quiz is live");
  const approveIt = (g: Game) => run(() => api.setQuizStatus(tid, g.id, "live", true), "Approved — the quiz is live");
  const toDraft = (g: Game) => run(() => api.setQuizStatus(tid, g.id, "draft"), "Moved back to draft");
  const close = (g: Game) =>
    approve({
      label: `Close "${g.title}". Players can no longer start it; results are kept.`,
      yes: "Close quiz",
      run: () => api.setQuizStatus(tid, g.id, "closed"),
    });
  const del = (g: Game) =>
    approve({
      label: `Delete "${g.title}" and its answer key. Plays already made stay in players' history but can't be reviewed against the quiz.`,
      yes: "Delete quiz",
      danger: true,
      run: async () => {
        await api.deleteQuiz(tid, g.id);
      },
    });
  const dup = (g: Game) =>
    run(async () => {
      const key = d.keys[g.id];
      if (!key) throw new Error("This quiz has no answer key to copy.");
      const sealed = g.questions.map((q) => sealQuestion({ ...unseal(q, key.answers[q.id]), id: newId("q") }));
      const id = newId("g-");
      const now = Date.now();
      const ng: Game = { ...g, id, title: `${g.title} (copy)`.slice(0, 60), status: "draft", questions: sealed.map((s) => s.q), createdAt: now, updatedAt: now, createdBy: undefined, editedBy: undefined, approvedBy: undefined };
      await api.saveQuiz(tid, { game: ng, key: { gid: id, answers: Object.fromEntries(sealed.map((s) => [s.q.id, s.canon])), updatedAt: now } });
    }, "Copy saved as a draft");

  return (
    <>
      <div className="toolbar">
        <h1>Quizzes</h1>
        {can("editor") && (
          <button className="btn lime small" onClick={() => setPacks(true)}>
            ✨ Starter library
          </button>
        )}
        <button className="btn primary" onClick={() => setPicker(true)}>
          New quiz
        </button>
      </div>
      <div className="chips-row" role="group" aria-label="Filter by type">
        {(["all", "sprint", "story", "cert", "live"] as const).map((k) => (
          <button key={k} className={`chip-tg ${kind === k ? "on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === "all" ? "All" : KIND[k].label} <span className="sub num">{k === "all" ? all.length : count(k)}</span>
          </button>
        ))}
      </div>
      <p className="fine">
        {kind === "live" ? "Live quizzes are hosted from the Live quiz tab — they don't appear in the player app on their own." : `Tip: daily sprints work best with ${d.cfg.minQ}–${Math.min(5, d.cfg.maxQ)} questions. Give one a date and players see it that morning.`}
        {mc ? ` Maker-checker is on: a second admin must approve sprints and exams before they go live${superUser ? " (as a super admin you can approve your own)" : ""}.` : ""}
      </p>
      <div className="gcards">
        {gs.length ? (
          gs.map((g) => {
            const k = g.kind || "sprint";
            const plays = players.flatMap((p) => Object.values(p.runs || {}).filter((x) => x.gid === g.id && x.status === "done"));
            const n = plays.reduce((s, x) => s + x.ans.length, 0);
            const acc = pct(plays.reduce((s, x) => s + runCorrect(x), 0), n);
            const passed = plays.filter((x) => x.passed).length;
            const st = statusOf(g);
            const dark = g.color === "ink";
            const hasKey = !!d.keys[g.id];
            const own = g.editedBy === me && !superUser; // super admins may approve their own changes
            const off = !features[KIND[k].feature];
            const liveSecs = g.questions.reduce((s, q) => s + (q.seconds || LIVE.defaultSeconds), 0);
            return (
              <article className="gcard" key={g.id}>
                <div className="top" style={{ background: COLOR_HEX[g.color], color: dark ? "#fff" : "#161512" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="row" style={{ gap: 6 }}>
                      <span className="st kind">{KIND[k].short}</span>
                      <span className={`st ${st.key}`}>{k === "live" ? (g.status === "draft" ? "Draft" : "Ready") : st.label}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {k === "live" ? `${g.questions.length} question${g.questions.length === 1 ? "" : "s"} · ${liveSecs < 60 ? `${liveSecs}s` : `${Math.floor(liveSecs / 60)}:${String(liveSecs % 60).padStart(2, "0")} min`}` : <>{g.date ? (g.date === t ? "Today" : fmtDate(g.date)) : "No date"} · {untimed(g) ? "no timer" : fmtMin(limitMs(g) / 60000)}</>}
                    </span>
                  </div>
                  <h3>{g.title}</h3>
                </div>
                <div className="body">
                  <div className="nums">
                    <div><b className="num">{g.questions.length}</b>{k === "story" ? (g.questions.length === 1 ? "story" : "stories") : "questions"}</div>
                    {k === "cert" ? (
                      <>
                        <div><b className="num">{plays.length}</b>attempts</div>
                        <div><b className="num">{plays.length ? `${pct(passed, plays.length)}%` : "—"}</b>pass rate</div>
                      </>
                    ) : k === "live" ? (
                      <>
                        <div><b className="num">{d.live.filter((s) => s.gid === g.id).length}</b>sessions</div>
                        <div><b className="num">{g.questions.length ? Math.round(liveSecs / g.questions.length) : 0}s</b>per question</div>
                      </>
                    ) : (
                      <>
                        <div><b className="num">{plays.length}</b>plays</div>
                        <div><b className="num">{plays.length ? `${acc}%` : "—"}</b>accuracy</div>
                      </>
                    )}
                  </div>
                  {k === "cert" && g.cert && <span className="fine">Pass mark {g.cert.passPct}% · {g.cert.attempts} attempt{g.cert.attempts === 1 ? "" : "s"} · {g.cert.validMonths ? `valid ${g.cert.validMonths} months` : "never expires"}</span>}
                  {off && <span className="fine" style={{ color: "var(--bad)" }}>{KIND[k].label} is turned off in Settings — players can't see this.</span>}
                  {!hasKey && <span className="fine" style={{ color: "var(--bad)" }}>No answer key — open and save the quiz to fix it.</span>}
                  {g.status === "pending" && <span className="fine">Waiting for approval{g.editedBy ? ` · last edited by ${g.editedBy}` : ""}</span>}
                  <div className="acts">
                    {can("editor") && <button className="btn primary small" onClick={() => setTab("edit", g.id)}>Edit</button>}
                    {k === "live" ? (
                      <>
                        {g.status === "draft" && <button className="btn lime small" onClick={() => publish(g)}>Mark ready</button>}
                        {features.live && <button className="btn lime small" onClick={() => setTab("live")}>Host</button>}
                      </>
                    ) : g.status === "live" ? (
                      <button className="btn ghost small" onClick={() => close(g)}>Close</button>
                    ) : g.status === "pending" ? (
                      <>
                        <button className="btn lime small" disabled={!can("admin") || own} title={own ? "A different admin must approve your changes" : !can("admin") ? "Only admins can approve" : ""} onClick={() => approveIt(g)}>
                          {own ? "Needs another admin" : "Approve & publish"}
                        </button>
                        <button className="btn ghost small" onClick={() => toDraft(g)}>Back to draft</button>
                      </>
                    ) : (
                      <button className="btn lime small" onClick={() => publish(g)}>{mc ? "Submit for approval" : g.status === "closed" ? "Reopen" : "Publish"}</button>
                    )}
                    {k !== "live" && <button className="btn ghost small" onClick={() => setTab("results", g.id)}>Results</button>}
                    <button className="btn ghost small" onClick={() => dup(g)}>Duplicate</button>
                    <button className="btn ghost small" onClick={() => del(g)}>Delete</button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty">
            No {kind === "all" ? "quizzes" : KIND[kind].label.toLowerCase() + " quizzes"} yet. Create one, or copy a ready-made quiz from the starter library.
          </div>
        )}
      </div>
      {picker && <KindPicker onClose={() => setPicker(false)} onPick={(k) => { setPicker(false); setTab("edit", "new:" + k); }} />}
      {packs && <StarterPacks kinds={["sprint", "story", "cert", "live", "poll"]} onClose={() => setPacks(false)} />}
    </>
  );
}

function KindPicker({ onClose, onPick }: { onClose: () => void; onPick: (k: QuizKind) => void }) {
  const { features } = useApp();
  return (
    <Modal label="Choose a quiz type" onClose={onClose} wide>
      <div className="stack">
        <h3>What kind of quiz?</h3>
        <div className="kind-grid">
          {(["sprint", "story", "cert", "live"] as const).map((k) => {
            const off = !features[KIND[k].feature];
            return (
              <button key={k} type="button" className="kind-opt" disabled={off} onClick={() => onPick(k)}>
                <b>{KIND[k].label}</b>
                <span className="fine">{KIND[k].text}</span>
                {off && <span className="sev warn">Turned off in Settings</span>}
              </button>
            );
          })}
        </div>
        <div className="row end">
          <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= editor ================= */
interface Form {
  kind: QuizKind;
  title: string;
  desc: string;
  date: string;
  until: string;
  minutes: number;
  color: CardColor;
  status: GameStatus;
  cert: CertSettings;
  qs: DraftQ[];
}

export function Editor({ gid }: { gid?: string }) {
  const { d, api, tid, approve, toast, features } = useApp();
  const { setTab } = useAdmin();
  const isNew = !gid || gid.startsWith("new:");
  const orig = !isNew ? d.games[gid!] : undefined;
  const key = orig ? d.keys[orig.id] : undefined;
  const newKind: QuizKind = gid?.startsWith("new:") && ["sprint", "cert", "live", "story"].includes(gid.slice(4)) ? (gid.slice(4) as QuizKind) : "sprint";
  const topic0 = d.cfg.topics[0] || "General Knowledge";
  const [f, setF] = useState<Form>(() =>
    orig
      ? {
          kind: orig.kind || "sprint", title: orig.title, desc: orig.desc || "", date: orig.date || "", until: orig.until || "", minutes: orig.minutes || 2, color: orig.color,
          status: orig.status, cert: { ...DEFAULT_CERT, ...(orig.cert || {}) },
          qs: orig.questions.map((q) => ({ ...unseal(q, key?.answers[q.id]), seconds: q.seconds || (orig.kind === "live" ? LIVE.defaultSeconds : undefined) })),
        }
      : {
          kind: newKind, title: "", desc: "", date: newKind === "sprint" || newKind === "story" ? todayKey() : "", until: "", minutes: newKind === "cert" ? 5 : newKind === "story" ? 0 : 1.5,
          color: newKind === "cert" ? "ink" : newKind === "live" ? "orange" : newKind === "story" ? "orange" : "lime", status: "draft", cert: { ...DEFAULT_CERT },
          qs:
            newKind === "story"
              ? parseScript(SCRIPT_EXAMPLE, d.cfg.topics, [newId("q")]).drafts
              : [{ ...blankDraft("mcq", topic0, newId("q")), ...(newKind === "live" ? { seconds: LIVE.defaultSeconds } : {}) }],
        },
  );
  const [start] = useState(() => JSON.stringify(f));
  const [importText, setImport] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Form>) => setF((c) => ({ ...c, ...p }));
  const setCert = (p: Partial<CertSettings>) => setF((c) => ({ ...c, cert: { ...c.cert, ...p } }));
  const setQ = (i: number, p: Partial<DraftQ>) => setF((c) => ({ ...c, qs: c.qs.map((q, k) => (k === i ? { ...q, ...p } : q)) }));
  const topics = useMemo(() => d.cfg.topics, [d.cfg.topics]);
  const live = f.kind === "live";
  const cert = f.kind === "cert";
  const storyKind = f.kind === "story";
  const maxQ = f.kind === "sprint" ? d.cfg.maxQ : MAX_Q_HARD;
  const n = f.qs.length;
  const per = Math.round((f.minutes * 60) / Math.max(1, n));
  const timed = f.kind !== "sprint" || f.minutes > 0; // a sprint with minutes 0 has no timer
  const liveTotal = f.qs.reduce((s, q) => s + (q.seconds || LIVE.defaultSeconds), 0);
  const dirty = JSON.stringify(f) !== start;
  const mcHere = d.cfg.makerChecker && !live;

  const addQ = (type: QType) => {
    if (n >= maxQ) return toast(`This quiz can have up to ${maxQ} questions${f.kind === "sprint" ? " (change this in Settings)" : ""}.`);
    set({ qs: [...f.qs, { ...blankDraft(type, f.qs[n - 1]?.topic || topic0, newId("q")), ...(live ? { seconds: f.qs[n - 1]?.seconds || LIVE.defaultSeconds } : {}) }] });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= n) return;
    const qs = f.qs.slice();
    [qs[i], qs[j]] = [qs[j], qs[i]];
    set({ qs });
  };
  const leave = () => (dirty ? approve({ label: "Leave without saving? Your changes to this quiz will be lost.", yes: "Discard changes", danger: true, run: () => setTab("games") }) : setTab("games"));

  const importRows = () => {
    const { drafts: out, skipped } = parseImport(importText, topics, live);
    // imported rows replace any empty question the editor started with
    const kept = f.qs.filter((q) => (q.type !== "mcq" && q.type !== "tf") || q.q.trim() || q.options.some((o) => o.trim()));
    const room = Math.max(0, maxQ - kept.length);
    set({ qs: [...kept, ...out.filter((q) => !storyKind || q.type === "story").slice(0, room)] });
    setImport("");
    toast(`Added ${Math.min(out.length, room)} question(s)${skipped.length ? ` · ${skipped.length} row(s) skipped` : ""}${out.length > room ? " · quiz limit reached" : ""}`);
  };

  const save = async () => {
    setErr("");
    const title = cleanText(f.title || (storyKind ? f.qs[0]?.q || "" : ""), 60).trim();
    if (!title) return setErr("Give the quiz a title.");
    if (storyKind ? n < 1 || n > 5 : n < d.cfg.minQ || n > maxQ) return setErr(storyKind ? "A Story Mode quiz holds 1–5 stories." : `This quiz needs ${d.cfg.minQ}–${maxQ} questions.`);
    if (!live && f.until && f.date && f.until < f.date) return setErr("The close date is before the start date.");
    if (live && f.qs.some((q) => q.type !== "mcq" && q.type !== "tf")) return setErr("Live quizzes use multiple-choice and true/false questions only.");
    if (storyKind && f.qs.some((q) => q.type !== "story")) return setErr("Story Mode holds stories only.");
    if (cert) {
      if (!(f.cert.passPct >= 1 && f.cert.passPct <= 100)) return setErr("Pass mark must be between 1% and 100%.");
      if (!f.cert.certTitle.trim()) return setErr("Give the certificate a title — it's printed on the certificate.");
    }
    for (let i = 0; i < n; i++) {
      const p = draftProblem(f.qs[i], i + 1);
      if (p) return setErr(p);
    }
    setBusy(true);
    try {
      const now = Date.now();
      const id = orig?.id || newId("g-");
      const sealed = f.qs.map((q) => {
        const clean: DraftQ = {
          ...q,
          q: cleanText(q.q, 300).trim(),
          explain: cleanText(q.explain, 300).trim(),
          options: q.options.map((o) => cleanText(o, 140).trim()),
          pairs: q.pairs.map(([a, b]) => [cleanText(a, 80).trim(), cleanText(b, 120).trim()] as [string, string]),
          steps: q.steps.map((s) => cleanText(s, 140).trim()),
          ...(q.sides ? { sides: q.sides.map((x) => cleanText(x, 40).trim()) as [string, string] } : {}),
          ...(q.cards ? { cards: q.cards.map((c) => ({ ...c, t: cleanText(c.t, 140).trim() })) } : {}),
          ...(q.buckets ? { buckets: q.buckets.map((x) => cleanText(x, 40).trim()) } : {}),
          ...(q.things ? { things: q.things.map((x) => ({ ...x, t: cleanText(x.t, 100).trim() })) } : {}),
          ...(q.story
            ? {
                story: {
                  intro: cleanText(q.story.intro, 400).trim(),
                  scenes: q.story.scenes.map((c) => ({ ...c, name: cleanText(c.name, 30).trim(), say: cleanText(c.say, 300).trim(), choices: c.choices.map((x) => ({ ...x, t: cleanText(x.t, 160).trim(), then: cleanText(x.then, 200).trim() })) })),
                  endings: q.story.endings.map((e) => cleanText(e, 200).trim()) as [string, string, string],
                },
              }
            : {}),
          seconds: live ? Math.max(5, Math.min(120, q.seconds || LIVE.defaultSeconds)) : undefined,
        };
        return sealQuestion(clean, orig?.questions.find((x) => x.id === q.id));
      });
      const game: Game = {
        id, kind: f.kind, title, desc: cleanText(f.desc, 110).trim(), color: f.color, status: f.status,
        date: live ? undefined : f.date || undefined, until: live ? undefined : f.until || undefined, minutes: live ? 0 : f.minutes,
        order: orig?.order ?? 0, questions: sealed.map((s) => s.q),
        ...(cert ? { cert: cleanCert(f.cert) } : {}),
        createdAt: orig?.createdAt ?? now, updatedAt: now, createdBy: orig?.createdBy, editedBy: orig?.editedBy, approvedBy: orig?.approvedBy,
      };
      const k: AnswerKey = { gid: id, answers: Object.fromEntries(sealed.map((s) => [s.q.id, s.canon])), updatedAt: now };
      await api.saveQuiz(tid, { game, key: k });
      const pendingNow = mcHere && f.status === "live" && orig?.status !== "live";
      toast(pendingNow ? "Saved — sent to another admin for approval" : "Quiz saved");
      setTab("games");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save. Check your connection and your access.");
      setBusy(false);
    }
  };

  if (orig && !key)
    return (
      <div className="panel">
        <h2>This quiz's answer key isn't available</h2>
        <p className="fine">Only editors and above can read answer keys. Reload the page and try again.</p>
        <button className="btn ghost small" onClick={() => setTab("games")}>Back</button>
      </div>
    );
  if (!isNew && !orig)
    return (
      <div className="panel">
        <h2>Quiz not found</h2>
        <p className="fine">It may have been deleted by another admin.</p>
        <button className="btn ghost small" onClick={() => setTab("games")}>Back to quizzes</button>
      </div>
    );

  const statusOpts: [GameStatus, string][] = live
    ? [["draft", "Draft"], ["live", "Ready to host"]]
    : [["draft", "Draft"], ["live", mcHere && orig?.status !== "live" ? "Submit for approval" : "Live"], ["closed", "Closed"]];

  return (
    <>
      <div className="toolbar">
        <button className="icon-btn" aria-label="Back to quizzes" onClick={leave}><Icon.back /></button>
        <h1>{orig ? "Edit quiz" : "New quiz"}</h1>
        <span className="pill">{KIND[f.kind].label}</span>
        <button className="btn ghost" onClick={leave}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save quiz"}</button>
      </div>
      {!features[KIND[f.kind].feature] && <div className="banner">{KIND[f.kind].label} is turned off in Settings. You can still build this quiz; players won't see it until the mode is on.</div>}
      {err && <div className="banner red" role="alert">{err}</div>}
      <div className="grid2">
        <section className="panel">
          <div className="field">
            <label htmlFor="gTitle">Quiz title</label>
            <input className="inp" id="gTitle" value={f.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder={cert ? "e.g. AML Certification 2026" : live ? "e.g. Town Hall Showdown" : "e.g. Daily 3 · Cyber"} />
          </div>
          <div className="field">
            <label htmlFor="gDesc">One-line teaser</label>
            <input className="inp" id="gDesc" value={f.desc} maxLength={110} onChange={(e) => set({ desc: e.target.value })} placeholder="What players will learn" />
          </div>
          {!live && (
            <>
              <div className="row2">
                {!storyKind && !cert && (
                <div className="field">
                  <span className="flabel">Time limit</span>
                  <Seg value={timed ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => set({ minutes: v === "on" ? 1.5 : 0 })} className="narrow" label="Time limit" />
                </div>
                )}
                {!storyKind && (cert || timed) && (
                <div className="field">
                  <label htmlFor="gMin">{cert ? "Time for the whole exam" : "Time for the whole quiz"}</label>
                  <select className="inp" id="gMin" value={f.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>
                    {[...new Set([...(cert ? CERT_MINUTES : MINUTE_OPTS), f.minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
                  </select>
                </div>
                )}
                <div className="field">
                  <label htmlFor="gDate">Show from</label>
                  <input className="inp" id="gDate" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="gUntil">Close after (optional)</label>
                  <input className="inp" id="gUntil" type="date" value={f.until} onChange={(e) => set({ until: e.target.value })} />
                </div>
              </div>
              {storyKind ? (
                <p className="fine">
                  Story Mode has no timer — players read at their own pace and get a rank (S, A or B) for each story. Write each story as a script below, pick the cast&apos;s looks, and preview it before you publish.
                </p>
              ) : !timed && !cert ? (
                <p className="fine">
                  No time limit — players answer at their own pace. Right answers earn the full 100 points, without the speed bonus, and the quiz closes itself after an hour if left open.
                </p>
              ) : (
              <p className="fine">
                {n} question{n === 1 ? "" : "s"} in {fmtMin(f.minutes)} → about <b>{per}s per question</b>.
                {cert ? " Exams hide right/wrong until the end and score 1 point per right answer." : " Recommended: 1–5 questions in 1–2 minutes. The clock pauses while players read each answer."}
                {f.qs.some((q) => q.type === "story") && " Case studies take longer to read — allow about a minute for each."}
              </p>
              )}
            </>
          )}
          {live && (
            <p className="fine">
              Live quizzes have no dates — you start them from the <b>Live quiz</b> tab and players join with a PIN. Each question has its own timer below. Total: <b>{Math.floor(liveTotal / 60)}:{String(liveTotal % 60).padStart(2, "0")}</b> of answering time.
            </p>
          )}
          <div className="row2">
            <div className="field">
              <span className="flabel">Card colour</span>
              <div className="swatches">
                {COLORS.map((c) => <button key={c} type="button" className={f.color === c ? "on" : ""} style={{ background: COLOR_HEX[c] }} aria-label={c} aria-pressed={f.color === c} onClick={() => set({ color: c })} />)}
              </div>
            </div>
            <div className="field">
              <span className="flabel">Status when saved</span>
              <Seg<GameStatus> value={f.status === "pending" ? "live" : f.status} onChange={(s) => set({ status: s })} options={statusOpts} label="Status" />
            </div>
          </div>
          {orig?.status === "pending" && <p className="fine">This quiz is waiting for approval. Saving changes keeps it waiting.</p>}
        </section>
        {cert ? (
          <section className="panel">
            <div className="panel-h"><div><h2>Exam rules</h2><p>How the certification is graded</p></div></div>
            <div className="row2">
              <div className="field">
                <label htmlFor="cPass">Pass mark (%)</label>
                <input className="inp num" id="cPass" type="number" min={1} max={100} value={f.cert.passPct} onChange={(e) => setCert({ passPct: Math.round(Number(e.target.value)) })} />
              </div>
              <div className="field">
                <label htmlFor="cAtt">Attempts allowed</label>
                <select className="inp" id="cAtt" value={f.cert.attempts} onChange={(e) => setCert({ attempts: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="cValid">Certificate valid for</label>
                <select className="inp" id="cValid" value={f.cert.validMonths} onChange={(e) => setCert({ validMonths: Number(e.target.value) })}>
                  {[...VALID_MONTHS, ...(VALID_MONTHS.some((v) => v[0] === f.cert.validMonths) ? [] : [[f.cert.validMonths, `${f.cert.validMonths} months`] as [number, string]])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="cTitle">Certificate title</label>
              <input className="inp" id="cTitle" value={f.cert.certTitle} maxLength={80} onChange={(e) => setCert({ certTitle: e.target.value })} placeholder="e.g. Certified in Anti-Money Laundering Essentials" />
            </div>
            <label className="check-row">
              <input type="checkbox" checked={f.cert.showAnswers} onChange={(e) => setCert({ showAnswers: e.target.checked })} />
              <span>Show the right answers after the exam ends</span>
            </label>
            <p className="fine">Passing needs {Math.ceil((f.cert.passPct / 100) * n)} of {n} right. People who pass can print their certificate; people who fail can retry until they run out of attempts.</p>
          </section>
        ) : (
          <BulkImport text={importText} setText={setImport} onAdd={importRows} live={live} story={storyKind} />
        )}
      </div>
      {cert && <CertDesign cert={f.cert} setCert={setCert} />}
      {cert && <BulkImport text={importText} setText={setImport} onAdd={importRows} live={false} />}
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>{storyKind ? `Stories (${n})` : `Questions (${n})`}</h2>
            <p>Answer keys stay on the server — players only ever receive the questions.</p>
          </div>
        </div>
        {f.qs.map((q, i) =>
          storyKind ? (
            <StoryEpisode key={q.id} q={q} i={i} n={n} topics={topics} setQ={setQ} move={move} remove={() => set({ qs: f.qs.filter((_, k) => k !== i) })} />
          ) : (
            <QEditor key={q.id} q={q} i={i} n={n} topics={topics} live={live} setQ={setQ} move={move} remove={() => set({ qs: f.qs.filter((_, k) => k !== i) })} />
          ),
        )}
        {!n && <p className="fine">No questions yet. Add one below.</p>}
        {storyKind ? (
          <div className="row">
            <button className="btn lime small" disabled={n >= 5} onClick={() => set({ qs: [...f.qs, ...parseScript(SCRIPT_EXAMPLE.replace("The blocked card", "New story"), topics, [newId("q")]).drafts] })}>+ Another story</button>
          </div>
        ) : (
        <div className="row">
          <button className="btn lime small" onClick={() => addQ("mcq")}>+ Multiple choice</button>
          <button className="btn ghost small" onClick={() => addQ("tf")}>+ True / False</button>
          {!live && <button className="btn ghost small" onClick={() => addQ("match")}>+ Match pairs</button>}
          {!live && <button className="btn ghost small" onClick={() => addQ("order")}>+ Put in order</button>}
          {!live && <button className="btn ghost small" onClick={() => addQ("swipe")}>+ Swipe sort</button>}
          {!live && <button className="btn ghost small" onClick={() => addQ("bucket")}>+ Buckets</button>}
        </div>
        )}
      </section>
      <div className="toolbar">
        <span style={{ marginRight: "auto" }} />
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save quiz"}</button>
      </div>
    </>
  );
}

const IMPORT_EXAMPLES: [string, string, string][] = [
  ["mcq", "Multiple choice", "MCQ | Cyber Security | Which password is strongest? | Summer2026! | P@ssw0rd | river-Lamp-kite-73 | C | Long passphrases are hardest to crack"],
  ["tf", "True / False", "TF | Cyber Security | You should lock your screen when you leave your desk. | TRUE | It takes one second"],
  ["match", "Match pairs", "MATCH | Cyber Security | Match each threat to its meaning | Phishing = Fake message | Malware = Harmful software | Vishing = Scam phone call | Why: Naming attacks helps you report them"],
  ["order", "Put in order", "ORDER | Cyber Security | You clicked a bad link. Put the steps in order | Disconnect from the network | Report it to IT | Change your passwords | Why: Contain, report, recover"],
  ["swipe", "Swipe sort", "SWIPE | Cyber Security | Swipe each card: risky or safe? | Risky / Safe | Sharing your OTP with a caller = Risky | Locking your screen = Safe | Clicking a link in an urgent SMS = L | Reporting a phishing email = R | Why: Anything that hands over codes is risky"],
  ["bucket", "Buckets", "BUCKET | Data Privacy | Sort each document by how sensitive it is | Public / Internal / Confidential | Press release = Public | Org chart = Internal | Salary list = Confidential | Product brochure = A | Customer contracts = C | Why: Label documents so everyone knows how to share them"],
  [
    "story",
    "Case study",
    [
      "STORY | Customer Experience | The blocked card",
      "CAST | Nimal | Customer | 11",
      "CAST | Ms. Perera | Branch manager | 5",
      "INTRO | Monday, 9:05 am. The branch has just opened. A customer hurries to your counter.",
      "SCENE | Customer | Nimal | My card got blocked and I fly in two hours! Fix it NOW! | angry",
      "CHOICE | Best | I'm sorry — let's sort this out. May I see your ID? | Nimal takes a breath and hands it over. | calm",
      "CHOICE | Okay | Please call our hotline. | Nimal sighs: “I'm already standing here…” | worried",
      "CHOICE | Poor | Cards aren't my department. | Nimal asks for your manager. | angry",
      "SCENE | narrator | The system shows three wrong PIN tries last night.",
      "CHOICE | Best | Explain, verify him and reset the PIN | “That was me!” | happy",
      "CHOICE | Poor | Unblock it, no questions | It works — but you skipped the checks. | thinking",
      "SCENE | Branch manager | Ms. Perera | Everything okay here? | thinking",
      "CHOICE | Best | All sorted — verified and unblocked. | “That's exactly how we do it.” | excited",
      "CHOICE | Okay | I'm not sure I followed every step. | She walks you through the checklist. | thinking",
      "ENDING | Best | Nimal makes his flight — and leaves a 5-star review.",
      "WHY | Calm the customer, verify identity, then fix it.",
      "END",
    ].join("\n"),
  ],
];
const STORY_EXAMPLES: [string, string, string][] = [
  ["script", "Script", SCRIPT_EXAMPLE],
  ["story", "Spreadsheet rows", IMPORT_EXAMPLES.find((x) => x[0] === "story")![2]],
];
const IMPORT_HELP: Record<string, string> = {
  script: "Write it like a play: Title, Cast (role and look for each person), Intro, then scenes as  Name (mood): words  with 2–3 replies under each:  - Best/Okay/Poor: reply -> (mood) what happens. Several stories can go in one paste.",
  mcq: "Type | Topic | Question | 2–5 options | correct letter | explanation (optional).",
  tf: "Type | Topic | Statement | TRUE or FALSE | explanation (optional).",
  match: "Type | Topic | Question | 2–6 pairs written as  term = meaning | Why: explanation (optional).",
  order: "Type | Topic | Question | 3–6 steps in the RIGHT order (players get them shuffled) | Why: explanation (optional).",
  swipe: "Type | Topic | Question | Left / Right side names | 4–12 cards written as  card = side  (the side's name, or L / R) | Why: explanation (optional).",
  bucket: "Type | Topic | Question | 2–3 bucket names split by / | 3–12 items written as  item = bucket  (its name, or A / B / C) | Why: explanation (optional).",
  story:
    "One row per line (Excel or .csv works), from STORY | topic | title to END. CAST | name | role | look number. SCENE | role or narrator | name | words | mood. Then 2–3 CHOICE | Best/Okay/Poor | reply | what happens | mood. 2–5 scenes. ENDING | Best/Good/Learn | text is optional; WHY is the lesson. Moods: calm, happy, excited, worried, thinking, angry, shocked.",
};

/** One CSV line → tab-separated cells (handles "quoted, cells" and "" escapes). */
function csvToTabs(line: string) {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q && ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.replace(/\t/g, " ")).join("\t");
}

function BulkImport({ text, setText, onAdd, live, story }: { text: string; setText: (s: string) => void; onAdd: () => void; live: boolean; story?: boolean }) {
  const { d, toast } = useApp();
  const [help, setHelp] = useState<string>(story ? "script" : "mcq");
  const file = useRef<HTMLInputElement>(null);
  const load = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return toast("That file is too big — 1 MB at most.");
    const t = (await f.text()).replace(/^\uFEFF/, "");
    // CSV saved from Excel: commas between columns (quoted cells kept whole) → tabs
    const rows = /\.csv$/i.test(f.name) && !t.includes("\t") && !t.includes("|") ? t.split(/\r?\n/).map(csvToTabs).join("\n") : t;
    setText((text.trim() ? text.replace(/\s*$/, "\n") : "") + rows);
    toast(`Loaded ${f.name} — check the preview, then add the questions`);
    if (file.current) file.current.value = "";
  };
  const res = useMemo(() => (text.trim() ? parseImport(text, d.cfg.topics, live) : null), [text, d.cfg.topics, live]);
  const counts = (res?.drafts || []).reduce<Record<string, number>>((m, q) => ((m[q.type] = (m[q.type] || 0) + 1), m), {});
  const ex = story ? STORY_EXAMPLES : IMPORT_EXAMPLES.filter((x) => (!live || x[0] === "mcq" || x[0] === "tf") && x[0] !== "story");
  const cur = ex.find((x) => x[0] === help) || ex[0];
  return (
    <section className="panel bulk">
      <div className="panel-h">
        <div>
          <h2>Bulk import</h2>
          <p>
            Paste rows from Excel (tab-separated), upload a .csv or .txt file, or use | between columns. Start a row with <b>MCQ</b>, <b>TF</b>
            {live ? "" : <>, <b>MATCH</b>, <b>ORDER</b>, <b>SWIPE</b>, <b>BUCKET</b> or a <b>STORY</b> block</>}
            {live ? ". Each gets a 20-second timer." : "."}
          </p>
        </div>
      </div>
      <div className="bulk-tabs" role="tablist" aria-label="Row format">
        {ex.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={cur[0] === k} className={cur[0] === k ? "on" : ""} onClick={() => setHelp(k)}>{label}</button>
        ))}
      </div>
      <div className="bulk-help">
        <code className="box" style={{ whiteSpace: "pre-wrap" }}>{cur[2]}</code>
        <p className="fine">
          {IMPORT_HELP[cur[0]]} Rows without a type word still work the old way.
        </p>
        <button type="button" className="link" onClick={() => { setText((text.trim() ? text.replace(/\s*$/, "\n") : "") + cur[2]); toast("Example added — edit it or paste your own rows"); }}>
          Add this example to the box
        </button>
      </div>
      <textarea className="inp" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste rows here" aria-label="Rows to import" />
      <div className="row">
        <input ref={file} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="sr" tabIndex={-1} aria-hidden="true" onChange={(e) => void load(e.target.files?.[0])} />
        <button type="button" className="btn ghost tiny" onClick={() => file.current?.click()}>
          Upload a .csv or .txt file
        </button>
        {text.trim() && (
          <button type="button" className="link" onClick={() => setText("")}>
            Clear
          </button>
        )}
      </div>
      {res && (
        <div className="bulk-prev" aria-live="polite">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="chip ok">{v} {TYPE_NAME[k as keyof typeof TYPE_NAME].toLowerCase()}</span>
          ))}
          {!res.drafts.length && <span className="fine">No questions recognised yet.</span>}
          {res.skipped.slice(0, 4).map((x) => (
            <span key={x.line} className="chip warn">Row {x.line}: {x.why}</span>
          ))}
          {res.skipped.length > 4 && <span className="fine">+{res.skipped.length - 4} more rows skipped</span>}
        </div>
      )}
      <button className="btn ghost small" style={{ justifySelf: "start" }} disabled={!res?.drafts.length} onClick={onAdd}>
        {res?.drafts.length ? `Add ${res.drafts.length} question${res.drafts.length === 1 ? "" : "s"}` : "Add these questions"}
      </button>
    </section>
  );
}

function QEditor({ q, i, n, topics, live, setQ, move, remove }: { q: DraftQ; i: number; n: number; topics: string[]; live: boolean; setQ: (i: number, p: Partial<DraftQ>) => void; move: (i: number, d: -1 | 1) => void; remove: () => void }) {
  const tlist = [...new Set([...topics, q.topic].filter(Boolean))];
  const badType = live && q.type !== "mcq" && q.type !== "tf";
  return (
    <div className="qed">
      <div className="qed-h">
        <span className="ttl">Q{i + 1} · {TYPE_NAME[q.type]}</span>
        <button className="x" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button className="x" aria-label={`Move question ${i + 1} down`} disabled={i === n - 1} onClick={() => move(i, 1)}>↓</button>
        <button className="x" aria-label={`Delete question ${i + 1}`} onClick={remove}>✕</button>
      </div>
      {badType && <p className="err">Live quizzes can't use this question type — remove it or change the quiz type.</p>}
      <div className="field">
        <label htmlFor={`q${i}t`}>{q.type === "tf" ? "Statement" : q.type === "story" ? "Case study title" : "Question"}</label>
        <textarea className="inp" id={`q${i}t`} rows={q.type === "story" ? 1 : 2} maxLength={q.type === "story" ? 80 : 300} value={q.q} placeholder={q.type === "story" ? "e.g. The blocked card" : undefined} onChange={(e) => setQ(i, { q: e.target.value })} />
      </div>
      <QImage img={q.img} i={i} onChange={(img) => setQ(i, { img })} />
      {q.type === "mcq" && (
        <div className="field">
          <span className="flabel">Options — tap the letter to mark the right one</span>
          {q.options.map((o, k) => (
            <div className="optrow" key={k}>
              <button type="button" className={`radio ${q.answer === k ? "on" : ""}`} aria-label={`Mark option ${"ABCDE"[k]} correct`} aria-pressed={q.answer === k} onClick={() => setQ(i, { answer: k })}>{"ABCDE"[k]}</button>
              <input className="inp" id={`q${i}o${k}`} value={o} maxLength={140} placeholder={`Option ${"ABCDE"[k]}`} aria-label={`Option ${"ABCDE"[k]}`} onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} />
              {q.options.length > 2 && <button type="button" className="x" aria-label={`Remove option ${"ABCDE"[k]}`} onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== k), answer: q.answer === k ? 0 : q.answer > k ? q.answer - 1 : q.answer })}>✕</button>}
            </div>
          ))}
          {q.options.length < (live ? 4 : 5) && <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setQ(i, { options: [...q.options, ""] })}>+ Add option</button>}
        </div>
      )}
      {q.type === "swipe" && <SwipeEdit q={q} i={i} setQ={setQ} />}
      {q.type === "bucket" && <BucketEdit q={q} i={i} setQ={setQ} />}
      {q.type === "story" && <StoryEdit q={q} i={i} setQ={setQ} />}
      {q.type === "tf" && (
        <div className="field">
          <span className="flabel">Right answer</span>
          <Seg value={q.tf ? "T" : "F"} options={[["T", "True"], ["F", "False"]]} onChange={(v) => setQ(i, { tf: v === "T" })} className="narrow" label="Right answer" />
        </div>
      )}
      {q.type === "match" && (
        <div className="field">
          <span className="flabel">Pairs (term → match). Players see the right side shuffled.</span>
          {q.pairs.map((p, k) => (
            <div className="optrow" key={k}>
              <input className="inp" value={p[0]} maxLength={80} placeholder="Term" aria-label={`Term ${k + 1}`} onChange={(e) => setQ(i, { pairs: q.pairs.map((x, j) => (j === k ? [e.target.value, x[1]] : x)) })} />
              <span>→</span>
              <input className="inp" value={p[1]} maxLength={120} placeholder="Meaning" aria-label={`Meaning ${k + 1}`} onChange={(e) => setQ(i, { pairs: q.pairs.map((x, j) => (j === k ? [x[0], e.target.value] : x)) })} />
              {q.pairs.length > 2 && <button type="button" className="x" aria-label="Remove pair" onClick={() => setQ(i, { pairs: q.pairs.filter((_, j) => j !== k) })}>✕</button>}
            </div>
          ))}
          {q.pairs.length < 6 && <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setQ(i, { pairs: [...q.pairs, ["", ""]] })}>+ Add pair</button>}
        </div>
      )}
      {q.type === "order" && (
        <div className="field">
          <span className="flabel">Steps in the RIGHT order. Players see them shuffled.</span>
          {q.steps.map((s, k) => (
            <div className="optrow" key={k}>
              <span className="radio on" style={{ background: "var(--ink)", color: "#fff", boxShadow: "none" }}>{k + 1}</span>
              <input className="inp" value={s} maxLength={140} placeholder={`Step ${k + 1}`} aria-label={`Step ${k + 1}`} onChange={(e) => setQ(i, { steps: q.steps.map((x, j) => (j === k ? e.target.value : x)) })} />
              {q.steps.length > 3 && <button type="button" className="x" aria-label="Remove step" onClick={() => setQ(i, { steps: q.steps.filter((_, j) => j !== k) })}>✕</button>}
            </div>
          ))}
          {q.steps.length < 6 && <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setQ(i, { steps: [...q.steps, ""] })}>+ Add step</button>}
        </div>
      )}
      <div className="row2">
        <div className="field">
          <label htmlFor={`q${i}tp`}>Topic (drives the gap dashboard)</label>
          <select className="inp" id={`q${i}tp`} value={q.topic} onChange={(e) => setQ(i, { topic: e.target.value })}>
            {tlist.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {live && (
          <div className="field">
            <label htmlFor={`q${i}s`}>Time to answer</label>
            <select className="inp" id={`q${i}s`} value={q.seconds || LIVE.defaultSeconds} onChange={(e) => setQ(i, { seconds: Number(e.target.value) })}>
              {[...new Set([...SECONDS, q.seconds || LIVE.defaultSeconds])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s} seconds</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor={`q${i}e`}>{q.type === "story" ? "The lesson (shown with the ending)" : "Why? (shown after answering)"}</label>
        <textarea className="inp" id={`q${i}e`} rows={2} maxLength={300} value={q.explain} placeholder={q.type === "story" ? "Calm the customer first, verify identity, then fix it." : "One or two lines that teach the point"} onChange={(e) => setQ(i, { explain: e.target.value })} />
      </div>
    </div>
  );
}

/** Optional picture for a question — resized and compressed in the browser before it's saved. */
function QImage({ img, i, onChange }: { img?: string; i: number; onChange: (img: string | undefined) => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="field">
      <span className="flabel">Image (optional)</span>
      <div
        className={`qimg-drop ${img ? "has" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files?.[0]);
        }}
      >
        {img ? <img src={img} alt={`Question ${i + 1} image`} /> : <span className="fine">Drop a picture here, or choose one. It's resized automatically.</span>}
        <div className="row">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
          <button type="button" className="btn ghost tiny" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Processing…" : img ? "Replace image" : "+ Add image"}</button>
          {img && <button type="button" className="link danger" onClick={() => onChange(undefined)}>Remove</button>}
        </div>
      </div>
    </div>
  );
}
