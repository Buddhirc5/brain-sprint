/* Private invite links (#/t/<slug>/k/<KEY>): the key is remembered per company on this device,
   then shown to the server before a new player looks up, claims or registers a card. */
import type { Api } from "../api/Api";
import { ApiError } from "../api/Api";
import { LS } from "../lib/util";

const k = (slug: string) => "bsx.jk." + slug;
export const getJoinKey = (slug: string) => LS.get(k(slug)) || "";
export const setJoinKey = (slug: string, key: string | null) => LS.set(k(slug), key);
/** Marker: this device was let in by a live game's PIN (the server already holds the pass). */
export const LIVE_PASS = "~LIVE";
/** Accepts a whole pasted link or just the key. */
export function cleanJoinKey(s: string) {
  const m = s.match(/\/k\/([A-Za-z0-9-]+)/);
  return (m ? m[1] : s).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

/** Before a new player signs in: present the remembered key (no-op when there is none). */
export async function joinIfNeeded(api: Api, tid: string, slug: string) {
  const key = getJoinKey(slug);
  if (!key || key === LIVE_PASS) return;
  if (!api.user()) await api.signInAnonymous();
  if (!(await api.joinCompany(tid, key))) {
    setJoinKey(slug, null);
    throw new ApiError("forbidden", "This invite link isn't valid any more. Ask your company for the current link.");
  }
}
