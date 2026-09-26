/* =====================================================================
   The public front door (#/): join a live game, vote in a poll, or go to
   your company's page — plus what Brain Sprint is, and (demo only) a
   guided tour of the demo companies.
   ===================================================================== */
import { useEffect, useState, type ReactNode } from "react";
import "../styles/home.css";
import { useApi } from "../app/ApiCtx";
import { nav } from "../app/router";
import { Chibi, Sprinty } from "../components/Chibi";
import { Icon } from "../components/ui";
import type { TenantPublic } from "../types";
import { DEMO_ADMINS, DEMO_PASSWORD, DEMO_SUPER } from "./demoHints";

const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Accepts "acme-bank", "/t/acme-bank" or a full pasted link. */
function slugFrom(s: string): string {
  const v = s.trim().toLowerCase();
  const m = v.match(/#\/t\/([a-z0-9-]+)/) || v.match(/(?:^|\/)t\/([a-z0-9-]+)/);
  return (m ? m[1] : v).replace(/[^a-z0-9-]/g, "");
}

/** In-page scroll (plain #anchors would be taken by the hash router). */
function jump(id: string, focus?: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (focus) setTimeout(() => document.getElementById(focus)?.focus({ preventScroll: true }), 350);
}

export function Home() {
  const { api } = useApi();
  const demo = api.mode === "demo";
  return (
    <div className="home">
      <header className="h-top">
        <a className="h-logo" href="#/" aria-label="Brain Sprint home">
          <Sprinty size={40} still />
          <span>Brain Sprint</span>
        </a>
        <nav className="h-topnav" aria-label="Quick links">
          <button type="button" onClick={() => jump("join-box")}>Join a game</button>
          <button type="button" onClick={() => jump("company-box")}>Company sign-in</button>
          {demo && <button type="button" className="h-demo-pill" onClick={() => jump("demo")}>Try the demo</button>}
        </nav>
      </header>

      <Hero />
      <Actions />
      <Features />
      <HowItWorks />
      {demo && <DemoPanel />}

      <footer className="h-foot">
        <span className="h-foot-brand">
          <Sprinty size={28} still /> Brain Sprint
        </span>
        <span>Learning your team actually plays.</span>
        <span className="h-foot-links">
          <a href="#/join">Join a game</a>
          <a href="#/vote">Vote</a>
          <a className="h-super" href="#/super">Super admin</a>
        </span>
      </footer>
    </div>
  );
}

/* ---------------- hero ---------------- */
function Hero() {
  return (
    <section className="h-hero">
      <div className="h-hero-copy">
        <span className="h-tag">Daily sprints · Live games · Polls</span>
        <h1 className="h-mega">
          Learning your team <span className="ink">actually plays.</span>
        </h1>
        <p className="h-sub">
          Two-minute daily quizzes, Kahoot-style live games and instant polls — under your company's own name and colours. Staff compete for coins and streaks; you see exactly where the knowledge gaps are.
        </p>
        <div className="h-hero-cta">
          <button type="button" className="btn primary" onClick={() => jump("join-box", "h-pin")}>Join a game</button>
          <button type="button" className="btn white" onClick={() => jump("company-box", "h-co")}>Go to your company</button>
        </div>
      </div>
      <div className="h-stage" aria-hidden="true">
        <span className="h-scribble">no boring e-learning!</span>
        <div className="h-float h-f1">
          <b>+150</b> pts · speed bonus
        </div>
        <div className="h-float h-f2">
          <Icon.fire /> 12-day streak
        </div>
        <div className="h-board">
          <span className="h-board-h">Branch Battle</span>
          {[
            ["City", 92],
            ["Harbour", 81],
            ["Airport", 67],
          ].map(([n, v], i) => (
            <div key={n} className="h-board-r">
              <span className="h-board-n">{i + 1}</span>
              <span className="h-board-l">{n}</span>
              <span className="h-board-t"><span style={{ width: `${v}%` }} /></span>
            </div>
          ))}
        </div>
        <div className="h-lineup">
          <Chibi look={1} variant="full" mood="happy" size={132} />
          <Sprinty mood="cheer" size={150} />
          <Chibi look={8} variant="full" mood="idle" size={132} />
        </div>
      </div>
    </section>
  );
}

/* ---------------- three big actions ---------------- */
function Actions() {
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [co, setCo] = useState("");
  const [coErr, setCoErr] = useState("");
  const slug = slugFrom(co);
  const goCo = (admin: boolean) => {
    if (!SLUG_OK.test(slug)) return setCoErr("Type your company's web address, like acme-bank.");
    setCoErr("");
    nav(admin ? { r: "admin", slug } : { r: "tenant", slug });
  };
  return (
    <section className="h-actions" aria-label="Get started">
      <form
        id="join-box"
        className="h-act h-act-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.length === 6) nav({ r: "join", pin });
        }}
      >
        <ActHead n="1" title="Join a live game" sub="Got a game PIN on the big screen? Type it here." />
        <label className="sr" htmlFor="h-pin">Game PIN</label>
        <input
          id="h-pin"
          className="h-pin num"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000000"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button className="btn lime block" disabled={pin.length !== 6}>Enter game</button>
      </form>

      <form
        className="h-act h-act-vote"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) nav({ r: "vote", code });
        }}
      >
        <ActHead n="2" title="Vote in a poll" sub="Town hall or training? Enter the poll code to have your say." />
        <label className="sr" htmlFor="h-code">Poll code</label>
        <input
          id="h-code"
          className="h-pin num"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000000"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button className="btn white block" disabled={code.length !== 6}>Vote now</button>
      </form>

      <form
        id="company-box"
        className="h-act h-act-co"
        onSubmit={(e) => {
          e.preventDefault();
          goCo(false);
        }}
        noValidate
      >
        <ActHead n="3" title="Go to your company" sub="Play today's sprint, see your leaderboard, or manage your team." />
        <label className="h-co-lbl" htmlFor="h-co">Company web address</label>
        <div className="h-co">
          <span>/t/</span>
          <input
            id="h-co"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="your-company"
            value={co}
            onChange={(e) => {
              setCo(e.target.value);
              setCoErr("");
            }}
          />
        </div>
        {coErr && <p className="err" role="alert">{coErr}</p>}
        <div className="h-co-btns">
          <button className="btn primary">Open</button>
          <button type="button" className="btn ghost" onClick={() => goCo(true)}>
            <Icon.lock /> Admin sign-in
          </button>
        </div>
      </form>
    </section>
  );
}

function ActHead({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="h-act-h">
      <span className="h-act-n">{n}</span>
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}

/* ---------------- features ---------------- */
const FEATURES: { k: string; t: string; d: string; c: string; art: ReactNode }[] = [
  { k: "sprint", t: "Daily Sprint", d: "Bite-size quizzes with coins, streaks, levels and a cartoon character everyone wants to dress up.", c: "lime", art: <ArtSprint /> },
  { k: "live", t: "Live Quiz", d: "Host a game on the big screen; everyone joins with a PIN on their phone. Fastest right answer wins.", c: "ink", art: <ArtLive /> },
  { k: "polls", t: "Live Polls", d: "Word clouds, ratings, rankings and Q&A for town halls and trainings — results appear as people vote.", c: "orange", art: <ArtPoll /> },
  { k: "cert", t: "Certification", d: "Timed exams with a pass mark, limited attempts and a printable certificate with expiry.", c: "blue", art: <ArtCert /> },
  { k: "gap", t: "Analytics & gap trend", d: "See weak topics by branch and department, and whether each gap is closing week by week.", c: "paper", art: <ArtTrend /> },
  { k: "sec", t: "Bank-grade security", d: "Answers are scored on the server, never sent to phones. Roles, two-step sign-in, maker-checker and full audit logs.", c: "pink", art: <ArtShield /> },
  { k: "wl", t: "White-label", d: "Your product name, logo and colours on every screen — players, admins, big screens and certificates.", c: "yellow", art: <ArtBrand /> },
];

function Features() {
  return (
    <section className="h-sec" aria-labelledby="h-feat">
      <div className="h-sec-h">
        <h2 id="h-feat">Everything your team needs to learn</h2>
        <p>One app for daily practice, big-room energy and proof of competence.</p>
      </div>
      <div className="h-feats">
        {FEATURES.map((f) => (
          <article key={f.k} className={`h-feat c-${f.c}`}>
            <div className="h-feat-art">{f.art}</div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: [string, string, ReactNode][] = [
    ["Your company gets its own address", "Branded with your name, logo and colours. Add your branches or locations and departments.", <Chibi key="a" look={4} mood="happy" size={72} />],
    ["Staff play two minutes a day", "Employee ID, email code or Microsoft sign-in. No app to install — it runs in the browser.", <Chibi key="b" look={11} mood="cheer" size={72} />],
    ["You close the gaps", "Spot weak topics by team, re-train with a live game, and watch the trend improve.", <Chibi key="c" look={5} mood="idle" size={72} />],
  ];
  return (
    <section className="h-sec" aria-labelledby="h-how">
      <div className="h-sec-h">
        <h2 id="h-how">How it works</h2>
      </div>
      <ol className="h-steps">
        {steps.map(([t, d, art], i) => (
          <li key={t}>
            <span className="h-step-n">{i + 1}</span>
            {art}
            <div>
              <b>{t}</b>
              <p>{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------- demo tour ---------------- */
function DemoPanel() {
  const { api } = useApi();
  const [pubs, setPubs] = useState<Record<string, TenantPublic | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all(["harbor", "northwind"].map((s) => api.tenantBySlug(s).then((p) => [s, p] as const, () => [s, null] as const))).then((xs) => setPubs(Object.fromEntries(xs)));
  }, [api]);
  const reset = async () => {
    if (!confirm("Reset the demo? Everything you changed in this browser is wiped and the demo companies are restored.")) return;
    setBusy(true);
    const { resetDemo } = await import("../api/demo");
    await resetDemo();
    location.hash = "#/";
    location.reload();
  };
  const hb = pubs.harbor;
  const nw = pubs.northwind;
  return (
    <section className="h-sec h-demo" id="demo" aria-labelledby="h-demo-t">
      <div className="h-sec-h">
        <h2 id="h-demo-t">Try the demo</h2>
        <p>Everything runs in this browser — nothing is sent anywhere. Open a player tab and an admin tab side by side to see it live.</p>
      </div>
      <div className="h-demo-grid">
        <DemoCard
          name={hb?.name.replace(" (demo)", "") || "Harbor Bank"}
          product={hb?.branding.productName || "Harbor Academy"}
          kind="Bank template"
          colors={hb ? [hb.branding.primary, hb.branding.accent, hb.branding.ink] : ["#5EEAD4", "#EA580C", "#0B1B2B"]}
          missing={hb === null}
        >
          <DemoLink href="#/t/harbor" t="Player app" d={<>Sign in with Employee ID <b>DEMO-101</b></>} />
          <DemoLink href="#/t/harbor/admin" t="Admin portal" d={<><b>{DEMO_ADMINS.harbor}</b> · {DEMO_PASSWORD}</>} />
          <DemoLink href="#/vote/482913" t="Vote in the town hall poll" d={<>Poll code <b className="num">482913</b></>} />
          <div className="h-howto">
            <b>Run a live game</b>
            <ol>
              <li>Open the admin portal → <b>Live</b> → start a game.</li>
              <li>In another tab, open <a className="link" href="#/join" target="_blank" rel="noopener">Join a game</a> and type the PIN.</li>
              <li>Press <b>Start</b> on the host screen and play.</li>
            </ol>
          </div>
        </DemoCard>
        <DemoCard
          name={nw?.name.replace(" (demo)", "") || "Northwind Traders"}
          product={nw?.branding.productName || "Brain Sprint"}
          kind="Generic template"
          colors={nw ? [nw.branding.primary, nw.branding.accent, nw.branding.ink] : ["#C6F432", "#FF5A1F", "#161512"]}
          missing={nw === null}
        >
          <DemoLink href="#/t/northwind" t="Player app" d="Pick a character and play today's sprint" />
          <DemoLink href="#/t/northwind/admin" t="Admin portal" d={<><b>{DEMO_ADMINS.northwind}</b> · {DEMO_PASSWORD}</>} />
        </DemoCard>
        <article className="h-dcard h-dcard-super">
          <div className="h-dcard-h">
            <span className="h-dcard-ic"><Icon.shield /></span>
            <div>
              <b>Super admin console</b>
              <span>Create companies, brand them, manage the starter library</span>
            </div>
          </div>
          <dl className="h-creds">
            <dt>Email</dt><dd>{DEMO_SUPER}</dd>
            <dt>Password</dt><dd>{DEMO_PASSWORD}</dd>
            <dt>Super code</dt><dd>Sandeepa</dd>
          </dl>
          <a className="btn lime block" href="#/super">Open the console</a>
          <p className="fine">You'll be asked to change the starting code — in the demo you can skip that.</p>
        </article>
      </div>
      <div className="h-reset">
        <span>Made a mess? Start over with fresh demo data.</span>
        <button className="btn ghost small" onClick={reset} disabled={busy}>
          {busy ? "Resetting…" : "Reset demo data"}
        </button>
      </div>
    </section>
  );
}

function DemoCard({ name, product, kind, colors, missing, children }: { name: string; product: string; kind: string; colors: string[]; missing?: boolean; children: ReactNode }) {
  return (
    <article className="h-dcard">
      <div className="h-dcard-h">
        <span className="h-sw" aria-hidden="true">
          {colors.map((c) => <i key={c} style={{ background: c }} />)}
        </span>
        <div>
          <b>{name}</b>
          <span>{product} · {kind}</span>
        </div>
      </div>
      {missing ? <p className="fine">This demo company was deleted. Reset the demo to bring it back.</p> : <div className="h-dlinks">{children}</div>}
    </article>
  );
}

function DemoLink({ href, t, d }: { href: string; t: string; d: ReactNode }) {
  return (
    <a className="h-dlink" href={href}>
      <span>
        <b>{t}</b>
        <small>{d}</small>
      </span>
      <span className="h-arrow" aria-hidden="true">→</span>
    </a>
  );
}

/* ---------------- tiny feature illustrations ---------------- */
function ArtSprint() {
  return (
    <svg viewBox="0 0 120 80">
      <rect x="10" y="10" width="70" height="60" rx="12" fill="#161512" />
      <rect x="18" y="20" width="44" height="6" rx="3" fill="#C6F432" />
      <rect x="18" y="32" width="54" height="8" rx="4" fill="#FFFEFA" />
      <rect x="18" y="44" width="54" height="8" rx="4" fill="#C6F432" />
      <rect x="18" y="56" width="54" height="8" rx="4" fill="#FFFEFA" opacity=".6" />
      <circle cx="92" cy="30" r="14" fill="#FFD84D" stroke="#C99A12" strokeWidth="3" />
      <path d="M92 23v14M88 27h6a2.5 2.5 0 0 1 0 5h-4a2.5 2.5 0 0 0 0 5h6" stroke="#8A5E00" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M100 62c0-8 6-9 6-16 3 4 6 7 6 13a6 6 0 0 1-12 3z" fill="#FF5A1F" />
    </svg>
  );
}
function ArtLive() {
  return (
    <svg viewBox="0 0 120 80">
      <rect x="8" y="8" width="78" height="50" rx="8" fill="#C6F432" />
      <text x="47" y="40" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="20" fill="#161512">482 913</text>
      <rect x="40" y="58" width="14" height="10" fill="#C6F432" />
      <rect x="30" y="68" width="34" height="4" rx="2" fill="#C6F432" />
      <rect x="92" y="30" width="22" height="40" rx="5" fill="#FFFEFA" />
      <rect x="96" y="38" width="14" height="6" rx="2" fill="#FF5A1F" />
      <rect x="96" y="47" width="14" height="6" rx="2" fill="#3D7BFF" />
      <rect x="96" y="56" width="14" height="6" rx="2" fill="#C6F432" />
    </svg>
  );
}
function ArtPoll() {
  return (
    <svg viewBox="0 0 120 80">
      <text x="10" y="30" fontFamily="Anton, Impact, sans-serif" fontSize="22" fill="#FFFEFA">trust</text>
      <text x="62" y="24" fontFamily="Figtree, sans-serif" fontWeight="800" fontSize="12" fill="#161512">speed</text>
      <text x="64" y="44" fontFamily="Anton, Impact, sans-serif" fontSize="17" fill="#161512">team</text>
      <text x="12" y="48" fontFamily="Figtree, sans-serif" fontWeight="800" fontSize="11" fill="#FFE2D4">clarity</text>
      {[40, 58, 28, 50].map((h, i) => (
        <rect key={i} x={14 + i * 22} y={76 - h * 0.4} width="14" height={h * 0.4} rx="3" fill={i === 1 ? "#161512" : "#FFFEFA"} />
      ))}
    </svg>
  );
}
function ArtCert() {
  return (
    <svg viewBox="0 0 120 80">
      <rect x="12" y="10" width="76" height="56" rx="6" fill="#FFFEFA" />
      <rect x="22" y="20" width="44" height="6" rx="3" fill="#161512" />
      <rect x="22" y="32" width="56" height="4" rx="2" fill="#D3E2FF" />
      <rect x="22" y="40" width="40" height="4" rx="2" fill="#D3E2FF" />
      <circle cx="92" cy="52" r="15" fill="#FFD84D" stroke="#161512" strokeWidth="2.5" />
      <path d="M85 52l5 5 9-10" stroke="#161512" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M84 64l-4 12 7-4 4 6 3-11M100 64l4 12-7-4-4 6" fill="#FF5A1F" />
    </svg>
  );
}
function ArtTrend() {
  return (
    <svg viewBox="0 0 120 80">
      <path d="M10 70H112" stroke="#D8D6CE" strokeWidth="2" />
      <path d="M10 50H112M10 30H112" stroke="#D8D6CE" strokeWidth="1" strokeDasharray="3 4" />
      <path d="M12 60 L34 54 L56 46 L78 34 L100 20" stroke="#161512" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[[12, 60], [34, 54], [56, 46], [78, 34], [100, 20]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="4.5" fill="#C6F432" stroke="#161512" strokeWidth="2" />
      ))}
      <rect x="66" y="52" width="42" height="14" rx="7" fill="#DDF3E3" />
      <text x="87" y="62.5" textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="900" fontSize="9" fill="#1E6E36">+18 pts</text>
    </svg>
  );
}
function ArtShield() {
  return (
    <svg viewBox="0 0 120 80">
      <path d="M60 6l30 11v20c0 19-13 31-30 37C43 68 30 56 30 37V17z" fill="#161512" />
      <path d="M60 14l22 8v15c0 14-9 23-22 28-13-5-22-14-22-28V22z" fill="#FF7EB6" />
      <rect x="49" y="34" width="22" height="18" rx="4" fill="#161512" />
      <path d="M53 34v-5a7 7 0 0 1 14 0v5" stroke="#161512" strokeWidth="3.5" fill="none" />
      <circle cx="60" cy="43" r="2.6" fill="#FFD6E8" />
    </svg>
  );
}
function ArtBrand() {
  return (
    <svg viewBox="0 0 120 80">
      <rect x="10" y="12" width="44" height="58" rx="9" fill="#161512" />
      <rect x="15" y="20" width="34" height="14" rx="5" fill="#C6F432" />
      <rect x="15" y="38" width="34" height="8" rx="4" fill="#FF5A1F" />
      <rect x="64" y="12" width="44" height="58" rx="9" fill="#0B1B2B" />
      <rect x="69" y="20" width="34" height="14" rx="5" fill="#5EEAD4" />
      <rect x="69" y="38" width="34" height="8" rx="4" fill="#EA580C" />
      <path d="M52 58 q6 -10 14 0" stroke="#161512" strokeWidth="2.5" fill="none" strokeLinecap="round" markerEnd="" />
      <path d="M62 54l4 4-5 2" stroke="#161512" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
