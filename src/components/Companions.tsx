/* Pets and rides from the store, drawn in the same chunky outline style as the characters (Chibi.tsx).
   <Pet> sits beside a character, <Ride> under it; <Kit> puts the three together. The 3D map draws the same
   SVGs onto canvases (map3d/chibiTexture.ts). */
import type { ReactElement } from "react";
import { Chibi, type Mood } from "./Chibi";
import type { Equipped } from "../types";
import { artUrl } from "./Painted";

const INK = "#1B1A17";
const S = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const cheek = (x: number, y: number) => <ellipse cx={x} cy={y} rx="3.4" ry="2" fill="#FF8A93" opacity=".7" />;
const eyes = (x1: number, x2: number, y: number, r = 3) => (
  <g>
    <circle cx={x1} cy={y} r={r} fill={INK} />
    <circle cx={x2} cy={y} r={r} fill={INK} />
    <circle cx={x1 - 1} cy={y - 1.2} r={r * 0.36} fill="#fff" />
    <circle cx={x2 - 1} cy={y - 1.2} r={r * 0.36} fill="#fff" />
  </g>
);

/* pets: viewBox 0 0 100 80, feet on y≈76 */
const PETS: Record<string, () => ReactElement> = {
  "pet-cat": () => (
    <g>
      <path className="tail" d="M20 60 Q4 50 12 30" fill="none" stroke="#F0A04B" strokeWidth="8" strokeLinecap="round" />
      <path d="M20 60 Q4 50 12 30" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" opacity="0" />
      <ellipse cx="46" cy="60" rx="26" ry="16" fill="#F0A04B" {...S} />
      <path d="M50 26 L54 8 L64 20 Z M74 20 L84 8 L86 26 Z" fill="#F0A04B" {...S} />
      <circle cx="68" cy="34" r="18" fill="#F0A04B" {...S} />
      <path d="M56 22 l3 6 M68 18 v6 M80 22 l-3 6" stroke="#C97A2B" strokeWidth="2.4" strokeLinecap="round" />
      {eyes(62, 75, 34)}
      <path d="M66 41 q2.5 2.5 5 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      {cheek(57, 40)}
      {cheek(80, 40)}
      <path d="M36 74 v-6 M54 74 v-6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  "pet-corgi": () => (
    <g>
      <ellipse cx="44" cy="58" rx="30" ry="15" fill="#E9A15C" {...S} />
      <path d="M22 70 v6 M36 72 v5 M54 72 v5 M66 70 v6" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path className="tail" d="M14 52 q-8 -6 -2 -12" fill="#E9A15C" {...S} />
      <path d="M58 20 L54 2 L68 14 Z M80 14 L92 2 L88 22 Z" fill="#E9A15C" {...S} />
      <circle cx="72" cy="32" r="18" fill="#E9A15C" {...S} />
      <path d="M62 40 q10 10 20 0 q-4 -6 -10 -6 q-6 0 -10 6z" fill="#FFF3E2" />
      {eyes(65, 79, 30)}
      <ellipse cx="72" cy="38" rx="3.6" ry="2.6" fill={INK} />
      <path d="M72 41 v3 M72 44 q-3 3 -5 1 M72 44 q3 3 5 1" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  ),
  "pet-owl": () => (
    <g>
      <path d="M26 30 L22 10 L38 22 M74 30 L78 10 L62 22" fill="#8A6BBE" {...S} />
      <ellipse cx="50" cy="44" rx="28" ry="30" fill="#8A6BBE" {...S} />
      <ellipse cx="50" cy="56" rx="17" ry="16" fill="#C9B6EC" />
      <path d="M40 54 q4 4 8 0 M52 60 q4 4 8 0 M42 64 q4 4 8 0" fill="none" stroke="#8A6BBE" strokeWidth="2" />
      <circle cx="38" cy="36" r="11" fill="#fff" {...S} />
      <circle cx="62" cy="36" r="11" fill="#fff" {...S} />
      {eyes(38, 62, 36, 5)}
      <path d="M46 44 L50 50 L54 44 Z" fill="#FFC21A" {...S} strokeWidth="2" />
      <path d="M40 74 h6 M54 74 h6" stroke="#FFC21A" strokeWidth="4" strokeLinecap="round" />
      <path d="M28 30 h44" stroke={INK} strokeWidth="0" />
      <circle cx="38" cy="36" r="15" fill="none" stroke={INK} strokeWidth="2.4" />
      <circle cx="62" cy="36" r="15" fill="none" stroke={INK} strokeWidth="2.4" />
      <path d="M53 36 h-6" stroke={INK} strokeWidth="2.4" />
    </g>
  ),
  "pet-bunny": () => (
    <g>
      <path className="ear-l" d="M44 30 Q36 2 46 2 Q54 4 52 30" fill="#FFFFFF" {...S} />
      <path d="M58 30 Q62 0 72 4 Q78 10 64 32" fill="#FFFFFF" {...S} />
      <path d="M46 26 Q42 10 47 8 M60 26 Q66 10 70 8" stroke="#FFB3CF" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="50" cy="60" rx="26" ry="17" fill="#FFFFFF" {...S} />
      <circle cx="24" cy="58" r="7" fill="#fff" {...S} />
      <circle cx="56" cy="40" r="17" fill="#FFFFFF" {...S} />
      {eyes(50, 63, 39)}
      <path d="M55 46 q1.5 2 3 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      {cheek(46, 45)}
      {cheek(68, 45)}
    </g>
  ),
  "pet-panda": () => (
    <g>
      <ellipse cx="50" cy="60" rx="28" ry="17" fill="#fff" {...S} />
      <path d="M28 66 q-4 10 6 10 h6 v-8 M72 66 q4 10 -6 10 h-6 v-8" fill={INK} />
      <circle cx="34" cy="20" r="8" fill={INK} />
      <circle cx="66" cy="20" r="8" fill={INK} />
      <circle cx="50" cy="36" r="20" fill="#fff" {...S} />
      <ellipse cx="42" cy="36" rx="6" ry="7.5" fill={INK} transform="rotate(-20 42 36)" />
      <ellipse cx="58" cy="36" rx="6" ry="7.5" fill={INK} transform="rotate(20 58 36)" />
      <circle cx="42.5" cy="35" r="2" fill="#fff" />
      <circle cx="57.5" cy="35" r="2" fill="#fff" />
      <ellipse cx="50" cy="44" rx="3.2" ry="2.3" fill={INK} />
      <path d="M47 48 q3 2 6 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M60 58 q10 -2 12 -14" stroke="#7BC86C" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M70 44 q6 -2 6 -8 q-6 0 -8 6" fill="#7BC86C" />
    </g>
  ),
  "pet-dragon": () => (
    <g>
      <path className="wing" d="M30 44 L6 26 L14 50 Z M70 44 L94 26 L86 50 Z" fill="#FF8A5B" {...S} />
      <path className="tail" d="M26 64 Q8 66 10 52 l6 4" fill="#5BC28B" {...S} />
      <ellipse cx="50" cy="60" rx="24" ry="16" fill="#5BC28B" {...S} />
      <ellipse cx="50" cy="64" rx="13" ry="9" fill="#C6F4C9" />
      <path d="M40 16 L36 4 L46 12 M60 16 L64 4 L54 12" fill="#FFE27A" {...S} strokeWidth="2.4" />
      <circle cx="50" cy="32" r="19" fill="#5BC28B" {...S} />
      {eyes(43, 57, 31, 3.4)}
      <path d="M45 40 q5 4 10 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="46" cy="25" r="1.4" fill="#2E8F5E" />
      <circle cx="54" cy="25" r="1.4" fill="#2E8F5E" />
      {cheek(38, 37)}
      {cheek(62, 37)}
    </g>
  ),
};

/* rides: viewBox 0 0 140 60, the rider stands at y≈30 (top of the deck), wheels on y≈56 */
const RIDES: Record<string, () => ReactElement> = {
  "ride-skate": () => (
    <g>
      <path d="M18 34 Q20 26 30 26 h80 Q120 26 122 34 Z" fill="#E86A38" {...S} />
      <path d="M40 30 h60" stroke="#FFD84D" strokeWidth="3" strokeLinecap="round" />
      <circle className="wheel" cx="38" cy="44" r="8" fill="#FFE27A" {...S} />
      <circle className="wheel" cx="102" cy="44" r="8" fill="#FFE27A" {...S} />
    </g>
  ),
  "ride-scooter": () => (
    <g>
      <path d="M100 32 L112 2" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M104 4 h16" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <rect x="22" y="30" width="86" height="10" rx="5" fill="#3D7BFF" {...S} />
      <circle className="wheel" cx="30" cy="48" r="8" fill="#333" {...S} />
      <circle className="wheel" cx="106" cy="48" r="8" fill="#333" {...S} />
    </g>
  ),
  "ride-bike": () => (
    <g>
      <circle className="wheel" cx="28" cy="42" r="15" fill="none" {...S} strokeWidth="4" />
      <circle className="wheel" cx="112" cy="42" r="15" fill="none" {...S} strokeWidth="4" />
      <path d="M28 42 L52 22 L96 22 L112 42 M52 22 L66 42 L96 22 M66 42 L28 42" fill="none" stroke="#2FA36B" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M96 22 L100 8 h10 M46 18 h14" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M28 30 v24 M16 42 h24 M112 30 v24 M100 42 h24" stroke="#999" strokeWidth="1.6" />
    </g>
  ),
  "ride-tuktuk": () => (
    <g>
      <path d="M10 46 Q12 6 66 4 Q120 6 128 46 Z" fill="#2FA36B" {...S} />
      <path d="M22 40 Q24 16 66 14 Q108 16 116 40 Z" fill="#CFEFFF" {...S} strokeWidth="2.4" />
      <path d="M10 46 h118 v6 H10 Z" fill="#FFC21A" {...S} />
      <circle cx="118" cy="30" r="4" fill="#FFF3B0" {...S} strokeWidth="2" />
      <circle className="wheel" cx="32" cy="54" r="7" fill="#333" {...S} />
      <circle className="wheel" cx="108" cy="54" r="7" fill="#333" {...S} />
    </g>
  ),
  "ride-hover": () => (
    <g>
      <ellipse cx="70" cy="32" rx="58" ry="10" fill="#6A4CF0" {...S} />
      <ellipse cx="70" cy="29" rx="42" ry="5" fill="#B9A6FF" />
      <path className="glow" d="M34 44 q4 6 0 12 M70 46 q4 6 0 10 M106 44 q4 6 0 12" stroke="#8FD3FF" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  ),
};

/** Rides the character sits in (drawn behind them) rather than stands on. */
export const RIDE_IN = new Set(["ride-tuktuk", "ride-bike"]);
/** how high the rider's feet sit (× character width) so they stand on the deck of the painted ride */
const RIDE_LIFT: Record<string, number> = { "ride-skate": 0.27, "ride-scooter": 0.1, "ride-hover": 0.17, "ride-bike": 0.03, "ride-tuktuk": 0.05 };

export const hasPet = (id?: string) => !!id && !!PETS[id];
export const hasRide = (id?: string) => !!id && !!RIDES[id];

export function Pet({ id, size = 60, className = "", still }: { id: string; size?: number; className?: string; still?: boolean }) {
  const draw = PETS[id];
  if (!draw) return null;
  const src = artUrl(`items/${id}`);
  if (src) return <img src={src} alt="" width={size} height={size * 0.8} className={`pet painted ${still ? "still" : ""} ${className}`} aria-hidden="true" draggable={false} />;
  return (
    <svg viewBox="0 0 100 80" width={size} height={size * 0.8} className={`pet ${still ? "still" : ""} ${className}`} aria-hidden="true">
      {draw()}
    </svg>
  );
}

export function Ride({ id, size = 120, className = "", still }: { id: string; size?: number; className?: string; still?: boolean }) {
  const draw = RIDES[id];
  if (!draw) return null;
  const src = artUrl(`items/${id}`);
  if (src) return <img src={src} alt="" width={size} height={(size * 60) / 140} className={`ride painted ${still ? "still" : ""} ${className}`} aria-hidden="true" draggable={false} />;
  return (
    <svg viewBox="0 0 140 60" width={size} height={(size * 60) / 140} className={`ride ${still ? "still" : ""} ${className}`} aria-hidden="true">
      {draw()}
    </svg>
  );
}

/** A character with their pet beside them and their ride under them (as equipped in the store). */
export function Kit({ look, equipped, size, mood, still, className = "" }: { look: number; equipped?: Equipped; size: number; mood?: Mood; still?: boolean; className?: string }) {
  const pet = hasPet(equipped?.pet) ? equipped!.pet! : null;
  const ride = hasRide(equipped?.ride) ? equipped!.ride! : null;
  if (!pet && !ride) return <Chibi look={look} equipped={equipped} variant="full" size={size} mood={mood} still={still} className={className} />;
  const h = Math.round((size * 162) / 120);
  const rideW = size * 1.15;
  const lift = ride ? size * (artUrl(`items/${ride}`) ? RIDE_LIFT[ride] ?? 0.12 : RIDE_IN.has(ride) ? 0.12 : 0.2) : 0;
  return (
    <span className={`kit ${className}`} style={{ width: size + (pet ? size * 0.42 : 0), height: h + lift }}>
      {ride && RIDE_IN.has(ride) && (
        <span className="kit-ride" style={{ width: rideW, left: (size - rideW) / 2 }}>
          <Ride id={ride} size={rideW} still={still} />
        </span>
      )}
      <span className="kit-me" style={{ bottom: lift }}>
        <Chibi look={look} equipped={equipped} variant="full" size={size} mood={mood} still={still} />
      </span>
      {ride && !RIDE_IN.has(ride) && (
        <span className="kit-ride" style={{ width: rideW, left: (size - rideW) / 2 }}>
          <Ride id={ride} size={rideW} still={still} />
        </span>
      )}
      {pet && (
        <span className="kit-pet" style={{ left: size * 0.86 }}>
          <Pet id={pet} size={size * 0.5} still={still} />
        </span>
      )}
    </span>
  );
}

/** For the 3D map: a pet or ride as an image the scene can draw. */
export function companionSvg(kind: "pet" | "ride", id: string): ReactElement | null {
  if (kind === "pet") return PETS[id] ? <Pet id={id} size={200} still /> : null;
  return RIDES[id] ? <Ride id={id} size={280} still /> : null;
}
