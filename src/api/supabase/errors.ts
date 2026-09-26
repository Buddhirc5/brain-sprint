/* Maps Postgres/PostgREST/Auth errors to ApiError.
   Server functions raise '<code>: <message>' or '<code>:<waitMs>: <message>'
   (see supabase/migrations/0003_functions.sql). */
import { ApiError, type ApiCode } from "../Api";

const CODE_RE = /^(auth|forbidden|not_found|invalid|conflict|rate_limited|suspended|closed)(?::(\d+))?: ([\s\S]*)$/;

interface ErrLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A value returned by functions that record a failure before reporting it. */
export interface ErrPayload {
  error: { code: ApiCode; message: string; wait?: number };
}
export function isErrPayload(v: unknown): v is ErrPayload {
  if (!v || typeof v !== "object" || !("error" in v)) return false;
  const e = (v as { error: unknown }).error;
  return !!e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string" && typeof (e as { message?: unknown }).message === "string";
}
export function fromPayload(p: ErrPayload): ApiError {
  return new ApiError(p.error.code, p.error.message, p.error.wait);
}

const isNetwork = (msg: string) => /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(msg);

/** Errors from supabase.rpc() / from() */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const o = (e && typeof e === "object" ? e : {}) as ErrLike;
  const msg = str(o.message) || (typeof e === "string" ? e : "");
  const m = CODE_RE.exec(msg);
  if (m) return new ApiError(m[1] as ApiCode, m[3], m[2] ? Number(m[2]) : undefined);
  const code = str(o.code);
  if (code === "PGRST301" || code === "PGRST302" || /jwt expired|invalid jwt/i.test(msg)) return new ApiError("auth", "Your session has expired. Please sign in again.");
  if (code === "42501" || /permission denied/i.test(msg)) return new ApiError("forbidden", "You don't have permission for that.");
  if (code === "PGRST202") return new ApiError("not_found", "The server isn't fully set up yet (a database function is missing).");
  if (code === "57014") return new ApiError("network", "The server took too long. Try again.");
  if (isNetwork(msg) || o.name === "TypeError") return new ApiError("network", "Can't reach the server. Check your connection.");
  return new ApiError("invalid", msg || "Something went wrong.");
}

/** Errors from supabase.auth.* */
export function authError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const o = (e && typeof e === "object" ? e : {}) as ErrLike;
  const code = str(o.code);
  const msg = str(o.message);
  const status = typeof o.status === "number" ? o.status : 0;
  if (status === 429 || /rate_limit/.test(code) || /rate limit|too many/i.test(msg))
    return new ApiError("rate_limited", "Too many tries. Wait a minute and try again.", 60_000);
  switch (code) {
    case "invalid_credentials":
      return new ApiError("auth", "Email or password is wrong.");
    case "email_not_confirmed":
      return new ApiError("auth", "Confirm your email first — check your inbox for the link.");
    case "otp_expired":
      return new ApiError("auth", "That code has expired or isn't right. Send a new one.");
    case "user_already_exists":
    case "email_exists":
      return new ApiError("conflict", "This email already has an account. Sign in instead.");
    case "weak_password":
      return new ApiError("invalid", msg || "Choose a stronger password.");
    case "validation_failed":
    case "email_address_invalid":
      return new ApiError("invalid", "Enter a valid email.");
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return new ApiError("auth", "That code isn't right. Check the time on your phone.");
    case "anonymous_provider_disabled":
      return new ApiError("forbidden", "Guest sign-in is turned off on the server (enable Anonymous sign-ins in Supabase).");
    case "provider_disabled":
    case "oauth_provider_not_supported":
      return new ApiError("forbidden", "This sign-in method isn't enabled for this site yet.");
    case "signup_disabled":
    case "otp_disabled":
      return new ApiError("forbidden", "New sign-ups are turned off. Ask your admin to invite you.");
    case "session_not_found":
    case "refresh_token_not_found":
      return new ApiError("auth", "Your session has expired. Please sign in again.");
  }
  if (isNetwork(msg) || o.name === "AuthRetryableFetchError") return new ApiError("network", "Can't reach the server. Check your connection.");
  return new ApiError("auth", msg || "Sign-in failed.");
}
