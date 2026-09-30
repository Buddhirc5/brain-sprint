# Ant Arena — security controls

Built for companies with strict security needs. The production controls are enforced in Postgres (`supabase/migrations`), never only in the browser. The in-browser demo mirrors the same rules.

## Tenant isolation
- Every table carries `tenant_id` and has **Row Level Security** on. Players and admins can only reach their own company's rows.
- Players never read tables directly. They get a masked snapshot through a `SECURITY DEFINER` function: other players' Employee IDs are masked, and their emails, sign-in history and answer choices are hidden.
- Anyone signed out can call exactly one function, `tenant_public`, which returns brand and sign-in options only.

## Identity & roles
| Who | How they sign in |
|---|---|
| Super admin | Email + password (no self sign-up or email reset on this page), then an **authenticator app (TOTP)**. The database only grants super admin rights in a session verified with the authenticator (`public.is_super()` needs `aal2`), so a stolen password alone opens nothing. The console signs out after 15 min idle. Every action is audited. |
| Company admins | Password and/or magic link (each company chooses). An **authenticator app (TOTP)** can be required (on by default for the bank template): until the admin passes it (`aal2`), the database gives them no admin rights. Roles: Viewer < Host < Editor < Admin < Owner, and at least one Owner is always kept. Idle sign-out (5–30 min). Admin rights only count for **confirmed** emails, and never for anonymous users. |
| Players | Employee ID + "Is this you?" (no password), a 6-digit email code, or Microsoft Entra ID (optional). One device at a time for Employee ID: signing in elsewhere signs the old device out. Admins can lock a card or sign it out of all devices. |

## Private invite links
- Each company has a random 10-character **invite key** (about 50 bits, unambiguous characters). The player link is `#/t/<slug>/k/<KEY>`; the key is remembered on the device and removed from the address bar.
- When required (default for new companies; a switch in Settings for existing ones), the database refuses Employee ID lookup, claim and registration until the sign-in has presented the key (`join_company`, rate limited per user and IP). Guessing a company address is not enough.
- Players already signed in keep working. Admins can make a new link at any time; the old one stops working for new players. Changes are audited.
- For the strongest control, combine it with the staff allowlist.

## Lost authenticator
- On the two-step screen: **Lost your phone or authenticator app?** emails a one-time sign-in link to the account's own address.
- Opened on the same device within **10 minutes**, that session may remove the old authenticator (`mfa_reset_self`). The database checks the session's `amr` claim (set by Supabase Auth) for a recent email sign-in, so a password-only session can never do it.
- The admin then scans a new QR code. Each reset is written to the company audit log (and the super admin log for super admins) as a warning.
- Needs working email (custom SMTP). If email is down, remove the factor in Supabase → Authentication → Users.

## Fair play
- **Server-side scoring:** questions reach players without answers. The server checks each answer, times it from its own clock (with a 1.5 s grace), and returns the right answer and explanation only after the player has answered.
- **One try per sprint:** resets are admin-only and audited.
- **Certification exams:** right/wrong stays hidden until the exam can't be retaken (passed or out of attempts). Attempt limits are enforced by the server.
- **Live quiz:** answers are checked on the server. Correctness, rank and streak are hidden from phones until the host reveals. The answer key is stored where only hosts can read it.
- **Maker-checker (optional):** a second admin must approve quizzes, and the approver can't be the last editor.
- **Integrity scan:** re-derives every score and flags too-fast answers, over-time plays, plays before release, shared devices, many devices, and players not on the allowlist. Admins can disqualify a play.
- **Rate limits:** Employee ID lookups, game PINs, poll codes, email codes, passwords and MFA codes are all rate-limited, per user and per IP.

## Privacy
- **Collected:** only an Employee ID, a name, a unit and answers (email only if that sign-in method is used).
- **Consent:** a notice with a timestamp at registration.
- **Masking:** masked IDs on player screens, with an optional "last initial only".
- **Staff allowlist:** stored only as salted SHA-256 hashes.
- **Exports:** watermarked with the company, the exporter and the time; audited; optional ID masking; protected against spreadsheet formula injection.
- **Retention:** a purge of old plays.
- **Poll voters:** anonymous; respondent IDs are per-poll pseudonyms.

## Audit
- **Company audit log:** quiz changes, approvals, player edits, locks, exports, settings, branding, admin invites and role changes, disqualifications, gifts and purges.
- **Super admin audit log:** unlocks, wrong codes, companies created, updated, suspended or deleted, invites and library changes.

## Platform
- **No third parties:** fonts, characters and QR codes are bundled; there are no CDNs or analytics.
- **Escaping:** React escapes all text (no `dangerouslySetInnerHTML`). Inputs are validated server-side and control characters are stripped.
- **HTTP headers:** `vercel.json` sets a strict CSP (only self plus `*.supabase.co`, `upgrade-insecure-requests`, no plugins, locked `base-uri`/`form-action`), HSTS with preload, nosniff, no-referrer, a Permissions-Policy, Cross-Origin-Opener/Resource-Policy, and frame-ancestors limited to self and Microsoft Teams.
- **SQL injection:** the browser never sends SQL. Every call is a fixed, parameterised Postgres function (`SECURITY DEFINER`, `search_path = ''`); the only dynamic SQL is one `format('%I')` over a fixed table list in setup. Tables are unreachable without RLS.
- **Dependencies:** `npm audit` reports 0 known vulnerabilities in runtime packages.
- **Secrets:** the browser only ever has the Supabase **anon** key. Never put the service-role key in the app or in Vercel env vars starting with `VITE_`.

## Before go-live checklist
- [ ] Super admins: set up the authenticator app on first sign-in, and keep the recovery email safe (lost phone → emailed reset link).
- [ ] Supabase Auth: enable **leaked password protection**, set minimum password length 10, turn on **CAPTCHA** (hCaptcha/Turnstile) for sign-in/sign-up if you see abuse.
- [ ] Vercel: turn on **Firewall → Bot protection / Attack challenge mode** when needed.
- [ ] Custom SMTP set up; Confirm email ON; OTP length 6; MFA TOTP ON.
- [ ] Raise the anonymous sign-in rate limit, since an office behind one NAT shares one IP.
- [ ] Redirect URLs limited to your domains.
- [ ] Per client: require admin MFA, turn on maker-checker, set retention, and add a staff allowlist if needed.
- [ ] Supabase Pro for more than about 200 simultaneous live players, for daily backups and so the project never pauses.
