/* Demo sandbox.
   The demo backend (src/api/demo) runs entirely in this browser: every change is
   kept in localStorage and never reaches the database. When the app is deployed
   with Supabase, visitors can still try everything by "entering the demo" — this
   flag switches the whole app to the in-browser backend until they exit. */
import { SUPABASE_ANON_KEY, SUPABASE_URL, FORCE_DEMO } from "../api";

const KEY = "bsx.sandbox";

/** A real backend is configured, so the demo is an opt-in sandbox rather than the whole app. */
export const HAS_LIVE_BACKEND = !FORCE_DEMO && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

export function sandboxOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Switch this browser to the local demo and open `to` (a #/ route). */
export function enterSandbox(to = "#/experience") {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private mode: the demo still loads for this page view */
  }
  location.hash = to;
  location.reload();
}

/** Back to the real app. Demo data stays in this browser for next time. */
export function exitSandbox(to = "#/") {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  location.hash = to;
  location.reload();
}
