/* Profile quiz editor: the whole quiz is one script (bulk import). Paste or edit it; it's checked as you type,
   with a preview of the traits, profiles and questions. */
import { useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { errMsg } from "../app/ApiCtx";
import { Icon, Seg } from "../components/ui";
import { ProfileIcon, TRAIT_COLORS } from "../components/ProfileIcon";
import { ICONS, isScale, parseProfileScript, profileDraft, toProfileScript } from "../lib/profile";
import { PROFILE_PACKS } from "../data/profilePacks";
import type { GameStatus } from "../types";
import { useAdmin } from "./Admin";

export function ProfileEditor({ gid }: { gid?: string }) {
  const { d, api, tid, toast } = useApp();
  const { setTab } = useAdmin();
  const orig = gid && !gid.startsWith("new:") ? d.games[gid] : undefined;
  const [text, setText] = useState(() => (orig ? toProfileScript(orig, d.keys[orig.id]) : PROFILE_PACKS[0].script));
  const [status, setStatus] = useState<GameStatus>(orig?.status || "draft");
  const [date, setDate] = useState(orig?.date || "");
  const [until, setUntil] = useState(orig?.until || "");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const parsed = useMemo(() => parseProfileScript(text), [text]);
  const p = parsed.data;
  const mc = d.cfg.makerChecker;

  const save = async () => {
    if (!p) return toast("Fix the script first — see the list under it.");
    if (until && date && until < date) return toast("The close date is before the start date.");
    setBusy(true);
    try {
      const draft = profileDraft(p, { ...orig, status, date, until });
      await api.saveQuiz(tid, draft);
      toast(mc && status === "live" && orig?.status !== "live" ? "Saved — sent to another admin for approval" : "Profile quiz saved");
      setTab("games");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <button className="icon-btn" aria-label="Back to quizzes" onClick={() => setTab("games")}><Icon.back /></button>
        <h1>{orig ? "Edit profile quiz" : "New profile quiz"}</h1>
        <span className="grow" />
        <button className="btn ghost" onClick={() => setTab("games")}>Cancel</button>
        <button className="btn primary" disabled={busy || !p} onClick={save}>{busy ? "Saving…" : "Save quiz"}</button>
      </div>
      <p className="fine">A personality / work-style test with no right answers. Players get a private profile (only they and admins see it); it never counts toward points or the leaderboard. One try each — reset a player from Results if they should take it again.</p>

      <div className="grid2">
        <section className="panel">
          <div className="panel-h">
            <div><h2>Script</h2><p>The whole quiz as text. Paste a new one, or edit this one.</p></div>
            <button className="btn ghost small" onClick={() => setHelp((v) => !v)}>{help ? "Hide format" : "Format help"}</button>
          </div>
          {help && <FormatHelp />}
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <span className="fine">Start from:</span>
            {PROFILE_PACKS.map((x) => (
              <button key={x.id} className="btn ghost small" onClick={() => setText(x.script)}>{x.title}</button>
            ))}
          </div>
          <textarea className="inp pf-script" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label="Profile quiz script" rows={28} />
          {parsed.errors.length > 0 ? (
            <div className="banner red">
              <b>Fix these first:</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{parsed.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : p && (
            <div className="banner blue">Looks good: {p.meta.traits.length} traits, {p.meta.types.length} profiles, {p.questions.length} questions{p.meta.checks?.length ? `, ${p.meta.checks.length} honesty checks` : ""}.</div>
          )}
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Status</label>
              <Seg<GameStatus> value={status} onChange={setStatus} label="Status" options={[["draft", "Draft"], ["live", mc && orig?.status !== "live" ? "Submit" : "Live"], ["closed", "Closed"]]} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field grow"><label htmlFor="pf-from">Opens</label><input className="inp" id="pf-from" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="field grow"><label htmlFor="pf-to">Closes</label><input className="inp" id="pf-to" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><div><h2>Preview</h2><p>What the script turns into</p></div></div>
          {!p ? (
            <p className="fine">The preview appears once the script reads cleanly.</p>
          ) : (
            <div className="stack">
              <h3 style={{ margin: 0 }}>{p.title}</h3>
              {p.intro && <p className="fine" style={{ margin: 0 }}>{p.intro}</p>}
              <div className="pfe-traits">
                {p.meta.traits.map((t, i) => (
                  <span key={t.name} className="pfe-trait" style={{ ["--c" as string]: TRAIT_COLORS[i % 6] }}>
                    <ProfileIcon name={t.icon} size={18} /> <b>{t.name}</b> <small>{t.desc}</small>
                  </span>
                ))}
              </div>
              <h4 className="pfe-h">Profiles</h4>
              <div className="pfe-types">
                {p.meta.types.map((t) => (
                  <div key={t.name} className="pfe-type">
                    <span className="pfe-pair">
                      <span style={{ color: TRAIT_COLORS[t.a % 6] }}><ProfileIcon name={p.meta.traits[t.a].icon} size={16} /></span>
                      <span style={{ color: TRAIT_COLORS[t.b % 6] }}><ProfileIcon name={p.meta.traits[t.b].icon} size={16} /></span>
                    </span>
                    <div><b>{t.name}</b><div className="fine">{t.role}</div></div>
                  </div>
                ))}
              </div>
              {p.meta.types.length < (p.meta.traits.length * (p.meta.traits.length - 1)) / 2 && (
                <p className="fine">Pairs without a profile line use the stronger trait's name ("The {p.meta.traits[0].name}").</p>
              )}
              <h4 className="pfe-h">Questions</h4>
              <ol className="pfe-qs">
                {p.questions.map((q, i) => {
                  const scale = isScale({ id: "", type: "pick", topic: "", q: q.q, options: q.options });
                  return (
                    <li key={i}>
                      <b>{q.q}</b>
                      <div className="pfe-opts">
                        {scale ? (
                          <span className="fine">Agree ↔ disagree scale → {p.meta.traits[q.weights.flat()[0]?.[0] ?? 0].name}</span>
                        ) : (
                          q.options.map((o, k) => (
                            <span key={k} className="pfe-opt">
                              {o}
                              {q.weights[k].map(([t]) => (
                                <span key={t} style={{ color: TRAIT_COLORS[t % 6] }} title={p.meta.traits[t].name}><ProfileIcon name={p.meta.traits[t].icon} size={14} /></span>
                              ))}
                            </span>
                          ))
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function FormatHelp() {
  return (
    <div className="pfe-help">
      <p><b>Sections</b>, each on its own line: <code>Title:</code>, <code>Intro:</code>, <code>Traits:</code>, <code>Profiles:</code>, <code>Check:</code>, <code>Questions:</code>.</p>
      <p><b>Trait:</b> <code>Name | icon | short description</code>. Icons: {ICONS.join(", ")}. 2–6 traits.</p>
      <p><b>Profile:</b> <code>Trait + Trait | The Name | Like a… | one line</code>, then optional indented <code>Strengths:</code>, <code>Watch:</code>, <code>Work:</code> lines (separate items with <code>;</code>).</p>
      <p><b>Question types:</b></p>
      <ul>
        <li><code>Q:</code> — pick one of 2–6 answers <code>A) answer | Trait</code>. Several traits: <code>| Planner, Anchor</code> (the first counts most). Exact weights: <code>| Harmoniser 2, Anchor 1</code>.</li>
        <li><code>Q*:</code> — a light question (colours, pictures, fun picks): counts half.</li>
        <li><code>Scale: statement | Trait</code> — a 5-point agree/disagree question. Add <code>-</code> after the trait to reverse it (agreeing counts against).</li>
      </ul>
      <p><b>Honesty check:</b> <code>Check: 3 &amp; 12 | Planner vs Explorer</code> — if one of those answers leaned Planner and the other Explorer, the result says the answers were mixed.</p>
    </div>
  );
}
