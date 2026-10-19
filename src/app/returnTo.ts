/* "Come back here after signing in": a player who opens a live game (QR / PIN) before they have a
   player card is sent to the company app to sign in or register, then straight back to the game.
   Kept per tab for 30 minutes. */
const KEY = "bsx.returnTo";
const TTL = 30 * 60_000;

export function setReturnTo(slug: string, hash: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ slug, hash, at: Date.now() }));
  } catch {
    /* private mode: they can still re-enter the PIN */
  }
}

/** The pending destination for this company, if any — removed once read. */
export function takeReturnTo(slug: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as { slug: string; hash: string; at: number };
    if (r.slug !== slug) return null;
    sessionStorage.removeItem(KEY);
    if (Date.now() - r.at > TTL || !/^#\/(join|vote)(\/|$)/.test(r.hash)) return null;
    return r.hash;
  } catch {
    return null;
  }
}
