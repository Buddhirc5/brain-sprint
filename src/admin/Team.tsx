import { useState } from "react";
import { useApp } from "../app/ctx";
import { useApi } from "../app/ApiCtx";
import { absUrl } from "../app/router";
import type { AdminMember, Role } from "../types";
import { ROLE_INFO, ROLES, useLiveTenant } from "./common";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function Team() {
  const { d, api, tid, approve, run, role, pub, slug } = useApp();
  const { user } = useApi();
  const { branding } = useLiveTenant();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("editor");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; role: Role } | null>(null);
  const me = user?.email?.toLowerCase() || "";
  const owner = role === "owner";
  const link = absUrl({ r: "admin", slug });
  const list = d.admins.slice().sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role) || a.email.localeCompare(b.email));
  const owners = d.admins.filter((m) => m.role === "owner").length;
  const assignable = ROLES.filter((r) => r !== "owner" || owner);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) return setErr("Enter a valid email address.");
    if (d.admins.some((m) => m.email === em)) return setErr("That email is already on the team.");
    setBusy(true);
    const ok = await run(() => api.inviteAdmin(tid, em, newRole).then(() => true));
    setBusy(false);
    if (ok) {
      setSent({ email: em, role: newRole });
      setEmail("");
    }
  };
  const change = (m: AdminMember, r: Role) =>
    approve({
      label: `Change ${m.email} from ${ROLE_INFO[m.role].label} to ${ROLE_INFO[r].label}. They can ${ROLE_INFO[r].text.toLowerCase()}.`,
      yes: "Change role",
      run: () => api.setAdminRole(tid, m.email, r),
    });
  const remove = (m: AdminMember) =>
    approve({
      label: `Remove ${m.email} from ${pub.name}'s admins. They lose access to this portal straight away.`,
      yes: "Remove admin",
      danger: true,
      run: () => api.removeAdmin(tid, m.email),
    });
  const message = sent ? `You've been added as ${ROLE_INFO[sent.role].label} for ${branding.productName} (${pub.name}).\nOpen ${link} and sign in with ${sent.email}.` : "";
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => run(async () => undefined, "Copied"), () => undefined);

  return (
    <>
      <div className="toolbar">
        <h1>Admins</h1>
      </div>
      <div className="grid2">
        <section className="panel">
          <div className="panel-h"><div><h2>Invite an admin</h2><p>They sign in to the admin portal with this email. No email is sent — share the link yourself.</p></div></div>
          <form className="stack" onSubmit={invite} autoComplete="off">
            <div className="row2">
              <div className="field">
                <label htmlFor="invEmail">Email</label>
                <input className="inp" id="invEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" maxLength={120} />
              </div>
              <div className="field">
                <label htmlFor="invRole">Role</label>
                <select className="inp" id="invRole" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                  {assignable.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label} — {ROLE_INFO[r].text}</option>)}
                </select>
              </div>
            </div>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary small" style={{ justifySelf: "start" }} disabled={busy || !email.trim()}>{busy ? "Adding…" : "Add admin"}</button>
          </form>
          {sent && (
            <div className="invite-box" role="status">
              <b>{sent.email} can now sign in as {ROLE_INFO[sent.role].label}.</b>
              <span className="fine">Send them this message (email, chat…):</span>
              <code className="box">{message}</code>
              <div className="row">
                <button className="btn lime small" onClick={() => copy(message)}>Copy message</button>
                <button className="btn ghost small" onClick={() => copy(link)}>Copy link only</button>
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-h"><div><h2>What each role can do</h2><p>Each role includes everything in the roles above it.</p></div></div>
          <table className="tbl">
            <thead><tr><th>Role</th><th>Can</th></tr></thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r}><td><span className={`role-tag ${r}`}>{ROLE_INFO[r].label}</span></td><td style={{ whiteSpace: "normal" }}>{ROLE_INFO[r].text}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="fine">Only owners can add, change or remove owners. A company always keeps at least one owner.</p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-h"><div><h2>Team ({list.length})</h2><p>Everyone with access to this admin portal</p></div></div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Authenticator app</th><th /></tr></thead>
            <tbody>
              {list.map((m) => {
                const self = m.email === me;
                const lockedOwner = m.role === "owner" && (!owner || owners < 2);
                const canEdit = !self && (m.role !== "owner" || owner);
                return (
                  <tr key={m.email}>
                    <td><b>{m.email}</b> {self && <span className="chip">you</span>}</td>
                    <td>
                      {canEdit && !lockedOwner ? (
                        <select className="sel" value={m.role} aria-label={`Role for ${m.email}`} onChange={(e) => change(m, e.target.value as Role)}>
                          {assignable.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                        </select>
                      ) : (
                        <span className={`role-tag ${m.role}`}>{ROLE_INFO[m.role].label}</span>
                      )}
                    </td>
                    <td>{m.joinedAt || m.userId ? <>Joined <span className="sub">{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : ""}</span></> : <><span className="sev warn">Invited</span> <span className="sub">{new Date(m.invitedAt).toLocaleDateString()}</span></>}</td>
                    <td>{m.mfa === true ? <span className="sev good">On</span> : m.mfa === false ? <span className="sev warn">Off</span> : <span className="sub">{m.joinedAt || m.userId ? "Unknown" : "—"}</span>}</td>
                    <td>{canEdit && !lockedOwner && <button className="link danger" onClick={() => remove(m)}>Remove</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {d.cfg.signIn.adminMfa ? <p className="fine">An authenticator app is required for every admin (Settings → Admin sign-in).</p> : <p className="fine">Tip: require an authenticator app for every admin in Settings → Admin sign-in.</p>}
      </section>
    </>
  );
}
