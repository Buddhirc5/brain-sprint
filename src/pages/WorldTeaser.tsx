/* Marketing block for the Knowledge World add-on (landing + experience pages). */

export function WorldTeaser() {
  return (
    <section className="h-world" aria-labelledby="h-world-t">
      <div className="h-world-copy">
        <span className="h-kicker">New · optional add-on</span>
        <h2 id="h-world-t">Knowledge World</h2>
        <p>
          A 3D open world for a well-earned break. Walk your cartoon character around a bright little city, grab a car, race the clock through checkpoints and pop
          knowledge bubbles for bonus trivia. Arrow keys and space on desktop, thumb controls on phones.
        </p>
        <ul className="h-world-list">
          <li><b>Explore</b> a city of parks, towers and a lake</li>
          <li><b>Drive</b> any of the parked cars — then race the lap</li>
          <li><b>Learn</b> by popping floating knowledge bubbles</li>
          <li><b>Switch it on</b> per company — admins decide</li>
        </ul>
        <div className="h-hero-cta">
          <a className="btn lime" href="#/world">Take it for a spin</a>
        </div>
      </div>
      <div className="h-world-art" aria-hidden="true">
        <WorldArt />
      </div>
    </section>
  );
}

function WorldArt() {
  return (
    <svg viewBox="0 0 360 260">
      <defs>
        <linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8FD3FF" />
          <stop offset="1" stopColor="#DFF4FF" />
        </linearGradient>
      </defs>
      <rect width="360" height="260" rx="26" fill="url(#wsky)" />
      <path d="M0 170 L360 150 L360 260 L0 260 Z" fill="#8BD450" />
      <path d="M40 260 L150 160 L210 160 L330 260 Z" fill="#3B3A36" />
      <path d="M180 170 v12 M180 196 v16 M180 226 v22" stroke="#FFD84D" strokeWidth="5" strokeLinecap="round" />
      <rect x="30" y="80" width="46" height="92" rx="4" fill="#FF7EB6" />
      <rect x="84" y="110" width="38" height="58" rx="4" fill="#3D7BFF" />
      <rect x="250" y="70" width="52" height="96" rx="4" fill="#FF5A1F" />
      <rect x="306" y="112" width="40" height="52" rx="4" fill="#FFD84D" />
      {[40, 52, 64, 92, 104, 260, 272, 284].map((x, i) => (
        <rect key={i} x={x} y={i < 3 ? 94 : i < 5 ? 122 : 86} width="7" height="9" rx="1.5" fill="#FFFEFA" opacity=".85" />
      ))}
      <circle cx="140" cy="150" r="16" fill="#2E9E4F" />
      <rect x="138" y="160" width="4" height="12" fill="#6B4A2B" />
      <circle cx="226" cy="146" r="13" fill="#2E9E4F" />
      <g transform="translate(196 190)">
        <rect x="0" y="8" width="70" height="24" rx="9" fill="#C6F432" />
        <rect x="14" y="-6" width="38" height="18" rx="7" fill="#161512" />
        <circle cx="16" cy="34" r="8" fill="#161512" />
        <circle cx="54" cy="34" r="8" fill="#161512" />
      </g>
      <g transform="translate(96 176)">
        <circle cx="0" cy="-26" r="18" fill="#F6D2B8" />
        <path d="M-18 -30 a18 18 0 0 1 36 0 q-18 -8 -36 0z" fill="#1E1A1A" />
        <circle cx="-6" cy="-24" r="2.4" fill="#1B1A17" />
        <circle cx="6" cy="-24" r="2.4" fill="#1B1A17" />
        <rect x="-11" y="-8" width="22" height="22" rx="7" fill="#161512" />
        <rect x="-9" y="12" width="7" height="14" rx="3" fill="#2B2B2B" />
        <rect x="2" y="12" width="7" height="14" rx="3" fill="#2B2B2B" />
      </g>
      <g>
        <circle cx="300" cy="200" r="15" fill="#C6F432" opacity=".35" />
        <circle cx="300" cy="200" r="10" fill="#C6F432" />
        <text x="300" y="205" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="14" fill="#161512">?</text>
      </g>
      <path d="M60 40 h40 M70 50 h24" stroke="#FFFEFA" strokeWidth="8" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}
