import { useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { applyBranding, brandProblems, contrast, okHex, onColor } from "../app/theme";
import { DEFAULT_BRANDING, LABELS } from "../api/engine";
import { cleanText } from "../lib/security";
import type { Branding, Labels } from "../types";
import { useLiveTenant } from "./common";

const MAX_LOGO = 150 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
type ColorKey = "primary" | "accent" | "ink" | "paper";
const COLOR_INFO: Record<ColorKey, { label: string; text: string }> = {
  primary: { label: "Primary", text: "Buttons, highlights. Dark text sits on it — keep it light and bright." },
  accent: { label: "Accent", text: "Second colour. White text sits on it — keep it deep." },
  ink: { label: "Ink", text: "Text and dark surfaces. Near-black works best." },
  paper: { label: "Background", text: "Page background. Keep it light." },
};
/** Palettes that pass the contrast checks. */
const PRESETS: { name: string; c: Pick<Branding, ColorKey> }[] = [
  { name: "Neon (default)", c: { primary: DEFAULT_BRANDING.primary, accent: DEFAULT_BRANDING.accent, ink: DEFAULT_BRANDING.ink, paper: DEFAULT_BRANDING.paper } },
  { name: "Teal & navy", c: { primary: "#5EEAD4", accent: "#C2410C", ink: "#0B1B2B", paper: "#EEF3F6" } },
  { name: "Sunshine", c: { primary: "#FACC15", accent: "#1D4ED8", ink: "#1C1917", paper: "#FAFAF5" } },
  { name: "Mint & berry", c: { primary: "#86EFAC", accent: "#BE185D", ink: "#111827", paper: "#F3F4F6" } },
  { name: "Sky & plum", c: { primary: "#7DD3FC", accent: "#7E22CE", ink: "#0F172A", paper: "#F1F5F9" } },
];
const LABEL_FIELDS: { k: keyof Labels; label: string; hint: string }[] = [
  { k: "branch", label: "Location (one)", hint: "Branch, Store, Site…" },
  { k: "branches", label: "Locations (many)", hint: "Branches, Stores…" },
  { k: "dept", label: "Team (one)", hint: "Department, Team…" },
  { k: "depts", label: "Teams (many)", hint: "Departments, Teams…" },
  { k: "battle", label: "Unit leaderboard name", hint: "Branch Battle, Team Battle…" },
];

export function Brand() {
  const { api, tid, approve, toast, pub } = useApp();
  const live = useLiveTenant();
  const [b, setB] = useState<Branding>(() => ({ ...DEFAULT_BRANDING, ...live.branding }));
  const [l, setL] = useState<Labels>(() => ({ ...live.labels }));
  const [logoErr, setLogoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = brandProblems(b);
  const labelProblem = LABEL_FIELDS.find((x) => !l[x.k].trim()) ? "Fill in every label." : null;
  const dirty = JSON.stringify(b) !== JSON.stringify({ ...DEFAULT_BRANDING, ...live.branding }) || JSON.stringify(l) !== JSON.stringify(live.labels);
  const set = (p: Partial<Branding>) => setB((c) => ({ ...c, ...p }));
  const ratios = useMemo(
    () => (okHex(b.primary) && okHex(b.accent) && okHex(b.ink) && okHex(b.paper) ? { pi: contrast(b.primary, b.ink), aw: contrast(b.accent, "#FFFFFF"), ip: contrast(b.ink, b.paper), iw: contrast(b.ink, "#FFFFFF") } : null),
    [b.primary, b.accent, b.ink, b.paper],
  );

  const onLogo = (f?: File) => {
    setLogoErr("");
    if (!f) return;
    if (!LOGO_TYPES.includes(f.type)) return setLogoErr("Use a PNG, JPEG, SVG or WebP image.");
    if (f.size > MAX_LOGO) return setLogoErr(`That file is ${Math.round(f.size / 1024)} KB — the limit is 150 KB. Export a smaller version (a square 256 × 256 PNG is plenty).`);
    const r = new FileReader();
    r.onload = () => set({ logo: String(r.result) });
    r.onerror = () => setLogoErr("Couldn't read that file.");
    r.readAsDataURL(f);
  };

  const save = () => {
    if (problem) return toast(problem);
    if (labelProblem) return toast(labelProblem);
    const branding: Branding = { ...b, productName: cleanText(b.productName, 40).trim() || DEFAULT_BRANDING.productName, tagline: cleanText(b.tagline || "", 80).trim(), primary: b.primary.toUpperCase(), accent: b.accent.toUpperCase(), ink: b.ink.toUpperCase(), paper: b.paper.toUpperCase() };
    const labels: Labels = Object.fromEntries(LABEL_FIELDS.map((x) => [x.k, cleanText(l[x.k], 30).trim()])) as unknown as Labels;
    approve({
      label: `Save branding for ${pub.name}. Players and admins see the new look straight away.`,
      yes: "Save branding",
      run: async () => {
        setBusy(true);
        try {
          await api.saveBrand(tid, branding, labels);
          applyBranding(branding);
          toast("Branding saved");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <>
      <div className="toolbar">
        <h1>Branding</h1>
        {dirty && <span className="sev warn">Unsaved changes</span>}
        {dirty && <button className="btn ghost small" onClick={() => { setB({ ...DEFAULT_BRANDING, ...live.branding }); setL({ ...live.labels }); }}>Undo</button>}
        <button className="btn primary" disabled={!dirty || !!problem || !!labelProblem || busy} onClick={save} title={problem || labelProblem || ""}>Save branding</button>
      </div>
      {problem && (
        <div className="banner red row" role="alert" style={{ justifyContent: "space-between" }}>
          <span><b>Can't save this palette:</b> {problem}</span>
          <button className="btn ghost small" onClick={() => set({ primary: DEFAULT_BRANDING.primary, accent: DEFAULT_BRANDING.accent, ink: DEFAULT_BRANDING.ink, paper: DEFAULT_BRANDING.paper })}>Reset colours to default</button>
        </div>
      )}
      <div className="grid2">
        <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
          <section className="panel">
            <div className="panel-h"><div><h2>Name & logo</h2><p>Shown in the header of the player app, the admin portal and certificates.</p></div></div>
            <div className="row2">
              <div className="field">
                <label htmlFor="bName">Product name</label>
                <input className="inp" id="bName" value={b.productName} maxLength={40} onChange={(e) => set({ productName: e.target.value })} placeholder="e.g. Harbor Academy" />
              </div>
              <div className="field">
                <label htmlFor="bTag">Tagline</label>
                <input className="inp" id="bTag" value={b.tagline || ""} maxLength={80} onChange={(e) => set({ tagline: e.target.value })} placeholder="e.g. Learn a little every day" />
              </div>
            </div>
            <div className="field">
              <span className="flabel">Logo</span>
              <div className="logo-row">
                <div className="logo-box">{b.logo ? <img src={b.logo} alt="Current logo" /> : <span className="fine">No logo</span>}</div>
                <div className="stack" style={{ gap: 6 }}>
                  <label className="btn ghost small">
                    {b.logo ? "Replace logo" : "Upload logo"}
                    <input type="file" accept={LOGO_TYPES.join(",")} className="sr" onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {b.logo && <button type="button" className="link danger" style={{ justifySelf: "start" }} onClick={() => set({ logo: undefined })}>Remove logo</button>}
                  <span className="fine">PNG, JPEG, SVG or WebP · up to 150 KB · square works best</span>
                </div>
              </div>
              {logoErr && <p className="err" role="alert">{logoErr}</p>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-h">
              <div><h2>Colours</h2><p>Checked for readability as you pick.</p></div>
              <button className="btn ghost small" onClick={() => set({ primary: DEFAULT_BRANDING.primary, accent: DEFAULT_BRANDING.accent, ink: DEFAULT_BRANDING.ink, paper: DEFAULT_BRANDING.paper })}>Reset to default</button>
            </div>
            <div className="chips-row" role="group" aria-label="Ready-made palettes">
              {PRESETS.map((p) => (
                <button key={p.name} className="chip-tg" onClick={() => set(p.c)}>
                  <span className="preset-dots" aria-hidden>{(["primary", "accent", "ink", "paper"] as const).map((k) => <i key={k} style={{ background: p.c[k] }} />)}</span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="colors">
              {(Object.keys(COLOR_INFO) as ColorKey[]).map((k) => (
                <div className="color-f" key={k}>
                  <input type="color" value={okHex(b[k]) ? b[k] : "#000000"} onChange={(e) => set({ [k]: e.target.value.toUpperCase() } as Partial<Branding>)} aria-label={`${COLOR_INFO[k].label} colour picker`} />
                  <div className="field" style={{ gap: 2 }}>
                    <label htmlFor={`c-${k}`}>{COLOR_INFO[k].label}</label>
                    <input className="inp num" id={`c-${k}`} value={b[k]} maxLength={7} onChange={(e) => set({ [k]: e.target.value.trim() } as Partial<Branding>)} aria-invalid={!okHex(b[k])} />
                    <span className="fine">{COLOR_INFO[k].text}</span>
                  </div>
                </div>
              ))}
            </div>
            {ratios && (
              <div className="ratios">
                <Ratio label="Dark text on primary" v={ratios.pi} min={4.5} />
                <Ratio label="White text on accent" v={ratios.aw} min={3} />
                <Ratio label="Ink on background" v={ratios.ip} min={7} />
                <Ratio label="Ink darkness" v={ratios.iw} min={10} />
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-h">
              <div><h2>Your words</h2><p>What you call locations and teams. Used everywhere: sign-up, boards, dashboards, reports.</p></div>
              <div className="row">
                <button className="btn ghost small" onClick={() => setL({ ...LABELS.generic })}>Generic</button>
                <button className="btn ghost small" onClick={() => setL({ ...LABELS.bank })}>Bank</button>
              </div>
            </div>
            <div className="row2">
              {LABEL_FIELDS.map((x) => (
                <div className="field" key={x.k}>
                  <label htmlFor={`l-${x.k}`}>{x.label}</label>
                  <input className="inp" id={`l-${x.k}`} value={l[x.k]} maxLength={30} placeholder={x.hint} onChange={(e) => setL({ ...l, [x.k]: e.target.value })} />
                </div>
              ))}
            </div>
            {labelProblem && <p className="err">{labelProblem}</p>}
          </section>
        </div>
        <section className="panel preview-panel">
          <div className="panel-h"><div><h2>Preview</h2><p>How the player app will look{problem ? " — fix the colours to save" : ""}.</p></div></div>
          <Preview b={b} l={l} />
        </section>
      </div>
    </>
  );
}

function Ratio({ label, v, min }: { label: string; v: number; min: number }) {
  const ok = v >= min;
  return (
    <div className="ratio">
      <span className={`sev ${ok ? "good" : "bad"}`}>{ok ? "OK" : "Too low"}</span>
      <span>{label}</span>
      <b className="num">{v.toFixed(1)}:1</b>
      <span className="sub">needs {min}:1</span>
    </div>
  );
}

/** A self-contained mini player screen painted with the draft colours (not the live theme). */
function Preview({ b, l }: { b: Branding; l: Labels }) {
  const c = (k: ColorKey, fb: string) => (okHex(b[k]) ? b[k] : fb);
  const primary = c("primary", "#cccccc"), accent = c("accent", "#999999"), ink = c("ink", "#000000"), paper = c("paper", "#ffffff");
  return (
    <div className="bp-phone" style={{ background: paper, color: ink }} aria-label="Preview of the player app">
      <div className="bp-top" style={{ background: ink }}>
        {b.logo ? <img src={b.logo} alt="" /> : <span className="bp-dot" style={{ background: primary }} />}
        <b style={{ color: primary }}>{b.productName || "Product name"}</b>
        <span className="bp-coins" style={{ background: primary, color: ink }}>120</span>
      </div>
      <div className="bp-body">
        <p className="bp-hi">Hi Nadia 👋</p>
        {b.tagline && <p className="bp-tag" style={{ color: ink, opacity: 0.75 }}>{b.tagline}</p>}
        <div className="bp-hero" style={{ background: primary, color: ink }}>
          <span className="bp-kicker" style={{ background: ink, color: primary }}>Today's sprint</span>
          <b className="bp-title">Cyber Basics</b>
          <span>3 questions · 1.5 min</span>
          <span className="bp-btn" style={{ background: ink, color: "#fff" }}>Play now</span>
        </div>
        <div className="bp-row">
          <div className="bp-card" style={{ background: accent, color: onColor(accent, ink) }}>
            <b>Live quiz</b>
            <span>Join with a PIN</span>
          </div>
          <div className="bp-card" style={{ background: "#fff", color: ink, boxShadow: `inset 0 0 0 2px ${ink}` }}>
            <b>{l.battle || "Battle"}</b>
            <span>#2 of 8 {(l.branches || "").toLowerCase()}</span>
          </div>
        </div>
        <div className="bp-row">
          <span className="bp-btn" style={{ background: accent, color: onColor(accent, ink) }}>Accent button</span>
          <span className="bp-btn" style={{ background: primary, color: ink }}>Primary button</span>
        </div>
        <p className="bp-fine" style={{ color: ink }}>
          {l.branch || "Branch"}: City · {l.dept || "Department"}: Operations
        </p>
      </div>
    </div>
  );
}
