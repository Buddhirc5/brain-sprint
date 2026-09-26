import { useEffect, useState } from "react";
import { ApiError, type LookupCard } from "../api/Api";
import { errMsg } from "../app/ApiCtx";
import { deviceLabel, useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { EmailCode } from "../components/auth";
import { levelTitle } from "../lib/scoring";
import { normEmpId, validEmpId } from "../lib/security";
import { firstName, TopBar, unitLabel } from "./common";

/* Sign in with Employee ID + "Is this you?" (no password or PIN).
   Safeguards (enforced by the server): wrong IDs are rate-limited, only first name + last
   initial are shown on the check card, one device at a time, admins can lock a card. */
export function Login() {
  const { api, tid, go, setMe, toast, labels, pub } = useApp();
  const [id, setId] = useState("");
  const [err, setErr] = useState("");
  const [found, setFound] = useState<LookupCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= now) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [until, now]);
  const wait = Math.max(0, until - now);

  const onErr = (e: unknown) => {
    if (e instanceof ApiError && e.code === "rate_limited") {
      const w = e.wait ?? 60_000;
      setUntil(Date.now() + w);
      setNow(Date.now());
      setErr("");
    } else setErr(errMsg(e));
  };

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wait || busy) return;
    setErr("");
    const emp = normEmpId(id);
    if (!validEmpId(emp)) return setErr("Enter your Employee ID (3–12 letters or numbers).");
    setBusy(true);
    try {
      if (!api.user()) await api.signInAnonymous();
      const card = await api.playerLookup(tid, emp);
      if (!card) setErr("We couldn't find that Employee ID. New here? Create your player card instead.");
      else setFound(card);
    } catch (e2) {
      onErr(e2);
    } finally {
      setBusy(false);
    }
  };

  const yes = async () => {
    if (!found || busy) return;
    setBusy(true);
    try {
      if (!api.user()) await api.signInAnonymous();
      const p = await api.playerClaim(tid, normEmpId(id), deviceLabel());
      setMe(p);
      toast(`Welcome back, ${firstName(p.name)}!`);
      go({ v: "lobby" });
    } catch (e2) {
      setFound(null);
      onErr(e2);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="phone">
      <TopBar title="Sign in" back={() => (found ? setFound(null) : go({ v: "welcome" }))} />
      {!found ? (
        <form className="card stack" onSubmit={find} autoComplete="off" noValidate>
          <h2 className="login-h">Welcome back</h2>
          <p className="fine">Enter your Employee ID. No password needed — we'll show your player card so you can check it's you.</p>
          <div className="field">
            <label htmlFor="loginId">Employee ID</label>
            <input className="inp num big-id" id="loginId" value={id} maxLength={12} autoFocus inputMode="text" placeholder="e.g. 10423" onChange={(e) => setId(normEmpId(e.target.value))} />
          </div>
          {(err || wait > 0) && (
            <p className="err" role="alert">
              {wait > 0 ? `Too many tries. Try again in ${fmtWait(wait)}.` : err}
            </p>
          )}
          <button className="btn primary block" disabled={!id || wait > 0 || busy}>
            {busy ? "Looking…" : "Find my card"}
          </button>
          <button type="button" className="link" style={{ justifySelf: "center" }} onClick={() => go({ v: "setup" })}>
            New here? Create a player card
          </button>
          {pub.signIn.emailOtp && (
            <button type="button" className="link" style={{ justifySelf: "center" }} onClick={() => go({ v: "email" })}>
              Use my work email instead
            </button>
          )}
        </form>
      ) : (
        <section className="confirm-card" aria-live="polite">
          <span className="label" style={{ color: "var(--ink)" }}>
            Is this you?
          </span>
          <Chibi look={found.look} variant="full" size={140} mood="happy" />
          <h2>
            {found.first} {found.lastInitial}
          </h2>
          <p className="who-line">
            {found.unit} <span className="fine">({unitLabel(labels, found.unitType)})</span> · Level {found.level} {levelTitle(found.level)}
          </p>
          <button type="button" className="btn primary block" onClick={yes} disabled={busy}>
            {busy ? "Signing in…" : "Yes, that's me"}
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setFound(null);
              setId("");
            }}
          >
            No, that's not me
          </button>
          <p className="fine">Only sign in to your own card — plays are checked, and your admin can see which devices use each card. Signing in here signs you out of any other device.</p>
        </section>
      )}
    </div>
  );
}

const fmtWait = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s >= 90 ? `${Math.ceil(s / 60)} min` : `${s}s`;
};

/** Work email + 6-digit code, then link to the player card with that email (or create one). */
export function EmailLogin() {
  const { api, tid, go, setMe, toast, pub } = useApp();
  const done = async () => {
    const p = await api.playerLinkEmail(tid, deviceLabel());
    if (p) {
      setMe(p);
      toast(`Welcome back, ${firstName(p.name)}!`);
      go({ v: "lobby" });
    } else {
      toast("Email confirmed — now create your player card.");
      go({ v: "setup" });
    }
  };
  return (
    <div className="phone">
      <TopBar title="Sign in" back={() => go({ v: "welcome" })} />
      <EmailCode onDone={done} intro={`We'll email you a 6-digit code to sign in to ${pub.branding.productName}. No password needed.`} />
      {pub.signIn.empId && (
        <button type="button" className="link" style={{ justifySelf: "center" }} onClick={() => go({ v: "login" })}>
          Use my Employee ID instead
        </button>
      )}
    </div>
  );
}
