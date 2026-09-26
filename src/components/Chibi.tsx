/* =====================================================================
   Cartoon characters — original chibi-style players drawn in SVG.
   One drawing, two framings: "full" (whole body) and "bust" (round
   portrait for lists). Moods drive the face and the body animation.
   ===================================================================== */
import { useId, type CSSProperties } from "react";
import { SPECIALS, SpecialChar, type SpecialKey } from "./Specials";
import type { Equipped } from "../types";
import { BG_FILL } from "../lib/catalog";

export type Mood = "idle" | "happy" | "sad" | "cheer" | "think";
type Hair = "long" | "twin" | "bun" | "bob" | "pony" | "wavy" | "crew" | "side" | "curly" | "spiky" | "quiff" | "buzz";

interface Look {
  g: "f" | "m";
  skin: string;
  hair: string;
  tips?: string; // two-tone hair ends
  h: Hair;
  top: string;
  trim: string;
  pants: string;
  shoe: string;
  eye: string;
  bg: string;
  beard?: boolean;
}

const K = { lime: "#C6F432", orange: "#FF5A1F", pink: "#FF7EB6", blue: "#3D7BFF", ink: "#1B1A17", white: "#FFFDF7", yellow: "#FFD84D", pinkS: "#FFD6E8", blueS: "#CFE0FF", mint: "#BDF2D5" };

export const LOOKS: Look[] = [
  { g: "f", skin: "#F6D2B8", hair: "#1E1A1A", h: "long", top: K.ink, trim: K.lime, pants: "#2B2B2B", shoe: K.orange, eye: "#3A2418", bg: K.lime },
  { g: "f", skin: "#F3D6C4", hair: "#F2F0E8", tips: "#9BE22E", h: "wavy", top: K.ink, trim: K.orange, pants: "#34302A", shoe: K.lime, eye: "#3B5A2A", bg: K.pinkS },
  { g: "f", skin: "#E9B48E", hair: "#E8612C", h: "bob", top: K.lime, trim: K.pink, pants: "#3D7BFF", shoe: K.white, eye: "#2E6B3A", bg: K.orange },
  { g: "f", skin: "#C98E68", hair: "#1C1A1A", h: "twin", top: K.orange, trim: K.yellow, pants: K.ink, shoe: K.lime, eye: "#2A1A12", bg: K.blueS },
  { g: "f", skin: "#9A5F3E", hair: "#141414", h: "bun", top: K.pink, trim: K.white, pants: "#5B3A8C", shoe: K.orange, eye: "#24150E", bg: K.lime },
  { g: "f", skin: "#FFE0C7", hair: "#5A3320", h: "pony", top: K.blue, trim: K.lime, pants: K.ink, shoe: K.pink, eye: "#4A2E1E", bg: K.pink },
  { g: "f", skin: "#B97A55", hair: "#2A1F1A", tips: "#FF7EB6", h: "long", top: K.lime, trim: K.ink, pants: "#2E2A26", shoe: K.orange, eye: "#2A1A12", bg: K.mint },
  { g: "f", skin: "#F0C4A2", hair: "#8B4A2B", h: "twin", top: K.pink, trim: K.lime, pants: "#3D7BFF", shoe: K.white, eye: "#3A2418", bg: K.yellow },
  { g: "m", skin: "#D9A07A", hair: "#1C1A1A", h: "side", top: K.blue, trim: K.white, pants: K.ink, shoe: K.orange, eye: "#2A1A12", bg: K.lime },
  { g: "m", skin: "#F2C6A4", hair: "#4A2E1E", h: "quiff", top: K.ink, trim: K.lime, pants: "#3A3A3A", shoe: K.lime, eye: "#3A2418", bg: K.orange },
  { g: "m", skin: "#9A5F3E", hair: "#141414", h: "curly", top: K.orange, trim: K.ink, pants: "#2B2B2B", shoe: K.white, eye: "#24150E", bg: K.blueS },
  { g: "m", skin: "#C98E68", hair: "#1C1A1A", h: "crew", top: K.lime, trim: K.blue, pants: K.ink, shoe: K.orange, eye: "#2A1A12", bg: K.pink, beard: true },
  { g: "m", skin: "#E7B08A", hair: "#E8612C", h: "spiky", top: K.pink, trim: K.ink, pants: "#3D7BFF", shoe: K.lime, eye: "#2E6B3A", bg: K.lime },
  { g: "m", skin: "#B97A55", hair: "#3A2618", h: "buzz", top: K.ink, trim: K.orange, pants: "#2E2A26", shoe: K.pink, eye: "#2A1A12", bg: K.yellow, beard: true },
  { g: "m", skin: "#F0C4A2", hair: "#9A958C", h: "side", top: K.lime, trim: K.pink, pants: K.ink, shoe: K.blue, eye: "#3A2418", bg: K.blueS, beard: true },
  { g: "m", skin: "#7A4A2E", hair: "#141414", h: "spiky", tips: "#C6F432", top: K.blue, trim: K.lime, pants: K.ink, shoe: K.orange, eye: "#24150E", bg: K.pinkS },
];
/** Looks after the regular ones are the special characters (Wren the explorer, Puff the bunny). */
export const lookCount = LOOKS.length + SPECIALS.length; // keep in step with LOOK_COUNT (api/engine.ts) and the database limit
export const specialOf = (look: number): SpecialKey | null => {
  const i = (look | 0) - LOOKS.length;
  return i >= 0 && i < SPECIALS.length ? SPECIALS[i].key : null;
};
export const lookOf = (i: number) => LOOKS[((i | 0) % LOOKS.length + LOOKS.length) % LOOKS.length];

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("");
}

const heart = (x: number, y: number, s: number) =>
  `M${x} ${y + s * 0.9} C${x - s * 1.4} ${y} ${x - s * 0.9} ${y - s * 0.9} ${x} ${y - s * 0.25} C${x + s * 0.9} ${y - s * 0.9} ${x + s * 1.4} ${y} ${x} ${y + s * 0.9} Z`;
const star = (x: number, y: number, r: number) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? "L" : "M"}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)} `;
  }
  return d + "Z";
};

export interface ChibiProps {
  look: number;
  equipped?: Equipped;
  mood?: Mood;
  variant?: "full" | "bust";
  size?: number;
  still?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Chibi({ look, equipped = {}, mood = "idle", variant = "bust", size, still, className = "", style, title }: ChibiProps) {
  const uid = useId().replace(/:/g, "");
  const sp = specialOf(look);
  if (sp) return <SpecialChar kind={sp} uid={uid} mood={mood} variant={variant} still={still} size={size} className={className} style={style} title={title} />;
  const L = lookOf(look);
  const H = L.hair;
  const hairFill = L.tips ? `url(#${uid}h)` : H;
  const skinFill = `url(#${uid}s)`;
  const topFill = `url(#${uid}t)`;
  const f = L.g === "f";
  const bg = equipped.bg && BG_FILL[equipped.bg] ? `url(#${uid}b)` : L.bg;
  const blinkDelay = `${(look * 0.37) % 3}s`;

  /* ---- hair behind the head ---- */
  let back = null;
  if (L.h === "long" || L.h === "wavy")
    back = (
      <path
        d={
          L.h === "long"
            ? "M24 58 C22 26 40 17 60 17 C80 17 98 26 96 58 L100 114 C92 120 80 118 74 112 L46 112 C40 118 28 120 20 114 Z"
            : "M24 58 C22 26 40 17 60 17 C80 17 98 26 96 58 L102 108 C98 116 92 112 90 118 C86 112 80 116 76 110 L44 110 C40 116 34 112 30 118 C28 112 22 116 18 108 Z"
        }
        fill={hairFill}
      />
    );
  if (L.h === "bob") back = <path d="M25 60 C23 27 40 18 60 18 C80 18 97 27 95 60 L97 90 C91 96 83 94 80 88 L40 88 C37 94 29 96 23 90 Z" fill={hairFill} />;
  if (L.h === "twin")
    back = (
      <g fill={hairFill}>
        <ellipse cx="18" cy="80" rx="12" ry="25" transform="rotate(12 18 80)" />
        <ellipse cx="102" cy="80" rx="12" ry="25" transform="rotate(-12 102 80)" />
        <path d="M26 58 C24 28 40 18 60 18 C80 18 96 28 94 58 Z" />
      </g>
    );
  if (L.h === "bun")
    back = (
      <g fill={hairFill}>
        <circle cx="60" cy="16" r="13" />
        <path d="M26 58 C24 28 40 19 60 19 C80 19 96 28 94 58 Z" />
      </g>
    );
  if (L.h === "pony")
    back = (
      <g fill={hairFill}>
        <path d="M82 28 C114 30 116 78 102 104 C100 86 98 62 84 50 Z" />
        <path d="M26 58 C24 28 40 19 60 19 C80 19 96 28 94 58 Z" />
      </g>
    );

  /* ---- fringe on top of the head ---- */
  const fringeD: Record<Hair, string> = {
    long: "M27 58 C25 28 44 18 62 19 C82 20 95 32 93 58 C86 42 70 35 56 33 C46 40 36 47 27 58 Z",
    wavy: "M27 56 C26 30 42 19 60 19 C78 19 94 30 93 56 C88 45 80 39 72 39 C70 45 64 47 60 41 C56 47 48 47 46 39 C38 41 31 47 27 56 Z",
    bob: "M27 52 C27 28 42 19 60 19 C78 19 93 28 93 52 L87 45 L33 45 Z",
    twin: "M27 56 C26 30 42 19 60 19 C78 19 94 30 93 56 C88 45 80 39 72 39 C70 45 64 47 60 41 C56 47 48 47 46 39 C38 41 31 47 27 56 Z",
    bun: "M27 56 C25 30 44 20 60 20 C78 20 95 30 93 56 C84 42 72 37 60 37 C48 37 36 42 27 56 Z",
    pony: "M27 58 C25 28 44 18 62 19 C82 20 95 32 93 58 C86 42 70 35 56 33 C46 40 36 47 27 58 Z",
    crew: "M28 50 C28 26 44 19 60 19 C76 19 92 26 92 50 C86 39 76 34 60 34 C44 34 34 39 28 50 Z",
    side: "M28 52 C26 26 46 17 64 19 C82 21 94 32 92 52 C88 41 80 35 70 34 L66 29 C58 36 44 38 28 52 Z",
    curly: "M28 50 C28 26 44 20 60 20 C76 20 92 26 92 50 C86 40 76 35 60 35 C44 35 34 40 28 50 Z",
    spiky: "M28 50 L25 30 L36 34 L37 17 L50 28 L58 10 L67 27 L79 15 L81 32 L95 28 L92 50 C84 39 74 35 60 35 C46 35 36 39 28 50 Z",
    quiff: "M28 50 C28 28 42 22 54 22 C58 10 80 8 88 20 C93 27 93 38 92 50 C86 39 76 35 60 35 C44 35 34 39 28 50 Z",
    buzz: "M29 48 C29 27 44 21 60 21 C76 21 91 27 91 48 C86 40 76 37 60 37 C44 37 34 40 29 48 Z",
  };

  /* ---- mouth by mood ---- */
  const mouthCol = "#7A2E1A";
  let mouth = <path d="M54 75 Q60 80 66 75" stroke={L.beard ? K.white : mouthCol} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  if (mood === "happy")
    mouth = (
      <g>
        <path d="M53 73 Q60 84 67 73 Z" fill={mouthCol} />
        <ellipse cx="60" cy="78.5" rx="3.6" ry="2" fill="#FF8A93" />
      </g>
    );
  if (mood === "cheer")
    mouth = (
      <g>
        <path d="M51 72 Q60 88 69 72 Z" fill={mouthCol} />
        <ellipse cx="60" cy="80.5" rx="4.4" ry="2.4" fill="#FF8A93" />
        <path d="M53 72.6 L67 72.6" stroke={K.white} strokeWidth="1.6" />
      </g>
    );
  if (mood === "sad") mouth = <path d="M55 79 Q60 74.5 65 79" stroke={L.beard ? K.white : mouthCol} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  if (mood === "think") mouth = <ellipse cx="63" cy="77" rx="2.3" ry="2.7" fill={mouthCol} />;

  const browY = mood === "sad" ? 1 : 0;
  const brow = shade(H, -0.2);
  const eyeClosed = mood === "cheer";

  const eye = (cx: number) =>
    eyeClosed ? (
      <path d={`M${cx - 6} ${63} Q${cx} ${56} ${cx + 6} ${63}`} stroke={K.ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    ) : (
      <g className="eye" style={{ animationDelay: blinkDelay }}>
        <ellipse cx={cx} cy="63" rx="6.4" ry="7.8" fill={`url(#${uid}e)`} />
        <circle cx={cx - 2.2} cy="59.6" r="2.5" fill={K.white} />
        <circle cx={cx + 2.4} cy="66.4" r="1.2" fill={K.white} opacity=".9" />
      </g>
    );

  /* ---- accessories ---- */
  const acc: JSX.Element[] = [];
  const face = equipped.face,
    head = equipped.head,
    ears = equipped.ears;
  if (ears === "hearts") acc.push(<g key="e" fill={K.lime} stroke={shade(K.lime, -0.35)} strokeWidth=".8"><path d={heart(27, 76, 4.2)} /><path d={heart(93, 76, 4.2)} /><path d="M27 68 L27 72 M93 68 L93 72" stroke={K.ink} strokeWidth="1.2" /></g>);
  if (ears === "hoops") acc.push(<g key="e" fill="none" stroke="#E0B12B" strokeWidth="2.2"><circle cx="27" cy="74" r="5" /><circle cx="93" cy="74" r="5" /></g>);
  if (ears === "studs") acc.push(<g key="e" fill={K.yellow} stroke="#C99A12" strokeWidth=".6"><path d={star(27, 70, 3.6)} /><path d={star(93, 70, 3.6)} /></g>);
  if (face === "specs")
    acc.push(
      <g key="f" fill="#FFFFFF" fillOpacity=".18" stroke={K.ink} strokeWidth="2.2">
        <circle cx="47" cy="63" r="9.5" />
        <circle cx="73" cy="63" r="9.5" />
        <path d="M56.5 62 Q60 59.5 63.5 62" fill="none" />
      </g>,
    );
  if (face === "shades")
    acc.push(
      <g key="f">
        <defs>
          <linearGradient id={`${uid}sh`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF9A3D" />
            <stop offset="1" stopColor="#FF4D1F" />
          </linearGradient>
        </defs>
        <rect x="36" y="55" width="21" height="15" rx="6" fill={`url(#${uid}sh)`} stroke={K.ink} strokeWidth="2" />
        <rect x="63" y="55" width="21" height="15" rx="6" fill={`url(#${uid}sh)`} stroke={K.ink} strokeWidth="2" />
        <path d="M57 60 L63 60" stroke={K.ink} strokeWidth="2" />
        <path d="M39 58 L45 58" stroke={K.white} strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
      </g>,
    );
  if (head === "phones")
    acc.push(
      <g key="h">
        <path d="M24 60 C20 16 100 16 96 60" stroke={K.lime} strokeWidth="6" fill="none" strokeLinecap="round" />
        <rect x="15" y="50" width="14" height="22" rx="7" fill={K.lime} stroke={shade(K.lime, -0.4)} strokeWidth="1.2" />
        <rect x="91" y="50" width="14" height="22" rx="7" fill={K.lime} stroke={shade(K.lime, -0.4)} strokeWidth="1.2" />
        <rect x="19" y="55" width="6" height="12" rx="3" fill={shade(K.lime, -0.35)} />
        <rect x="95" y="55" width="6" height="12" rx="3" fill={shade(K.lime, -0.35)} />
      </g>,
    );
  if (head === "cap")
    acc.push(
      <g key="h">
        <path d="M27 44 C27 16 93 16 93 44 Z" fill={K.orange} />
        <path d="M60 41 C80 38 102 42 108 47 C98 50 80 47 60 45 Z" fill={shade(K.orange, -0.25)} />
        <circle cx="60" cy="31" r="5" fill={K.lime} />
        <path d="M44 22 Q52 18 60 18" stroke={K.white} strokeWidth="2" opacity=".5" fill="none" strokeLinecap="round" />
      </g>,
    );
  if (head === "beanie")
    acc.push(
      <g key="h">
        <path d="M26 46 C26 14 94 14 94 46 Z" fill={K.blue} />
        <rect x="24" y="38" width="72" height="11" rx="5.5" fill={shade(K.blue, -0.25)} />
        {[32, 40, 48, 56, 64, 72, 80, 88].map((x) => (
          <path key={x} d={`M${x} 40 L${x} 47`} stroke={shade(K.blue, 0.25)} strokeWidth="1.4" />
        ))}
        <circle cx="60" cy="13" r="7.5" fill={K.pink} />
      </g>,
    );
  if (head === "bow")
    acc.push(
      <g key="h" transform="rotate(14 86 26)">
        <path d="M86 26 L72 16 C68 22 68 32 72 36 Z" fill={K.pink} stroke={shade(K.pink, -0.3)} strokeWidth="1" />
        <path d="M86 26 L100 16 C104 22 104 32 100 36 Z" fill={K.pink} stroke={shade(K.pink, -0.3)} strokeWidth="1" />
        <circle cx="86" cy="26" r="4.5" fill={shade(K.pink, -0.15)} />
      </g>,
    );
  if (head === "crown")
    acc.push(
      <g key="h">
        <path d="M36 32 L39 12 L50 24 L60 7 L70 24 L81 12 L84 32 Z" fill={K.yellow} stroke="#C99A12" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="60" cy="25" r="3" fill={K.pink} />
        <circle cx="46" cy="28" r="2.2" fill={K.lime} />
        <circle cx="74" cy="28" r="2.2" fill={K.blue} />
      </g>,
    );

  /* ---- body (full variant only needs legs/arms; bust shows shoulders) ---- */
  const armL =
    mood === "cheer" ? "rotate(150deg)" : mood === "happy" ? "rotate(40deg)" : mood === "sad" ? "rotate(6deg)" : mood === "think" ? "rotate(-20deg)" : "rotate(14deg)";
  const armR =
    mood === "cheer" ? "rotate(-150deg)" : mood === "happy" ? "rotate(-40deg)" : mood === "sad" ? "rotate(-6deg)" : mood === "think" ? "rotate(-150deg)" : "rotate(-14deg)";

  const vb = variant === "bust" ? "14 12 92 92" : "0 0 120 162";
  const w = size ?? (variant === "bust" ? 48 : 120);
  const h = variant === "bust" ? w : Math.round((w * 162) / 120);

  return (
    <svg
      viewBox={vb}
      width={w}
      height={h}
      className={`chibi m-${mood} ${variant} ${still ? "still" : ""} ${className}`}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={`${uid}s`} cx="40%" cy="36%" r="70%">
          <stop offset="0" stopColor={shade(L.skin, 0.28)} />
          <stop offset=".65" stopColor={L.skin} />
          <stop offset="1" stopColor={shade(L.skin, -0.14)} />
        </radialGradient>
        <linearGradient id={`${uid}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(L.top, 0.18)} />
          <stop offset="1" stopColor={shade(L.top, -0.18)} />
        </linearGradient>
        <linearGradient id={`${uid}e`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120C08" />
          <stop offset="1" stopColor={L.eye} />
        </linearGradient>
        {L.tips && (
          <linearGradient id={`${uid}h`} x1="0" y1="0" x2="0" y2="1">
            <stop offset=".45" stopColor={H} />
            <stop offset=".9" stopColor={L.tips} />
          </linearGradient>
        )}
        {equipped.bg && BG_FILL[equipped.bg] && (
          <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={BG_FILL[equipped.bg][0]} />
            <stop offset="1" stopColor={BG_FILL[equipped.bg][1]} />
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
      {variant === "full" && <ellipse cx="60" cy="156" rx="30" ry="4.5" fill="#000" opacity=".12" className="shadow" />}
      <g clipPath={variant === "bust" ? `url(#${uid}c)` : undefined}>
        <g className="body">
          {back}
          {variant === "full" && (
            <g>
              <rect x="44" y="128" width="13" height="22" rx="6" fill={L.pants} />
              <rect x="63" y="128" width="13" height="22" rx="6" fill={L.pants} />
              <ellipse cx="49" cy="152" rx="10" ry="5.5" fill={L.shoe} stroke={shade(L.shoe, -0.3)} strokeWidth="1" />
              <ellipse cx="71" cy="152" rx="10" ry="5.5" fill={L.shoe} stroke={shade(L.shoe, -0.3)} strokeWidth="1" />
              <path d="M40 154 L58 154 M62 154 L80 154" stroke={K.white} strokeWidth="1.6" opacity=".8" />
              <g className="arm arm-l" style={{ transform: armL }}>
                <rect x="33" y="95" width="11" height="28" rx="5.5" fill={topFill} />
                <circle cx="38.5" cy="124" r="5" fill={L.skin} />
              </g>
              <g className="arm arm-r" style={{ transform: armR }}>
                <rect x="76" y="95" width="11" height="28" rx="5.5" fill={topFill} />
                <circle cx="81.5" cy="124" r="5" fill={L.skin} />
              </g>
            </g>
          )}
          {/* torso */}
          <path d="M36 98 C36 91 45 88 60 88 C75 88 84 91 84 98 L88 128 C88 133 84 135 80 135 L40 135 C36 135 32 133 32 128 Z" fill={topFill} />
          <path d="M33 122 L87 122 L88 128 C88 133 84 135 80 135 L40 135 C36 135 32 133 32 128 Z" fill={L.trim} />
          {f ? (
            <g fill={L.trim} stroke={shade(L.trim, -0.3)} strokeWidth=".6">
              {[48, 52.5, 57, 61.5, 66, 70.5].map((x, i) => (
                <circle key={x} cx={x + 1} cy={92 + Math.sin((i / 5) * Math.PI) * 6} r="2.2" />
              ))}
            </g>
          ) : (
            <g>
              <path d="M51 88 L60 99 L69 88 Z" fill={K.white} />
              <path d="M58 97 L62 97 L64 113 L60 117 L56 113 Z" fill={L.trim} />
            </g>
          )}
          <rect x="54" y="82" width="12" height="10" rx="3" fill={shade(L.skin, -0.12)} />
          {/* head */}
          <g className="head">
            <ellipse cx="27" cy="62" rx="5" ry="7" fill={L.skin} />
            <ellipse cx="93" cy="62" rx="5" ry="7" fill={L.skin} />
            <ellipse cx="60" cy="57" rx="33.5" ry="31.5" fill={skinFill} />
            {L.beard && <path d="M30 64 C32 84 46 92 60 92 C74 92 88 84 90 64 C85 75 77 80 71 80 C67 76 53 76 49 80 C43 80 35 75 30 64 Z" fill={H} />}
            <path d={fringeD[L.h]} fill={hairFill} />
            {L.h === "curly" && (
              <g fill={H}>
                {[30, 38, 46, 54, 62, 70, 78, 86].map((x, i) => (
                  <circle key={x} cx={x + 2} cy={i % 2 ? 26 : 30} r="7" />
                ))}
              </g>
            )}
            {(L.h === "twin" || L.h === "bun") && (
              <g fill={L.trim}>
                <circle cx={L.h === "bun" ? 60 : 28} cy={L.h === "bun" ? 29 : 58} r="3.4" />
                {L.h === "twin" && <circle cx="92" cy="58" r="3.4" />}
              </g>
            )}
            <path d="M40 30 Q52 23 66 25" stroke={K.white} strokeWidth="3" fill="none" strokeLinecap="round" opacity=".28" />
            {/* brows */}
            <g stroke={brow} strokeWidth={f ? 1.8 : 2.6} strokeLinecap="round" fill="none">
              <path d={mood === "sad" ? "M40 53 Q46 50 52 48" : `M41 ${51 + browY} Q47 ${47.5 + browY} 53 ${50 + browY}`} />
              <path d={mood === "sad" ? "M68 48 Q74 50 80 53" : `M67 ${50 + browY} Q73 ${47.5 + browY} 79 ${51 + browY}`} />
            </g>
            {eye(47)}
            {eye(73)}
            {f && !eyeClosed && (
              <g stroke={K.ink} strokeWidth="1.8" strokeLinecap="round">
                <path d="M40.5 58 L37.5 55.5" />
                <path d="M79.5 58 L82.5 55.5" />
              </g>
            )}
            <ellipse cx="39" cy="73" rx="5.5" ry="3.2" fill="#FF7A8A" opacity=".45" />
            <ellipse cx="81" cy="73" rx="5.5" ry="3.2" fill="#FF7A8A" opacity=".45" />
            <path d="M59 69.5 Q60 71 61 69.5" stroke={shade(L.skin, -0.3)} strokeWidth="1.4" fill="none" strokeLinecap="round" />
            {mouth}
            {mood === "sad" && <path d="M84 50 C82 54 84 57 86 57 C88 57 89 54 84 50 Z" fill="#7FC8FF" className="tear" />}
            {acc}
          </g>
        </g>
      </g>
    </svg>
  );
}

/* =====================================================================
   The Ant Arena mascots: Wren the explorer and Puff the bunny (components/Specials.tsx).
   Cheerful moments show Wren, thinking/sad/quiet ones show Puff; pass `who` to choose.
   ===================================================================== */
export function Mascot({ mood = "idle", size = 120, className = "", still, who }: { mood?: Mood; size?: number; className?: string; still?: boolean; who?: SpecialKey }) {
  const uid = useId().replace(/:/g, "");
  const kind: SpecialKey = who ?? (mood === "cheer" || mood === "happy" ? "explorer" : "puff");
  return <SpecialChar kind={kind} uid={uid} mood={mood} variant="full" still={still} size={size} className={`mascot ${className}`} />;
}
