/* New company wizard: name → web address → template → owner → brand → starter library → create. */
import { useEffect, useMemo, useState } from "react";
import type { Branding, LibraryItem, Tenant } from "../types";
import { useApi, errMsg } from "../app/ApiCtx";
import { absUrl } from "../app/router";
import { brandProblems } from "../app/theme";
import { DEFAULT_BRANDING, LABELS } from "../api/engine";
import { Icon } from "../components/ui";
import { Chibi, Mascot } from "../components/Chibi";
import { confetti } from "../components/ui";
import { BrandPreview, ColorField, CoLogo, readLogo } from "./Companies";
import { CopyField, EMAIL_RE, SI, Toggle, slugProblem, slugify, useSuper } from "./shared";

const STEPS = ["Company", "Template", "Owner", "Brand", "Starter quizzes", "Review"];

export function NewCompany() {
  const { api, toast } = useApi();
  const { tenants, reload, go, recheck } = useSuper();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tpl, setTpl] = useState<Tenant["template"]>("generic");
  const [owner, setOwner] = useState("");
  const [brand, setBrand] = useState<Branding>({ ...DEFAULT_BRANDING });
  const [starter, setStarter] = useState(true);
  const [lib, setLib] = useState<LibraryItem[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Tenant | null>(null);

  useEffect(() => {
    api.library().then(setLib, () => setLib([]));
  }, [api]);
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const taken = (tenants || []).map((t) => t.slug);
  const sp = slugProblem(slug, taken);
  const sets = useMemo(() => (lib || []).filter((x) => x.industry === "any" || (tpl === "bank" && x.industry === "bank")), [lib, tpl]);
  const bp = brandProblems(brand);

  const problem = (s: number): string | null => {
    if (s === 0) return name.trim().length < 2 ? "Enter the company name." : sp;
    if (s === 2) return EMAIL_RE.test(owner.trim()) ? null : "Enter the owner's work email.";
    if (s === 3) return !brand.productName.trim() ? "Enter a product name." : bp;
    return null;
  };
  const next = () => {
    const p = problem(step);
    if (p) return setErr(p);
    setErr("");
    setStep(step + 1);
  };

  const create = async () => {
    for (let s = 0; s < 5; s++) {
      const p = problem(s);
      if (p) {
        setStep(s);
        return setErr(p);
      }
    }
    setBusy(true);
    setErr("");
    try {
      const changed: Partial<Branding> = {};
      (Object.keys(brand) as (keyof Branding)[]).forEach((k) => {
        if (brand[k] !== DEFAULT_BRANDING[k]) (changed as Record<string, unknown>)[k] = brand[k];
      });
      const t = await api.superCreateTenant({ name: name.trim(), slug, template: tpl, ownerEmail: owner.trim().toLowerCase(), branding: changed, starter });
      await reload();
      setDone(t);
      confetti(90);
      toast(`${t.name} created`);
    } catch (e) {
      setErr(errMsg(e));
      if ((e as { code?: string }).code === "forbidden") recheck();
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setStep(0);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setTpl("generic");
    setOwner("");
    setBrand({ ...DEFAULT_BRANDING });
    setStarter(true);
  };

  if (done) {
    const player = absUrl({ r: "tenant", slug: done.slug });
    const admin = absUrl({ r: "admin", slug: done.slug });
    const email = owner.trim().toLowerCase();
    const note = `Hi! ${done.branding.productName} is ready for ${done.name}.

1. Open the admin portal: ${admin}
2. Click "First time? Set a password" and use ${email}.
3. ${starter ? "Your starter quizzes are waiting as drafts — review them, then publish." : "Create your first quiz."}
4. Share the player link with your team: ${player}`;
    return (
      <>
        <div className="toolbar">
          <h1>Company created</h1>
        </div>
        <section className="su-done">
          <div className="su-done-hero">
            <div className="stack">
              <span className="label" style={{ color: "inherit" }}>New company</span>
              <b className="su-done-name">{done.name}</b>
              <p>
                Owner <b>{email}</b> · {done.template === "bank" ? "Bank" : "Generic"} template{starter ? ` · ${sets.length} starter quizzes as drafts` : ""}
              </p>
            </div>
            <div className="su-done-chars" aria-hidden="true">
              <Chibi look={2} mood="cheer" variant="full" size={96} />
              <Mascot mood="cheer" size={96} />
              <Chibi look={9} mood="cheer" variant="full" size={96} />
            </div>
          </div>
          <div className="grid2">
            <div className="panel">
              <h2 className="su-h3">Links to share</h2>
              <CopyField label="Player app — for everyone" value={player} />
              <CopyField label="Admin portal — for the owner" value={admin} />
              <div className="row">
                <a className="btn white small" href={`#/t/${done.slug}`} target="_blank" rel="noopener"><SI.ext /> Open player app</a>
                <a className="btn white small" href={`#/t/${done.slug}/admin`} target="_blank" rel="noopener"><SI.ext /> Open admin portal</a>
              </div>
            </div>
            <div className="panel">
              <h2 className="su-h3">Send this to the owner</h2>
              <code className="box su-note">{note}</code>
              <CopyNote text={note} />
            </div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => go("co-" + done.id)}>Manage {done.name}</button>
            <button className="btn ghost" onClick={reset}>Create another</button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="toolbar">
        <h1>New company</h1>
      </div>
      <ol className="su-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "on" : i < step ? "done" : ""}>
            <button type="button" disabled={i > step} onClick={() => { setErr(""); setStep(i); }}>
              <span className="n">{i < step ? <Icon.check /> : i + 1}</span>
              <span className="t">{s}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="su-wiz">
        <form
          className="panel su-wiz-main"
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 5) next();
            else void create();
          }}
          noValidate
        >
          {step === 0 && (
            <>
              <h2 className="su-wiz-h">What's the company called?</h2>
              <div className="field">
                <label htmlFor="nc-name">Company name</label>
                <input className="inp" id="nc-name" autoFocus value={name} maxLength={80} placeholder="e.g. Acme Bank" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="nc-slug">Web address</label>
                <div className="su-prefix">
                  <span>/t/</span>
                  <input
                    className="inp"
                    id="nc-slug"
                    value={slug}
                    maxLength={32}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                  />
                </div>
                {slug && sp ? <p className="err">{sp}</p> : slug ? <p className="fine">Players will open <b>{absUrl({ r: "tenant", slug })}</b></p> : <p className="fine">Suggested from the name. 3–32 lowercase letters, numbers or dashes.</p>}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h2 className="su-wiz-h">Pick a starting template</h2>
              <p className="fine">Sets the labels, sample units, topics and security defaults. Everything can be changed later.</p>
              <div className="su-tpls" role="radiogroup" aria-label="Template">
                {(["generic", "bank"] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={tpl === k} className={`su-tpl ${tpl === k ? "on" : ""}`} onClick={() => setTpl(k)}>
                    <span className="su-tpl-ic">{k === "bank" ? <BankArt /> : <OfficeArt />}</span>
                    <b>{k === "bank" ? "Bank" : "Generic"}</b>
                    <span className="fine">
                      {k === "bank"
                        ? "Branches & departments, Branch Battle, AML / cyber / digital banking starters, maker-checker approvals and authenticator app for admins."
                        : "Locations & departments, Team Battle, company-wide starters (cyber, privacy, service, safety, ethics, fun trivia)."}
                    </span>
                    <span className="chip">{LABELS[k].branch} · {LABELS[k].dept} · {LABELS[k].battle}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="su-wiz-h">Who owns it?</h2>
              <p className="fine">The owner manages everything for this company, including inviting other admins. They'll sign in with this email and set their own password.</p>
              <div className="field">
                <label htmlFor="nc-owner">Owner's work email</label>
                <input className="inp" id="nc-owner" type="email" autoFocus value={owner} placeholder="owner@company.com" onChange={(e) => setOwner(e.target.value)} />
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2 className="su-wiz-h">Brand it <span className="su-opt">optional</span></h2>
              <p className="fine">Keep the Ant Arena look, or give it the company's own name, colours and logo. You can refine this later.</p>
              <div className="row2">
                <div className="field">
                  <label htmlFor="nc-pn">Product name</label>
                  <input className="inp" id="nc-pn" value={brand.productName} maxLength={40} onChange={(e) => setBrand({ ...brand, productName: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="nc-tag">Tagline</label>
                  <input className="inp" id="nc-tag" value={brand.tagline || ""} maxLength={80} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} />
                </div>
                <ColorField id="nc-p" label="Primary (light)" value={brand.primary} onChange={(v) => setBrand({ ...brand, primary: v })} />
                <ColorField id="nc-a" label="Accent (deep)" value={brand.accent} onChange={(v) => setBrand({ ...brand, accent: v })} />
              </div>
              <div className="row">
                <CoLogo b={brand} size={44} name={name || undefined} />
                <label className="btn white small su-file">
                  <SI.upload /> {brand.logo ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        setErr("");
                        const logo = await readLogo(f);
                        setBrand((b) => ({ ...b, logo }));
                      } catch (e2) {
                        setErr(errMsg(e2));
                      }
                    }}
                  />
                </label>
                {brand.logo && <button type="button" className="link danger" onClick={() => setBrand({ ...brand, logo: undefined })}>Remove</button>}
                <button type="button" className="link" onClick={() => setBrand({ ...DEFAULT_BRANDING })}>Reset to Ant Arena</button>
              </div>
              {bp && <p className="err">{bp}</p>}
            </>
          )}
          {step === 4 && (
            <>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <h2 className="su-wiz-h">Starter quizzes</h2>
                <Toggle on={starter} onChange={setStarter} label="Include starter library" />
              </div>
              <p className="fine">
                {starter
                  ? `These ${sets.length} ready-made sets are copied into the company as drafts. The owner reviews and publishes them.`
                  : "The company starts empty. The owner can still copy starter sets later from their admin portal."}
              </p>
              <div className={`su-libmini ${starter ? "" : "off"}`}>
                {lib === null ? (
                  <p className="fine">Loading library…</p>
                ) : (
                  sets.map((s) => (
                    <div key={s.id} className="su-libmini-row">
                      <span className={`su-ind ${s.industry}`}>{s.industry === "bank" ? "Bank" : "Any"}</span>
                      <b>{s.title}</b>
                      <span className="fine">{s.topic} · {s.questions.length} questions</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <h2 className="su-wiz-h">Ready to create</h2>
              <dl className="su-review">
                <dt>Company</dt><dd>{name.trim()}</dd>
                <dt>Web address</dt><dd>/t/{slug}</dd>
                <dt>Template</dt><dd>{tpl === "bank" ? "Bank" : "Generic"} ({LABELS[tpl].branch} / {LABELS[tpl].dept})</dd>
                <dt>Owner</dt><dd>{owner.trim().toLowerCase()}</dd>
                <dt>Product name</dt><dd>{brand.productName}</dd>
                <dt>Starter quizzes</dt><dd>{starter ? `${sets.length} sets as drafts` : "None"}</dd>
              </dl>
            </>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          <div className="row su-wiz-nav">
            {step > 0 && (
              <button type="button" className="btn ghost small" onClick={() => { setErr(""); setStep(step - 1); }}>
                Back
              </button>
            )}
            <span style={{ flex: 1 }} />
            {step === 3 && (
              <button type="button" className="link" onClick={() => { setBrand({ ...DEFAULT_BRANDING }); setErr(""); setStep(4); }}>
                Skip
              </button>
            )}
            {step < 5 ? (
              <button className="btn primary small">Next</button>
            ) : (
              <button className="btn lime" disabled={busy}>{busy ? "Creating…" : "Create company"}</button>
            )}
          </div>
        </form>
        <aside className="su-wiz-side">
          <BrandPreview b={brand} labels={LABELS[tpl]} company={name.trim() || "Your company"} />
          <p className="fine su-center-text">Live preview of the player app</p>
        </aside>
      </div>
    </>
  );
}

function CopyNote({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn white small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1600);
        } catch {
          /* clipboard blocked: the text is selectable */
        }
      }}
    >
      {ok ? "Copied" : "Copy message"}
    </button>
  );
}

function BankArt() {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true">
      <rect x="0" y="0" width="64" height="48" rx="12" fill="var(--blue-soft)" />
      <path d="M12 20 L32 9 L52 20 Z" fill="#161512" />
      <rect x="14" y="21" width="36" height="3" fill="#161512" />
      {[17, 26, 35, 44].map((x) => (
        <rect key={x} x={x - 1} y="25" width="5" height="12" rx="1" fill="#FFFEFA" stroke="#161512" strokeWidth="1.6" />
      ))}
      <rect x="12" y="37" width="40" height="4" rx="1" fill="#161512" />
      <circle cx="32" cy="16" r="2.4" fill="#C6F432" />
    </svg>
  );
}
function OfficeArt() {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true">
      <rect x="0" y="0" width="64" height="48" rx="12" fill="var(--lime-soft)" />
      <rect x="14" y="10" width="20" height="30" rx="2" fill="#161512" />
      <rect x="34" y="18" width="16" height="22" rx="2" fill="#FF5A1F" />
      {[14, 20, 26, 32].map((y) => (
        <g key={y}>
          <rect x="18" y={y} width="4" height="3" fill="#C6F432" />
          <rect x="26" y={y} width="4" height="3" fill="#C6F432" />
        </g>
      ))}
      <rect x="10" y="40" width="44" height="2.5" rx="1" fill="#161512" />
    </svg>
  );
}
