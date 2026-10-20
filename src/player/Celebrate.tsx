/* Celebration screen 2.0: right after a sprint, a spotlight stage. The player's character and the
   mascots dance, a "+points" pill pops in, stickers slap on, then Continue to rank / See my scorecard.
   Shown once per finished play (fresh results); tap Skip or press Esc to go straight to the scorecard. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Chibi, Mascot } from "../components/Chibi";
import { CountUp, confetti } from "../components/ui";
import type { Equipped } from "../types";
import "../styles/celebrate.css";

export interface CelebrateProps {
  name: string;
  look: number;
  equipped?: Equipped;
  points: number;
  correct: number;
  total: number;
  acc: number;
  coins: number | null; // null when coins are off
  streak: number; // 0 when streaks are off
  rank: number; // in this quiz, 0 = unknown
  perfect: boolean;
  onRank: () => void;
  onScorecard: () => void;
}

const LINES: [number, string, string][] = [
  [100, "Flawless!", "Every single answer right."],
  [90, "Legend status!", "That's top-of-the-class stuff."],
  [70, "Great run!", "You really know this."],
  [50, "Solid effort!", "Halfway there and climbing."],
  [0, "Nice try!", "Every miss is a lesson — check the tips."],
];

export function Celebrate(p: CelebrateProps) {
  const [, head, sub] = LINES.find(([min]) => p.acc >= min) || LINES[LINES.length - 1];
  const good = p.acc >= 50;
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.body.classList.add("cb-open");
    primary.current?.focus();
    const t = good ? setTimeout(() => confetti(160), 650) : undefined;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onScorecard();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("cb-open");
      if (t) clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mood = p.acc >= 70 ? "cheer" : p.acc >= 40 ? "happy" : "think";

  return createPortal(
    <div className={`cb ${good ? "good" : "meh"}`} role="dialog" aria-modal="true" aria-label={`${head} ${p.points} points`}>
      <div className="cb-bg" aria-hidden="true">
        <i className="cb-beam l" />
        <i className="cb-beam r" />
        <i className="cb-glow" />
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className="cb-spark" style={{ ["--i" as string]: i }} />
        ))}
      </div>

      <button type="button" className="cb-skip" onClick={p.onScorecard}>Skip</button>

      <div className="cb-pill num" aria-hidden="true">
        +<CountUp to={p.points} ms={1100} /> <span>PTS!</span>
      </div>

      <div className="cb-stage" aria-hidden="true">
        {good && <Mascot who="explorer" mood="cheer" size={92} className="cb-side l" />}
        <div className="cb-hero">
          <Chibi look={p.look} equipped={p.equipped} variant="full" size={170} mood={mood} />
          {p.perfect && <span className="cb-sticker s1">PERFECT!</span>}
          {p.rank === 1 && <span className="cb-sticker s2">#1 SO FAR</span>}
          {!p.perfect && p.streak >= 3 && <span className="cb-sticker s3">🔥 {p.streak}-DAY STREAK</span>}
        </div>
        {good && <Mascot who="puff" mood="happy" size={84} className="cb-side r" />}
        <i className="cb-floor" />
      </div>

      <h1 className="cb-head">{head}</h1>
      <p className="cb-sub">{sub}</p>

      <div className="cb-dots" aria-label={`${p.correct} of ${p.total} correct`}>
        {Array.from({ length: p.total }, (_, i) => (
          <i key={i} className={i < p.correct ? "ok" : ""} style={{ ["--i" as string]: i }} />
        ))}
      </div>

      <ul className="cb-stats">
        <li><b className="num">{p.correct}/{p.total}</b><span>correct</span></li>
        <li><b className="num">{p.acc}%</b><span>accuracy</span></li>
        {p.coins != null && <li><b className="num">+{p.coins}</b><span>coins</span></li>}
        {p.rank > 0 && <li><b className="num">#{p.rank}</b><span>in this quiz</span></li>}
      </ul>

      <div className="cb-acts">
        <button ref={primary} type="button" className="btn lime cb-go" onClick={p.onRank}>Continue to rank 🏆</button>
        <button type="button" className="btn cb-ghost" onClick={p.onScorecard}>See my scorecard</button>
      </div>
      <span className="sr" aria-live="polite">{`${head} ${p.points} points, ${p.correct} of ${p.total} correct.`}</span>
    </div>,
    document.body,
  );
}
