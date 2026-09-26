/* #/world — public preview of Knowledge World (pick a character, then play).
   Inside a company, players reach it from their lobby when an admin has switched it on. */
import { lazy, Suspense, useState } from "react";
import "../styles/home.css";
import { Chibi, lookCount } from "../components/Chibi";
import { Loading } from "../App";
import { SiteFooter, SiteHeader } from "../pages/site";
import { LS } from "../lib/util";

const WorldView = lazy(() => import("./WorldView").then((m) => ({ default: m.WorldView })));
const LOOK_KEY = "bsx.world.look";

export function WorldPage() {
  const [look, setLook] = useState<number>(() => {
    const v = Number(LS.get(LOOK_KEY));
    return Number.isFinite(v) ? v : 0;
  });
  const [playing, setPlaying] = useState(false);
  const pick = (i: number) => {
    setLook(i);
    LS.set(LOOK_KEY, String(i));
  };
  if (playing)
    return (
      <Suspense fallback={<Loading text="Building the city…" />}>
        <WorldView look={look} onExit={() => setPlaying(false)} />
      </Suspense>
    );
  return (
    <div className="home">
      <SiteHeader />
      <section className="h-world kw-intro">
        <div className="h-world-copy">
          <span className="h-kicker">Knowledge World · preview</span>
          <h1 className="h-page-title" style={{ color: "#fff" }}>
            Take a <span className="ink" style={{ color: "var(--lime)" }}>break.</span>
          </h1>
          <p>
            Pick a character and step into a papercraft city. Run and jump across Downtown's rooftops, pick a car at the lot, race Sprinty over Hill Raceway and pop the
            floating <b>?</b> bubbles for quick trivia. Nothing here is saved to a server — it's just for fun.
          </p>
          <ul className="h-world-list">
            <li><b>Desktop:</b> ← → to move · Space to jump (hold for higher) or boost · E to get in and out · Esc to pause</li>
            <li><b>Phone:</b> ◀ ▶ buttons to move · big buttons to jump, boost and drive — best held sideways</li>
          </ul>
          <div className="h-hero-cta">
            <button type="button" className="btn lime" onClick={() => setPlaying(true)}>Play now</button>
          </div>
        </div>
        <div className="kw-pick" role="radiogroup" aria-label="Choose your character">
          <div className="kw-pick-hero">
            <Chibi look={look} variant="full" mood="cheer" size={170} />
          </div>
          <div className="kw-pick-grid">
            {Array.from({ length: lookCount }, (_, i) => (
              <button key={i} type="button" role="radio" aria-checked={look === i} aria-label={`Character ${i + 1}`} className={look === i ? "on" : ""} onClick={() => pick(i)}>
                <Chibi look={i} size={46} still />
              </button>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
