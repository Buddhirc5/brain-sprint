/* Companies list and company detail (profile, status, brand, features, admins, delete). */
import { useEffect, useMemo, useState } from "react";
import type { AdminMember, Branding, Features, Labels, Role, SignIn, Tenant } from "../types";
import { useApi, errMsg } from "../app/ApiCtx";
import { absUrl } from "../app/router";
import { brandProblems, okHex } from "../app/theme";
import { DEFAULT_BRANDING, LABELS, normalizeCfg } from "../api/engine";
import { Icon, Modal, Seg } from "../components/ui";
import { Sprinty } from "../components/Chibi";
import { mix } from "../lib/util";
import { CopyField, SI, Toggle, ago, EMAIL_RE, slugProblem, useSuper, type TenantRow } from "./shared";

/* ================= list ================= */
export function Companies() {
  const { tenants, go } = useSuper();
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "active" | "suspended">("all");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tenants || []).filter((t) => (f === "all" || t.status === f) && (!s || t.name.toLowerCase().includes(s) || t.slug.includes(s) || t.branding.productName.toLowerCase().includes(s)));
  }, [tenants, q, f]);
  const tot = useMemo(() => {
    const ts = tenants || [];
    return {
      n: ts.length,
      active: ts.filter((t) => t.status === "active").length,
      players: ts.reduce((a, t) => a + t.usage.players, 0),
      plays: ts.reduce((a, t) => a + t.usage.runs30, 0),
    };
  }, [tenants]);

  return (
    <>
      <div className="toolbar">
        <h1>Companies</h1>
        <button className="btn lime small" onClick={() => go("new")}>
          <SI.plus /> New company
        </button>
      </div>
      <div className="kpis">
        <div className="kpi hl"><span className="sub">Companies</span><b className="num">{tot.n}</b><span className="sub">{tot.active} active</span></div>
        <div className="kpi"><span className="sub">Players</span><b className="num">{tot.players.toLocaleString()}</b><span className="sub">across all companies</span></div>
        <div className="kpi bl"><span className="sub">Plays · 30 days</span><b className="num">{tot.plays.toLocaleString()}</b><span className="sub">sprints & exams finished</span></div>
        <div className="kpi or"><span className="sub">Paused</span><b className="num">{tot.n - tot.active}</b><span className="sub">companies suspended</span></div>
      </div>
      <section className="panel">
        <div className="su-filter">
          <label className="su-search">
            <SI.search />
            <span className="sr">Search companies</span>
            <input type="search" placeholder="Search by name or web address" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Seg value={f} onChange={setF} label="Status" options={[["all", "All"], ["active", "Active"], ["suspended", "Suspended"]]} />
        </div>
        {tenants === null ? (
          <p className="fine">Loading companies…</p>
        ) : !list.length ? (
          <div className="empty">{tenants.length ? "No companies match." : "No companies yet — create the first one."}</div>
        ) : (
          <>
            <div className="scroll-x su-only-wide">
              <table className="tbl su-tbl">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Template</th>
                    <th>Status</th>
                    <th className="r">Players</th>
                    <th className="r">Active 30d</th>
                    <th className="r">Plays 30d</th>
                    <th className="r">Live 30d</th>
                    <th className="r">Polls</th>
                    <th className="r">Admins</th>
                    <th>Last active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id} className="su-click" onClick={() => go("co-" + t.id)}>
                      <td>
                        <CoName t={t} />
                      </td>
                      <td><span className="chip">{t.template === "bank" ? "Bank" : "Generic"}</span></td>
                      <td><StatusChip s={t.status} /></td>
                      <td className="r num">{t.usage.players}</td>
                      <td className="r num">{t.usage.activePlayers30}</td>
                      <td className="r num">{t.usage.runs30}</td>
                      <td className="r num">{t.usage.liveSessions30}</td>
                      <td className="r num">{t.usage.polls}</td>
                      <td className="r num">{t.usage.admins}</td>
                      <td className="sub">{ago(t.usage.lastActive)}</td>
                      <td className="r">
                        <button className="btn tiny white" onClick={(e) => { e.stopPropagation(); go("co-" + t.id); }}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="su-cards su-only-narrow">
              {list.map((t) => (
                <button key={t.id} className="su-cocard" onClick={() => go("co-" + t.id)}>
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <CoName t={t} />
                    <StatusChip s={t.status} />
                  </div>
                  <div className="su-cocard-nums">
                    <span><b className="num">{t.usage.players}</b>players</span>
                    <span><b className="num">{t.usage.runs30}</b>plays 30d</span>
                    <span><b className="num">{t.usage.admins}</b>admins</span>
                  </div>
                  <span className="fine">{t.template === "bank" ? "Bank" : "Generic"} · last active {ago(t.usage.lastActive)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}

export function CoLogo({ b, size = 36, name }: { b: Branding; size?: number; name?: string }) {
  return b.logo ? (
    <img className="su-logo" src={b.logo} alt="" width={size} height={size} />
  ) : (
    <span className="su-logo su-logo-fb" style={{ width: size, height: size, background: b.primary, color: b.ink, fontSize: size * 0.5 }} aria-hidden="true">
      {(name || b.productName || "?").trim()[0]?.toUpperCase()}
    </span>
  );
}
function CoName({ t }: { t: Tenant }) {
  return (
    <span className="su-coname">
      <CoLogo b={t.branding} name={t.name} />
      <span>
        <b>{t.name}</b>
        <span className="sub">/t/{t.slug} · {t.branding.productName}</span>
      </span>
    </span>
  );
}
export function StatusChip({ s }: { s: Tenant["status"] }) {
  return <span className={`sev ${s === "active" ? "good" : "warn"}`}>{s === "active" ? "Active" : "Suspended"}</span>;
}

/* ================= detail ================= */
export function CompanyDetail({ id }: { id: string }) {
  const { tenants, go } = useSuper();
  if (tenants === null) return <p className="fine">Loading…</p>;
  const t = tenants.find((x) => x.id === id);
  if (!t)
    return (
      <div className="panel su-center-text" style={{ justifyItems: "center" }}>
        <Sprinty mood="sad" size={90} />
        <h2>Company not found</h2>
        <p className="fine">It may have been deleted.</p>
        <button className="btn primary small" onClick={() => go("companies")}>All companies</button>
      </div>
    );
  return <Detail key={t.id} t={t} />;
}

function Detail({ t }: { t: TenantRow }) {
  const { go } = useSuper();
  const cfg = normalizeCfg(t.cfg, t.template);
  return (
    <>
      <div className="su-dhead">
        <button className="icon-btn" aria-label="All companies" onClick={() => go("companies")}>
          <Icon.back />
        </button>
        <CoLogo b={t.branding} size={52} name={t.name} />
        <div className="su-dhead-t">
          <h1>{t.name}</h1>
          <div className="row" style={{ gap: 8 }}>
            <StatusChip s={t.status} />
            <span className="chip">{t.template === "bank" ? "Bank template" : "Generic template"}</span>
            <span className="fine">created {new Date(t.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
        </div>
        <div className="row su-dhead-acts">
          <a className="btn white small" href={`#/t/${t.slug}`} target="_blank" rel="noopener">
            <SI.ext /> Player app
          </a>
          <a className="btn lime small" href={`#/t/${t.slug}/admin`} target="_blank" rel="noopener">
            <SI.ext /> Admin portal
          </a>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="sub">Players</span><b className="num">{t.usage.players}</b><span className="sub">{t.usage.activePlayers30} active in 30 days</span></div>
        <div className="kpi hl"><span className="sub">Plays · 30 days</span><b className="num">{t.usage.runs30}</b><span className="sub">{t.usage.quizzes} quizzes</span></div>
        <div className="kpi bl"><span className="sub">Live games · 30 days</span><b className="num">{t.usage.liveSessions30}</b><span className="sub">{t.usage.polls} polls</span></div>
        <div className="kpi pk"><span className="sub">Last active</span><b className="su-kpi-s">{ago(t.usage.lastActive)}</b><span className="sub">{t.usage.admins} admins</span></div>
      </div>
      <div className="grid2">
        <div className="stack su-col">
          <ProfilePanel t={t} />
          <StatusPanel t={t} />
          <LinksPanel t={t} />
        </div>
        <div className="stack su-col">
          <AdminsPanel t={t} />
          <FeaturesPanel t={t} features={cfg.features} signIn={cfg.signIn} />
        </div>
      </div>
      <BrandPanel t={t} />
      <DangerPanel t={t} />
    </>
  );
}

function useSave() {
  const { api, toast } = useApi();
  const { reload, recheck } = useSuper();
  const [busy, setBusy] = useState(false);
  const save = async (id: string, patch: Parameters<typeof api.superUpdateTenant>[1], ok: string) => {
    setBusy(true);
    try {
      await api.superUpdateTenant(id, patch);
      toast(ok);
      await reload();
      return true;
    } catch (e) {
      toast(errMsg(e));
      if ((e as { code?: string }).code === "forbidden") recheck();
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
}

function PanelH({ icon, title, sub }: { icon: JSX.Element; title: string; sub?: string }) {
  return (
    <div className="su-ph">
      <span className="su-ph-ic">{icon}</span>
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
    </div>
  );
}

function ProfilePanel({ t }: { t: TenantRow }) {
  const { tenants } = useSuper();
  const { save, busy } = useSave();
  const [name, setName] = useState(t.name);
  const [slug, setSlug] = useState(t.slug);
  const [tpl, setTpl] = useState(t.template);
  const [relabel, setRelabel] = useState(true);
  const taken = (tenants || []).filter((x) => x.id !== t.id).map((x) => x.slug);
  const sp = slug === t.slug ? null : slugProblem(slug, taken);
  const dirty = name.trim() !== t.name || slug !== t.slug || tpl !== t.template;
  const labelsMatchOld = JSON.stringify(t.labels) === JSON.stringify(LABELS[t.template]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || sp || name.trim().length < 2) return;
    const patch: Parameters<typeof save>[1] = {};
    if (name.trim() !== t.name) patch.name = name.trim();
    if (slug !== t.slug) patch.slug = slug;
    if (tpl !== t.template) {
      patch.template = tpl;
      if (relabel) patch.labels = LABELS[tpl];
    }
    await save(t.id, patch, "Company updated");
  };
  return (
    <form className="panel" onSubmit={submit}>
      <PanelH icon={<SI.building />} title="Company profile" sub="Legal name, web address and template." />
      <div className="field">
        <label htmlFor="cp-name">Company name</label>
        <input className="inp" id="cp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cp-slug">Web address</label>
        <div className="su-prefix">
          <span>/t/</span>
          <input className="inp" id="cp-slug" value={slug} maxLength={32} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
        </div>
        {sp ? <p className="err">{sp}</p> : slug !== t.slug && <p className="banner">Old links (#/t/{t.slug}) will stop working. Share the new links with the company.</p>}
      </div>
      <div className="field">
        <span className="flabel">Template</span>
        <Seg value={tpl} onChange={setTpl} label="Template" options={[["generic", "Generic"], ["bank", "Bank"]]} />
        {tpl !== t.template && (
          <label className="check">
            <input type="checkbox" checked={relabel} onChange={(e) => setRelabel(e.target.checked)} />
            <span>
              Also switch labels to {LABELS[tpl].branch} / {LABELS[tpl].dept}
              {!labelsMatchOld && " (this replaces the company's custom labels)"}
            </span>
          </label>
        )}
      </div>
      <div className="row end">
        <button className="btn primary small" disabled={!dirty || !!sp || busy || name.trim().length < 2}>Save profile</button>
      </div>
    </form>
  );
}

function StatusPanel({ t }: { t: TenantRow }) {
  const { save, busy } = useSave();
  const [ask, setAsk] = useState(false);
  const pausing = t.status === "active";
  return (
    <section className={`panel su-status ${pausing ? "" : "paused"}`}>
      <PanelH icon={pausing ? <SI.play /> : <SI.pause />} title={pausing ? "Company is active" : "Company is suspended"} sub={pausing ? "Players and admins can use it normally." : "Players see a 'Paused' page and admins can't sign in. Data is kept."} />
      <div className="row">
        <button className={`btn small ${pausing ? "ghost" : "lime"}`} onClick={() => setAsk(true)} disabled={busy}>
          {pausing ? <><SI.pause /> Suspend company</> : <><SI.play /> Reactivate company</>}
        </button>
      </div>
      {ask && (
        <Modal label={pausing ? "Suspend company" : "Reactivate company"} onClose={() => setAsk(false)}>
          <h3>{pausing ? `Suspend ${t.name}?` : `Reactivate ${t.name}?`}</h3>
          <p>
            {pausing
              ? "Players will see a 'Paused' page, live games and polls stop accepting answers, and the company's admins lose access until you reactivate it. Nothing is deleted."
              : "Players and admins get access again straight away."}
          </p>
          <div className="row end">
            <button className="btn ghost small" onClick={() => setAsk(false)}>Cancel</button>
            <button
              className={`btn small ${pausing ? "orange" : "primary"}`}
              data-autofocus
              onClick={async () => {
                if (await save(t.id, { status: pausing ? "suspended" : "active" }, pausing ? "Company suspended" : "Company reactivated")) setAsk(false);
              }}
            >
              {pausing ? "Suspend" : "Reactivate"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function LinksPanel({ t }: { t: TenantRow }) {
  return (
    <section className="panel">
      <PanelH icon={<SI.ext />} title="Links to share" sub="While the console is unlocked you can open this company's admin portal as an owner." />
      <CopyField label="Player app" value={absUrl({ r: "tenant", slug: t.slug })} />
      <CopyField label="Admin portal" value={absUrl({ r: "admin", slug: t.slug })} />
    </section>
  );
}

const ROLE_HELP: Record<Role, string> = {
  owner: "everything, incl. admins",
  admin: "settings, players, quizzes",
  editor: "write & publish quizzes",
  host: "run live games & polls",
  viewer: "read-only reports",
};
function AdminsPanel({ t }: { t: TenantRow }) {
  const { api, toast } = useApi();
  const [list, setList] = useState<AdminMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { reload } = useSuper();
  const load = () => api.superAdmins(t.id).then(setList, (e) => setErr(errMsg(e)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return setErr("Enter a valid email.");
    setErr("");
    setBusy(true);
    try {
      await api.superInvite(t.id, em, role);
      toast(`Invited ${em} as ${role}`);
      setEmail("");
      await load();
      void reload();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <PanelH icon={<SI.users />} title="Admins" sub="People who can sign in to this company's admin portal." />
      {list === null ? (
        <p className="fine">Loading…</p>
      ) : !list.length ? (
        <div className="empty">No admins yet — invite an owner below.</div>
      ) : (
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.email}>
                  <td>{m.email}</td>
                  <td><span className={`chip su-role ${m.role}`}>{m.role}</span></td>
                  <td className="sub">{m.joinedAt ? `joined ${ago(m.joinedAt)}${m.mfa ? " · 2-step on" : ""}` : `invited ${ago(m.invitedAt)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="su-invite" onSubmit={invite} noValidate>
        <div className="field">
          <label htmlFor="inv-email">Invite by email</label>
          <input className="inp" id="inv-email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="inv-role">Role</label>
          <select className="sel su-sel" id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(["owner", "admin", "editor", "host", "viewer"] as Role[]).map((r) => (
              <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)} — {ROLE_HELP[r]}</option>
            ))}
          </select>
        </div>
        <button className="btn primary small" disabled={busy || !email}>Invite</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
      <p className="fine">They sign in at the admin portal with this email (first time: “Set a password”).</p>
    </section>
  );
}

const FEATURE_LABEL: [keyof Features, string, string][] = [
  ["sprint", "Daily Sprint", "Short self-paced quizzes every day"],
  ["live", "Live Quiz", "Kahoot-style games on a big screen"],
  ["polls", "Live Polls", "Word clouds, ratings, Q&A"],
  ["cert", "Certification", "Pass-mark exams with certificates"],
  ["coins", "Coins", "Earned for playing"],
  ["store", "Avatar store", "Spend coins on looks"],
  ["streaks", "Streaks", "Days in a row"],
  ["avatars", "Cartoon avatars", "Players pick a character"],
  ["rewards", "Hall of Fame & gifts", "Weekly winners"],
  ["battle", "Team leaderboard", "Units compete"],
];
const SIGNIN_LABEL: [Exclude<keyof SignIn, "adminAuth">, string, string][] = [
  ["empId", "Employee ID", "Players type their ID, no password"],
  ["emailOtp", "Email code", "6-digit code by email"],
  ["sso", "Microsoft sign-in", "Entra ID — configure it in the backend first"],
  ["liveGuests", "Live quiz guests", "Nickname-only join for live games"],
  ["adminMfa", "Admins need an authenticator app", "Two-step sign-in for every admin"],
];
function FeaturesPanel({ t, features, signIn }: { t: TenantRow; features: Features; signIn: SignIn }) {
  const { save, busy } = useSave();
  const [f, setF] = useState(features);
  const [s, setS] = useState(signIn);
  const dirty = JSON.stringify(f) !== JSON.stringify(features) || JSON.stringify(s) !== JSON.stringify(signIn);
  const noPlayerSignIn = !s.empId && !s.emailOtp && !s.sso;
  return (
    <section className="panel">
      <PanelH icon={<SI.toggles />} title="Features & sign-in" sub="What this company's plan includes and how people sign in." />
      <div className="su-toggles">
        {FEATURE_LABEL.map(([k, l, d]) => (
          <div key={k} className="su-tg">
            <span>
              <b>{k === "battle" ? t.labels.battle : l}</b>
              <small>{d}</small>
            </span>
            <Toggle on={f[k]} label={l} onChange={(v) => setF({ ...f, [k]: v })} />
          </div>
        ))}
      </div>
      <h3 className="su-h3">Sign-in</h3>
      <div className="su-toggles">
        {SIGNIN_LABEL.map(([k, l, d]) => (
          <div key={k} className="su-tg">
            <span>
              <b>{l}</b>
              <small>{d}</small>
            </span>
            <Toggle on={s[k]} label={l} onChange={(v) => setS({ ...s, [k]: v })} />
          </div>
        ))}
      </div>
      <div className="field">
        <span className="flabel">Admins sign in with</span>
        <Seg value={s.adminAuth} onChange={(v) => setS({ ...s, adminAuth: v })} label="Admin sign-in" options={[["password", "Password"], ["magic", "Email link"], ["both", "Both"]]} />
      </div>
      {noPlayerSignIn && <p className="err">Turn on at least one way for players to sign in.</p>}
      <div className="row end">
        {dirty && <button className="btn ghost small" onClick={() => { setF(features); setS(signIn); }}>Undo</button>}
        <button className="btn primary small" disabled={!dirty || busy || noPlayerSignIn} onClick={() => void save(t.id, { cfg: { ...normalizeCfg(t.cfg, t.template), features: f, signIn: s } }, "Features saved")}>
          Save features
        </button>
      </div>
    </section>
  );
}

/* ---------- brand ---------- */
const MAX_LOGO = 150 * 1024;
export function readLogo(file: File): Promise<string> {
  return new Promise((res, rej) => {
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) return rej(new Error("Use a PNG, JPEG, WebP or SVG image."));
    if (file.size > MAX_LOGO) return rej(new Error(`That logo is ${Math.round(file.size / 1024)} KB — keep it under 150 KB.`));
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

export function ColorField({ label, value, onChange, id }: { label: string; value: string; onChange: (v: string) => void; id: string }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  return (
    <div className="field su-color">
      <label htmlFor={id}>{label}</label>
      <div className="su-color-row">
        <input type="color" aria-label={`${label} picker`} value={okHex(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input
          className="inp num"
          id={id}
          value={txt}
          maxLength={7}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && v[0] !== "#") v = "#" + v;
            setTxt(v);
            if (okHex(v)) onChange(v.toUpperCase());
          }}
        />
      </div>
    </div>
  );
}

/** A small phone-sized preview painted with the brand's colours. */
export function BrandPreview({ b, labels, company }: { b: Branding; labels?: Labels; company: string }) {
  const style = {
    "--lime": b.primary,
    "--lime-deep": okHex(b.primary) ? mix(b.primary, "#000000", 0.25) : b.primary,
    "--orange": b.accent,
    "--ink": b.ink,
    "--paper": b.paper,
  } as React.CSSProperties;
  return (
    <div className="su-prev" style={style} aria-label="Brand preview">
      <div className="su-prev-top">
        <CoLogo b={b} size={26} name={company} />
        <b>{b.productName || "Product name"}</b>
      </div>
      <div className="su-prev-hero">
        <span className="su-prev-tag">{company}</span>
        <span className="su-prev-mega">
          Today's <span>sprint</span>
        </span>
        <span className="su-prev-sub">{b.tagline || "Daily quizzes, live games and polls"}</span>
        <Sprinty size={60} still />
      </div>
      <div className="su-prev-card">
        <b>{labels?.battle || "Team Battle"}</b>
        <div className="su-prev-bar"><span style={{ width: "78%" }} /></div>
        <div className="su-prev-bar"><span style={{ width: "54%", background: b.accent }} /></div>
      </div>
      <div className="su-prev-btns">
        <span className="su-prev-btn p">Play now</span>
        <span className="su-prev-btn a">Join live</span>
      </div>
    </div>
  );
}

function BrandPanel({ t }: { t: TenantRow }) {
  const { save, busy } = useSave();
  const [b, setB] = useState<Branding>({ ...DEFAULT_BRANDING, ...t.branding });
  const [l, setL] = useState<Labels>(t.labels);
  const [err, setErr] = useState("");
  const prob = brandProblems(b);
  const dirty = JSON.stringify(b) !== JSON.stringify({ ...DEFAULT_BRANDING, ...t.branding }) || JSON.stringify(l) !== JSON.stringify(t.labels);
  const labelProb = Object.values(l).some((v) => !v.trim()) ? "Fill in every label." : null;
  const set = (k: keyof Branding, v: string) => setB({ ...b, [k]: v });
  return (
    <section className="panel">
      <PanelH icon={<SI.palette />} title="Brand" sub="The company sees its own product name, logo and colours everywhere — players, admins, big screens and certificates." />
      <div className="su-brand-grid">
        <div className="stack">
          <div className="row2">
            <div className="field">
              <label htmlFor="br-name">Product name</label>
              <input className="inp" id="br-name" value={b.productName} maxLength={40} onChange={(e) => set("productName", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="br-tag">Tagline</label>
              <input className="inp" id="br-tag" value={b.tagline || ""} maxLength={80} onChange={(e) => set("tagline", e.target.value)} />
            </div>
          </div>
          <div className="row2">
            <ColorField id="br-p" label="Primary (light, dark text on it)" value={b.primary} onChange={(v) => set("primary", v)} />
            <ColorField id="br-a" label="Accent (deep, white text on it)" value={b.accent} onChange={(v) => set("accent", v)} />
            <ColorField id="br-i" label="Ink (text & dark surfaces)" value={b.ink} onChange={(v) => set("ink", v)} />
            <ColorField id="br-bg" label="Background" value={b.paper} onChange={(v) => set("paper", v)} />
          </div>
          <div className="field">
            <span className="flabel">Logo (PNG, JPEG, WebP or SVG · up to 150 KB)</span>
            <div className="row">
              <CoLogo b={b} size={48} name={t.name} />
              <label className="btn white small su-file">
                <SI.upload /> Upload logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      setErr("");
                      set("logo", await readLogo(f));
                    } catch (e2) {
                      setErr(errMsg(e2));
                    }
                  }}
                />
              </label>
              {b.logo && <button className="link danger" onClick={() => setB({ ...b, logo: undefined })}>Remove logo</button>}
            </div>
          </div>
          <div className="field">
            <span className="flabel">Labels</span>
            <div className="row2 su-labels">
              {(["branch", "branches", "dept", "depts", "battle"] as (keyof Labels)[]).map((k) => (
                <input key={k} className="inp" aria-label={`Label: ${k}`} value={l[k]} maxLength={24} onChange={(e) => setL({ ...l, [k]: e.target.value })} />
              ))}
            </div>
            <p className="fine">Singular and plural for units (e.g. Branch / Branches, Store / Stores), departments, and the team leaderboard name.</p>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          {prob ? <p className="err">{prob}</p> : <p className="su-okline"><Icon.check /> Colours pass the contrast checks.</p>}
          {labelProb && <p className="err">{labelProb}</p>}
          <div className="row end">
            {dirty && <button className="btn ghost small" onClick={() => { setB({ ...DEFAULT_BRANDING, ...t.branding }); setL(t.labels); }}>Undo</button>}
            <button className="btn ghost small" onClick={() => setB({ ...DEFAULT_BRANDING, productName: b.productName, tagline: b.tagline, logo: b.logo })}>Brain Sprint colours</button>
            <button className="btn primary small" disabled={!dirty || !!prob || !!labelProb || busy || !b.productName.trim()} onClick={() => void save(t.id, { branding: { ...b, productName: b.productName.trim() }, labels: l }, "Brand saved")}>
              Save brand
            </button>
          </div>
        </div>
        <BrandPreview b={b} labels={l} company={t.name} />
      </div>
    </section>
  );
}

function DangerPanel({ t }: { t: TenantRow }) {
  const { api, toast } = useApi();
  const { reload, go } = useSuper();
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const del = async () => {
    try {
      await api.superDeleteTenant(t.id, typed.trim());
      toast(`${t.name} deleted`);
      await reload();
      go("companies");
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <section className="panel su-danger">
      <div className="panel-h">
        <div>
          <h2>Delete company</h2>
          <p>Removes {t.name}, its players, quizzes, results, live games and polls for good. This can't be undone — suspend it instead if you might need the data.</p>
        </div>
        <button className="btn small su-btn-danger" onClick={() => { setAsk(true); setTyped(""); setErr(""); }}>
          <SI.trash /> Delete company
        </button>
      </div>
      {ask && (
        <Modal label="Delete company" onClose={() => setAsk(false)}>
          <h3>Delete {t.name}?</h3>
          <p>
            Everything for this company is deleted permanently. Type <b className="num">{t.slug}</b> to confirm.
          </p>
          <input className="inp" aria-label="Type the web address to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          {err && <p className="err" role="alert">{err}</p>}
          <div className="row end">
            <button className="btn ghost small" onClick={() => setAsk(false)}>Cancel</button>
            <button className="btn small su-btn-danger" disabled={typed.trim() !== t.slug} onClick={del}>Delete forever</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

