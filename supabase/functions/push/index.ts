// Ant Arena · phone notifications (Web Push). Deploy: supabase functions deploy push --no-verify-jwt
//
//   POST { tid, title, body, unit?, daily? }   an admin sending now (their sign-in in Authorization: Bearer …)
//   POST { tid, gift }                         an admin telling a Hall of Fame winner (once per gift)
//   POST { cron: true }                        the hourly schedule (header x-cron-secret) → daily reminders
//
// The admin's role, the rate limit and the audit entry are all checked in the database (push_begin), with the
// admin's own sign-in. Only then does this function read the devices with the service role and send.
// Secrets (supabase secrets set …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*", // the caller proves who they are with a bearer token, not cookies
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
/** Errors go back as { error: { code, message, wait? } } — the app's ApiError shape. */
const fail = (code: string, message: string, wait?: number) => json({ error: { code, message, ...(wait ? { wait } : {}) } });

/** private.err() raises "code: message" or "code:wait: message". */
function pgError(msg: string) {
  const m = /^([a-z_]+)(?::(\d+))?: (.*)$/s.exec(msg || "");
  return m ? fail(m[1], m[3], m[2] ? Number(m[2]) : undefined) : fail("network", "Couldn't send right now. Try again.");
}

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const service = () => createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

/** Send one prepared message to every device it targets; report back and forget dead addresses. */
async function deliver(send: { id: string; slug: string; title: string; body: string; daily: boolean }) {
  const db = service();
  const { data: subs, error } = await db.rpc("push_targets", { p_send: send.id });
  if (error) throw new Error(error.message);
  const payload = JSON.stringify({
    title: send.title,
    body: send.body,
    url: `/#/t/${send.slug}`,
    tag: send.daily ? `daily-${send.slug}` : `msg-${send.id}`,
  });
  const queue = [...((subs as { endpoint: string; p256dh: string; auth: string }[]) || [])];
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  const worker = async () => {
    for (let s = queue.pop(); s; s = queue.pop()) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: send.daily ? 6 * 3600 : 24 * 3600, // a reminder is stale by the evening; a message keeps for a day
          urgency: "normal",
        });
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint); // the app was removed or notifications turned off
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(20, queue.length) }, worker));
  await db.rpc("push_done", { p_send: send.id, p_sent: sent, p_failed: failed, p_dead: dead });
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("invalid", "POST only.");
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) return fail("invalid", "Phone notifications aren't set up on the server yet (VAPID keys missing).");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return fail("invalid", "Bad request.");
  }

  // hourly schedule → today's reminders for the companies whose reminder hour it is
  if (body.cron === true) {
    if (!sameSecret(req.headers.get("x-cron-secret") ?? "", CRON_SECRET)) return new Response("forbidden", { status: 403, headers: CORS });
    const { data, error } = await service().rpc("push_daily_claim");
    if (error) return fail("network", error.message);
    const out: Record<string, { sent: number; failed: number }> = {};
    for (const r of (data as { send_id: string; tid: string; slug: string; title: string; body: string }[]) || []) {
      out[r.slug] = await deliver({ id: r.send_id, slug: r.slug, title: r.title, body: r.body, daily: true }).catch(() => ({ sent: 0, failed: -1 }));
    }
    return json({ ok: true, companies: out });
  }

  // an admin sending now: the database checks their role and the rate limit with their own sign-in
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return fail("auth", "Please sign in.");
  const asAdmin = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = body.gift
    ? await asAdmin.rpc("push_begin_gift", { p_tid: String(body.tid ?? ""), p_gift: String(body.gift) }) // a Hall of Fame win → the winner
    : await asAdmin.rpc("push_begin", {
        p_tid: String(body.tid ?? ""),
        p_title: String(body.title ?? ""),
        p_body: String(body.body ?? ""),
        p_unit: body.unit ? String(body.unit) : null,
        p_daily: body.daily === true,
      });
  if (error) return pgError(error.message);
  if (!data) return json({ sent: 0, failed: 0 }); // this gift's winner was already told
  try {
    return json(await deliver(data as { id: string; slug: string; title: string; body: string; daily: boolean }));
  } catch {
    return fail("network", "Saved, but sending failed. Try again in a minute.");
  }
});
