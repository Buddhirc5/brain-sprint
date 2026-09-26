/* RFC 6238 TOTP (used only by the demo backend; Supabase does this server-side). */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newSecret(bytes = 20): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = "";
  b.forEach((x) => (bits += x.toString(2).padStart(8, "0")));
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(s: string): Uint8Array {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v >= 0) bits += v.toString(2).padStart(5, "0");
  }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

export async function totp(secret: string, t = Date.now(), step = 30): Promise<string> {
  const counter = Math.floor(t / 1000 / step);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setUint32(4, counter);
  new DataView(msg).setUint32(0, Math.floor(counter / 2 ** 32));
  const key = await crypto.subtle.importKey("raw", decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, "0");
}

/** Accepts the current code and the ones either side (clock drift). */
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const c = code.replace(/\s/g, "");
  for (const d of [0, -30_000, 30_000]) if ((await totp(secret, Date.now() + d)) === c) return true;
  return false;
}

export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
