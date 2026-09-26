import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../app/ctx";
import { useApi } from "../app/ApiCtx";
import { Icon, Seg } from "../components/ui";
import { auditReport } from "../lib/reports";
import { dqKey } from "../lib/scoring";
import { normEmpId, sha256, validEmpId } from "../lib/security";
import { dayKey, fmtDT, randHex } from "../lib/util";
import type { OrgConfig, SignIn } from "../types";
import { useAdmin } from "./Admin";
import { slugify, Toggle } from "./common";
import { useScan } from "./useScan";

interface Control {
  on: boolean;
  srv?: boolean; // enforced by the server — always on
  title: string;
  text: ReactNode;
  ctrl?: ReactNode;
}

export function Security() {
  const { d, players, approve, api, tid, toast, pub } = useApp();
  const { user } = useApi();
  const { exportCSV } = useAdmin();
  const { flags, ready } = useScan();
  const [roster, setRoster] = useState("");
  const [sev, setSev] = useState<"all" | "alert" | "warn">("all");
  const [q, setQ] = useState("");
  const [flagFilter, setFlagFilter] = useState<"open" | "all">("open");
  const [flagSev, setFlagSev] = useState<"all" | "alert" | "warn" | "info">("all");
  const cfg = d.cfg;

  const setPolicy = (patch: Partial<OrgConfig>, what: string, after?: () => void) =>
    approve({
      label: `Change security policy: ${what}.`,
      yes: "Apply",
      run: async () => {
        await api.saveConfig(tid, { ...cfg, ...patch });
        toast("Policy updated");
        after?.();
      },
    });
  const setSignIn = (patch: Partial<SignIn>, what: string, after?: () => void) => setPolicy({ signIn: { ...cfg.signIn, ...patch } }, what, after);

  const requireMfa = async (on: boolean) => {
    if (!on) return setSignIn({ adminMfa: false }, "authenticator app no longer required for admins");
    const m = await api.mfaState().catch(() => ({ enrolled: false, verified: false }));
    if (m.verified) return setSignIn({ adminMfa: true }, "every admin must use an authenticator app");
    approve({
      label: "Require an authenticator app for every admin. You haven't verified one in this session, so you'll be asked to set one up straight after saving. Other admins are asked at their next sign-in.",
      yes: "Require & set up now",
      run: async () => {
        await api.saveConfig(tid, { ...cfg, signIn: { ...cfg.signIn, adminMfa: true } });
        location.reload();
      },
    });
  };

  const games = Object.values(d.games);
  const keyed = games.filter((g) => d.keys[g.id]).length;
  const consented = players.filter((p) => p.consentAt).length;
  const joined = d.admins.filter((m) => m.joinedAt || m.userId);
  const mfaKnown = joined.filter((m) => m.mfa).length;
  const controls: Control[] = [
    { on: true, srv: true, title: "Company data kept separate", text: "Row-level security in the database: every read and write is checked against your company, so no other company can see your players, quizzes or results." },
    { on: true, srv: true, title: "Scoring on the server", text: "Answers are checked and points calculated by the server with its own clock. A player's device can't send itself a score." },
    { on: keyed === games.length, srv: true, title: "Hidden answer keys", text: `${keyed} of ${games.length} quizzes have an answer key. Keys are readable by admins only; players get questions, and right answers only after they answer.` },
    {
      on: cfg.signIn.adminMfa, title: "Authenticator app for admins",
      text: <>{cfg.signIn.adminMfa ? "Required: admins get no access until they pass a 6-digit code." : "Optional: admins who set one up are asked for it."} {joined.length ? `${mfaKnown} of ${joined.length} admins who have signed in use one.` : ""}</>,
      ctrl: <Toggle on={cfg.signIn.adminMfa} label="Require authenticator app for admins" onChange={(v) => void requireMfa(v)} />,
    },
    {
      on: cfg.adminIdleMin <= 15, title: "Admin idle sign-out", text: "The admin portal signs itself out after this long without activity.",
      ctrl: <select className="sel" value={cfg.adminIdleMin} aria-label="Idle sign-out minutes" onChange={(e) => setPolicy({ adminIdleMin: Number(e.target.value) }, `sign admins out after ${e.target.value} idle minutes`)}>{[...new Set([5, 10, 15, 30, 60, cfg.adminIdleMin])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} min</option>)}</select>,
    },
    { on: true, srv: true, title: "Audit log", text: `Every admin action is recorded by the server (${d.audit.length} entries kept). Admins can read it; nobody can edit it.` },
    { on: true, srv: true, title: "Rate limits", text: "Sign-in codes, Employee ID look-ups, live-game joins and poll answers are rate-limited to stop guessing and flooding." },
    {
      on: cfg.retentionDays <= 365, title: "Data retention", text: <>Plays older than this can be deleted in one step (see below).</>,
      ctrl: <select className="sel" value={cfg.retentionDays} aria-label="Retention" onChange={(e) => setPolicy({ retentionDays: Number(e.target.value) }, `keep plays for ${e.target.value} days`)}>{[...new Set([90, 180, 365, 730, cfg.retentionDays])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} days</option>)}</select>,
    },
    { on: cfg.maskIds, title: "Hide IDs from players", text: "Leaderboards show names and units only.", ctrl: <Toggle on={cfg.maskIds} label="Hide IDs from players" onChange={(v) => setPolicy({ maskIds: v }, `hide IDs from players ${v ? "on" : "off"}`)} /> },
    { on: cfg.lastInitialOnly, title: "Last initial only", text: "Players see \"Nadia P.\" instead of full names on boards.", ctrl: <Toggle on={cfg.lastInitialOnly} label="Last initial only" onChange={(v) => setPolicy({ lastInitialOnly: v }, `last initial only ${v ? "on" : "off"}`)} /> },
    { on: cfg.exportMask, title: "Mask IDs in exports", text: "CSV files show ••94 instead of full IDs and leave out emails. Every export is watermarked and logged either way.", ctrl: <Toggle on={cfg.exportMask} label="Mask IDs in exports" onChange={(v) => setPolicy({ exportMask: v }, `mask IDs in exports ${v ? "on" : "off"}`)} /> },
    { on: cfg.makerChecker, title: "Maker-checker for quizzes", text: "A second admin must approve a sprint or exam before players can see it. Editors can never publish on their own.", ctrl: <Toggle on={cfg.makerChecker} label="Maker-checker" onChange={(v) => setPolicy({ makerChecker: v }, `maker-checker ${v ? "on" : "off"}`)} /> },
    {
      on: cfg.requireAllowlist && !!d.roster?.hashes.length, title: "Staff allowlist",
      text: d.roster?.hashes.length ? `${d.roster.hashes.length} IDs on the list (stored as salted hashes). ${cfg.requireAllowlist ? "Only they can register." : "Not enforced yet — turn on to block other IDs."}` : "Upload your staff list below so only real IDs can register.",
      ctrl: <Toggle on={cfg.requireAllowlist} label="Require allowlist" onChange={(v) => { if (v && !d.roster?.hashes.length) return toast("Upload a staff list first (below)."); setPolicy({ requireAllowlist: v }, `staff allowlist ${v ? "enforced" : "not enforced"}`); }} />,
    },
    { on: true, title: "Consent recorded", text: `${consented} of ${players.length} players accepted the privacy notice (time-stamped).` },
  ];
  const score = controls.filter((c) => c.on).length;

  const parseIds = (s: string) => [...new Set(s.split(/[\s,;]+/).map(normEmpId).filter(validEmpId))];
  const saveRoster = () => {
    const ids = parseIds(roster);
    if (!ids.length) return toast("No valid IDs found.");
    const missing = players.filter((p) => !ids.includes(p.empId)).length;
    approve({
      label: `Replace the staff allowlist with ${ids.length} IDs.${missing ? ` ${missing} registered player${missing === 1 ? " is" : "s are"} not on it and will be flagged in the integrity scan.` : ""}`,
      yes: "Save list",
      run: async () => {
        const salt = randHex(12);
        // sha256(salt + EMPID) — no separator; must match the backend's check
        const hashes = await Promise.all(ids.map((id) => sha256(salt + id)));
        await api.saveRoster(tid, { salt, hashes, updatedAt: Date.now() });
        setRoster("");
        toast(`Allowlist saved · ${ids.length} IDs`);
      },
    });
  };
  const clearRoster = () =>
    approve({
      label: `Remove the staff allowlist${cfg.requireAllowlist ? " and stop enforcing it" : ""}. Anyone with the player link can register again.`,
      yes: "Remove list",
      danger: true,
      run: async () => {
        if (cfg.requireAllowlist) await api.saveConfig(tid, { ...cfg, requireAllowlist: false });
        await api.saveRoster(tid, null);
      },
    });
  const onFile = (f?: File) => f && f.size < 2_000_000 && f.text().then((t) => setRoster(t));

  const purge = () => {
    const cutoff = Date.now() - cfg.retentionDays * 864e5;
    const n = players.reduce((s, p) => s + Object.values(p.runs || {}).filter((x) => (x.finishedAt || x.startedAt) < cutoff).length, 0);
    if (!n) return toast(`Nothing older than ${cfg.retentionDays} days.`);
    approve({
      label: `Permanently delete ${n} plays older than ${cfg.retentionDays} days (before ${new Date(cutoff).toLocaleDateString()}). Dashboards and boards will no longer include them.`,
      yes: "Delete old plays",
      danger: true,
      run: async () => {
        const k = await api.purgeRuns(tid, cutoff);
        toast(`${k} old plays deleted`);
      },
    });
  };
  const setDQ = (uid: string, gid: string, on: boolean, reason: string) =>
    approve({
      label: `${on ? "Disqualify" : "Restore"} ${d.players[uid]?.name}'s play of "${d.games[gid]?.title}". ${on ? "It stops counting on leaderboards, rewards and dashboards." : "It counts again."}`,
      yes: on ? "Disqualify" : "Restore",
      danger: on,
      run: async () => {
        const runs = { ...(d.dq.runs || {}) };
        if (on) runs[dqKey(uid, gid)] = { at: Date.now(), by: user?.email || "admin", reason };
        else delete runs[dqKey(uid, gid)];
        await api.saveDQ(tid, { runs });
        toast(on ? "Play removed from leaderboards" : "Play restored");
      },
    });

  const isDq = (uid: string, gid?: string) => !!(gid && d.dq.runs?.[dqKey(uid, gid)]);
  const shownFlags = flags.filter((f) => (flagFilter === "all" || !isDq(f.uid, f.gid)) && (flagSev === "all" || f.sev === flagSev));
  const counts = { alert: flags.filter((f) => f.sev === "alert").length, warn: flags.filter((f) => f.sev === "warn").length, info: flags.filter((f) => f.sev === "info").length };
  const names = useMemo(() => Object.fromEntries(players.map((p) => [p.uid, p.name])), [players]);
  const audit = useMemo(() => {
    const k = q.trim().toLowerCase();
    return d.audit.filter((e) => (sev === "all" || e.sev === sev) && (!k || `${e.actor} ${e.action} ${e.target || ""} ${e.detail || ""} ${names[e.actor] || ""}`.toLowerCase().includes(k)));
  }, [d.audit, sev, q, names]);

  return (
    <>
      <div className="toolbar">
        <h1>Security</h1>
        <span className="pill"><Icon.shield /> {score} of {controls.length} controls on</span>
      </div>
      <div className="grid2">
        <section className="panel">
          <div className="panel-h"><div><h2>Security controls</h2><p>What protects staff data and fair play. Blue shields are enforced by the server and can't be turned off. Every change here is logged.</p></div></div>
          {controls.map((c) => (
            <div className="ctl" key={c.title}>
              <span className={`ic ${c.srv ? "srv" : c.on ? "on" : "off"}`} aria-hidden>{c.on ? <Icon.shield /> : <Icon.unlock />}</span>
              <div><b>{c.title}</b><span className="fine">{c.text}</span></div>
              {c.ctrl ?? <span className={`sev ${c.srv ? "info" : c.on ? "good" : "warn"}`}>{c.srv ? "Always on" : c.on ? "On" : "Check"}</span>}
            </div>
          ))}
        </section>
        <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
          <section className="panel">
            <div className="panel-h">
              <div><h2>Integrity scan</h2><p>Every sprint and exam play re-checked against its answer key and the scoring rules, plus timing, device and identity checks.</p></div>
              <Seg value={flagFilter} onChange={setFlagFilter} options={[["open", "Open"], ["all", "Incl. disqualified"]]} label="Show" />
            </div>
            <div className="chips-row" role="group" aria-label="Filter by level">
              {([["all", `All ${flags.length}`], ["alert", `${counts.alert} alerts`], ["warn", `${counts.warn} warnings`], ["info", `${counts.info} notes`]] as const).map(([k, l]) => (
                <button key={k} className={`chip-tg ${flagSev === k ? "on" : ""}`} aria-pressed={flagSev === k} onClick={() => setFlagSev(k)}>
                  {k !== "all" && <span className={`sev ${k}`} style={{ padding: "0 5px" }}>{k === "alert" ? "!" : k === "warn" ? "?" : "i"}</span>}
                  {l}
                </button>
              ))}
            </div>
            {!ready ? <p className="fine">Scanning…</p> : shownFlags.length ? (
              <div className="scroll-x" style={{ maxHeight: 520, overflowY: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Level</th><th>Player</th><th>Issue</th></tr></thead>
                  <tbody>
                    {shownFlags.slice(0, 150).map((f, i) => {
                      const dq = isDq(f.uid, f.gid);
                      return (
                        <tr key={i}>
                          <td><span className={`sev ${f.sev}`}>{f.sev}</span></td>
                          <td><b>{d.players[f.uid]?.name}</b><div className="sub">{d.players[f.uid]?.empId}</div></td>
                          <td className="wrap">
                            <b>{f.kind}</b>{f.gid && <span className="sub"> · {d.games[f.gid]?.title}</span>}
                            <div className="sub">{f.detail}</div>
                            {f.gid && <button className={`link flag-act ${dq ? "" : "danger"}`} onClick={() => setDQ(f.uid, f.gid!, !dq, f.kind)}>{dq ? "Restore play" : "Disqualify play"}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {shownFlags.length > 150 && <p className="fine">Showing the first 150 of {shownFlags.length}.</p>}
              </div>
            ) : <p className="fine">Nothing to review. Every play matches its answer key and the rules.</p>}
          </section>
          <section className="panel">
            <div className="panel-h"><div><h2>Staff allowlist</h2><p>Paste IDs from HR, or upload a file. They're stored only as salted hashes — the list can't be read back.</p></div></div>
            <textarea className="inp" rows={4} value={roster} onChange={(e) => setRoster(e.target.value)} placeholder="E1001, E1002, E1003 … one per line or comma-separated" aria-label="IDs for the allowlist" />
            <div className="row">
              <button className="btn primary small" disabled={!roster.trim()} onClick={saveRoster}>Replace list{roster.trim() ? ` (${parseIds(roster).length})` : ""}</button>
              <label className="btn ghost small">Upload file<input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr" onChange={(e) => onFile(e.target.files?.[0])} /></label>
              {d.roster?.hashes.length ? (
                <>
                  <span className="fine">Current list: {d.roster.hashes.length} IDs · updated {fmtDT(d.roster.updatedAt)}</span>
                  <button className="link danger" onClick={clearRoster}>Remove list</button>
                </>
              ) : <span className="fine">No list uploaded.</span>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-h"><div><h2>Delete old plays</h2><p>Your retention setting is {cfg.retentionDays} days. Deleting is permanent and logged.</p></div></div>
            <button className="btn orange small" style={{ justifySelf: "start" }} onClick={purge}>Delete plays older than {cfg.retentionDays} days</button>
          </section>
        </div>
      </div>
      <section className="panel">
        <div className="panel-h">
          <div><h2>Audit log</h2><p>Who did what and when — written by the server for every admin action.</p></div>
          <div className="row">
            <Seg value={sev} onChange={setSev} options={[["all", "All"], ["alert", "Alerts"], ["warn", "Warnings"]]} label="Level" />
            <input className="inp" style={{ maxWidth: 220, minHeight: 40 }} placeholder="Search who, what…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
            <button className="btn ghost small" disabled={!audit.length} onClick={() => exportCSV(`${slugify(pub.slug)}-audit-${dayKey(Date.now())}.csv`, "audit log", auditReport(audit, names))}>Export</button>
          </div>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th><th>Level</th></tr></thead>
            <tbody>
              {audit.slice(0, 300).map((e) => (
                <tr key={e.id}>
                  <td className="num">{fmtDT(e.at)}</td>
                  <td>{names[e.actor] || e.actor}</td>
                  <td><b>{e.action}</b></td>
                  <td>{e.target || "—"}</td>
                  <td className="wrap">{e.detail || ""}</td>
                  <td><span className={`sev ${e.sev || "info"}`}>{e.sev || "info"}</span></td>
                </tr>
              ))}
              {!audit.length && <tr><td colSpan={6} className="fine">No entries match.</td></tr>}
            </tbody>
          </table>
        </div>
        {audit.length > 300 && <p className="fine">Showing the latest 300 of {audit.length}. Export to see them all.</p>}
      </section>
    </>
  );
}
