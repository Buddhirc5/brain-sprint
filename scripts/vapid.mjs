// Make a Web Push (VAPID) key pair for phone notifications. Run once: node scripts/vapid.mjs
// • VITE_VAPID_PUBLIC_KEY → Vercel environment variables (the app needs it to subscribe phones)
// • VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET → supabase secrets set …
// Keep the private key secret. Changing keys later means every phone has to turn reminders on again.
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]).toString("base64url");

console.log(`# Vercel (Project → Settings → Environment Variables), then redeploy
VITE_VAPID_PUBLIC_KEY=${raw}

# Supabase (Edge Function secrets)
supabase secrets set VAPID_PUBLIC_KEY=${raw} VAPID_PRIVATE_KEY=${priv.d} VAPID_SUBJECT=mailto:you@yourcompany.com CRON_SECRET=${randomBytes(24).toString("base64url")}
`);
