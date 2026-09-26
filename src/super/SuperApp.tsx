/* =====================================================================
   Super admin console (#/super). Three locks in a row:
   1. signed in with email + password,
   2. that email is on the super admin list (checked by the backend),
   3. the super admin code has been entered in the last 30 minutes.
   The console auto-locks after 15 minutes without activity.
   ===================================================================== */
import "../styles/admin.css";
import { Logo, LogoMark, PixelWord } from "../components/Logo";
import { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/super.css";
import { ApiError } from "../api/Api";
import { useApi, errMsg } from "../app/ApiCtx";
import { absUrl, nav } from "../app/router";
import { applyBranding } from "../app/theme";
import { AdminSignIn } from "../components/auth";
import { Icon, Modal } from "../components/ui";
import { Sprinty } from "../components/Chibi";
import { Loading } from "../App";
import { onIdle, codeProblems } from "../lib/security";
import { fmtClock } from "../lib/util";
import { isDemo } from "../api/demo/guard";
import { DEMO_PASSWORD, DEMO_SUPER } from "../pages/demoHints";
import { SI, SuperProvider, type TenantRow } from "./shared";
import { Companies, CompanyDetail } from "./Companies";
import { NewCompany } from "./NewCompany";
import { Library } from "./Library";
import { Audit, Usage } from "./Audit";

type Status = { isSuperUser: boolean; unlockedUntil: number; codeIsDefault: boolean };
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

  if (!user || user.anonymous)
    return (
      <div className="su-gate">
        <GateHead />
        <AdminSignIn method="password" title="Super admin" redirectTo={absUrl({ r: "super" })} note="Only for the people who run this Brain Sprint service. Company admins sign in on their own company's page." />
        {isDemo(api) && (
          <p className="banner blue">
            Demo: sign in as <b>{DEMO_SUPER}</b> with password <b>{DEMO_PASSWORD}</b>, then enter the code <b>Sandeepa</b>.
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
          <Sprinty mood="sad" size={96} className="su-center" />
          <h2>This account isn't a super admin</h2>
          <p className="fine">
            <b>{user.email}</b> can't open the super admin console. If you run a company's quizzes, use your company's admin page instead.
          </p>
          <button className="btn primary" onClick={() => void api.signOut()}>Sign out</button>
          <a className="link" href="#/">Back to home</a>
        </div>
      </div>
    );
  if (st.unlockedUntil <= Date.now()) return <CodeScreen email={user.email || ""} onDone={recheck} />;
  return <Console tab={tab} st={st} recheck={recheck} />;
}

function GateHead() {
  return (
    <div className="su-gate-head">
      <Logo size={60} tagline={false} />
      <div className="fine">Super admin console</div>
    </div>
  );
}

/* ---------------- step 3: the super admin code ---------------- */
function CodeScreen({ email, onDone }: { email: string; onDone: () => void }) {
  const { api } = useApi();
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [waitUntil, setWaitUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => {
      tick((x) => x + 1);
      if (Date.now() >= waitUntil) {
        setWaitUntil(0);
        setMsg("");
      }
    }, 500);
    return () => clearInterval(t);
  }, [waitUntil]);
  const left = Math.max(0, waitUntil - Date.now());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || left) return;
    setBusy(true);
    setMsg("");
    try {
      await api.superUnlock(code);
      setCode("");
      onDone();
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === "rate_limited" && e2.wait && e2.wait > 0) setWaitUntil(Date.now() + e2.wait);
      setMsg(errMsg(e2));
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="su-gate">
      <GateHead />
      <form className="card stack auth-card su-code" onSubmit={submit} noValidate>
        <span className="lock-badge">
          <SI.key />
        </span>
        <h2 style={{ fontSize: 24, fontWeight: 900 }}>Enter your super admin code</h2>
        <p className="fine">
          Signed in as <b>{email}</b>. The code unlocks the console for 30 minutes on this device.
        </p>
        <div className="field">
          <label htmlFor="su-code">Super admin code</label>
          <div className="su-pw">
            <input
              className="inp"
              id="su-code"
              type={show ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={code}
              disabled={!!left}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <button type="button" className="su-eye" aria-label={show ? "Hide code" : "Show code"} aria-pressed={show} onClick={() => setShow(!show)}>
              <Icon.eye />
            </button>
          </div>
        </div>
        {left > 0 ? (
          <p className="banner red" role="alert">
            <b>Too many wrong codes.</b> Try again in <b className="num">{fmtClock(left)}</b>.
          </p>
        ) : (
          msg && <p className="err" role="alert">{msg}</p>
        )}
        <button className="btn primary block" disabled={busy || !code || left > 0}>
          {busy ? "Checking…" : "Unlock console"}
        </button>
        <p className="fine su-center-text">5 wrong codes lock this account for 1 minute, doubling up to 15 minutes. Every try is logged.</p>
        <button type="button" className="link su-center" onClick={() => void api.signOut()}>Sign out</button>
      </form>
    </div>
  );
}

/* ---------------- change the code ---------------- */
export function ChangeCodeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { api, toast } = useApi();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const checks: [boolean, string][] = [
    [b.length >= 8, "8 or more characters"],
    [/[A-Za-z]/.test(b) && /\d/.test(b), "Letters and numbers"],
    [!!b && b.toLowerCase() !== "sandeepa", "Not the starting code"],
    [!!b && !!a && b !== a, "Different from the current code"],
    [!!b && b === c, "Both new codes match"],
  ];
  const weak = b ? codeProblems(b) : null;
  const ok = checks.every((x) => x[0]) && !weak && !!a;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      await api.superChangeCode(a, b);
      toast("Super admin code changed");
      onDone();
      onClose();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal label="Change super admin code" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <h3>Change super admin code</h3>
        <p className="fine">Anyone with a super admin login also needs this code. Keep it somewhere safe — it can't be recovered, only changed.</p>
        <div className="field">
          <label htmlFor="cc-old">Current code</label>
          <input className="inp" id="cc-old" type="password" autoComplete="off" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cc-new">New code</label>
          <input className="inp" id="cc-new" type="password" autoComplete="off" value={b} onChange={(e) => setB(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cc-conf">Type the new code again</label>
          <input className="inp" id="cc-conf" type="password" autoComplete="off" value={c} onChange={(e) => setC(e.target.value)} />
        </div>
        <ul className="su-checks" aria-label="Code rules">
          {checks.map(([pass, t]) => (
            <li key={t} className={pass ? "ok" : ""}>
              <span aria-hidden="true">{pass ? "✓" : "•"}</span> {t}
            </li>
          ))}
        </ul>
        {b && weak && checks[0][0] && checks[1][0] && <p className="err">{weak}</p>}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row end">
          <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
          <button className="btn primary small" disabled={!ok || busy}>{busy ? "Saving…" : "Change code"}</button>
        </div>
      </form>
    </Modal>
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

function Console({ tab, st, recheck }: { tab?: string; st: Status; recheck: () => void }) {
  const { api, user, toast } = useApi();
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [changing, setChanging] = useState(false);
  const [, tick] = useState(0);

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

  // countdown + lock when the unlock expires
  useEffect(() => {
    const t = setInterval(() => {
      tick((x) => x + 1);
      if (Date.now() >= st.unlockedUntil) recheck();
    }, 1000);
    return () => clearInterval(t);
  }, [st.unlockedUntil, recheck]);

  // auto-lock after 15 minutes idle
  useEffect(
    () =>
      onIdle(IDLE_MS, () => {
        void api.superLock().then(() => {
          toast("Locked after 15 minutes without activity");
          recheck();
        });
      }),
    [api, recheck, toast],
  );

  const lockNow = async () => {
    await api.superLock();
    toast("Console locked");
    recheck();
  };

  const cur = tab || "companies";
  const detailId = cur.startsWith("co-") ? cur.slice(3) : null;
  const navKey = detailId ? "companies" : cur;
  const ctx = useMemo(() => ({ tenants, reload, recheck, go: (t: string) => nav({ r: "super", tab: t }) }), [tenants, reload, recheck]);
  const left = Math.max(0, st.unlockedUntil - Date.now());

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
            <span className={`sess ${left < 5 * 60_000 ? "warn" : ""}`} title="Time until the console locks itself">
              <span className="dot" /> <span className="lbl">Unlocked · </span><b className="num">{fmtClock(left)}</b>
            </span>
            <button className="btn tiny su-lock" onClick={lockNow} aria-label="Lock now" title="Lock now">
              <Icon.lock /> <span className="lbl">Lock now</span>
            </button>
            <button className="icon-btn" aria-label="Change super admin code" title="Change super admin code" onClick={() => setChanging(true)}>
              <SI.key />
            </button>
            <button className="icon-btn" aria-label={`Sign out ${user?.email || ""}`} title={`Sign out ${user?.email || ""}`} onClick={() => void api.signOut()}>
              <Icon.logout />
            </button>
          </div>
        </nav>
        {st.codeIsDefault && (
          <div className="su-alert" role="alert">
            <span className="su-alert-ic"><SI.key /></span>
            <div>
              <b>You're still using the starting code — change it now.</b>
              <p>Anyone who knows the starting code and a super admin password could open this console.</p>
            </div>
            <button className="btn white small" onClick={() => setChanging(true)}>Change code</button>
          </div>
        )}
        {body}
        <p className="fine su-foot">
          Signed in as <b>{user?.email}</b> · auto-locks after 15 minutes idle · every action here is logged in <a className="link" href="#/super/audit">Audit</a>
        </p>
      </div>
      {changing && <ChangeCodeModal onClose={() => setChanging(false)} onDone={recheck} />}
    </SuperProvider>
  );
}
