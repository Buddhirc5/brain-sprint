import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/ctx";
import { absUrl } from "../app/router";
import { Seg } from "../components/ui";
import { cleanText } from "../lib/security";
import type { Features, OrgConfig, SignIn } from "../types";
import { SwitchRow, useLiveTenant } from "./common";

const lines = (s: string) => [...new Set(s.split(/\r?\n/).map((x) => cleanText(x, 60).trim()).filter(Boolean))];

interface Form {
  branches: string;
  departments: string;
  topics: string;
  minQ: number;
  maxQ: number;
  features: Features;
  signIn: SignIn;
}
const toForm = (c: OrgConfig): Form => ({
  branches: c.branches.join("\n"), departments: c.departments.join("\n"), topics: c.topics.join("\n"),
  minQ: c.minQ, maxQ: c.maxQ, features: { ...c.features }, signIn: { ...c.signIn },
});

export function Settings() {
  const { d, api, tid, approve, toast, slug } = useApp();
  const { labels } = useLiveTenant();
  const [f, setF] = useState<Form>(() => toForm(d.cfg));
  const base = useMemo(() => JSON.stringify(toForm(d.cfg)), [d.cfg]);
  const dirty = JSON.stringify(f) !== base;
  // settings saved elsewhere (Security tab, another admin): follow them unless this form has edits
  const prevBase = useRef(base);
  useEffect(() => {
    if (prevBase.current !== base) {
      setF((cur) => (JSON.stringify(cur) === prevBase.current ? toForm(d.cfg) : cur));
      prevBase.current = base;
    }
  }, [base, d.cfg]);
  const setFeat = (k: keyof Features, v: boolean) => setF((c) => ({ ...c, features: { ...c.features, [k]: v, ...(k === "coins" && !v ? { store: false } : {}) } }));
  const setSI = (p: Partial<SignIn>) => setF((c) => ({ ...c, signIn: { ...c.signIn, ...p } }));
  const playerLink = absUrl({ r: "tenant", slug });
  const adminLink = absUrl({ r: "admin", slug });

  const problem = (): string | null => {
    if (f.minQ > f.maxQ) return "Minimum questions can't be more than the maximum.";
    if (!lines(f.branches).length && !lines(f.departments).length) return `Add at least one ${labels.branch.toLowerCase()} or ${labels.dept.toLowerCase()}.`;
    if (!lines(f.topics).length) return "Add at least one topic.";
    if (!f.signIn.empId && !f.signIn.emailOtp && !f.signIn.sso) return "Players need at least one way to sign in.";
    if (!f.features.sprint && !f.features.cert && !f.features.live && !f.features.polls) return "Turn on at least one mode (sprint, certification, live quiz or polls).";
    return null;
  };

  const save = async () => {
    const p = problem();
    if (p) return toast(p);
    const cfg: OrgConfig = { ...d.cfg, branches: lines(f.branches), departments: lines(f.departments), topics: lines(f.topics), minQ: f.minQ, maxQ: f.maxQ, features: f.features, signIn: f.signIn };
    const mfaOn = f.signIn.adminMfa && !d.cfg.signIn.adminMfa;
    const verified = mfaOn ? (await api.mfaState().catch(() => ({ verified: false }))).verified : true;
    const changes: string[] = [];
    (Object.keys(f.features) as (keyof Features)[]).forEach((k) => f.features[k] !== d.cfg.features[k] && changes.push(`${FEAT[k].title(labels.battle)} ${f.features[k] ? "on" : "off"}`));
    (Object.keys(f.signIn) as (keyof SignIn)[]).forEach((k) => f.signIn[k] !== d.cfg.signIn[k] && changes.push(`${SI_NAME[k]}: ${String(f.signIn[k]).replace("true", "on").replace("false", "off")}`));
    approve({
      label: `Save settings${changes.length ? ` — ${changes.slice(0, 6).join(", ")}${changes.length > 6 ? "…" : ""}` : ""}.${!verified ? " You'll be asked to set up an authenticator app straight away." : ""} Players see changes the next time their app refreshes.`,
      yes: "Save settings",
      run: async () => {
        await api.saveConfig(tid, cfg);
        toast("Settings saved");
        if (!verified) location.reload();
      },
    });
  };

  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast("Link copied"), () => toast("Copy the link from the box"));

  return (
    <>
      <div className="toolbar">
        <h1>Settings</h1>
        {dirty && <span className="sev warn">Unsaved changes</span>}
        {dirty && <button className="btn ghost small" onClick={() => setF(toForm(d.cfg))}>Undo</button>}
        <button className="btn primary" disabled={!dirty} onClick={save}>Save settings</button>
      </div>
      <div className="grid2">
        <section className="panel">
          <div className="panel-h"><div><h2>Modes & features</h2><p>Turn off anything you don't use — it disappears from the player app and the admin portal.</p></div></div>
          {(Object.keys(FEAT) as (keyof Features)[]).map((k) => (
            <SwitchRow key={k} title={FEAT[k].title(labels.battle)} text={FEAT[k].text(labels)} on={f.features[k]} onChange={(v) => setFeat(k, v)} disabled={k === "store" && !f.features.coins} />
          ))}
        </section>
        <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
          <section className="panel">
            <div className="panel-h"><div><h2>Player sign-in</h2><p>How staff get into the player app</p></div></div>
            <SwitchRow title="Employee ID" text='Type your ID, confirm "Is this you?", done. No password. One device at a time.' on={f.signIn.empId} onChange={(v) => setSI({ empId: v })} />
            <SwitchRow title="Email code" text="A 6-digit code sent to the player's email. Works for cards that have an email." on={f.signIn.emailOtp} onChange={(v) => setSI({ emailOtp: v })} />
            <SwitchRow title="Microsoft account (SSO)" text={<>Sign in with a work Microsoft account. <b>Needs Microsoft Entra ID set up in Supabase Auth first</b> — otherwise the button won't work.</>} on={f.signIn.sso} onChange={(v) => setSI({ sso: v })} />
            <SwitchRow title="Guests in live quizzes" text="People without a player card can join a live game with just a nickname (for events and visitors)." on={f.signIn.liveGuests} onChange={(v) => setSI({ liveGuests: v })} />
          </section>
          <section className="panel">
            <div className="panel-h"><div><h2>Admin sign-in</h2><p>How admins get into this portal</p></div></div>
            <div className="field">
              <span className="flabel">Sign-in method</span>
              <Seg<SignIn["adminAuth"]> value={f.signIn.adminAuth} onChange={(v) => setSI({ adminAuth: v })} options={[["password", "Password"], ["magic", "Email link"], ["both", "Either"]]} label="Admin sign-in method" />
              <span className="fine">{f.signIn.adminAuth === "magic" ? "Admins get a one-time sign-in link by email. No passwords to leak." : f.signIn.adminAuth === "password" ? "Admins sign in with email and password." : "Admins can use a password or a one-time email link."}</span>
            </div>
            <SwitchRow title="Require an authenticator app" text="Every admin must enter a 6-digit code from an app like Microsoft or Google Authenticator. Strongly recommended." on={f.signIn.adminMfa} onChange={(v) => setSI({ adminMfa: v })} />
          </section>
          <section className="panel">
            <div className="panel-h"><div><h2>Links to share</h2><p>Put the player link on your intranet or in a QR code.</p></div></div>
            <div className="field">
              <label htmlFor="pLink">Player app</label>
              <div className="optrow"><input className="inp" id="pLink" readOnly value={playerLink} onFocus={(e) => e.target.select()} /><button className="btn ghost small" onClick={() => copy(playerLink)}>Copy</button></div>
            </div>
            <div className="field">
              <label htmlFor="aLink">Admin portal</label>
              <div className="optrow"><input className="inp" id="aLink" readOnly value={adminLink} onFocus={(e) => e.target.select()} /><button className="btn ghost small" onClick={() => copy(adminLink)}>Copy</button></div>
            </div>
          </section>
        </div>
        <section className="panel">
          <div className="panel-h"><div><h2>{labels.branches}</h2><p>One per line. All of them appear in the gap report, even with no plays.</p></div></div>
          <textarea className="inp" rows={9} value={f.branches} onChange={(e) => setF({ ...f, branches: e.target.value })} aria-label={labels.branches} />
          <span className="fine">{lines(f.branches).length} {labels.branches.toLowerCase()}</span>
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>{labels.depts}</h2><p>One per line</p></div></div>
          <textarea className="inp" rows={9} value={f.departments} onChange={(e) => setF({ ...f, departments: e.target.value })} aria-label={labels.depts} />
          <span className="fine">{lines(f.departments).length} {labels.depts.toLowerCase()} · rename these words in Branding</span>
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>Topics</h2><p>One per line. Every question is tagged with one — they drive the knowledge-gap dashboard.</p></div></div>
          <textarea className="inp" rows={8} value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} aria-label="Topics" />
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>Daily sprint size</h2><p>How many questions a sprint can have. 1–5 works best. (Exams and live quizzes can have up to 50.)</p></div></div>
          <div className="row2">
            <div className="field">
              <label htmlFor="minQ">Minimum</label>
              <select className="inp" id="minQ" value={f.minQ} onChange={(e) => setF({ ...f, minQ: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
            </div>
            <div className="field">
              <label htmlFor="maxQ">Maximum</label>
              <select className="inp" id="maxQ" value={f.maxQ} onChange={(e) => setF({ ...f, maxQ: Number(e.target.value) })}>{[...new Set([3, 4, 5, 6, 8, 10, 12, 15, 20, f.maxQ])].sort((a, b) => a - b).map((n) => <option key={n}>{n}</option>)}</select>
            </div>
          </div>
        </section>
      </div>
      {dirty && (
        <div className="save-bar" role="region" aria-label="Unsaved settings">
          <span>You have unsaved changes.</span>
          <button className="btn ghost small" onClick={() => setF(toForm(d.cfg))}>Undo</button>
          <button className="btn lime small" onClick={save}>Save settings</button>
        </div>
      )}
    </>
  );
}

type L = ReturnType<typeof useLiveTenant>["labels"];
const FEAT: Record<keyof Features, { title: (battle: string) => string; text: (l: L) => string }> = {
  sprint: { title: () => "Daily sprints", text: () => "Short self-paced quizzes players open from their phone — the heart of the knowledge-gap dashboard." },
  cert: { title: () => "Certification exams", text: () => "Graded exams with a pass mark, limited attempts and a printable certificate." },
  live: { title: () => "Live quiz", text: () => "Host a game-show quiz on a big screen; everyone answers on their phone at the same time." },
  polls: { title: () => "Live polls", text: () => "Word clouds, votes, scales and Q&A for meetings and town halls." },
  coins: { title: () => "Coins", text: () => "Players earn coins for right answers and streaks." },
  store: { title: () => "Store", text: () => "Players spend coins on outfits for their character. Needs coins." },
  streaks: { title: () => "Streaks", text: () => "Rewards playing on days in a row." },
  avatars: { title: () => "Characters", text: () => "Each player picks a cartoon character shown on boards." },
  rewards: { title: () => "Hall of Fame", text: () => "Record prizes for top players; winners show in the player app." },
  battle: { title: (b) => b, text: (l) => `A leaderboard between ${l.branches.toLowerCase()} and ${l.depts.toLowerCase()} (average points per active player).` },
};
const SI_NAME: Record<keyof SignIn, string> = { empId: "Employee ID sign-in", emailOtp: "Email code sign-in", sso: "Microsoft sign-in", liveGuests: "Live guests", adminAuth: "Admin sign-in", adminMfa: "Admin authenticator app" };
