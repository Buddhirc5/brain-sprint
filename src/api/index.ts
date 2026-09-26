/* Picks the backend: Supabase when configured (production), otherwise the in-browser demo.
   The demo is always bundled (as its own lazy chunk) so a production site can offer a
   sandbox that keeps every change in the visitor's browser — see app/sandbox.ts. */
import type { Api } from "./Api";

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "";
export const FORCE_DEMO = import.meta.env.VITE_DEMO === "1" || !SUPABASE_URL || !SUPABASE_ANON_KEY;

export async function createApi(sandbox = false): Promise<Api> {
  if (!FORCE_DEMO && !sandbox) {
    const { createSupabaseApi } = await import("./supabase");
    return createSupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  const { createDemoApi } = await import("./demo");
  return createDemoApi();
}
