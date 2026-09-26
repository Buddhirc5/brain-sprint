/// <reference types="vite/client" />
/** true when the in-browser demo backend may be bundled (dev, standalone demo, and web builds without Supabase). */
declare const __DEMO__: boolean;
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DEMO?: string;
  readonly VITE_APP_URL?: string;
}
