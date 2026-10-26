/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DEMO?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string; // Web Push public key (scripts/vapid.mjs); without it, phone notifications stay off
}
