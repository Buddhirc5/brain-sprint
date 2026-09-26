/* Marketing block for the Knowledge World add-on (landing + experience pages).
   The pictures are real in-game screenshots. */
import downtown from "../assets/world/downtown.jpg";
import race from "../assets/world/race.jpg";

export function WorldTeaser() {
  return (
    <section className="h-world" aria-labelledby="h-world-t">
      <div className="h-world-copy">
        <span className="h-kicker">New · optional add-on</span>
        <h2 id="h-world-t">Knowledge World</h2>
        <p>
          A hand-made papercraft city for a well-earned break. Your own cartoon character runs and jumps across rooftops, picks one of three cars and races
          Sprinty over the hills, popping knowledge bubbles for bonus trivia along the way. Arrow keys and space on desktop, big thumb buttons on phones.
        </p>
        <ul className="h-world-list">
          <li><b>Explore</b> six districts, from Downtown to Lighthouse Point</li>
          <li><b>Race</b> Sprinty in a hatchback, sports car or big-wheel buggy</li>
          <li><b>Learn</b> by popping floating knowledge bubbles</li>
          <li><b>Switch it on</b> per company — admins decide</li>
        </ul>
        <div className="h-hero-cta">
          <a className="btn lime" href="#/world">Take it for a spin</a>
        </div>
      </div>
      <div className="h-world-art">
        <img className="h-world-shot" src={downtown} alt="Knowledge World: a cartoon character jumping past the Break Café in a papercraft downtown" loading="lazy" width={1200} height={675} />
        <img className="h-world-shot2" src={race} alt="Racing Sprinty over Hill Raceway at sunset" loading="lazy" width={1200} height={675} />
      </div>
    </section>
  );
}
