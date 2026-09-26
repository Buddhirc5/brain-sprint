/* =====================================================================
   Special player characters (original designs, animated with CSS):
   - Wren the explorer: a girl in a big blue hooded cloak, flipping a gold coin
   - Puff the bunny: a round, fluffy bunny hugging a little treasure chest
   Same coordinate system as the Chibi characters (full 120×162, bust 14 12 92 92),
   so they drop into every avatar, leaderboard and live-game spot, and wear store items too.
   ===================================================================== */
import type { CSSProperties, ReactNode } from "react";
import { accessories, type Mood } from "./Chibi";
import type { Equipped } from "../types";
import { BG_FILL } from "../lib/catalog";

export type SpecialKey = "explorer" | "puff";
export const SPECIALS: { key: SpecialKey; name: string; bg: string }[] = [
  { key: "explorer", name: "Wren the explorer", bg: "#BDF2D5" },
  { key: "puff", name: "Puff the bunny", bg: "#FFD6E8" },
];

const INK = "#1B1A17";

function sparkle(x: number, y: number, r: number, delay: number) {
  return <path className="sp-spark" style={{ animationDelay: `${delay}s` }} d={`M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`} fill="#FFF3A6" />;
}

function mouthFor(mood: Mood, cx: number, cy: number) {
  if (mood === "sad") return <path d={`M${cx - 5} ${cy + 3} Q${cx} ${cy - 2} ${cx + 5} ${cy + 3}`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />;
  if (mood === "think") return <path d={`M${cx - 4} ${cy + 1} L${cx + 4} ${cy}`} stroke={INK} strokeWidth="2" strokeLinecap="round" />;
  return (
    <g>
      <path d={`M${cx - 6} ${cy - 1} Q${cx} ${cy + 9} ${cx + 6} ${cy - 1} Z`} fill="#7A2E2E" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d={`M${cx - 3} ${cy + 3.4} Q${cx} ${cy + 1.6} ${cx + 3} ${cy + 3.4} Q${cx} ${cy + 6} ${cx - 3} ${cy + 3.4} Z`} fill="#FF8A8A" />
    </g>
  );
}

function Explorer({ uid, mood, acc }: { uid: string; mood: Mood; acc?: ReactNode }) {
  const cheer = mood === "cheer" || mood === "happy";
  return (
    <g className="body">
      <defs>
        <linearGradient id={`${uid}cl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5BA8EE" />
          <stop offset="1" stopColor="#2A67B0" />
        </linearGradient>
        <radialGradient id={`${uid}sk`} cx="42%" cy="38%" r="70%">
          <stop offset="0" stopColor="#FFE6D3" />
          <stop offset="1" stopColor="#EDBE9C" />
        </radialGradient>
      </defs>
      {/* cloak */}
      <g className="sp-cloak">
        <path d="M60 40 C34 40 26 72 28 100 C29 122 22 138 18 150 L102 150 C98 138 91 122 92 100 C94 72 86 40 60 40 Z" fill={`url(#${uid}cl)`} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M19 146 C40 152 80 152 101 146 L102 150 C80 156 40 156 18 150 Z" fill="#8C857C" stroke={INK} strokeWidth="2" />
        <path d="M60 92 L60 146" stroke="#1F4F8C" strokeWidth="2" opacity=".5" />
      </g>
      <ellipse cx="50" cy="152" rx="8" ry="4.5" fill="#7A4A26" stroke={INK} strokeWidth="1.6" />
      <ellipse cx="70" cy="152" rx="8" ry="4.5" fill="#7A4A26" stroke={INK} strokeWidth="1.6" />
      {/* hood */}
      <g className="head">
        <path d="M34 30 C22 18 10 20 4 28 C16 26 22 34 26 42 Z" fill={`url(#${uid}cl)`} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M60 16 C30 16 20 42 24 68 C26 84 38 94 60 94 C82 94 94 84 96 68 C100 42 90 16 60 16 Z" fill={`url(#${uid}cl)`} stroke={INK} strokeWidth="2.6" />
        <ellipse cx="60" cy="60" rx="29" ry="30" fill="#7B746B" stroke={INK} strokeWidth="1.6" />
        <ellipse cx="60" cy="62" rx="24" ry="25" fill={`url(#${uid}sk)`} />
        {/* hair */}
        <path d="M36 60 C34 38 46 34 60 34 C74 34 86 38 84 60 C80 50 72 45 66 45 C62 51 56 51 52 45 C46 47 40 51 36 60 Z" fill="#5A3522" />
        <path d="M37 52 C33 66 34 80 39 90 L44 88 C41 76 41 62 43 54 Z" fill="#5A3522" />
        <path d="M83 52 C87 66 86 80 81 90 L76 88 C79 76 79 62 77 54 Z" fill="#5A3522" />
        {/* face */}
        <g className="eye">
          <ellipse cx="51" cy="65" rx="5" ry="6.4" fill="#3A2214" />
          <ellipse cx="69" cy="65" rx="5" ry="6.4" fill="#3A2214" />
          <circle cx="52.6" cy="62.6" r="1.9" fill="#fff" />
          <circle cx="70.6" cy="62.6" r="1.9" fill="#fff" />
        </g>
        <path d="M45 55 Q50 52 55 54 M65 54 Q70 52 75 55" stroke="#4A2A18" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <ellipse cx="44" cy="74" rx="4.5" ry="2.8" fill="#FF7A8A" opacity=".5" />
        <ellipse cx="76" cy="74" rx="4.5" ry="2.8" fill="#FF7A8A" opacity=".5" />
        {mouthFor(mood, 60, 76)}
        {acc && <g transform="translate(60 65) scale(0.78) translate(-60 -63)">{acc}</g>}
      </g>
      {/* hand with a spinning coin */}
      <g className={cheer ? "sp-lift" : ""}>
        <path d="M86 104 C92 102 96 98 98 94" stroke={`url(#${uid}cl)`} strokeWidth="10" strokeLinecap="round" fill="none" />
        <circle cx="98" cy="93" r="5" fill="#EDBE9C" stroke={INK} strokeWidth="1.4" />
        <g className="sp-coin">
          <ellipse cx="104" cy="84" rx="8" ry="8" fill="#FFD84D" stroke="#B07A08" strokeWidth="2" />
          <ellipse cx="104" cy="84" rx="4.2" ry="4.2" fill="none" stroke="#E0A91C" strokeWidth="1.6" />
        </g>
        {sparkle(114, 74, 4, 0)}
        {sparkle(94, 72, 3, 0.7)}
      </g>
      <circle cx="36" cy="118" r="4.6" fill="#EDBE9C" stroke={INK} strokeWidth="1.4" />
    </g>
  );
}

function Puff({ uid, mood, acc }: { uid: string; mood: Mood; acc?: ReactNode }) {
  const sad = mood === "sad";
  return (
    <g className="body">
      <defs>
        <radialGradient id={`${uid}fu`} cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".7" stopColor="#E6EEFF" />
          <stop offset="1" stopColor="#BFD0F2" />
        </radialGradient>
      </defs>
      <g className="sp-ear-l">
        <path d="M42 70 C30 46 30 24 38 12 C48 26 52 48 52 68 Z" fill={`url(#${uid}fu)`} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M42 62 C36 46 36 32 39 22 C45 32 47 46 47 62 Z" fill="#FFB8C8" />
      </g>
      <g className="sp-ear-r">
        <path d="M78 70 C90 46 90 24 82 12 C72 26 68 48 68 68 Z" fill={`url(#${uid}fu)`} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M78 62 C84 46 84 32 81 22 C75 32 73 46 73 62 Z" fill="#FFB8C8" />
      </g>
      {/* fluffy round body */}
      <path
        d="M60 60 C84 60 102 78 102 104 C102 108 106 112 102 116 C100 136 84 150 60 150 C36 150 20 136 18 116 C14 112 18 108 18 104 C18 78 36 60 60 60 Z"
        fill={`url(#${uid}fu)`}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M40 72 Q46 66 54 66" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".8" />
      {/* face */}
      <g className="head">
        {sad ? (
          <g stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round">
            <path d="M44 94 Q49 98 54 94" />
            <path d="M66 94 Q71 98 76 94" />
          </g>
        ) : (
          <g stroke={INK} strokeWidth="2.8" fill="none" strokeLinecap="round">
            <path d="M44 96 Q49 89 54 96" />
            <path d="M66 96 Q71 89 76 96" />
          </g>
        )}
        <ellipse cx="42" cy="104" rx="6" ry="3.6" fill="#FF8FA6" opacity=".55" />
        <ellipse cx="78" cy="104" rx="6" ry="3.6" fill="#FF8FA6" opacity=".55" />
        <path d="M58.5 99 L61.5 99 L60 101 Z" fill="#FF7A95" />
        {mouthFor(mood, 60, 104)}
        {acc && <g transform="translate(60 94) scale(0.9) translate(-60 -63)">{acc}</g>}
      </g>
      {/* treasure chest */}
      <g className="sp-chest">
        <rect x="44" y="120" width="32" height="22" rx="3" fill="#A0602E" stroke={INK} strokeWidth="2.2" />
        <path d="M44 128 H76" stroke={INK} strokeWidth="1.6" />
        <rect x="57" y="126" width="6" height="7" rx="1.5" fill="#FFD84D" stroke={INK} strokeWidth="1.2" />
        <g className="sp-coins">
          <circle cx="52" cy="119" r="4.4" fill="#FFD84D" stroke="#B07A08" strokeWidth="1.4" />
          <circle cx="61" cy="117" r="4.4" fill="#FFD84D" stroke="#B07A08" strokeWidth="1.4" />
          <circle cx="69" cy="119" r="4.4" fill="#FFD84D" stroke="#B07A08" strokeWidth="1.4" />
        </g>
        <path d="M42 120 L46 108 L78 108 L78 112 L50 112 Z" fill="#B8733A" stroke={INK} strokeWidth="2" strokeLinejoin="round" className="sp-lid" />
        {sparkle(80, 112, 3.4, 0.2)}
        {sparkle(40, 116, 2.8, 1)}
      </g>
      <ellipse cx="42" cy="128" rx="6" ry="5" fill="#fff" stroke={INK} strokeWidth="1.8" />
      <ellipse cx="78" cy="128" rx="6" ry="5" fill="#fff" stroke={INK} strokeWidth="1.8" />
    </g>
  );
}

export function SpecialChar({ kind, uid, mood, variant, still, size, className = "", style, title, equipped = {} }: { kind: SpecialKey; uid: string; mood: Mood; variant: "full" | "bust"; still?: boolean; size?: number; className?: string; style?: CSSProperties; title?: string; equipped?: Equipped }) {
  // store items: the same hats, glasses and earrings as everyone else, fitted to this character's head
  const acc = accessories(equipped, uid);
  const fill = equipped.bg ? BG_FILL[equipped.bg] : undefined;
  const bg = fill ? `url(#${uid}b)` : SPECIALS.find((s) => s.key === kind)!.bg;
  const vb = variant === "bust" ? "14 12 92 92" : "0 0 120 162";
  const w = size ?? (variant === "bust" ? 48 : 120);
  const h = variant === "bust" ? w : Math.round((w * 162) / 120);
  // the bunny's face sits low on its body: lift it into the round avatar frame
  const lift = variant === "bust" ? (kind === "puff" ? "translate(0 -34)" : "translate(0 -2)") : undefined;
  return (
    <svg
      viewBox={vb}
      width={w}
      height={h}
      className={`chibi special sp-${kind} m-${mood} ${variant} ${still ? "still" : ""} ${className}`}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        {fill && (
          <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={fill[0]} />
            <stop offset="1" stopColor={fill[1]} />
          </linearGradient>
        )}
        <clipPath id={`${uid}c`}>
          <circle cx="60" cy="58" r="46" />
        </clipPath>
      </defs>
      {variant === "bust" && <circle cx="60" cy="58" r="46" fill={bg} />}
      {variant === "bust" && equipped.bg === "bg-galaxy" && (
        <g fill="#FFFFFF" opacity=".8">
          <circle cx="30" cy="30" r="1.2" />
          <circle cx="88" cy="24" r="1" />
          <circle cx="96" cy="70" r="1.4" />
          <circle cx="22" cy="74" r="1" />
        </g>
      )}
      {variant === "full" && <ellipse cx="60" cy="156" rx="32" ry="4.5" fill="#000" opacity=".12" className="shadow" />}
      <g clipPath={variant === "bust" ? `url(#${uid}c)` : undefined}>
        <g transform={lift}>{kind === "explorer" ? <Explorer uid={uid} mood={mood} acc={acc.length ? acc : undefined} /> : <Puff uid={uid} mood={mood} acc={acc.length ? acc : undefined} />}</g>
      </g>
    </svg>
  );
}
