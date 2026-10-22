import { useEffect, useRef, useState, type ReactNode } from "react";
import { reducedMotion } from "../lib/util";

/* ---------------- icons ---------------- */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icon = {
  back: () => (<svg viewBox="0 0 24 24" {...P}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>),
  close: () => (<svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  trophy: () => (<svg viewBox="0 0 24 24" {...P}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M16 6h3v1a3 3 0 0 1-3 3M8 6H5v1a3 3 0 0 0 3 3M12 13v4M8 20h8" /></svg>),
  user: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>),
  clock: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></svg>),
  lock: () => (<svg viewBox="0 0 24 24" {...P}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>),
  unlock: () => (<svg viewBox="0 0 24 24" {...P}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>),
  shield: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>),
  store: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6" /></svg>),
  book: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M8 7h7M8 11h5" /></svg>),
  full: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>),
  gift: () => (<svg viewBox="0 0 24 24" {...P}><rect x="3" y="9" width="18" height="12" rx="1.5" /><path d="M3 13h18M12 9v12M12 9c-1.5-4-6-4-5-1 .5 1.5 3 1 5 1zm0 0c1.5-4 6-4 5-1-.5 1.5-3 1-5 1z" /></svg>),
  fire: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" /></svg>),
  coin: () => (<svg viewBox="0 0 24 24" {...P}><ellipse cx="12" cy="12" rx="8" ry="8" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></svg>),
  check: () => (<svg viewBox="0 0 24 24" {...P}><path d="M5 12.5l4.5 4.5L19 7" /></svg>),
  eye: () => (<svg viewBox="0 0 24 24" {...P}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>),
  logout: () => (<svg viewBox="0 0 24 24" {...P}><path d="M15 4h4v16h-4M10 16l-4-4 4-4M6 12h10" /></svg>),
};

export function IconBtn({ label, onClick, children, className = "" }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function Seg<T extends string>({ value, options, onChange, label, className = "" }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string; className?: string }) {
  return (
    <div className={`seg ${className}`} role="tablist" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Modal({ children, onClose, label, wide, className = "" }: { children: ReactNode; onClose?: () => void; label: string; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, button, select, textarea");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? "wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        {children}
      </div>
    </div>
  );
}

/* ---------------- numbers that count up ---------------- */
export function CountUp({ to, from = 0, ms = 900, prefix = "", className }: { to: number; from?: number; ms?: number; prefix?: string; className?: string }) {
  const [v, setV] = useState(reducedMotion() ? to : from);
  useEffect(() => {
    if (reducedMotion()) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms]);
  return (
    <span className={className}>
      {prefix}
      {v.toLocaleString()}
    </span>
  );
}

/* ---------------- celebrations ---------------- */
export function confetti(amount = 130) {
  if (reducedMotion()) return;
  const c = document.createElement("canvas");
  c.className = "confetti";
  document.body.appendChild(c);
  const ctx = c.getContext("2d")!;
  const W = (c.width = innerWidth),
    H = (c.height = innerHeight);
  const cols = ["#C6F432", "#FF5A1F", "#FF7EB6", "#3D7BFF", "#FFD84D", "#141414"];
  const ps = Array.from({ length: amount }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.4,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 10,
    vy: -Math.random() * 11 - 4,
    r: Math.random() * 7 + 4,
    c: cols[Math.floor(Math.random() * cols.length)],
    a: Math.random() * 6,
    circle: Math.random() < 0.3,
  }));
  let f = 0;
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.3;
      p.x += p.vx;
      p.y += p.vy;
      p.a += 0.2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      if (p.circle) {
        ctx.beginPath();
        ctx.arc(0, 0, p.r / 2.4, 0, 7);
        ctx.fill();
      } else ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (++f < 160) requestAnimationFrame(tick);
    else c.remove();
  })();
}

/** Coins that fly from an element toward the coin counter. */
export function coinBurst(from: HTMLElement | null, n = 8) {
  if (!from || reducedMotion()) return;
  const target = document.querySelector<HTMLElement>("[data-coin-target]");
  const a = from.getBoundingClientRect();
  const b = target?.getBoundingClientRect() ?? { left: innerWidth - 60, top: 20, width: 20, height: 20 };
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.className = "fly-coin";
    el.style.left = a.left + a.width / 2 + "px";
    el.style.top = a.top + a.height / 2 + "px";
    document.body.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const jx = (Math.random() - 0.5) * 80,
      jy = -40 - Math.random() * 60;
    el.animate(
      [
        { transform: "translate(0,0) scale(.6)", opacity: 0 },
        { transform: `translate(${jx}px,${jy}px) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0.2 },
      ],
      { duration: 900 + i * 60, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" },
    ).onfinish = () => el.remove();
  }
}

export function Speech({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "lime" | "ink" }) {
  return <div className={`speech ${tone}`}>{children}</div>;
}
