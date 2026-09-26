# Ant Arena — security controls

Built for regulated clients such as banks. The production controls are enforced in Postgres (`supabase/migrations`), never only in the browser. The in-browser demo mirrors the same rules.

## Tenant isolation
- Every table carries `tenant_id` and has **Row Level Security** on. Players and admins can only reach their own company's rows.
- Players never read tables directly. They get a masked snapshot through a `SECURITY DEFINER` function: other players' Employee IDs are masked, and their emails, sign-in history and answer choices are hidden.
- Anyone signed out can call exactly one function, `tenant_public`, which returns brand and sign-in options only.

## Identity & roles
| Who | How they sign in |
|---|---|
| Super admin | Email + password, then a **super admin code** (bcrypt-hashed, starts as `Sandeepa`, change it straight away). 5 wrong codes → locked for 1 min, doubling up to 15 min. Unlock lasts 30 min and the console locks after 15 min idle. Every attempt is audited. |
| Company admins | Password and/or magic link (each company chooses). An **authenticator app (TOTP)** can be required (on by default for the bank template): until the admin passes it (`aal2`), the database gives them no admin rights. Roles: Viewer < Host < Editor < Admin < Owner, and at least one Owner is always kept. Idle sign-out (5–30 min). Admin rights only count for **confirmed** emails, and never for anonymous users. |
| Players | Employee ID + "Is this you?" (no password), a 6-digit email code, or Microsoft Entra ID (optional). One device at a time for Employee ID: signing in elsewhere signs the old device out. Admins can lock a card or sign it out of all devices. |

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
- **HTTP headers:** `vercel.json` sets a strict CSP (only self plus `*.supabase.co`), HSTS, nosniff, no-referrer, a Permissions-Policy, and frame-ancestors limited to self and Microsoft Teams.
- **Secrets:** the browser only ever has the Supabase **anon** key. Never put the service-role key in the app or in Vercel env vars starting with `VITE_`.

## Before go-live checklist
- [ ] Change the super admin code from `Sandeepa`.
- [ ] Custom SMTP set up; Confirm email ON; OTP length 6; MFA TOTP ON.
- [ ] Raise the anonymous sign-in rate limit, since an office behind one NAT shares one IP.
- [ ] Redirect URLs limited to your domains.
- [ ] Per client: require admin MFA, turn on maker-checker, set retention, and add a staff allowlist if needed.
- [ ] Supabase Pro for more than about 200 simultaneous live players, for daily backups and so the project never pauses.
