import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { useApi } from "../app/ApiCtx";
import { Icon, Modal, Seg } from "../components/ui";
import { blankDraft, draftProblem, sealQuestion, TYPE_NAME, unseal, type DraftQ } from "../lib/answers";
import { COLOR_HEX, COLORS, DARK_CARDS, MINUTE_OPTS, sortGames, statusOf } from "../lib/games";

const CERT_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180]; // exams: 1–180 min (server clamps the same)
import { limitMs, runCorrect } from "../lib/scoring";
import { cleanText } from "../lib/security";
import { fmtDate, fmtMin, newId, pct, todayKey } from "../lib/util";
import { LIVE } from "../api/engine";
import type { AnswerKey, CardColor, CertSettings, Game, GameStatus, LibraryItem, QType, QuizKind } from "../types";
import { useAdmin } from "./Admin";
import { KIND } from "./common";

const MAX_Q_HARD = 50; // backend limit
const SECONDS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const VALID_MONTHS: [number, string][] = [[0, "Never expires"], [3, "3 months"], [6, "6 months"], [12, "1 year"], [24, "2 years"], [36, "3 years"]];
const DEFAULT_CERT: CertSettings = { passPct: 80, attempts: 3, certTitle: "", validMonths: 12, showAnswers: true };

/* ================= list ================= */
export function Quizzes() {
  const { d, players, approve, run, api, tid, can, features } = useApp();
  const { user } = useApi();
  const { setTab } = useAdmin();
  const [kind, setKind] = useState<"all" | QuizKind>("all");
  const [picker, setPicker] = useState(false);
  const [lib, setLib] = useState(false);
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
        <button className="btn ghost small" onClick={() => setLib(true)}>
          <Icon.book /> Starter library
        </button>
        <button className="btn primary" onClick={() => setPicker(true)}>
          New quiz
        </button>
      </div>
      <div className="chips-row" role="group" aria-label="Filter by type">
        {(["all", "sprint", "cert", "live"] as const).map((k) => (
          <button key={k} className={`chip-tg ${kind === k ? "on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === "all" ? "All" : KIND[k].label} <span className="sub num">{k === "all" ? all.length : count(k)}</span>
          </button>
        ))}
      </div>
      <p className="fine">
        {kind === "live" ? "Live quizzes are hosted from the Live quiz tab — they don't appear in the player app on their own." : `Tip: daily sprints work best with ${d.cfg.minQ}–${Math.min(5, d.cfg.maxQ)} questions. Give one a date and players see it that morning.`}
        {mc ? " Maker-checker is on: a second admin must approve sprints and exams before they go live." : ""}
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
            const dark = DARK_CARDS.includes(g.color);
            const hasKey = !!d.keys[g.id];
            const own = g.editedBy === me;
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
                      {k === "live" ? `${Math.round(liveSecs / 6) / 10} min of questions` : <>{g.date ? (g.date === t ? "Today" : fmtDate(g.date)) : "No date"} · {fmtMin(limitMs(g) / 60000)}</>}
                    </span>
                  </div>
                  <h3>{g.title}</h3>
                </div>
                <div className="body">
                  <div className="nums">
                    <div><b className="num">{g.questions.length}</b>questions</div>
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
      {lib && <Library onClose={() => setLib(false)} />}
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
          {(["sprint", "cert", "live"] as const).map((k) => {
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

function Library({ onClose }: { onClose: () => void }) {
  const { api, tid, run, pub, toast } = useApp();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [ind, setInd] = useState<"all" | "any" | "bank">(pub.template === "bank" ? "all" : "any");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api.library().then((x) => live && setItems(x), () => live && setItems([]));
    return () => {
      live = false;
    };
  }, [api]);
  const shown = (items || []).filter((x) => ind === "all" || x.industry === ind);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const go = async () => {
    setBusy(true);
    const n = await run(() => api.importLibrary(tid, sel));
    setBusy(false);
    if (n != null) {
      onClose();
      toast(`${n} quiz${n === 1 ? "" : "zes"} copied as drafts — review, then publish`);
    }
  };
  return (
    <Modal label="Starter library" onClose={onClose} wide>
      <div className="stack">
        <div className="panel-h">
          <div>
            <h3>Starter library</h3>
            <p className="fine">Ready-made quizzes you can copy and edit. They're added as drafts — nothing goes live until you publish it.</p>
          </div>
          <Seg value={ind} onChange={setInd} label="Industry" options={[["all", "All"], ["any", "Any industry"], ["bank", "Banking"]]} />
        </div>
        {!items ? (
          <p className="fine">Loading…</p>
        ) : !shown.length ? (
          <p className="fine">Nothing in the library for this filter.</p>
        ) : (
          <div className="lib-list">
            {shown.map((x) => (
              <label key={x.id} className={`lib-item ${sel.includes(x.id) ? "on" : ""}`}>
                <input type="checkbox" checked={sel.includes(x.id)} onChange={() => toggle(x.id)} />
                <span>
                  <b>{x.title}</b>
                  <span className="fine">{x.topic} · {x.questions.length} questions</span>
                </span>
                <span className={`chip ${x.industry === "bank" ? "bank" : ""}`}>{x.industry === "bank" ? "Banking" : "Any industry"}</span>
              </label>
            ))}
          </div>
        )}
        <div className="row end">
          <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary small" disabled={!sel.length || busy} onClick={go}>
            {busy ? "Copying…" : `Copy ${sel.length || ""} as draft${sel.length === 1 ? "" : "s"}`}
          </button>
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
  const newKind: QuizKind = gid?.startsWith("new:") && ["sprint", "cert", "live"].includes(gid.slice(4)) ? (gid.slice(4) as QuizKind) : "sprint";
  const topic0 = d.cfg.topics[0] || "General Knowledge";
  const [f, setF] = useState<Form>(() =>
    orig
      ? {
          kind: orig.kind || "sprint", title: orig.title, desc: orig.desc || "", date: orig.date || "", until: orig.until || "", minutes: orig.minutes || 2, color: orig.color,
          status: orig.status, cert: { ...DEFAULT_CERT, ...(orig.cert || {}) },
          qs: orig.questions.map((q) => ({ ...unseal(q, key?.answers[q.id]), seconds: q.seconds || (orig.kind === "live" ? LIVE.defaultSeconds : undefined) })),
        }
      : {
          kind: newKind, title: "", desc: "", date: newKind === "sprint" ? todayKey() : "", until: "", minutes: newKind === "cert" ? 5 : 1.5,
          color: newKind === "cert" ? "ink" : newKind === "live" ? "orange" : "lime", status: "draft", cert: { ...DEFAULT_CERT },
          qs: [{ ...blankDraft("mcq", topic0, newId("q")), ...(newKind === "live" ? { seconds: LIVE.defaultSeconds } : {}) }],
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
  const maxQ = f.kind === "sprint" ? d.cfg.maxQ : MAX_Q_HARD;
  const n = f.qs.length;
  const per = Math.round((f.minutes * 60) / Math.max(1, n));
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
    const rows = importText.split(/\r?\n/).map((l) => l.split(l.includes("\t") ? "\t" : "|").map((c) => c.trim())).filter((c) => c.length >= 3 && c.some(Boolean));
    const out: DraftQ[] = [];
    let bad = 0;
    for (const c of rows) {
      const topic = topics.find((t) => t.toLowerCase() === c[0].toLowerCase()) || topics[0] || "General Knowledge";
      const extra = live ? { seconds: LIVE.defaultSeconds } : {};
      if (c.length >= 7) {
        const opts = c.slice(2, 6).filter(Boolean);
        const ans = "ABCD".indexOf((c[6] || "").toUpperCase());
        if (opts.length < 2 || ans < 0 || ans >= opts.length) { bad++; continue; }
        out.push({ ...blankDraft("mcq", topic, newId("q")), q: cleanText(c[1], 300), options: opts.map((o) => cleanText(o, 140)), answer: ans, explain: cleanText(c[7] || "", 300), ...extra });
      } else if (/^(true|false)$/i.test(c[2])) {
        out.push({ ...blankDraft("tf", topic, newId("q")), q: cleanText(c[1], 300), tf: /^true$/i.test(c[2]), explain: cleanText(c[3] || "", 300), ...extra });
      } else bad++;
    }
    const room = Math.max(0, maxQ - n);
    set({ qs: [...f.qs, ...out.slice(0, room)] });
    setImport("");
    toast(`Added ${Math.min(out.length, room)} question(s)${bad ? ` · ${bad} row(s) skipped` : ""}${out.length > room ? " · quiz limit reached" : ""}`);
  };

  const save = async () => {
    setErr("");
    const title = cleanText(f.title, 60).trim();
    if (!title) return setErr("Give the quiz a title.");
    if (n < d.cfg.minQ || n > maxQ) return setErr(`This quiz needs ${d.cfg.minQ}–${maxQ} questions.`);
    if (!live && f.until && f.date && f.until < f.date) return setErr("The close date is before the start date.");
    if (live && f.qs.some((q) => q.type !== "mcq" && q.type !== "tf")) return setErr("Live quizzes use multiple-choice and true/false questions only.");
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
          seconds: live ? Math.max(5, Math.min(120, q.seconds || LIVE.defaultSeconds)) : undefined,
        };
        return sealQuestion(clean, orig?.questions.find((x) => x.id === q.id));
      });
      const game: Game = {
        id, kind: f.kind, title, desc: cleanText(f.desc, 110).trim(), color: f.color, status: f.status,
        date: live ? undefined : f.date || undefined, until: live ? undefined : f.until || undefined, minutes: live ? 0 : f.minutes,
        order: orig?.order ?? 0, questions: sealed.map((s) => s.q),
        ...(cert ? { cert: { ...f.cert, certTitle: cleanText(f.cert.certTitle, 80).trim(), attempts: Math.max(1, Math.min(5, Math.round(f.cert.attempts))) } } : {}),
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
                <div className="field">
                  <label htmlFor="gMin">{cert ? "Time for the whole exam" : "Time for the whole quiz"}</label>
                  <select className="inp" id="gMin" value={f.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>
                    {[...new Set([...(cert ? CERT_MINUTES : MINUTE_OPTS), f.minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="gDate">Show from</label>
                  <input className="inp" id="gDate" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="gUntil">Close after (optional)</label>
                  <input className="inp" id="gUntil" type="date" value={f.until} onChange={(e) => set({ until: e.target.value })} />
                </div>
              </div>
              <p className="fine">
                {n} question{n === 1 ? "" : "s"} in {fmtMin(f.minutes)} → about <b>{per}s per question</b>.
                {cert ? " Exams hide right/wrong until the end and score 1 point per right answer." : " Recommended: 1–5 questions in 1–2 minutes. The clock pauses while players read each answer."}
              </p>
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
          <BulkImport text={importText} setText={setImport} onAdd={importRows} live={live} />
        )}
      </div>
      {cert && <BulkImport text={importText} setText={setImport} onAdd={importRows} live={false} />}
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Questions ({n})</h2>
            <p>Answer keys stay on the server — players only ever receive the questions.</p>
          </div>
        </div>
        {f.qs.map((q, i) => (
          <QEditor key={q.id} q={q} i={i} n={n} topics={topics} live={live} setQ={setQ} move={move} remove={() => set({ qs: f.qs.filter((_, k) => k !== i) })} />
        ))}
        {!n && <p className="fine">No questions yet. Add one below.</p>}
        <div className="row">
          <button className="btn lime small" onClick={() => addQ("mcq")}>+ Multiple choice</button>
          <button className="btn ghost small" onClick={() => addQ("tf")}>+ True / False</button>
          {!live && <button className="btn ghost small" onClick={() => addQ("match")}>+ Match pairs</button>}
          {!live && <button className="btn ghost small" onClick={() => addQ("order")}>+ Put in order</button>}
        </div>
      </section>
      <div className="toolbar">
        <span style={{ marginRight: "auto" }} />
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save quiz"}</button>
      </div>
    </>
  );
}

function BulkImport({ text, setText, onAdd, live }: { text: string; setText: (s: string) => void; onAdd: () => void; live: boolean }) {
  return (
    <section className="panel">
      <div className="panel-h"><div><h2>Bulk import</h2><p>Paste rows from Excel (tab-separated) or use | between columns{live ? ". Each gets a 20-second timer." : ""}</p></div></div>
      <code className="box">{"Topic | Question | Option A | Option B | Option C | Option D | Correct letter | Explanation\nTopic | Statement | TRUE or FALSE | Explanation"}</code>
      <textarea className="inp" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste rows here" aria-label="Rows to import" />
      <button className="btn ghost small" style={{ justifySelf: "start" }} disabled={!text.trim()} onClick={onAdd}>Add these questions</button>
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
        <label htmlFor={`q${i}t`}>{q.type === "tf" ? "Statement" : "Question"}</label>
        <textarea className="inp" id={`q${i}t`} rows={2} maxLength={300} value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} />
      </div>
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
        <label htmlFor={`q${i}e`}>Why? (shown after answering)</label>
        <textarea className="inp" id={`q${i}e`} rows={2} maxLength={300} value={q.explain} placeholder="One or two lines that teach the point" onChange={(e) => setQ(i, { explain: e.target.value })} />
      </div>
    </div>
  );
}
