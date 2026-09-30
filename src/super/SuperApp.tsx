/* =====================================================================
   Super admin console (#/super). Three checks in a row:
   1. signed in with email + password,
   2. that email is on the super admin list (checked by the backend),
   3. verified with an authenticator app in this session (checked by the
      backend on every super admin action).
   The console signs out after 15 minutes without activity.
   ===================================================================== */
import "../styles/admin.css";
import { Logo, LogoMark, PixelWord } from "../components/Logo";
import { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/super.css";
import { ApiError } from "../api/Api";
import { useApi, errMsg } from "../app/ApiCtx";
import { absUrl, nav } from "../app/router";
import { applyBranding } from "../app/theme";
import { AdminSignIn, MfaGate, NewPasswordGate, PasswordForm, SandboxSignInNote } from "../components/auth";
import { Icon, Modal } from "../components/ui";
import { Mascot } from "../components/Chibi";
import { Loading } from "../App";
import { onIdle } from "../lib/security";
import { isDemo } from "../api/demo/guard";
import { DEMO_PASSWORD, DEMO_SUPER } from "../pages/demoHints";
import { SI, SuperProvider, type TenantRow } from "./shared";
import { Companies, CompanyDetail } from "./Companies";
import { NewCompany } from "./NewCompany";
import { Library } from "./Library";
import { Audit, Usage } from "./Audit";

type Status = { isSuperUser: boolean };
const IDLE_MS = 15 * 60_000;

export function SuperApp({ tab }: { tab?: string }) {
  const { api, user } = useApi();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    applyBranding(undefined);
  }, []);

  const recheck = useCallback(() => {
    if (!user || user.anonymous) return setSt(null);
    api.superStatus().then(
      (s) => {
        setSt(s);
        setErr("");
      },
      (e) => setErr(errMsg(e)),
    );
  }, [api, user]);
  useEffect(recheck, [recheck]);
  // super admins always verify with an authenticator app (set up on first sign-in)
  const [mfa, setMfa] = useState<{ enrolled: boolean; verified: boolean } | null>(null);
  useEffect(() => {
    if (!user || user.anonymous) return setMfa(null);
    api.mfaState().then(setMfa, (e) => setErr(errMsg(e)));
  }, [api, user]);
  // opened a "reset your password" email: choose a new password after the authenticator
  const [mustChange, setMustChange] = useState<boolean | null>(null);
  const checkPw = useCallback(() => {
    if (!user || user.anonymous) return setMustChange(null);
    api.passwordStatus().then((p) => setMustChange(p.mustChange), () => setMustChange(false));
  }, [api, user]);
  useEffect(checkPw, [checkPw]);

  if (!user || user.anonymous)
    return (
      <div className="su-gate">
        <GateHead />
        <SandboxSignInNote back="#/super" />
        <AdminSignIn method="password" passwordOnly title="Super admin" redirectTo={absUrl({ r: "super" })} note="Only for the people who run this Ant Arena service. Company admins sign in on their own company's page." />
        {isDemo(api) && (
          <p className="banner blue">
            Demo: sign in as <b>{DEMO_SUPER}</b> with password <b>{DEMO_PASSWORD}</b>, then enter the authenticator code shown.
          </p>
        )}
        <a className="link su-center" href="#/">Back to home</a>
      </div>
    );
  if (err)
    return (
      <div className="su-gate">
        <GateHead />
        <div className="card stack">
          <h2>Can't check your access</h2>
          <p className="fine">{err}</p>
          <button className="btn primary" onClick={recheck}>Try again</button>
        </div>
      </div>
    );
  if (!st) return <Loading text="Checking access…" />;
  if (!st.isSuperUser)
    return (
      <div className="su-gate">
        <GateHead />
        <div className="card stack su-center-text">
          <Mascot mood="sad" size={96} className="su-center" />
          <h2>This account isn't a super admin</h2>
          <p className="fine">
            <b>{user.email}</b> can't open the super admin console. If you run a company's quizzes, use your company's admin page instead.
          </p>
          <button className="btn primary" onClick={() => void api.signOut()}>Sign out</button>
          <a className="link" href="#/">Back to home</a>
        </div>
      </div>
    );
  if (!mfa) return <Loading text="Checking access…" />;
  if (!mfa.verified)
    return (
      <div className="su-gate">
        <GateHead />
        <MfaGate enrolled={mfa.enrolled} onDone={() => api.mfaState().then(setMfa, (e) => setErr(errMsg(e)))} />
        <button className="link su-center" onClick={() => void api.signOut()}>Sign out</button>
      </div>
    );
  if (mustChange === null) return <Loading text="Checking access…" />;
  if (mustChange)
    return (
      <div className="su-gate">
        <GateHead />
        <NewPasswordGate onDone={checkPw} />
      </div>
    );
  return <Console tab={tab} recheck={recheck} />;
}

function GateHead() {
  return (
    <div className="su-gate-head">
      <Logo size={60} tagline={false} />
      <div className="fine">Super admin console</div>
    </div>
  );
}

/* ---------------- the console ---------------- */
const TABS: [string, string, () => JSX.Element][] = [
  ["companies", "Companies", SI.building],
  ["new", "New company", SI.plus],
  ["library", "Starter library", SI.book],
  ["usage", "Usage", SI.chart],
  ["audit", "Audit", SI.list],
];

function Console({ tab, recheck }: { tab?: string; recheck: () => void }) {
  const { api, user, toast } = useApi();
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  const reload = useCallback(async () => {
    try {
      setTenants(await api.superTenants());
    } catch (e) {
      if (e instanceof ApiError && e.code === "forbidden") recheck();
      else toast(errMsg(e));
    }
  }, [api, recheck, toast]);
  useEffect(() => {
    void reload();
  }, [reload]);

  // sign out after 15 minutes idle: coming back needs the password and the authenticator again
  useEffect(
    () =>
      onIdle(IDLE_MS, () => {
        void api.signOut().then(() => toast("Signed out after 15 minutes without activity"));
      }),
    [api, toast],
  );

  const cur = tab || "companies";
  const detailId = cur.startsWith("co-") ? cur.slice(3) : null;
  const navKey = detailId ? "companies" : cur;
  const ctx = useMemo(() => ({ tenants, reload, recheck, go: (t: string) => nav({ r: "super", tab: t }) }), [tenants, reload, recheck]);

  let body: JSX.Element;
  if (detailId) body = <CompanyDetail id={detailId} />;
  else if (cur === "new") body = <NewCompany />;
  else if (cur === "library") body = <Library />;
  else if (cur === "usage") body = <Usage />;
  else if (cur === "audit") body = <Audit />;
  else body = <Companies />;

  return (
    <SuperProvider value={ctx}>
      <div className="adm su">
        <nav className="adm-nav su-nav" aria-label="Super admin">
          <a className="adm-brand su-brand" href="#/super">
            <LogoMark size={38} />
            <PixelWord height={15} className="su-pixel" />
            <span className="su-badge">Super</span>
          </a>
          <div className="adm-tabs su-tabs" role="tablist">
            {TABS.map(([k, l, Ic]) => (
              <button key={k} role="tab" aria-selected={navKey === k} className={navKey === k ? "on" : ""} onClick={() => ctx.go(k)}>
                <Ic />
                <span>{l}</span>
              </button>
            ))}
          </div>
          <div className="su-sess">
            <span className="sess" title="Signed in with password and authenticator app">
              <span className="dot" /> <Icon.lock /> <span className="lbl">Authenticator verified</span>
            </span>
            <button className="icon-btn" aria-label="Change my password" title="Change my password" onClick={() => setChangingPw(true)}>
              <SI.key />
            </button>
            <button className="icon-btn" aria-label={`Sign out ${user?.email || ""}`} title={`Sign out ${user?.email || ""}`} onClick={() => void api.signOut()}>
              <Icon.logout />
            </button>
          </div>
        </nav>
        {body}
        {changingPw && (
          <Modal label="Change my password" onClose={() => setChangingPw(false)}>
            <h3>Change my password</h3>
            <p className="fine">For <b>{user?.email}</b>. Your authenticator app stays the same.</p>
            <PasswordForm mode="change" onDone={() => setChangingPw(false)} onCancel={() => setChangingPw(false)} />
          </Modal>
        )}
        <p className="fine su-foot">
          Signed in as <b>{user?.email}</b> · signs out after 15 minutes idle · every action here is logged in <a className="link" href="#/super/audit">Audit</a>
        </p>
      </div>
    </SuperProvider>
  );
}
