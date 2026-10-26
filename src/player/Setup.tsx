import { useEffect, useMemo, useRef, useState } from "react";
import { ReminderSwitch } from "./AppCard";
import { ApiError } from "../api/Api";
import { errMsg, useApi } from "../app/ApiCtx";
import { deviceLabel, useApp } from "../app/ctx";
import { absUrl } from "../app/router";
import { Chibi, LOOKS } from "../components/Chibi";
import { SPECIALS } from "../components/Specials";
import { Seg } from "../components/ui";
import { cleanName, normEmpId, validEmpId, validName } from "../lib/security";
import type { UnitType } from "../types";
import { unitTypes } from "../api/engine";
import { firstName, TopBar, unitLabel } from "./common";
import { cleanJoinKey, getJoinKey, joinIfNeeded, setJoinKey } from "../app/joinKey";

/** Splits a product name over two lines for the hero: "Harbor / Academy", "Brain / Sprint". */
function splitName(name: string): [string, string] {
  const w = name.trim().split(/\s+/);
  if (w.length < 2) return ["", w[0] || ""];
  return [w.slice(0, -1).join(" "), w[w.length - 1]];
}

export function Welcome() {
  const { go, pub, features, api, tid, setMe, toast, signOut } = useApp();
  const { user } = useApi();
  const b = pub.branding;
  const [top, bottom] = splitName(b.productName);
  const longest = Math.max(4, ...b.productName.split(/\s+/).map((x) => x.length));
  const size = `clamp(40px, ${Math.min(21, 150 / longest).toFixed(1)}vw, ${Math.round(Math.min(104, 640 / longest))}px)`;
  const si = pub.signIn;
  const [linking, setLinking] = useState(false);
  const tried = useRef("");
  const emailUser = user && !user.anonymous && user.email ? user : null;
  // private company: new players need the invite link (or its code) before they can sign in
  const [hasKey, setHasKey] = useState(() => !!getJoinKey(pub.slug));
  const [paste, setPaste] = useState("");
  const [keyErr, setKeyErr] = useState("");
  const [checking, setChecking] = useState(false);
  const locked = !!pub.joinKeyRequired && !hasKey && !emailUser;
  const useKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = cleanJoinKey(paste);
    if (key.length < 8) return setKeyErr("Paste the whole invite link, or the code at its end.");
    setChecking(true);
    setKeyErr("");
    try {
      if (!api.user()) await api.signInAnonymous();
      if (!(await api.joinCompany(tid, key))) return setKeyErr("That invite link isn't right. Check it with your company.");
      setJoinKey(pub.slug, key);
      setHasKey(true);
    } catch (e2) {
      setKeyErr(errMsg(e2));
    } finally {
      setChecking(false);
    }
  };

  // back from Microsoft (or signed in with email elsewhere): link to the player card with this email
  useEffect(() => {
    if (!emailUser || tried.current === emailUser.id) return;
    tried.current = emailUser.id;
    setLinking(true);
    api.playerLinkEmail(tid, deviceLabel()).then(
      (p) => {
        setLinking(false);
        if (p) {
          setMe(p);
          go({ v: "lobby" });
          toast(`Welcome back, ${firstName(p.name)}!`);
        }
      },
      () => setLinking(false),
    );
  }, [emailUser, api, tid, setMe, go, toast]);

  const microsoft = async () => {
    try {
      await api.signInMicrosoft(absUrl({ r: "tenant", slug: pub.slug }));
    } catch (e) {
      toast(errMsg(e));
    }
  };

  return (
    <div className="phone">
      <section className="hero">
        <div className="hero-brand">
          {b.logo && <img className="hero-logo" src={b.logo} alt="" />}
          <div className="tag">{pub.name}</div>
        </div>
        {features.sprint && (
          <span className="scribble" aria-hidden="true">
            1 min a day!
          </span>
        )}
        <h1 className="mega" style={{ fontSize: size }} aria-label={b.productName}>
          {top && (
            <>
              {top}
              <br />
            </>
          )}
          <span className="ink">{bottom}</span>
        </h1>
        <p className="hero-sub">{b.tagline || "Quick quizzes for your team. Learn something new, earn points and climb the board."}</p>
        <div className="lineup" aria-hidden="true">
          <Chibi look={3} variant="full" size={104} mood="happy" equipped={{ face: "shades" }} />
          <Chibi look={1} variant="full" size={124} mood="cheer" equipped={{ head: "phones", ears: "hearts" }} />
          <Chibi look={9} variant="full" size={104} mood="idle" equipped={{ head: "cap" }} />
        </div>
      </section>

      {emailUser && !linking && (
        <div className="banner blue stack" style={{ gap: 8 }}>
          <span>
            Signed in as <b>{emailUser.email}</b>, but there's no player card for this email yet.
          </span>
          <div className="row">
            <button type="button" className="btn primary small" onClick={() => go({ v: "setup" })}>
              Create my player card
            </button>
            <button type="button" className="link" onClick={() => signOut()}>
              Not you? Sign out
            </button>
          </div>
        </div>
      )}
      {linking && <p className="fine" style={{ textAlign: "center" }}>Finding your player card…</p>}

      {locked && (
        <form className="card stack invite-card" onSubmit={useKey} noValidate>
          <b style={{ fontSize: 18 }}>This is a private company space</b>
          <p className="fine">Open the invite link or scan the QR code your company shared with you. Or paste the link (or its code) here:</p>
          <input className="inp" aria-label="Invite link or code" placeholder="Paste invite link or code" value={paste} onChange={(e) => setPaste(e.target.value)} autoComplete="off" />
          {keyErr && <p className="err" role="alert">{keyErr}</p>}
          <button className="btn primary block" disabled={checking}>{checking ? "Checking…" : "Continue"}</button>
        </form>
      )}
      {!locked && si.empId && (
        <>
          <button type="button" className="btn primary block" onClick={() => go({ v: "login" })}>
            I already play — sign in with my Employee ID
          </button>
          {!emailUser && (
            <button type="button" className="btn lime block" onClick={() => go({ v: "setup" })}>
              I'm new — create my player card
            </button>
          )}
        </>
      )}
      {!locked && si.emailOtp && !emailUser && (
        <button type="button" className={`btn ${si.empId ? "ghost" : "primary"} block`} onClick={() => go({ v: "email" })}>
          Sign in with my work email
        </button>
      )}
      {!locked && si.sso && !emailUser && (
        <button type="button" className="btn ghost block ms-btn" onClick={microsoft}>
          <MsLogo /> Sign in with Microsoft
        </button>
      )}
      {!si.empId && !si.emailOtp && !si.sso && <div className="empty">Sign-in isn't set up yet. Please ask your admin.</div>}
      <div className="row" style={{ justifyContent: "center", gap: 18 }}>
        <button type="button" className="link" onClick={() => go({ v: "guide" })}>
          How it works
        </button>
        {features.live && (
          <a className="link" href="#/join">
            Join a live game
          </a>
        )}
      </div>
    </div>
  );
}

function MsLogo() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="1" y="1" width="8.5" height="8.5" fill="#F25022" />
      <rect x="10.5" y="1" width="8.5" height="8.5" fill="#7FBA00" />
      <rect x="1" y="10.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  );
}

export function Setup({ editing }: { editing?: boolean }) {
  const { api, tid, d, me, go, toast, setMe, signOut, labels, features, pub } = useApp();
  const { user } = useApi();
  const [empId, setEmp] = useState(me?.empId ?? "");
  const [name, setName] = useState(me?.name ?? "");
  const types = unitTypes(d.cfg);
  // the company may only use one kind of unit; a player keeps theirs if it was set before
  const [unitType, setUT] = useState<UnitType>(me && (types.includes(me.unitType) || editing) ? me.unitType : types[0]);
  const [unit, setUnit] = useState(me?.unit ?? "");
  const [look, setLook] = useState<number>(me?.look ?? Math.floor(Math.random() * LOOKS.length));
  const [filter, setFilter] = useState<"all" | "f" | "m" | "s">("all");
  const [agree, setAgree] = useState(!!me);
  const [err, setErr] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = unitType === "dept" ? d.cfg.departments : d.cfg.branches;
  // keep showing the player's current unit even if an admin has since removed it from the list
  const list = me?.unit && me.unitType === unitType && !base.includes(me.unit) ? [...base, me.unit] : base;
  const shown = useMemo(
    () => [
      ...SPECIALS.map((sp, k) => ({ i: LOOKS.length + k, g: "s", name: sp.name })),
      ...LOOKS.map((l, i) => ({ i, g: l.g as string, name: `Character ${i + 1}` })),
    ].filter((x) => filter === "all" || x.g === filter),
    [filter],
  );
  const email = user && !user.anonymous ? user.email : undefined;
  const uLabel = unitLabel(labels, unitType);
  const bothUnits = types.length > 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setConflict(false);
    const id = normEmpId(empId);
    const nm = cleanName(name);
    if (!editing && !validEmpId(id)) return setErr("Employee ID: 3–12 letters or numbers.");
    if (!validName(nm)) return setErr("Name: letters only, 2–40 characters.");
    if (!unit) return setErr(`Choose your ${uLabel.toLowerCase()}.`);
    if (!agree) return setErr("Please accept the privacy notice to play.");
    setBusy(true);
    try {
      if (editing && me) {
        await api.updateMyCard(tid, { name: nm, unitType, unit, look });
        toast("Player card updated");
      } else {
        if (!api.user()) await api.signInAnonymous();
        await joinIfNeeded(api, tid, pub.slug);
        const p = await api.playerRegister(tid, { empId: id, name: nm, unitType, unit, look, email }, deviceLabel());
        setMe(p);
        toast(`Welcome, ${firstName(nm)}!`);
      }
      go({ v: "lobby" });
    } catch (e2) {
      setErr(errMsg(e2));
      if (e2 instanceof ApiError && e2.code === "conflict" && pub.signIn.empId) setConflict(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="phone">
      <TopBar title={editing ? "Edit player card" : "Player card"} back={() => go({ v: editing ? "lobby" : "welcome" })} />
      <div className="setup-preview" aria-hidden="true">
        <Chibi look={look} equipped={me?.equipped} variant="full" size={110} mood="happy" />
        <div className="who">
          <span className="label" style={{ color: "var(--ink)" }}>
            {unit || `Your ${uLabel.toLowerCase()}`}
          </span>
          <b>{firstName(cleanName(name)) || "You"}</b>
        </div>
      </div>
      <form className="card stack" onSubmit={submit} autoComplete="off" noValidate>
        {email && !editing && (
          <p className="fine">
            Signed in as <b>{email}</b>
          </p>
        )}
        <div className="field">
          <label htmlFor="empId">Employee ID</label>
          {editing ? (
            <div className="num" style={{ fontFamily: "var(--display)", fontSize: 30 }}>
              {me?.empId}
            </div>
          ) : (
            <input className="inp num" id="empId" inputMode="text" value={empId} maxLength={12} onChange={(e) => setEmp(normEmpId(e.target.value))} placeholder="e.g. 10423" />
          )}
          {editing && <span className="fine">Only an admin can change an Employee ID.</span>}
        </div>
        <div className="field">
          <label htmlFor="pName">Name (shown on leaderboards)</label>
          <input className="inp" id="pName" value={name} maxLength={40} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Morgan" />
        </div>
        <div className="field">
          <span className="flabel">Where do you work?</span>
          {bothUnits && (
            <Seg
              value={unitType}
              label="Unit type"
              options={[["branch", labels.branch], ["dept", labels.dept]]}
              onChange={(v) => {
                setUT(v);
                setUnit("");
              }}
            />
          )}
          <select className="inp" id="pUnit" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={uLabel}>
            <option value="">Select {uLabel.toLowerCase()}…</option>
            {list.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        {features.avatars && (
          <div className="field">
            <span className="flabel">Pick your character</span>
            <Seg value={filter} label="Filter characters" options={[["all", "All"], ["s", "★ Special"], ["f", "Women"], ["m", "Men"]]} onChange={setFilter} className="narrow" />
            <div className="avatars">
              {shown.map(({ i, g, name }) => (
                <button type="button" key={i} className={`${look === i ? "on" : ""} ${g === "s" ? "special" : ""}`} aria-label={name} title={name} aria-pressed={look === i} onClick={() => setLook(i)}>
                  <Chibi look={i} size={64} still={look !== i} />
                  {g === "s" && <span className="sp-badge" aria-hidden="true">★</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {!editing && (
          <div className="consent card" style={{ background: "var(--paper)", boxShadow: "none" }}>
            <b>Your data, in plain words</b>
            <ul>
              <li>
                {pub.name} keeps your Employee ID, name, {labels.branch.toLowerCase()} or {labels.dept.toLowerCase()} and quiz answers.
              </li>
              <li>
                Other players see your {d.cfg.lastInitialOnly ? "first name and last initial" : "name"}, {uLabel.toLowerCase()} and points{d.cfg.maskIds ? " — never your Employee ID" : ""}.
              </li>
              <li>Your company uses answers to plan training, not for performance ratings.</li>
              <li>Plays are kept for {d.cfg.retentionDays} days, then can be deleted.</li>
            </ul>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I understand and want to play.</span>
            </label>
          </div>
        )}
        {err && (
          <p className="err" role="alert">
            {err}{" "}
            {conflict && (
              <button type="button" className="link" onClick={() => go({ v: "login" })}>
                Sign in instead
              </button>
            )}
          </p>
        )}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Save and start"}
        </button>
        {editing && <ReminderSwitch />}
        {editing && (
          <button type="button" className="link" style={{ justifySelf: "center" }} onClick={() => signOut(`Signed out. See you soon, ${firstName(me?.name)}!`)}>
            Not {firstName(me?.name)}? Sign out of this device
          </button>
        )}
      </form>
    </div>
  );
}
