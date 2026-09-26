# Brain Sprint

White-label learning games for companies: **Daily Sprint** quizzes (coins, streaks, levels, leaderboards, cartoon characters), **Live Quiz** (game-show style, game PIN + big screen), **Live Polls** (word cloud, multiple choice, scale, ranking, open text, Q&A) and **Certification** exams with printable certificates.

You run one installation. You (the **super admin**) create a company for each client. Each company gets its own web address, brand (name, logo, colours, wording), admins, players and questions, and can't see any other company's data.

**Stack:** React 18 + TypeScript + Vite · Supabase (Postgres + Row Level Security, Auth, Realtime) · Vercel.

---

## 1. Try it in 30 seconds (no setup)

```bash
npm install
npm run dev          # http://localhost:5173
```

With no Supabase keys, the app runs a full **demo backend inside the browser** (data is kept in localStorage):

| What | Where | Sign in |
|---|---|---|
| Landing page | `#/` | — |
| Experience (guided demo tour) | `#/experience` | — |
| Sign in (join a game, vote, company & admin sign-in) | `#/signin` | — |
| Knowledge World (mini game preview) | `#/world` | — |
| Harbor Bank, player app (bank template, custom brand) | `#/t/harbor` | Employee ID `DEMO-101` … `DEMO-130` |
| Harbor Bank, admin portal | `#/t/harbor/admin` | `admin@harbor.demo` / `demo1234` (Owner) · `host@harbor.demo` / `demo1234` (Host) |
| Northwind Traders (generic template) | `#/t/northwind` · `/admin` | `admin@northwind.demo` / `demo1234` |
| Live poll (audience) | `#/vote/482913` | anonymous |
| Super admin console | `#/super` | `super@demo.app` / `demo1234`, then code **Sandeepa** |

In the demo, email codes and links appear in a blue "Demo inbox" box instead of being emailed. To test a live game, host it from the admin portal and press **+ Open a test player** to open player tabs.

**Demo sandbox on a live site.** When Supabase is configured, visitors can still try everything from `#/experience`: the first click switches their browser to the in-browser demo (a "Demo sandbox · Exit demo" bar stays on screen). Nothing they do is sent to the database; it's kept in their browser's localStorage.

`npm run build:demo` produces **one self-contained HTML file** (`dist-demo/index.html`) that you can email to a prospect or open from disk.

## 2. Open in Cursor

1. Unzip, then **File → Open Folder…** and pick `brain-sprint`.
2. Open the terminal (`` Ctrl+` ``) and run `npm install`, then `npm run dev`.
3. Useful commands: `npm run typecheck`, `npm run build`, `npm run build:demo`.

Where things live:

```
src/
  api/Api.ts            the backend contract (every data operation)
  api/demo/             in-browser demo backend (same rules as production)
  api/supabase/         production backend client
  api/engine.ts         shared rules: live points, poll results, default settings
  lib/scoring.ts        points, coins, levels, streaks, leaderboards (also shown in the in-app guide)
  pages/                home, company player app, admin gate
  player/               Daily Sprint + certification (player side)
  admin/                company admin portal (dashboard, quizzes, players, results, rewards, security, admins, branding, settings)
  live/                 live quiz: admin tab, host screen, phone controller
  polls/                live polls: editor, presenter screen, voting page
  cert/                 printable certificate
  super/                super admin console
  world/                Knowledge World: 2D papercraft platformer + racing mini game (canvas, lazy-loaded)
supabase/               SQL migrations, seed, backend README
```

## Knowledge World (add-on)

A side-scrolling papercraft city players can open from their lobby: run and jump across rooftops, pop "?" bubbles for trivia, pick one of three cars and race Sprinty over the hills (spring suspension, air control, boost), with a day/night cycle and synthesised sound. Arrow keys/A D + Space + E on desktop; big thumb buttons on phones. It is **off by default**: switch it on per company in the super admin console (**Features & sign-in → Knowledge World**) or in the company's **Settings**. Nothing in it is saved to the server (coins and best laps live in the player's browser).

**Question images:** every quiz question can carry a picture. The admin portal resizes and compresses it in the browser (about 50–250 KB) and it's stored with the question.

## 3. Set up Supabase (free plan)

1. Create a project at [supabase.com](https://supabase.com) (the free plan is fine to start).
2. In **SQL Editor**, run these files in order: `supabase/migrations/0001_schema.sql`, `0002_security.sql`, `0003_functions.sql`, `0004_question_images.sql`, then `supabase/seed.sql`.
3. Make yourself super admin: `select public.bootstrap_super_admin('you@yourmail.com');`
4. In **Authentication**, turn **Anonymous sign-ins ON**, set the **email OTP length to 6**, enable **MFA (TOTP)**, add your redirect URLs, and raise the anonymous sign-in rate limit. The full checklist is in `supabase/README.md` §3.
5. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (**Project Settings → API**).
6. Run `npm run dev`. The app now uses Supabase. Open `#/super`, sign in with your email ("First time? Set a password"), and unlock with **Sandeepa**. **Change the code straight away** (you'll see a red banner until you do).

Optional: `npm run test:supabase` runs about 230 end-to-end checks against a Supabase stack (see `supabase/README.md`).

## 4. Deploy to Vercel

1. Push the folder to a GitHub repo, then use **Vercel → Add New → Project → Import** on it.
2. The framework is detected as **Vite**; `vercel.json` already sets the build and the security headers.
3. **Environment Variables:** add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_APP_URL` (your Vercel address, used in QR codes).
4. Deploy. Then add the Vercel URL to Supabase → Authentication → URL Configuration (Site URL + Redirect URLs).

Routes use `#/…` hash URLs, so no rewrites are needed and links work anywhere.

## 5. Onboard a client

1. `#/super` → **New company**. Enter the name, the web address (e.g. `acme-bank`), the template (**Bank** = Branch/Department wording, maker-checker and admin MFA on), the owner's email, brand colours and logo, and whether to include the starter library.
2. Send the owner the two links the wizard shows:
   - player link: `https://your-app/#/t/acme-bank`
   - admin link: `https://your-app/#/t/acme-bank/admin`

   The owner signs in with that email ("First time? Set a password").
3. The owner invites their own admins (**Admins** tab: Owner, Admin, Editor, Host, Viewer), adds players (or lets staff register), edits quizzes, and sets branding and features.
4. You can suspend, edit or delete a company at any time and see usage per company.

## 6. Free-plan limits (Supabase)

- **Database:** 500 MB, which is plenty for thousands of players (use **Security → Purge old plays** for retention).
- **Realtime:** about **200 concurrent connections**. A live game or poll with more than about 200 phones at once needs **Supabase Pro ($25/month)**; no code changes. If Realtime is full, screens fall back to polling every few seconds.
- **Inactivity:** free projects pause after 7 days without activity (Pro doesn't).
- **Email:** the built-in sender only allows a few emails per hour, so add your own SMTP (e.g. Resend, Postmark or SES) before going live.

## 7. Security

See `SECURITY.md`. In short:

- **Tenant isolation** by Postgres Row Level Security.
- **Server-side scoring:** answer keys never reach players.
- **Access:** role-based access, optional or required authenticator-app MFA for admins, a super admin code as a second factor with lockout, and rate limits on every guessable input.
- **Records and devices:** audit logs per company and for the super admin, idle sign-out, and one device at a time for Employee-ID players.
- **Headers:** strict security headers on Vercel.

## 8. Ownership

Brain Sprint is your product. Before selling it, check that your employment contract or any client agreement doesn't claim the IP. The demo companies (Harbor Bank, Northwind Traders) are fictional.
