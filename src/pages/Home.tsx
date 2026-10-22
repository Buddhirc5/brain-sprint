/* =====================================================================
   The public landing page (#/): what Ant Arena is and why a company
   should buy it. Trying it lives on #/experience; joining a game, voting
   and company sign-in live on #/signin (both in the top bar).
   ===================================================================== */
import { useEffect, useState, type ReactNode } from "react";
import { Chibi, Mascot } from "../components/Chibi";
import { Icon } from "../components/ui";
import { CONTACT_EMAIL, SiteFooter, SiteHeader } from "./site";
import type { Section } from "../app/router";
import { FAQ } from "./faq";
import { SECTION_META } from "./seo";
import { SECTIONS } from "../app/router";

/** Fades sections up as they scroll into view. Sections already on screen stay put (no flicker),
 *  and nothing is hidden without JavaScript or when reduced motion is requested. */
function useReveal() {
  useEffect(() => {
    const all = [...document.querySelectorAll<HTMLElement>(".rv:not(.in)")];
    all.forEach((e) => e.getBoundingClientRect().top < innerHeight && e.classList.add("in"));
    const els = all.filter((e) => !e.classList.contains("in"));
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return els.forEach((e) => e.classList.add("in"));
    document.documentElement.classList.add("rv-on");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  // characters only animate while on screen: their SVG animations repaint every frame
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("paused", !e.isIntersecting)), { rootMargin: "120px 0px" });
    document.querySelectorAll(".home .chibi").forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

export function Home({ section, page }: { section?: Section; page?: Section } = {}) {
  if (page) return <SectionPage section={page} />;
  return <Landing section={section} />;
}

function Landing({ section }: { section?: Section }) {
  useReveal();
  // #/features, #/faq … open the landing page scrolled to that section
  useEffect(() => {
    if (!section) return;
    const t = window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => window.clearTimeout(t);
  }, [section]);
  return (
    <div className="home">
      <SiteHeader />
      <Hero />
      <Ticker />
      <Proof />
      <BeforeAfter />
      <Features />
      <UseCases />
      <HowItWorks />
      <Security />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

/* ---------------- a page of its own for each section (/features, /faq …) ---------------- */
const SECTION_BODY: Record<Section, () => JSX.Element> = {
  features: Features,
  "how-it-works": HowItWorks,
  "use-cases": UseCases,
  security: Security,
  faq: Faq,
};
const SECTION_LABEL: Record<Section, string> = { features: "Features", "how-it-works": "How it works", "use-cases": "Who it's for", security: "Security", faq: "FAQ" };

function SectionPage({ section }: { section: Section }) {
  useReveal();
  const m = SECTION_META[section];
  const Body = SECTION_BODY[section];
  return (
    <div className="home h-page">
      <SiteHeader />
      <section className="h-page-hero">
        <nav className="h-crumbs" aria-label="Breadcrumb">
          <a href="/">Home</a> <span aria-hidden="true">›</span> <span aria-current="page">{SECTION_LABEL[section]}</span>
        </nav>
        <span className="h-tag">{m.tag}</span>
        <h1 className="h-page-h1">{m.h1}</h1>
        <p className="h-sub">{m.lead}</p>
        <div className="h-hero-cta">
          <a className="btn primary" href="#/experience">Try it free — no sign-up</a>
          {CONTACT_EMAIL || section !== "features" ? <SalesCta /> : <a className="btn white" href="/how-it-works">How it works</a>}
        </div>
      </section>
      <Body />
      <nav className="h-more" aria-label="More about Ant Arena">
        <b>More about Ant Arena</b>
        {SECTIONS.filter((s) => s !== section).map((s) => (
          <a key={s} href={SECTION_META[s].path}>{SECTION_LABEL[s]} →</a>
        ))}
      </nav>
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

function SalesCta({ className = "btn white" }: { className?: string }) {
  return CONTACT_EMAIL ? (
    <a className={className} href="#/contact">Book a demo</a>
  ) : (
    <a className={className} href="#/features">See the features</a>
  );
}

/* ---------------- hero ---------------- */
const HERO_BOARD: [string, string, string, number][] = [
  ["Aisha", "Dubai office", "2,450", 3],
  ["Marco", "Sales · Milan", "2,310", 9],
  ["Kenji", "Support · Tokyo", "2,180", 11],
];
const HERO_CROWD: [number, "cheer" | "happy" | "idle", string][] = [
  [5, "happy", "+50 coins!"],
  [12, "cheer", "7-day streak 🔥"],
  [0, "happy", ""],
];
function Hero() {
  return (
    <section className="h-hero">
      <img
        className="h-hero-bg"
        src="/hero-bg-1600.webp"
        srcSet="/hero-bg-900.webp 900w, /hero-bg-1600.webp 1600w"
        sizes="(min-width: 1440px) 1440px, 100vw"
        width={1600}
        height={1073}
        alt=""
        {...{ fetchpriority: "high" }}
        decoding="async"
      />
      <div className="h-hero-copy">
        <span className="h-tag">Gamified training for global teams</span>
        <h1 className="h-mega">
          Learning your team <span className="ink">actually plays.</span>
        </h1>
        <p className="h-sub">
          Two-minute daily quizzes, big-screen live games, instant polls and certification — under your own brand. Your people compete for coins and streaks. You see
          exactly where the knowledge gaps are, by team, week by week.
        </p>
        <div className="h-hero-cta">
          <a className="btn primary" href="#/experience">Try it free — no sign-up</a>
          <SalesCta />
        </div>
        <ul className="h-trust">
          <li><Icon.check /> No app to install</li>
          <li><Icon.check /> Your logo &amp; colours</li>
          <li><Icon.check /> Enterprise-grade security</li>
        </ul>
        <p className="h-player-links">
          Here to play? <a href="#/join">Join a live game</a> · <a href="#/vote">Vote in a poll</a>
        </p>
      </div>
      <div className="h-stage" aria-hidden="true">
        <div className="h-board">
          <span className="h-board-h"><i className="h-live-dot" /> Live quiz · Round 3</span>
          <ol>
            {HERO_BOARD.map(([name, team, pts, look], i) => (
              <li key={name}>
                <span className="h-board-n">{i + 1}</span>
                <Chibi look={look} mood={i === 0 ? "cheer" : "happy"} size={38} still />
                <span className="h-board-who"><b>{name}</b><small>{team}</small></span>
                <b className="h-board-pts">{pts}</b>
              </li>
            ))}
          </ol>
        </div>
        <div className="h-crowd">
          {HERO_CROWD.map(([look, mood, bubble], i) => (
            <div key={look} className={`h-pal p${i + 1}`}>
              {bubble && <span className="h-bubble">{bubble}</span>}
              <Chibi look={look} variant="full" mood={mood} size={i === 1 ? 118 : 100} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- scrolling ticker ---------------- */
const TICKER = ["Daily quiz sprints", "Live quiz games", "Word clouds & polls", "Certification exams", "Knowledge-gap analytics", "Coins, streaks & levels", "Team battles", "Your brand, everywhere"];
function Ticker() {
  const row = TICKER.map((t) => (
    <span key={t} className="h-tick">
      {t}
    </span>
  ));
  return (
    <div className="h-ticker" aria-label="What's inside">
      <div className="h-ticker-track">
        <div className="h-ticker-row">{row}</div>
        <div className="h-ticker-row" aria-hidden="true">{row}</div>
      </div>
    </div>
  );
}

/* ---------------- proof strip (product facts) ---------------- */
function Proof() {
  const facts: [string, string][] = [
    ["2 min", "a day is all it takes"],
    ["4-in-1", "sprints, live games, polls & exams"],
    ["0", "answer keys ever sent to phones"],
    ["100%", "your brand on every screen"],
  ];
  return (
    <section className="h-proof rv" aria-label="At a glance">
      {facts.map(([n, t]) => (
        <div key={t}>
          <b>{n}</b>
          <span>{t}</span>
        </div>
      ))}
    </section>
  );
}

/* ---------------- before / after ---------------- */
function BeforeAfter() {
  const before = ["Hour-long modules nobody finishes", "Click-through slides, no idea what stuck", "Annual refreshers, forgotten by Friday", "Reports that only show completion"];
  const after = ["Two-minute sprints people look forward to", "Every answer tagged to a topic and a team", "Little and often — with streaks that stick", "A live map of knowledge gaps, closing week by week"];
  return (
    <section className="h-sec rv" aria-labelledby="h-ba">
      <div className="h-sec-h">
        <span className="h-kicker">Why teams switch</span>
        <h2 id="h-ba">Training people skip vs. a game they play</h2>
      </div>
      <div className="h-ba">
        <div className="h-ba-col h-ba-before">
          <h3>Typical e-learning</h3>
          <ul>{before.map((x) => <li key={x}><Icon.close /> {x}</li>)}</ul>
        </div>
        <div className="h-ba-col h-ba-after">
          <h3>With Ant Arena</h3>
          <ul>{after.map((x) => <li key={x}><Icon.check /> {x}</li>)}</ul>
          <Mascot mood="cheer" size={96} />
        </div>
      </div>
    </section>
  );
}

/* ---------------- features ---------------- */
const FEATURES: { k: string; t: string; d: string; c: string; art: ReactNode }[] = [
  { k: "sprint", t: "Daily Sprint", d: "Bite-size quizzes with coins, streaks, levels and a cartoon character everyone wants to dress up. Add images to any question.", c: "lime", art: <FeatArt k="sprint" /> },
  { k: "live", t: "Live Quiz", d: "Host a game-show on the big screen; everyone joins with a PIN on their phone. Fastest right answer wins.", c: "ink", art: <FeatArt k="live" /> },
  { k: "polls", t: "Live Polls", d: "Word clouds, ratings, rankings and Q&A for town halls and trainings — results appear as people vote.", c: "orange", art: <FeatArt k="polls" /> },
  { k: "cert", t: "Certification", d: "Timed exams with a pass mark, limited attempts and a printable certificate with expiry.", c: "blue", art: <FeatArt k="cert" /> },
  { k: "gap", t: "Analytics & gap trend", d: "See weak topics by team, office and department, and whether each gap is closing week by week.", c: "paper", art: <FeatArt k="trend" /> },
  { k: "sec", t: "Enterprise-grade security", d: "Answers are scored on the server, never sent to phones. Roles, two-step sign-in, maker-checker and full audit logs.", c: "pink", art: <FeatArt k="shield" /> },
  { k: "wl", t: "White-label", d: "Your product name, logo and colours on every screen — players, admins, big screens and certificates.", c: "yellow", art: <FeatArt k="brand" /> },
];

function Features() {
  return (
    <section className="h-sec rv" aria-labelledby="h-feat" id="features">
      <div className="h-sec-h">
        <span className="h-kicker">The platform</span>
        <h2 id="h-feat">Everything your team needs to learn</h2>
        <p>One app for daily practice, big-room energy and proof of competence.</p>
      </div>
      <div className="h-feats">
        {FEATURES.map((f, i) => (
          <article key={f.k} className={`h-feat c-${f.c}`} style={{ ["--i" as string]: i }}>
            <div className="h-feat-art">{f.art}</div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </article>
        ))}
      </div>
      <div className="h-sec-cta">
        <a className="btn ghost" href="#/how-it-works">How it works →</a>
      </div>
    </section>
  );
}

/* ---------------- use cases ---------------- */
function UseCases() {
  const cases: [string, string, number][] = [
    ["HR & Onboarding", "Onboarding, product knowledge and company culture — in two minutes a day instead of a lost afternoon.", 5],
    ["Compliance & Safety", "Data privacy, cyber security, health & safety and code-of-conduct refreshers — with certificates, expiry dates and an audit trail.", 9],
    ["Sales & Customer teams", "Keep every office and region sharp on new products. Team battles turn knowledge into friendly rivalry.", 2],
    ["Leaders & Internal comms", "All-hands polls, anonymous Q&A and live games that get every room — and every video call — talking.", 11],
  ];
  return (
    <section className="h-sec rv" aria-labelledby="h-uc" id="use-cases">
      <div className="h-sec-h">
        <span className="h-kicker">Who it's for</span>
        <h2 id="h-uc">Built for the whole company</h2>
      </div>
      <div className="h-cases">
        {cases.map(([t, d, look]) => (
          <article key={t} className="h-case">
            <Chibi look={look} mood="happy" size={64} />
            <div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: [string, string, ReactNode][] = [
    ["Your company gets its own address", "Branded with your name, logo and colours. Add your offices, regions and departments.", <Chibi key="a" look={4} mood="happy" size={72} />],
    ["Staff play two minutes a day", "Employee ID, email code or Microsoft sign-in. No app to install — it runs in the browser.", <Chibi key="b" look={11} mood="cheer" size={72} />],
    ["You close the gaps", "Spot weak topics by team, re-train with a live game, and watch the trend improve.", <Chibi key="c" look={5} mood="idle" size={72} />],
  ];
  return (
    <section className="h-sec rv" aria-labelledby="h-how" id="how-it-works">
      <div className="h-sec-h">
        <span className="h-kicker">Up and running in a day</span>
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
      <div className="h-sec-cta">
        <a className="btn ghost" href="#/signin">Sign in to your company</a>
      </div>
    </section>
  );
}

/* ---------------- security ---------------- */
function Security() {
  const items: [string, string][] = [
    ["Tenant isolation", "Every company's data is walled off at the database level (row-level security)."],
    ["Server-side scoring", "Answer keys never leave the server, so nobody can cheat from the browser."],
    ["Admin controls", "Five roles, authenticator-app sign-in, maker-checker approvals and idle sign-out."],
    ["Full audit trail", "Every admin action is logged per company, with exportable reports."],
  ];
  return (
    <section className="h-secband rv" aria-labelledby="h-sec-t" id="security">
      <div className="h-secband-h">
        <span className="h-dcard-ic"><Icon.shield /></span>
        <div>
          <span className="h-kicker">Security first</span>
          <h2 id="h-sec-t">Ready for banks. Fine for everyone else.</h2>
        </div>
      </div>
      <div className="h-secgrid">
        {items.map(([t, d]) => (
          <div key={t}>
            <b>{t}</b>
            <p>{d}</p>
          </div>
        ))}
      </div>
      <div className="h-sec-cta">
        <a className="btn ghost" href="#/faq">Read the FAQ</a>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
function Faq() {
  const qs = FAQ;
  const [open, setOpen] = useState(0);
  return (
    <section className="h-sec rv" aria-labelledby="h-faq" id="faq">
      <div className="h-sec-h">
        <span className="h-kicker">FAQ</span>
        <h2 id="h-faq">Questions, answered</h2>
      </div>
      <div className="h-faq">
        {qs.map(([q, a], i) => (
          <div key={q} className={`h-faq-i ${open === i ? "on" : ""}`}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
              <span>{q}</span>
              <span className="h-faq-x" aria-hidden="true">+</span>
            </button>
            <p hidden={open !== i}>{a}</p>
          </div>
        ))}
      </div>
      {CONTACT_EMAIL && (
        <div className="h-faq-more">
          <span>Still curious? Ask us anything — security reviews included.</span>
          <a className="btn ghost small" href="#/contact">Contact sales</a>
        </div>
      )}
    </section>
  );
}

function FinalCta() {
  return (
    <section className="h-final rv">
      <div>
        <h2>Make learning the best two minutes of the day.</h2>
        <p>Try the full product in your browser right now — no sign-up, no credit card.</p>
      </div>
      <div className="h-hero-cta">
        <a className="btn lime" href="#/experience">Try it free</a>
        <SalesCta className="btn ghost h-final-ghost" />
      </div>
      <div className="h-final-art" aria-hidden="true">
        <Chibi look={6} variant="full" mood="cheer" size={120} />
      </div>
    </section>
  );
}

/* ---------------- feature icons (3D toy style, src/assets/feat) ---------------- */
const FEAT = import.meta.glob("../assets/feat/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
function FeatArt({ k }: { k: string }) {
  return <img src={FEAT[`../assets/feat/${k}.webp`]} alt="" width={80} height={80} loading="lazy" decoding="async" />;
}
