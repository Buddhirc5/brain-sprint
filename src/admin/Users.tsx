import { useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Modal, Seg } from "../components/ui";
import { usersReport } from "../lib/reports";
import { cleanName, normEmpId, validEmpId, validName } from "../lib/security";
import { dayKey, fmtDT } from "../lib/util";
import type { RegisterInput } from "../api/Api";
import type { Labels, Player, UnitType } from "../types";
import { useAdmin } from "./Admin";
import { slugify, unitWord, useLiveTenant } from "./common";

type Sort = "points" | "name" | "unit" | "recent" | "new" | "signin";
const lastLogin = (p: Player) => Math.max(0, ...(p.logins || []).map((l) => l.at));
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function Users() {
  const { d, players, stats, approve, api, tid, pub } = useApp();
  const { labels } = useLiveTenant();
  const { exportCSV } = useAdmin();
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const [sort, setSort] = useState<Sort>("points");
  const [edit, setEdit] = useState<string | null>(null);
  const [imp, setImp] = useState(false);

  const units = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of d.cfg.branches) m.set(`branch|${b}`, b);
    for (const x of d.cfg.departments) m.set(`dept|${x}`, x);
    for (const p of players) m.set(`${p.unitType}|${p.unit}`, p.unit);
    return [...m.entries()];
  }, [d.cfg.branches, d.cfg.departments, players]);

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = players.filter((p) => (unit === "all" || `${p.unitType}|${p.unit}` === unit) && (!k || `${p.name} ${p.empId} ${p.unit} ${p.email || ""}`.toLowerCase().includes(k)));
    return list.sort((a, b) => {
      const sa = stats[a.uid], sb = stats[b.uid];
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "unit") return a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name);
      if (sort === "recent") return sb.lastAt - sa.lastAt;
      if (sort === "signin") return lastLogin(b) - lastLogin(a);
      if (sort === "new") return b.createdAt - a.createdAt;
      return sb.points - sa.points;
    });
  }, [players, stats, q, sort, unit]);
  const active = players.filter((p) => stats[p.uid]?.runsDone).length;
  const locked = players.filter((p) => p.locked).length;
  const demo = players.filter((p) => p.demo);

  const lock = (p: Player) =>
    approve({
      label: p.locked ? `Unlock ${p.name}'s player card so they can sign in again.` : `Lock ${p.name}'s player card. They are signed out everywhere and can't sign in until you unlock it.`,
      yes: p.locked ? "Unlock" : "Lock card",
      danger: !p.locked,
      run: () => api.adminPatchPlayer(tid, p.uid, { locked: !p.locked }),
    });
  const signOut = (p: Player) =>
    approve({
      label: `Sign ${p.name} out of every device. They can sign in again straight away.`,
      yes: "Sign out everywhere",
      run: () => api.adminSignOutPlayer(tid, p.uid),
    });
  const del = (p: Player) =>
    approve({
      label: `Delete ${p.name} (${p.empId}) and all their plays. This can't be undone.`,
      yes: "Delete player",
      danger: true,
      run: () => api.adminDeletePlayer(tid, p.uid),
    });
  const clearDemo = () =>
    approve({
      label: `Delete ${demo.length} sample players and their plays. Real players are not touched.`,
      yes: "Delete sample players",
      danger: true,
      run: async () => {
        for (const p of demo) await api.adminDeletePlayer(tid, p.uid);
      },
    });

  return (
    <>
      <div className="toolbar">
        <h1>Players</h1>
        <button className="btn ghost small" onClick={() => setImp(true)}>Import players</button>
        <button className="btn primary small" onClick={() => exportCSV(`${slugify(pub.slug)}-players-${dayKey(Date.now())}.csv`, "player list", usersReport({ players, games: d.games, dq: d.dq, cfg: d.cfg, stats, labels }))}>
          Export (CSV)
        </button>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="label">Registered</span><b className="num">{players.length}</b></div>
        <div className="kpi hl"><span className="label" style={{ color: "var(--ink)" }}>Have played</span><b className="num">{active}</b></div>
        <div className="kpi pk"><span className="label">Not played yet</span><b className="num">{players.length - active}</b></div>
        <div className="kpi"><span className="label">Locked</span><b className="num">{locked}</b></div>
      </div>
      {demo.length > 0 && (
        <div className="banner row" style={{ justifyContent: "space-between" }}>
          <span><b>{demo.length} sample players</b> are included so dashboards have something to show. Remove them before launch.</span>
          <button className="btn orange small" onClick={clearDemo}>Remove sample players</button>
        </div>
      )}
      <section className="panel">
        <div className="toolbar">
          <input className="inp" style={{ maxWidth: 280 }} placeholder="Search name, ID or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
          <select className="sel" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={`Filter by ${labels.branch.toLowerCase()} or ${labels.dept.toLowerCase()}`}>
            <option value="all">All {labels.branches.toLowerCase()} & {labels.depts.toLowerCase()}</option>
            <optgroup label={labels.branches}>{units.filter(([k]) => k.startsWith("branch|")).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
            <optgroup label={labels.depts}>{units.filter(([k]) => k.startsWith("dept|")).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
          </select>
          <select className="sel" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort players">
            <option value="points">Sort: top points</option>
            <option value="name">Sort: name</option>
            <option value="unit">Sort: {labels.branch.toLowerCase()} / {labels.dept.toLowerCase()}</option>
            <option value="recent">Sort: last played</option>
            <option value="signin">Sort: last sign-in</option>
            <option value="new">Sort: newest</option>
          </select>
          <span className="fine" style={{ marginLeft: "auto" }}>{rows.length} shown</span>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Player</th><th>ID</th><th>{labels.branch} / {labels.dept}</th><th className="r">Plays</th><th className="r">Accuracy</th><th className="r">Points</th><th>Last played</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => {
                const s = stats[p.uid];
                const ll = (p.logins || []).slice().sort((a, b) => b.at - a.at)[0];
                return (
                  <tr key={p.uid}>
                    <td>
                      <div className="who">
                        <Chibi look={p.look} equipped={p.equipped} size={34} still />
                        <div>
                          <b>{p.name}</b> {p.demo && <span className="chip">sample</span>} {p.locked && <span className="sev alert">Locked</span>}
                          <div className="sub">{p.email || "no email"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num"><b>{p.empId}</b></td>
                    <td>{p.unit} <span className="sub">{unitWord(labels, p.unitType)}</span></td>
                    <td className="r num">{s?.runsDone ?? 0}</td>
                    <td className="r num">{s?.answered ? `${s.acc}%` : "—"}</td>
                    <td className="r num"><b>{(s?.points ?? 0).toLocaleString()}</b></td>
                    <td className="num">{s?.lastAt ? fmtDT(s.lastAt) : "—"}</td>
                    <td>{ll ? <>{fmtDT(ll.at)}<div className="sub">{ll.dev}</div></> : <span className="sub">Never</span>}</td>
                    <td className="acts-cell">
                      <button className="link" onClick={() => setEdit(p.uid)}>Edit</button>
                      <button className="link" onClick={() => lock(p)}>{p.locked ? "Unlock" : "Lock"}</button>
                      <button className="link" onClick={() => signOut(p)} disabled={p.locked}>Sign out</button>
                      <button className="link danger" onClick={() => del(p)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={9} className="fine">{players.length ? "No players match." : "No players yet. Import your staff list, or share the player link so people can register."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {edit && d.players[edit] && <EditPlayer p={d.players[edit]} onClose={() => setEdit(null)} />}
      {imp && <ImportPlayers onClose={() => setImp(false)} />}
    </>
  );
}

function EditPlayer({ p, onClose }: { p: Player; onClose: () => void }) {
  const { d, players, approve, api, tid, run } = useApp();
  const { labels } = useLiveTenant();
  const [empId, setEmp] = useState(p.empId);
  const [name, setName] = useState(p.name);
  const [email, setEmail] = useState(p.email || "");
  const [ut, setUt] = useState<UnitType>(p.unitType);
  const [unit, setUnit] = useState(p.unit);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const list = [...new Set([...(ut === "dept" ? d.cfg.departments : d.cfg.branches), ...(ut === p.unitType ? [p.unit] : [])].filter(Boolean))];
  const runs = Object.entries(p.runs || {}).sort((a, b) => (b[1].startedAt || 0) - (a[1].startedAt || 0));

  const reset = (key: string, title: string) =>
    approve({
      label: `Reset ${p.name}'s play of "${title}" so they can play it again. Their answers for it are deleted.`,
      yes: "Reset play",
      danger: true,
      run: () => api.adminResetRun(tid, p.uid, key),
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = normEmpId(empId), nm = cleanName(name), em = email.trim().toLowerCase();
    if (!validEmpId(id)) return setErr("ID: 3–12 letters or numbers.");
    if (!validName(nm)) return setErr("Name: letters only, 2–40 characters.");
    if (em && !EMAIL.test(em)) return setErr("That email doesn't look right.");
    if (players.some((x) => x.empId === id && x.uid !== p.uid)) return setErr("Another player already uses that ID.");
    if (em && players.some((x) => x.email === em && x.uid !== p.uid)) return setErr("Another player already uses that email.");
    if (!unit) return setErr(`Choose a ${labels.branch.toLowerCase()} or ${labels.dept.toLowerCase()}.`);
    const patch: Parameters<typeof api.adminPatchPlayer>[2] = {};
    if (id !== p.empId) patch.empId = id;
    if (nm !== p.name) patch.name = nm;
    if (em !== (p.email || "")) patch.email = em;
    if (ut !== p.unitType) patch.unitType = ut;
    if (unit !== p.unit) patch.unit = unit;
    if (!Object.keys(patch).length) return onClose();
    setBusy(true);
    const ok = await run(() => api.adminPatchPlayer(tid, p.uid, patch).then(() => true), "Player updated");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal label={`Edit ${p.name}`} onClose={onClose} wide>
      <form onSubmit={submit} autoComplete="off" className="stack">
        <h3>Edit player</h3>
        <div className="row2">
          <div className="field">
            <label htmlFor="uName">Name</label>
            <input className="inp" id="uName" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="uId">Employee ID</label>
            <input className="inp num" id="uId" value={empId} maxLength={12} onChange={(e) => setEmp(normEmpId(e.target.value))} style={{ fontWeight: 800 }} />
          </div>
          <div className="field">
            <label htmlFor="uEmail">Email (for email-code sign-in)</label>
            <input className="inp" id="uEmail" type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div className="field">
          <span className="flabel">Works in</span>
          <Seg value={ut} options={[["branch", labels.branch], ["dept", labels.dept]]} onChange={(v) => { setUt(v); setUnit(""); }} className="narrow" label="Unit type" />
          <select className="inp" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={unitWord(labels, ut)}>
            <option value="">Select…</option>
            {list.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <p className="fine">Plays stay with the player card when you change the ID or email.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row end">
          <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary small" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
        <div className="field">
          <span className="flabel">Plays ({runs.length})</span>
          {runs.length ? (
            <div className="scroll-x">
              <table className="tbl">
                <thead><tr><th>Quiz</th><th>Status</th><th className="r">Right</th><th>When</th><th /></tr></thead>
                <tbody>
                  {runs.map(([k, r]) => {
                    const title = d.games[r.gid]?.title || "Deleted quiz";
                    return (
                      <tr key={k}>
                        <td>{title}{(r.attempt || 1) > 1 && <span className="sub"> · attempt {r.attempt}</span>}</td>
                        <td>{r.status === "done" ? (typeof r.passed === "boolean" ? (r.passed ? "Passed" : "Failed") : "Done") : "Playing"}</td>
                        <td className="r num">{r.ans.filter((a) => a.ok).length}/{r.total}</td>
                        <td className="num">{fmtDT(r.finishedAt || r.startedAt)}</td>
                        <td><button type="button" className="link danger" onClick={() => reset(k, title)}>Reset</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="fine">No plays yet.</p>
          )}
        </div>
        {p.logins?.length ? (
          <div className="field">
            <span className="flabel">Recent sign-ins</span>
            <div className="fine">{p.logins.slice().sort((a, b) => b.at - a.at).slice(0, 5).map((l, i) => <div key={i}>{new Date(l.at).toLocaleString()} · {l.dev}</div>)}</div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

/* ---------------- import ---------------- */
/** Minimal CSV/TSV parser: quotes, commas, semicolons or tabs. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const delim = first.includes("\t") ? "\t" : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  });
}

function unitTypeOf(s: string, l: Labels): UnitType | null {
  const v = s.trim().toLowerCase();
  if (!v) return null;
  if (["dept", "department", "departments", l.dept.toLowerCase(), l.depts.toLowerCase()].includes(v)) return "dept";
  if (["branch", "branches", l.branch.toLowerCase(), l.branches.toLowerCase()].includes(v)) return "branch";
  return null;
}

interface Parsed { row: RegisterInput; problem: string | null; line: number }

function ImportPlayers({ onClose }: { onClose: () => void }) {
  const { api, tid, players, run, d } = useApp();
  const { labels } = useLiveTenant();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);

  const parsed: Parsed[] = useMemo(() => {
    const t = parseTable(text);
    if (t.length && /emp|id/i.test(t[0][0] || "") && /name/i.test(t[0][1] || "")) t.shift(); // header row
    const seen = new Set(players.map((p) => p.empId));
    const known = new Set([...d.cfg.branches.map((b) => `branch|${b.toLowerCase()}`), ...d.cfg.departments.map((x) => `dept|${x.toLowerCase()}`)]);
    return t.map((c, i) => {
      const empId = normEmpId(c[0] || "");
      const name = cleanName(c[1] || "");
      const ut = unitTypeOf(c[2] || "", labels);
      const unit = (c[3] || "").trim().slice(0, 60);
      const email = (c[4] || "").trim().toLowerCase();
      let problem: string | null = null;
      if (!validEmpId(empId)) problem = "ID must be 3–12 letters or numbers";
      else if (seen.has(empId)) problem = "ID already registered";
      else if (!validName(name)) problem = "Name missing or has odd characters";
      else if (!ut) problem = `Type must be ${labels.branch} or ${labels.dept}`;
      else if (!unit) problem = "Unit missing";
      else if (email && !EMAIL.test(email)) problem = "Email looks wrong";
      if (!problem) seen.add(empId);
      const warn = !problem && ut && !known.has(`${ut}|${unit.toLowerCase()}`) ? `new ${unitWord(labels, ut).toLowerCase()}` : null;
      return { row: { empId, name, unitType: ut || "branch", unit, look: 0, email: email || undefined }, problem: problem || null, line: i + 1, warn } as Parsed & { warn: string | null };
    });
  }, [text, players, labels, d.cfg.branches, d.cfg.departments]);
  const good = parsed.filter((x) => !x.problem);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return run(async () => { throw new Error("That file is over 2 MB. Split it up."); });
    f.text().then(setText);
  };
  const go = async () => {
    setBusy(true);
    const r = await run(() => api.adminImportPlayers(tid, good.map((x) => x.row)));
    setBusy(false);
    if (r) setDone(r);
  };

  return (
    <Modal label="Import players" onClose={onClose} wide>
      <div className="stack">
        <h3>Import players</h3>
        {done ? (
          <>
            <p><b>{done.added}</b> player{done.added === 1 ? "" : "s"} added{done.skipped ? <>, <b>{done.skipped}</b> skipped (already registered or invalid)</> : ""}.</p>
            <p className="fine">Imported players sign in with their Employee ID{d.cfg.signIn.emailOtp ? " or a code sent to their email" : ""}.</p>
            <div className="row end"><button className="btn primary small" onClick={onClose}>Done</button></div>
          </>
        ) : (
          <>
            <p className="fine">Paste from Excel or upload a CSV. One player per row, columns in this order (a header row is fine):</p>
            <code className="box">{`EmpId, Name, Type (${labels.branch} or ${labels.dept}), ${labels.branch} / ${labels.dept} name, Email (optional)\nE1024, Nadia Perera, ${labels.branch}, ${d.cfg.branches[0] || "Head Office"}, nadia@example.com`}</code>
            <div className="row">
              <label className="btn ghost small">
                Upload CSV
                <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <span className="fine">or paste below</span>
            </div>
            <textarea className="inp" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste rows here" aria-label="Players to import" />
            {parsed.length > 0 && (
              <>
                <p className="fine"><b>{good.length}</b> ready · <b>{parsed.length - good.length}</b> with problems (skipped)</p>
                <div className="scroll-x" style={{ maxHeight: 260, overflowY: "auto" }}>
                  <table className="tbl">
                    <thead><tr><th>#</th><th>ID</th><th>Name</th><th>Type</th><th>Unit</th><th>Email</th><th>Check</th></tr></thead>
                    <tbody>
                      {parsed.slice(0, 200).map((x) => (
                        <tr key={x.line} className={x.problem ? "nodata" : ""}>
                          <td className="num">{x.line}</td>
                          <td className="num">{x.row.empId}</td>
                          <td>{x.row.name}</td>
                          <td>{unitWord(labels, x.row.unitType)}</td>
                          <td>{x.row.unit}</td>
                          <td>{x.row.email || ""}</td>
                          <td>{x.problem ? <span className="sev alert">{x.problem}</span> : (x as Parsed & { warn: string | null }).warn ? <span className="sev warn">{(x as Parsed & { warn: string | null }).warn}</span> : <span className="sev good">OK</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="row end">
              <button className="btn ghost small" onClick={onClose}>Cancel</button>
              <button className="btn primary small" disabled={!good.length || busy} onClick={go}>{busy ? "Importing…" : `Import ${good.length} player${good.length === 1 ? "" : "s"}`}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
