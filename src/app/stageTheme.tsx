/* The "stage" look for the big screens and audience phones (live polls, live quiz).
   There is one look, light; the old per-device light/dark switch is gone. */
export type StageMode = "light";

export function getStageMode(): StageMode {
  return "light";
}

/** Kept as a hook so screens read the mode in one way; it is always light. */
export function useStageMode(): [StageMode] {
  return ["light"];
}
