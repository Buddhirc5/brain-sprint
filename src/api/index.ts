/* Picks the backend: Supabase when configured (production), otherwise the in-browser demo. */
import type { Api } from "./Api";

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "";
export const FORCE_DEMO = __DEMO__ && (import.meta.env.VITE_DEMO === "1" || !SUPABASE_URL);

export async function createApi(): Promise<Api> {
  if (!FORCE_DEMO && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createSupabaseApi } = await import("./supabase");
    return createSupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (!__DEMO__) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  const { createDemoApi } = await import("./demo");
  return createDemoApi();
}
