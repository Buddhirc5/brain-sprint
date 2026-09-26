/* =====================================================================
   The public landing page (#/): what Brain Sprint is and why a company
   should buy it. Trying it lives on #/experience; joining a game, voting
   and company sign-in live on #/signin (both in the top bar).
   ===================================================================== */
import { useState, type ReactNode } from "react";
import { Chibi, Sprinty } from "../components/Chibi";
import { Icon } from "../components/ui";
import { CONTACT_EMAIL, SiteFooter, SiteHeader, jump } from "./site";
import { WorldTeaser } from "./WorldTeaser";

export function Home() {
  return (
    <div className="home">
      <SiteHeader />
      <Hero />
      <Proof />
      <BeforeAfter />
      <Features />
      <UseCases />
      <WorldTeaser />
      <HowItWorks />
      <Security />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

function SalesCta({ className = "btn white" }: { className?: string }) {
  return CONTACT_EMAIL ? (
    <a className={className} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Brain Sprint demo")}`}>Book a demo</a>
  ) : (
    <button type="button" className={className} onClick={() => jump("features")}>See the features</button>
  );
}

/* ---------------- hero ---------------- */
function Hero() {
  return (
    <section className="h-hero">
      <div className="h-hero-copy">
        <span className="h-tag">The employee learning game</span>
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
          <li><Icon.check /> Bank-grade security</li>
        </ul>
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

/* ---------------- proof strip (product facts) ---------------- */
function Proof() {
  const facts: [string, string][] = [
    ["2 min", "a day is all it takes"],
    ["4-in-1", "sprints, live games, polls & exams"],
    ["0", "answer keys ever sent to phones"],
    ["100%", "your brand on every screen"],
  ];
  return (
    <section className="h-proof" aria-label="At a glance">
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
    <section className="h-sec" aria-labelledby="h-ba">
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
          <h3>With Brain Sprint</h3>
          <ul>{after.map((x) => <li key={x}><Icon.check /> {x}</li>)}</ul>
          <Sprinty mood="cheer" size={96} />
        </div>
      </div>
    </section>
  );
}

/* ---------------- features ---------------- */
const FEATURES: { k: string; t: string; d: string; c: string; art: ReactNode }[] = [
  { k: "sprint", t: "Daily Sprint", d: "Bite-size quizzes with coins, streaks, levels and a cartoon character everyone wants to dress up. Add images to any question.", c: "lime", art: <ArtSprint /> },
  { k: "live", t: "Live Quiz", d: "Host a game-show on the big screen; everyone joins with a PIN on their phone. Fastest right answer wins.", c: "ink", art: <ArtLive /> },
  { k: "polls", t: "Live Polls", d: "Word clouds, ratings, rankings and Q&A for town halls and trainings — results appear as people vote.", c: "orange", art: <ArtPoll /> },
  { k: "cert", t: "Certification", d: "Timed exams with a pass mark, limited attempts and a printable certificate with expiry.", c: "blue", art: <ArtCert /> },
  { k: "gap", t: "Analytics & gap trend", d: "See weak topics by branch and department, and whether each gap is closing week by week.", c: "paper", art: <ArtTrend /> },
  { k: "sec", t: "Bank-grade security", d: "Answers are scored on the server, never sent to phones. Roles, two-step sign-in, maker-checker and full audit logs.", c: "pink", art: <ArtShield /> },
  { k: "wl", t: "White-label", d: "Your product name, logo and colours on every screen — players, admins, big screens and certificates.", c: "yellow", art: <ArtBrand /> },
];

function Features() {
  return (
    <section className="h-sec" aria-labelledby="h-feat" id="features">
      <div className="h-sec-h">
        <span className="h-kicker">The platform</span>
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

/* ---------------- use cases ---------------- */
function UseCases() {
  const cases: [string, string, number][] = [
    ["HR & Learning", "Onboarding, product knowledge and culture — in two minutes a day instead of a lost afternoon.", 5],
    ["Compliance & Risk", "AML, cyber security and policy refreshers with certificates, expiry dates and an audit trail.", 9],
    ["Sales & Service", "Keep every branch sharp on new products. Team battles turn knowledge into friendly rivalry.", 2],
    ["Leaders & Comms", "Town hall polls, anonymous Q&A and live games that get the whole room talking.", 11],
  ];
  return (
    <section className="h-sec" aria-labelledby="h-uc">
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
    ["Your company gets its own address", "Branded with your name, logo and colours. Add your branches or locations and departments.", <Chibi key="a" look={4} mood="happy" size={72} />],
    ["Staff play two minutes a day", "Employee ID, email code or Microsoft sign-in. No app to install — it runs in the browser.", <Chibi key="b" look={11} mood="cheer" size={72} />],
    ["You close the gaps", "Spot weak topics by team, re-train with a live game, and watch the trend improve.", <Chibi key="c" look={5} mood="idle" size={72} />],
  ];
  return (
    <section className="h-sec" aria-labelledby="h-how">
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
    <section className="h-secband" aria-labelledby="h-sec-t">
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
    </section>
  );
}

/* ---------------- FAQ ---------------- */
function Faq() {
  const qs: [string, string][] = [
    ["Do employees need to install an app?", "No. Brain Sprint runs in any modern browser on phones, tablets and computers. Share a link or a QR code and they're in."],
    ["Can we use our own questions?", "Yes. Build quizzes in the admin portal — multiple choice, true/false, matching and ordering, with images — or start from the built-in library."],
    ["How do people sign in?", "With an Employee ID, a 6-digit email code or Microsoft sign-in. Admins can require an authenticator app."],
    ["Does it look like our brand?", "Completely. Your product name, logo and colours appear on every screen, including big screens and certificates."],
    ["What is Knowledge World?", "An optional 3D mini game — explore a city, drive cars, race checkpoints and pop trivia bubbles. Admins switch it on per company."],
    ["Can I try it before talking to anyone?", "Yes. The Experience page opens a private demo that runs entirely in your browser — nothing is saved to our servers."],
  ];
  const [open, setOpen] = useState(0);
  return (
    <section className="h-sec" aria-labelledby="h-faq">
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
            {open === i && <p>{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="h-final">
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
