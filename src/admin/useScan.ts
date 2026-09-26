import { useEffect, useState } from "react";
import { useApp } from "../app/ctx";
import { scan, type Flag } from "../lib/integrity";

/** Runs the integrity scan whenever plays, quizzes, keys or the allowlist change. */
export function useScan(): { flags: Flag[]; ready: boolean } {
  const { players, d } = useApp();
  const [state, setState] = useState<{ flags: Flag[]; ready: boolean }>({ flags: [], ready: false });
  useEffect(() => {
    let live = true;
    scan(players, d.games, d.keys, d.roster).then(
      (flags) => live && setState({ flags, ready: true }),
      () => live && setState({ flags: [], ready: true }),
    );
    return () => {
      live = false;
    };
  }, [players, d.games, d.keys, d.roster]);
  return state;
}
