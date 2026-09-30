/* Reusable sign-in pieces for admins, super admins and players. */
import { useEffect, useState } from "react";
import { useApi, errMsg } from "../app/ApiCtx";
import { isDemo } from "../api/demo/guard";
import { Icon } from "./ui";
import { HAS_LIVE_BACKEND, exitSandbox } from "../app/sandbox";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Demo only: shows the last "email" so testers can use codes and links without a mailbox. */
export function DemoOutbox() {
  const { api } = useApi();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 800);
    return () => clearInterval(t);
  }, []);
  if (!api.demoOutbox) return null;
  const m = api.demoOutbox();
  if (!m || Date.now() - m.at > 10 * 60_000) return null;
  return (
    <div className="banner blue demo-outbox" role="status">
      <b>Demo inbox</b> · to {m.to || "you"}: {m.body}
      {m.code && (
        <>
          {" "}
          <b className="num" style={{ fontSize: 18, letterSpacing: ".12em" }}>{m.code}</b>
        </>
      )}
      {m.link && (
        <>
          {" "}
          <a className="link" href={m.link}>
            Open the link
          </a>
        </>
      )}
    </div>
  );
}

type Method = "password" | "magic" | "both";

/** Email + password and/or magic link, with "first time? set a password". */
/** `passwordOnly`: no "set a password" or email reset links (accounts are created by the operator). */
export function AdminSignIn({ method, redirectTo, title = "Admin sign-in", note, passwordOnly }: { method: Method; redirectTo: string; title?: string; note?: string; passwordOnly?: boolean }) {
  const { api } = useApi();
  const [tab, setTab] = useState<"password" | "magic">(method === "magic" ? "magic" : "password");
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setSent("");
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) return setErr("Enter your work email.");
    setBusy(true);
    try {
      if (tab === "magic") {
        await api.sendMagicLink(em, redirectTo);
        setSent(`We emailed a sign-in link to ${em}. Open it on this device.`);
      } else if (mode === "reset") {
        await api.resetPassword(em, redirectTo);
        setSent(`If ${em} has an account, a reset link is on its way.`);
      } else if (mode === "up") {
        if (pw.length < 10) throw new Error("Use at least 10 characters.");
        const r = await api.signUpPassword(em, pw);
        if (r.needsConfirm) setSent(`Check ${em} to confirm your email, then sign in.`);
      } else {
        await api.signInPassword(em, pw);
      }
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack auth-card" onSubmit={submit} noValidate>
      <span className="lock-badge">
        <Icon.lock />
      </span>
      <h2 style={{ fontSize: 24, fontWeight: 900 }}>{mode === "up" ? "Create your admin password" : mode === "reset" ? "Reset your password" : title}</h2>
      {note && <p className="fine">{note}</p>}
      {method === "both" && mode === "in" && (
        <div className="seg" role="tablist">
          <button type="button" className={tab === "password" ? "on" : ""} onClick={() => setTab("password")}>Password</button>
          <button type="button" className={tab === "magic" ? "on" : ""} onClick={() => setTab("magic")}>Email link</button>
        </div>
      )}
      <div className="field">
        <label htmlFor="ad-email">Work email</label>
        <input className="inp" id="ad-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {tab === "password" && mode !== "reset" && (
        <div className="field">
          <label htmlFor="ad-pw">{mode === "up" ? "New password (10+ characters)" : "Password"}</label>
          <input className="inp" id="ad-pw" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      {sent && <p className="banner">{sent}</p>}
      <button className="btn primary block" disabled={busy}>
        {busy ? "Please wait…" : tab === "magic" ? "Email me a sign-in link" : mode === "up" ? "Create password" : mode === "reset" ? "Send reset link" : "Sign in"}
      </button>
      {tab === "password" && !passwordOnly && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          {mode === "in" ? (
            <>
              <button type="button" className="link" onClick={() => setMode("up")}>First time? Set a password</button>
              <button type="button" className="link" onClick={() => setMode("reset")}>Forgot password?</button>
            </>
          ) : (
            <button type="button" className="link" onClick={() => setMode("in")}>Back to sign in</button>
          )}
        </div>
      )}
      <DemoOutbox />
    </form>
  );
}

/** 6-digit email code (players, and anyone without a password). */
export function EmailCode({ onDone, intro }: { onDone: () => void | Promise<void>; intro?: string }) {
  const { api } = useApi();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!EMAIL.test(email.trim())) return setErr("Enter your work email.");
    setBusy(true);
    try {
      await api.sendEmailCode(email.trim().toLowerCase());
      setStep("code");
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.verifyEmailCode(email.trim().toLowerCase(), code.replace(/\D/g, ""));
      await onDone();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  return step === "email" ? (
    <form className="card stack" onSubmit={send} noValidate>
      <h2 className="login-h">Sign in with email</h2>
      <p className="fine">{intro || "We'll email you a 6-digit code. No password needed."}</p>
      <div className="field">
        <label htmlFor="pl-email">Work email</label>
        <input className="inp" id="pl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary block" disabled={busy || !email}>{busy ? "Sending…" : "Send my code"}</button>
      <DemoOutbox />
    </form>
  ) : (
    <form className="card stack" onSubmit={verify} noValidate>
      <h2 className="login-h">Check your email</h2>
      <p className="fine">Enter the 6-digit code we sent to <b>{email}</b>. It works for 10 minutes.</p>
      <div className="field">
        <label htmlFor="pl-code">Code</label>
        <input className="inp num big-id" id="pl-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
      <button type="button" className="link" style={{ justifySelf: "center" }} onClick={() => { setStep("email"); setCode(""); }}>Use a different email</button>
      <DemoOutbox />
    </form>
  );
}

/** Authenticator-app setup (first time) or check (every sign-in). */
export function MfaGate({ enrolled, onDone }: { enrolled: boolean; onDone: () => void }) {
  const { api } = useApi();
  const [f, setF] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  // lost authenticator: "ask" → email link sent → (link opened on this device) canReset
  const [lost, setLost] = useState<"no" | "ask" | "sent">("no");
  const [canReset, setCanReset] = useState(false);
  useEffect(() => {
    if (!enrolled) api.mfaEnroll().then(setF, (e) => setErr(errMsg(e)));
    else api.mfaState().then((st) => setCanReset(!!st.canReset), () => undefined);
  }, [api, enrolled]);
  useEffect(() => {
    if (!isDemo(api)) return;
    const t = setInterval(() => api.demoMfaCode().then(setDemoCode), 1000);
    return () => clearInterval(t);
  }, [api]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const st = await api.mfaState();
      await api.mfaVerify(f?.factorId || st.factorId || "", code);
      onDone();
    });
  };

  if (enrolled && canReset)
    return (
      <div className="card stack auth-card">
        <span className="lock-badge"><Icon.shield /></span>
        <h2 style={{ fontSize: 24, fontWeight: 900 }}>Replace your authenticator</h2>
        <p className="fine">You opened the reset link from your email. Remove the old authenticator, then scan a new QR code with your new phone or app. This is recorded in the audit log.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy} onClick={() => void run(async () => { await api.mfaReset(); onDone(); })}>
          {busy ? "Please wait…" : "Remove old authenticator and set up a new one"}
        </button>
        <button type="button" className="link" onClick={() => setCanReset(false)}>I found my authenticator — cancel</button>
      </div>
    );

  if (enrolled && lost !== "no")
    return (
      <div className="card stack auth-card">
        <span className="lock-badge"><Icon.shield /></span>
        <h2 style={{ fontSize: 24, fontWeight: 900 }}>Lost your authenticator?</h2>
        {lost === "ask" ? (
          <>
            <p className="fine">We'll email a one-time sign-in link to your account's address. Open it <b>on this device within 10 minutes</b> and you can remove the old authenticator and set up a new one.</p>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary block" disabled={busy} onClick={() => void run(async () => { await api.mfaResetSend(hereUrl()); setLost("sent"); })}>
              {busy ? "Sending…" : "Email me a reset link"}
            </button>
          </>
        ) : (
          <p className="banner">Check your inbox (and spam) for the link, then open it on this device. It works for 10 minutes.</p>
        )}
        <DemoOutbox />
        <button type="button" className="link" onClick={() => setLost("no")}>Back to the code</button>
      </div>
    );

  return (
    <form className="card stack auth-card" onSubmit={verify}>
      <span className="lock-badge">
        <Icon.shield />
      </span>
      <h2 style={{ fontSize: 24, fontWeight: 900 }}>{enrolled ? "Two-step check" : "Set up two-step sign-in"}</h2>
      {!enrolled && (
        <>
          <p className="fine">Scan this with Microsoft Authenticator, Google Authenticator or any authenticator app, then type the 6-digit code it shows.</p>
          {f ? (
            <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
              <img src={f.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: "#fff", borderRadius: 12, padding: 6 }} />
              <code className="box" style={{ fontSize: 12 }}>{f.secret}</code>
            </div>
          ) : (
            <p className="fine">Preparing…</p>
          )}
        </>
      )}
      {enrolled && <p className="fine">Open your authenticator app and enter the current 6-digit code.</p>}
      <div className="field">
        <label htmlFor="mfa-code">Authenticator code</label>
        <input className="inp num big-id" id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
      </div>
      {demoCode && <p className="banner blue">Demo: the current code is <b className="num">{demoCode}</b></p>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
      {enrolled && <button type="button" className="link" onClick={() => { setErr(""); setLost("ask"); }}>Lost your phone or authenticator app?</button>}
    </form>
  );
}

/**
 * On a live site, a browser that entered the demo keeps using the in-browser demo until it exits,
 * so real accounts get "Email or password is wrong" there. Say so, with a one-click way out.
 */
export function SandboxSignInNote({ back }: { back: string }) {
  const { api } = useApi();
  if (!HAS_LIVE_BACKEND || !isDemo(api)) return null;
  return (
    <p className="banner" role="note">
      <b>You're in the demo sandbox</b>, so only the demo accounts below work here. Signing in with your real account?{" "}
      <button type="button" className="link" onClick={() => exitSandbox(back)}>Exit the demo</button>
    </p>
  );
}

/** This page's address for email links (same site address the rest of the app uses). */
function hereUrl() {
  const raw = ((import.meta.env.VITE_APP_URL as string | undefined) || location.href.split("#")[0]).replace(/\/+$/, "");
  const base = location.protocol === "file:" ? raw : raw + "/";
  return base + location.hash.replace(/[?&]demo_token=[a-f0-9]+/, "");
}

/* ---------------- passwords ---------------- */
const pwRules = (pw: string, again: string, current?: string): [boolean, string][] => [
  [pw.length >= 10, "10 or more characters"],
  [/[A-Za-z]/.test(pw) && /\d/.test(pw), "Letters and numbers"],
  [!!pw && pw === again, "Both new passwords match"],
  ...(current !== undefined ? [[!!pw && pw !== current, "Different from your current password"] as [boolean, string]] : []),
];

/** Change your password ("change": asks for the current one) or choose a new one after a reset ("set"). */
export function PasswordForm({ mode, onDone, onCancel }: { mode: "change" | "set"; onDone: () => void; onCancel?: () => void }) {
  const { api, toast } = useApi();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const rules = pwRules(pw, again, mode === "change" ? cur : undefined);
  const ok = rules.every((r) => r[0]) && (mode === "set" || !!cur);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      if (mode === "change") await api.changeMyPassword(cur, pw);
      else await api.updatePassword(pw);
      toast("Password changed");
      onDone();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  const type = show ? "text" : "password";
  return (
    <form className="stack" onSubmit={submit} noValidate>
      {mode === "change" && (
        <div className="field">
          <label htmlFor="pw-cur">Current password</label>
          <input className="inp" id="pw-cur" type={type} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="pw-new">New password</label>
        <input className="inp" id="pw-new" type={type} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw-again">Type the new password again</label>
        <input className="inp" id="pw-again" type={type} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <span>Show passwords</span>
      </label>
      <ul className="pw-rules" aria-label="Password rules">
        {rules.map(([pass, t]) => (
          <li key={t} className={pass ? "ok" : ""}>
            <span aria-hidden="true">{pass ? "✓" : "•"}</span> {t}
          </li>
        ))}
      </ul>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row end">
        {onCancel && <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>}
        <button className="btn primary small" disabled={!ok || busy}>{busy ? "Saving…" : mode === "change" ? "Change password" : "Save new password"}</button>
      </div>
    </form>
  );
}

/** Shown after signing in with a temporary password, or from a "reset your password" email. */
export function NewPasswordGate({ onDone }: { onDone: () => void }) {
  const { api } = useApi();
  return (
    <div className="card stack auth-card">
      <span className="lock-badge">
        <Icon.lock />
      </span>
      <h2 style={{ fontSize: 24, fontWeight: 900 }}>Choose a new password</h2>
      <p className="fine">Your password was reset. Pick a new one that only you know — you'll use it from now on.</p>
      <PasswordForm mode="set" onDone={onDone} />
      <button type="button" className="link" style={{ justifySelf: "center" }} onClick={() => void api.signOut()}>Sign out</button>
    </div>
  );
}
