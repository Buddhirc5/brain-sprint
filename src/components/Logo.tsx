/* =====================================================================
   Brain Sprint logo.
   Mark: Sprinty (the lime brain-bean mascot) in "game mode" — headset,
   controller and a gaming chair — drawn in the app's cartoon style.
   Wordmark: BRAIN SPRINT set in a custom 5×7 pixel font (game-screen
   feel), plus a small tagline. Animations are CSS only and switch off
   for people who prefer reduced motion (see styles/logo.css).
   ===================================================================== */
import { useId } from "react";

const INK = "#161512";
const ORANGE = "#FF5A1F";
const LIME = "#C6F432";

/* ---------------- pixel font ---------------- */
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
};

/** One SVG path for a line of pixel text; returns the path and its width in pixels. */
function pixelPath(text: string, x0 = 0, y0 = 0): { d: string; w: number; letters: { d: string; x: number }[] } {
  let x = x0;
  let all = "";
  const letters: { d: string; x: number }[] = [];
  for (const ch of text) {
    if (ch === " ") {
      x += 3;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) continue;
    let d = "";
    g.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) if (row[rx] === "1") d += `M${x + rx} ${y0 + ry}h1v1h-1z`;
    });
    letters.push({ d, x });
    all += d;
    x += 6;
  }
  return { d: all, w: x - x0 - 1, letters };
}

const WORD = pixelPath("BRAIN SPRINT");

/** Pixel wordmark (animated "power-on" per letter). */
export function PixelWord({ height = 20, color = ORANGE, className = "" }: { height?: number; color?: string; className?: string }) {
  const w = WORD.w;
  return (
    <svg className={`bs-word ${className}`} viewBox={`-0.5 -0.5 ${w + 1.5} 8.5`} height={height} width={(height * (w + 1.5)) / 8.5} role="img" aria-label="Brain Sprint">
      <g fill={INK} opacity=".22" transform="translate(.5 .6)">
        <path d={WORD.d} />
      </g>
      <g fill={color}>
        {WORD.letters.map((l, i) => (
          <path key={i} d={l.d} className="bs-px" style={{ animationDelay: `${i * 55}ms` }} />
        ))}
      </g>
    </svg>
  );
}

/** The mascot badge. `bg` draws the cream rounded tile (favicons, avatars). */
export function LogoMark({ size = 44, bg = false, still = false, className = "" }: { size?: number; bg?: boolean; still?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg className={`bs-mark ${still ? "still" : ""} ${className}`} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}g`} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#E9FF8F" />
          <stop offset=".6" stopColor={LIME} />
          <stop offset="1" stopColor="#8FBF12" />
        </radialGradient>
      </defs>
      {bg && <rect x="2" y="2" width="116" height="116" rx="28" fill="#FFFEFA" />}
      {/* gaming chair */}
      <path d="M42 20 Q46 9 62 9 L90 10 Q104 11 104 26 L104 100 Q104 110 94 110 L42 110 Z" fill="#2B2A26" />
      <path d="M88 16 Q98 18 98 30 L98 96" stroke="#3B3A36" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* sound waves */}
      <g className="bs-waves" stroke={ORANGE} strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M108 46 q5 8 0 16" />
        <path d="M113 42 q8 12 0 24" />
      </g>
      <g className="bs-body">
        <g transform="translate(12 12) scale(.8)">
          {/* bean */}
          <path d="M60 14 C86 14 100 34 100 64 C100 94 84 112 60 112 C36 112 20 94 20 64 C20 34 34 14 60 14 Z" fill={`url(#${uid}g)`} stroke="#8FBF12" strokeWidth="2" />
          <g stroke="#9ACB18" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".9">
            <path d="M42 26 q6 -6 12 0 q6 6 12 0 q6 -6 12 0" />
          </g>
          {/* sweatband */}
          <rect x="22" y="36" width="76" height="11" rx="5.5" fill={ORANGE} />
          <rect x="22" y="40" width="76" height="3" fill="#FFFEFA" opacity=".85" />
          {/* eyes */}
          <g className="bs-eyes">
            <ellipse cx="47" cy="61" rx="6.5" ry="8" fill={INK} />
            <circle cx="44.8" cy="57.6" r="2.5" fill="#FFFEFA" />
            <ellipse cx="73" cy="61" rx="6.5" ry="8" fill={INK} />
            <circle cx="70.8" cy="57.6" r="2.5" fill="#FFFEFA" />
          </g>
          <ellipse cx="36" cy="73" rx="6" ry="3.4" fill="#FF7A8A" opacity=".55" />
          <ellipse cx="84" cy="73" rx="6" ry="3.4" fill="#FF7A8A" opacity=".55" />
          {/* grin */}
          <path d="M51 72 Q60 86 69 72 Z" fill="#7A2E1A" />
          <ellipse cx="60" cy="79.5" rx="4" ry="2.2" fill="#FF8A93" />
          {/* headset */}
          <path d="M20 60 C18 6 102 6 100 60" stroke={INK} strokeWidth="7" fill="none" strokeLinecap="round" />
          <rect x="8" y="48" width="18" height="28" rx="8" fill={ORANGE} stroke={INK} strokeWidth="3" />
          <rect x="94" y="48" width="18" height="28" rx="8" fill={ORANGE} stroke={INK} strokeWidth="3" />
          <path d="M16 76 Q18 92 40 90" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <circle cx="42" cy="90" r="4.5" fill={INK} />
        </g>
        {/* controller + hands */}
        <g className="bs-pad">
          <path d="M34 90 H86 Q98 90 100 102 L101 108 Q101 116 93 116 Q88 116 85 111 L81 106 H39 L35 111 Q32 116 27 116 Q19 116 19 108 L20 102 Q22 90 34 90 Z" fill={INK} />
          <path d="M34 99 h8 M38 95 v8" stroke={ORANGE} strokeWidth="3.4" strokeLinecap="round" />
          <circle className="bs-btn a" cx="80" cy="97" r="3.2" fill={LIME} />
          <circle className="bs-btn b" cx="87" cy="101" r="3.2" fill={ORANGE} />
          <ellipse cx="24" cy="100" rx="7" ry="6" fill="#A8D81E" stroke="#8FBF12" strokeWidth="1.5" />
          <ellipse cx="96" cy="100" rx="7" ry="6" fill="#A8D81E" stroke="#8FBF12" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Full logo.
 *  - "row": mark + wordmark on one line (site header)
 *  - "stack": mark above wordmark + tagline, like a badge (footer, loading, social image)
 */
export function Logo({ variant = "row", size = 40, tagline = true, className = "" }: { variant?: "row" | "stack"; size?: number; tagline?: boolean; className?: string }) {
  if (variant === "stack")
    return (
      <span className={`bs-logo stack ${className}`}>
        <LogoMark size={size} />
        <PixelWord height={Math.round(size * 0.24)} />
        {tagline && <span className="bs-tag">Learning games for teams</span>}
      </span>
    );
  return (
    <span className={`bs-logo row ${className}`}>
      <LogoMark size={size} />
      <span className="bs-logo-txt">
        <PixelWord height={Math.round(size * 0.42)} />
        {tagline && <span className="bs-tag">Learning games for teams</span>}
      </span>
    </span>
  );
}
