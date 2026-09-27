/* Light or dark "stage" for the big screens and audience phones (live polls, live quiz).
   Light is the default; the choice is remembered per device. */
import { useCallback, useEffect, useState } from "react";

export type StageMode = "light" | "dark";
const KEY = "bsx.stage";
const EVT = "bsx-stage";

export function getStageMode(): StageMode {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useStageMode(): [StageMode, () => void] {
  const [mode, setMode] = useState<StageMode>(getStageMode);
  useEffect(() => {
    const f = () => setMode(getStageMode());
    window.addEventListener(EVT, f);
    window.addEventListener("storage", f);
    return () => {
      window.removeEventListener(EVT, f);
      window.removeEventListener("storage", f);
    };
  }, []);
  const toggle = useCallback(() => {
    const next: StageMode = getStageMode() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: still switch for this page */
    }
    setMode(next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [mode, toggle];
}

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
/** Sun / moon button. Shows what you'll switch to. */
export function StageModeToggle({ mode, onToggle, className = "", label }: { mode: StageMode; onToggle: () => void; className?: string; label?: boolean }) {
  const to = mode === "dark" ? "Light mode" : "Dark mode";
  return (
    <button type="button" className={className} onClick={onToggle} aria-label={`${to} (T)`} title={`${to} (T)`}>
      {mode === "dark" ? (
        <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
      )}
      {label && <span>{to}</span>}
    </button>
  );
}
