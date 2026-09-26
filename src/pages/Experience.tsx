/* =====================================================================
   Experience (#/experience): a hands-on tour of the product. Everything
   here runs on the in-browser demo backend — changes stay in this
   browser's localStorage and never reach the database. On a live site
   the first click switches this browser into the demo sandbox.
   ===================================================================== */
import { useEffect, useState, type ReactNode } from "react";
import { useApi } from "../app/ApiCtx";
import { HAS_LIVE_BACKEND, enterSandbox, exitSandbox } from "../app/sandbox";
import { Chibi } from "../components/Chibi";
import { Icon } from "../components/ui";
import type { TenantPublic } from "../types";
import { DEMO_ADMINS, DEMO_PASSWORD, DEMO_SUPER } from "./demoHints";
import { DemoHref, SiteFooter, SiteHeader, jump, useInDemo } from "./site";

export function Experience() {
  const inDemo = useInDemo();
  return (
    <div className="home">
      <SiteHeader />
      <section className="h-exp-hero">
        <div className="h-exp-copy">
          <span className="h-tag">Hands-on · no sign-up</span>
          <h1 className="h-page-title">
            Experience it <span className="ink">in 30 seconds.</span>
          </h1>
          <p className="h-sub">
            Play as an employee, run the admin portal, host a live game and vote in a poll — with two ready-made demo companies. It all runs in your browser:
            <b> nothing you do here is saved to our servers.</b>
          </p>
          <div className="h-hero-cta">
            {HAS_LIVE_BACKEND && !inDemo ? (
              <button type="button" className="btn primary" onClick={() => enterSandbox("#/experience")}>Launch the demo</button>
            ) : (
              <button type="button" className="btn primary" onClick={() => jump("missions")}>Start the tour</button>
            )}
          </div>
          <ul className="h-trust">
            <li><Icon.check /> Private sandbox in your browser</li>
            <li><Icon.check /> Reset any time</li>
            <li><Icon.check /> Works on phone and desktop</li>
          </ul>
        </div>
        <div className="h-exp-art" aria-hidden="true">
          <div className="h-phone">
            <div className="h-phone-top">
              <span className="pill">City Branch</span>
              <span className="pill num"><span className="coin-ic" /> 1,240</span>
            </div>
            <Chibi look={2} variant="full" mood="cheer" size={150} />
            <div className="h-phone-q">
              <b>Today's sprint</b>
              <span>3 questions · 2 min</span>
            </div>
            <span className="h-phone-btn">Play now</span>
          </div>
          <span className="h-scribble">try me!</span>
        </div>
      </section>

      <Missions />
      <LiveGameSteps />
      <Accounts />
      <SiteFooter />
    </div>
  );
}

/* ---------------- missions ---------------- */
interface Mission {
  n: number;
  title: string;
  who: string;
  text: ReactNode;
  href: string;
  cta: string;
  art: ReactNode;
  c: string;
}

function Missions() {
  const list: Mission[] = [
    {
      n: 1, c: "lime", title: "Play today's sprint", who: "As an employee",
      text: <>Sign in with Employee ID <b className="num">DEMO-101</b>, pick a character, answer three quick questions and watch the coins fly.</>,
      href: "#/t/harbor", cta: "Open the player app", art: <Chibi look={0} variant="full" mood="happy" size={96} />,
    },
    {
      n: 2, c: "ink", title: "Run the admin portal", who: "As an L&D admin",
      text: <>See the knowledge-gap dashboard, build a quiz (with images), and manage players. Sign in as <b>{DEMO_ADMINS.harbor}</b> / <b>{DEMO_PASSWORD}</b>.</>,
      href: "#/t/harbor/admin", cta: "Open the admin portal", art: <Chibi look={9} variant="full" mood="think" size={96} />,
    },
    {
      n: 3, c: "orange", title: "Vote in a town hall", who: "As the audience",
      text: <>Poll code <b className="num">482913</b>. Word clouds, ratings and Q&amp;A update as people vote.</>,
      href: "#/vote/482913", cta: "Vote now", art: <Chibi look={4} variant="full" mood="cheer" size={96} />,
    },
    {
      n: 4, c: "blue", title: "Onboard a new client", who: "As the platform owner",
      text: <>Create a company in the super admin console: brand, colours, features and the starter library — in one wizard.</>,
      href: "#/super", cta: "Open the console", art: <Chibi look={13} variant="full" mood="idle" size={96} />,
    },
  ];
  return (
    <section className="h-sec" id="missions" aria-labelledby="h-mis">
      <div className="h-sec-h">
        <span className="h-kicker">The tour</span>
        <h2 id="h-mis">Four missions, five minutes</h2>
        <p>Each one opens a real screen of the product. Open two tabs side by side — a player and an admin — to see changes appear live.</p>
      </div>
      <div className="h-missions">
        {list.map((m) => (
          <article key={m.n} className={`h-mission c-${m.c}`}>
            <div className="h-mission-art">{m.art}</div>
            <div className="h-mission-body">
              <span className="h-mission-n">Mission {m.n} · {m.who}</span>
              <h3>{m.title}</h3>
              <p>{m.text}</p>
              <DemoHref className="btn white small" href={m.href}>
                {m.cta} <span aria-hidden="true">→</span>
              </DemoHref>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LiveGameSteps() {
  const steps: [string, ReactNode][] = [
    ["Start a game", <>Admin portal → <b>Live</b> → pick a quiz → <b>Host</b>. A big-screen view opens with a game PIN.</>],
    ["Join from a phone", <>Open <DemoHref className="link" href="#/join" newTab>Join a game</DemoHref> in another tab (or on your phone) and type the PIN.</>],
    ["Play", <>Press <b>Start</b> on the host screen. Fastest right answer wins — podium and confetti included.</>],
  ];
  return (
    <section className="h-sec h-live-steps" aria-labelledby="h-lg">
      <div className="h-sec-h">
        <span className="h-kicker">Big-room energy</span>
        <h2 id="h-lg">Host a live game</h2>
      </div>
      <ol className="h-steps">
        {steps.map(([t, d], i) => (
          <li key={t}>
            <span className="h-step-n">{i + 1}</span>
            <Chibi look={[3, 12, 7][i]} mood={i === 2 ? "cheer" : "happy"} size={72} />
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

/* ---------------- accounts & reset ---------------- */
function Accounts() {
  const { api } = useApi();
  const inDemo = useInDemo();
  const [pubs, setPubs] = useState<Record<string, TenantPublic | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!inDemo) return; // the demo companies only exist in the in-browser backend
    Promise.all(["harbor", "northwind"].map((s) => api.tenantBySlug(s).then((p) => [s, p] as const, () => [s, null] as const))).then((xs) => setPubs(Object.fromEntries(xs)));
  }, [api, inDemo]);
  const reset = async () => {
    if (!confirm("Reset the demo? Everything you changed in this browser is wiped and the demo companies are restored.")) return;
    setBusy(true);
    const { resetDemo } = await import("../api/demo");
    await resetDemo();
    location.hash = "#/experience";
    location.reload();
  };
  const hb = pubs.harbor;
  const nw = pubs.northwind;
  return (
    <section className="h-sec h-demo" id="demo" aria-labelledby="h-demo-t">
      <div className="h-sec-h">
        <span className="h-kicker">Demo accounts</span>
        <h2 id="h-demo-t">Two companies, ready to go</h2>
        <p>
          Two sample companies, each with its own brand, players and quizzes. Everything runs in this browser — nothing is sent to a server.
        </p>
      </div>
      <div className="h-demo-grid">
        <DemoCard
          name={hb?.name.replace(" (demo)", "") || "Harbor Bank"}
          product={hb?.branding.productName || "Harbor Academy"}
          kind="Financial services template"
          colors={hb ? [hb.branding.primary, hb.branding.accent, hb.branding.ink] : ["#5EEAD4", "#EA580C", "#0B1B2B"]}
          missing={hb === null}
        >
          <DemoLink href="#/t/harbor" t="Player app" d={<>Sign in with Employee ID <b>DEMO-101</b></>} />
          <DemoLink href="#/t/harbor/admin" t="Admin portal" d={<><b>{DEMO_ADMINS.harbor}</b> · {DEMO_PASSWORD}</>} />
          <DemoLink href="#/vote/482913" t="Vote in the town hall poll" d={<>Poll code <b className="num">482913</b></>} />
        </DemoCard>
        <DemoCard
          name={nw?.name.replace(" (demo)", "") || "Northwind Traders"}
          product={nw?.branding.productName || "Ant Arena"}
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
              <span>Create companies, brand them and choose their features</span>
            </div>
          </div>
          <dl className="h-creds">
            <dt>Email</dt><dd>{DEMO_SUPER}</dd>
            <dt>Password</dt><dd>{DEMO_PASSWORD}</dd>
            <dt>Super code</dt><dd>Sandeepa</dd>
          </dl>
          <DemoHref className="btn lime block" href="#/super">Open the console</DemoHref>
          <p className="fine">You'll be asked to change the starting code — in the demo you can skip that.</p>
        </article>
      </div>
      <div className="h-reset">
        {inDemo ? (
          <>
            <span>Made a mess? Start over with fresh demo data.</span>
            <span className="row">
              <button className="btn ghost small" onClick={reset} disabled={busy}>
                {busy ? "Resetting…" : "Reset demo data"}
              </button>
              {HAS_LIVE_BACKEND && (
                <button className="btn ghost small" onClick={() => exitSandbox()}>Exit demo</button>
              )}
            </span>
          </>
        ) : (
          <>
            <span>Clicking any link above switches this browser to a private demo sandbox.</span>
            <button className="btn lime small" onClick={() => enterSandbox("#/experience")}>Launch the demo</button>
          </>
        )}
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
    <DemoHref className="h-dlink" href={href}>
      <span>
        <b>{t}</b>
        <small>{d}</small>
      </span>
      <span className="h-arrow" aria-hidden="true">→</span>
    </DemoHref>
  );
}
