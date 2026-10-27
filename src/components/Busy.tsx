/* The loader for admin writes: a lime pill at the top where three ants march over a hill, with "Saving…". */
import { useBusy } from "../lib/busy";

export function Busy() {
  const verb = useBusy();
  return (
    <div className={`busy ${verb ? "on" : ""}`} role="status" aria-live="polite" aria-hidden={!verb}>
      <span className="busy-track" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <b>{verb || "Saving"}…</b>
    </div>
  );
}
