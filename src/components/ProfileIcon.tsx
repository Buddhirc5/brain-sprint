/* Line icons for profile traits (no emoji): 24×24, drawn with the current colour. */
import type { ProfileIconName } from "../types";

const P: Record<ProfileIconName, string> = {
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
  clipboard: "M9 4h6v3H9zM7 5.5H5.5V21h13V5.5H17M8.5 11.5l2 2 4-4M8.5 17h7",
  bolt: "M13 2.5 4.5 14H11l-1 7.5L19.5 10H13l0-7.5Z",
  hands: "M3 12.5 7.5 8l3 1.5L14 7l7 5.5M3 12.5l4.5 5 2-1.5 1.5 1.5 2-1.5 1.5 1.5L21 12.5M9.5 9.5 12 12",
  anchor: "M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 0V21m0 0c-4.5 0-7.5-3-7.5-7.5M12 21c4.5 0 7.5-3 7.5-7.5M3 13.5h3M18 13.5h3M8.5 11h7",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  heart: "M12 20.5S3.5 15.5 3.5 9.3A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 8.5 2.1c0 6.2-8.5 11.2-8.5 11.2Z",
  flame: "M12 21.5c-4 0-6.5-2.7-6.5-6.3 0-4.4 4.2-6.2 4.2-11 3 2 6.8 5.5 6.8 10.3 0 .9-.2 1.7-.5 2.3.9-.6 1.6-1.8 1.8-3 1 1.2 1.7 2.5 1.7 4.2 0 2.3-2.6 3.5-7.5 3.5Z",
  leaf: "M5 19c0-9 5.5-14.5 15-15 0 9.5-5.5 15-14 15H5Zm0 0 8-8",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  shield: "M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 10",
  rocket: "M14.5 4.5c3-1.5 5-1 5-1s.5 2-1 5L13 14l-3-3 4.5-6.5ZM10 11l-4.5-.5L8 8h4M13 14l.5 4.5L16 16v-4M6.5 17.5c-1 0-2 1-2 2.5 1.5 0 2.5-1 2.5-2",
  puzzle: "M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4V8Z",
  crown: "M3.5 8 7.5 12 12 5l4.5 7 4-4-2 11h-13l-2-11Z",
  wave: "M2.5 9c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 4 2.5M2.5 15c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 4 2.5",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
};

export function ProfileIcon({ name, size = 24, className }: { name: ProfileIconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.star} />
    </svg>
  );
}
/** Path data, for drawing icons on a canvas (share card). */
export const iconPath = (name: ProfileIconName) => P[name] || P.star;

/** One colour per trait slot (traits are listed in order). */
export const TRAIT_COLORS = ["#7C5CFF", "#2D6BE4", "#FF5A1F", "#16A673", "#C99A06", "#E0457B"];
