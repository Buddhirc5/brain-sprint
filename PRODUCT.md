# Ant Arena — Product Guide

> **Learning your team actually plays.**
> Gamified employee training, live games, polls and certification — under each client's own brand.

This document describes everything the Ant Arena web app does, written for people rather than developers. Use it as the source for proposals, pitch decks, sales one-pagers, posters and website copy. Technical setup lives in [README.md](README.md); security details in [SECURITY.md](SECURITY.md).

---

## Contents

1. [The one-line pitch](#1-the-one-line-pitch)
2. [The problem we solve](#2-the-problem-we-solve)
3. [What Ant Arena is](#3-what-ant-arena-is)
4. [Who it's for](#4-who-its-for)
5. [The four products in one](#5-the-four-products-in-one)
6. [The player experience](#6-the-player-experience)
7. [The company admin portal](#7-the-company-admin-portal)
8. [The super admin console (the business owner)](#8-the-super-admin-console-the-business-owner)
9. [White-label branding](#9-white-label-branding)
10. [Security and trust](#10-security-and-trust)
11. [Technology and hosting](#11-technology-and-hosting)
12. [The public website and free demo](#12-the-public-website-and-free-demo)
13. [How a client goes live](#13-how-a-client-goes-live)
14. [Business model ideas](#14-business-model-ideas)
15. [Why Ant Arena wins](#15-why-ant-arena-wins)
16. [Ready-made copy for pitches and posters](#16-ready-made-copy-for-pitches-and-posters)
17. [Feature checklist](#17-feature-checklist)
18. [Glossary](#18-glossary)

---

## 1. The one-line pitch

**Ant Arena turns compulsory training into two minutes of fun a day — daily quiz sprints, big-screen live games, instant polls and certification, all under your company's own name, logo and colours — and shows managers exactly where the knowledge gaps are.**

Shorter versions:

- *"Duolingo meets Kahoot, built for the workplace."*
- *"Two minutes a day. Measurable knowledge. Your brand."*
- *"Training people actually want to open."*

---

## 2. The problem we solve

| Today | With Ant Arena |
|---|---|
| Long e-learning modules nobody finishes | 2-minute daily sprints people come back to for streaks and coins |
| Compliance training feels like a chore | Game mechanics: points, levels, characters, leaderboards, team battles |
| Managers can't see what people actually know | Knowledge-gap analytics by topic, team and week, plus a printable PDF report |
| Town halls and trainings are one-way | Live quiz shows and polls where every phone in the room takes part |
| Certificates are managed in spreadsheets | Timed certification exams with automatic, branded, printable certificates and expiry dates |
| Separate tools for quizzes, polls and certificates | One platform, one login, one brand |
| Generic tools show someone else's logo | Fully white-label: every client sees only their own brand |

---

## 3. What Ant Arena is

Ant Arena is a **white-label, multi-company web platform** for learning and engagement:

- **One installation, many client companies.** The owner (super admin) creates a private space for each client company.
- **Each company is fully separate.** It gets its own web address, name, logo, colours, wording, admins, players, questions and results. No company can ever see another's data.
- **Nothing to install.** It runs in any modern browser on phones, tablets, laptops and projectors.
- **Works for any industry.** Built for global corporate teams: HR, compliance, sales, customer service, operations, IT security, onboarding and internal communications. A "Bank" template adds Branch/Department wording and stricter controls for regulated industries.

---

## 4. Who it's for

**Buyers (who pays):**
- HR and Learning & Development leaders
- Compliance, risk and information-security teams
- Sales enablement and customer-service managers
- Internal communications and leadership teams
- Training companies and consultants who want to resell under their own brand

**Users (who plays):**
- Employees at every level, on their own phone, in two minutes a day
- Audiences at town halls, workshops, onboarding days and conferences

**Typical use cases:**
- **HR & onboarding:** company culture, products, policies — learned in daily bites.
- **Compliance & safety:** data privacy, anti-fraud, cyber security, health & safety, code of conduct — with certificates, expiry dates and audit trails.
- **Sales & customer teams:** product knowledge refreshers and friendly team battles between offices and regions.
- **Leaders & internal comms:** all-hands polls, anonymous Q&A, and live games that get every room — and every video call — talking.

---

## 5. The four products in one

### 5.1 Daily Sprint — bite-sized daily quizzes

- Short quizzes (typically 1–5 questions in 1–2 minutes) that open on set dates.
- **Question types:** multiple choice, true/false, match the pairs, put in order.
- Optional **picture on any question** (compressed automatically in the browser).
- Optional **explanation** shown after answering, so every mistake becomes a lesson.
- **Scoring on the server** — answers are checked securely, so nobody can cheat from the browser.
- Points for correct and fast answers, **coins**, **daily streaks**, **levels** and **leaderboards**.
- A built-in **starter library** of ready-made questions, plus bulk import from spreadsheets (CSV).
- Maker-checker approval: an editor writes a quiz, another admin approves it before it goes live (optional, on by default for the Bank template).

### 5.2 Live Quiz — the game-show experience

A Kahoot-style live game for rooms and video calls:

- The host opens the game on a **big screen** (projector or shared screen) showing a **game PIN** and **QR code**.
- Players join on their phones with their player card or, if allowed, **just a nickname** (guest mode).
- Colourful answer tiles with shapes, a countdown stopwatch, live "answered" counter and sound effects (can be muted).
- After each question: the right answer is revealed with a "Correct!" stamp, answer counts, and an explanation.
- A **race-track scoreboard** where each player's cartoon character runs along their lane, with streak flames and position changes.
- A **podium finale** with spotlights, confetti and a crown for the winner, then full results and CSV download.
- Faster correct answers earn more points; streaks are celebrated.
- Keyboard shortcuts for hosts (Space = next, F = full screen, M = sound, T = light/dark).
- **Light mode by default**, dark mode optional — per device.

### 5.3 Live Polls — interactive presentations (Mentimeter-style)

The audience joins at a short web address with a **6-digit code** or QR code. Answers are **anonymous**, no account needed.

**Question slides (10 types):**
| Slide | What people do | What the big screen shows |
|---|---|---|
| Multiple choice | Pick one (or several) options | Animated bar chart |
| Word cloud | Type 1–3 words | A live, growing word cloud |
| Open text | Write a short answer | Colourful sticky-note wall |
| Scale | Rate 1–5 or 1–10 | Average plus distribution |
| Ranking | Drag options into order | Ranked list (Borda points) |
| Q&A | Ask questions and upvote others | Live question list; host can mark answered or hide |
| Guess the number | Enter a number in a range | Average, middle guess, histogram — right answer revealed when voting is locked |
| 100 points | Share 100 points between options | Average points per option |
| 2 × 2 grid | Place items on two 1–10 scales (e.g. Effort vs Impact) | Quadrant chart with every item plotted |
| Pin on image | Tap a spot on a picture (floor plan, map, product) | Every pin appears live on the picture |

**Content slides:** Text (heading + paragraph, e.g. an agenda) and Image (full picture with caption).

**Also:**
- A picture can be added to **any** slide.
- Presenter controls: next/previous slide, lock voting, show or hide results on phones, hide results on the big screen, full screen, big QR code.
- Live editor with phone and big-screen preview.
- Export all poll results to CSV.
- **Light mode by default**, dark mode optional.

### 5.4 Certification — exams and certificates

- Timed exams with a **pass mark**, a limited number of **attempts** (1–5), and an optional **expiry** (3 months to 3 years).
- Right/wrong answers stay hidden until the exam ends; answers can be shown afterwards if the admin wants.
- On passing, the employee gets a **branded, printable certificate** (A4 landscape, "Download PDF / Print") with:
  - the employee's name, the certificate title, date passed, score, valid-until date
  - a unique **certificate ID**
  - the company logo and name
  - an **editable signature** — signer's name and job title, with a signature drawn on screen, uploaded as an image, or written in a handwriting style
  - an **editable seal** — custom letters and wording, five colour styles (ink & lime, navy & gold, crimson & gold, forest & cream, gold foil), or the company's own stamp image
- Admins see who is certified, who failed and who is expiring.

---

## 6. The player experience

**Joining**
- Each company has its own private address, e.g. `yourapp.com/#/t/acme`.
- **Private invite links** with a secret key (and a downloadable QR code) stop outsiders from guessing a company's address and joining. Admins can require the link and generate a new one at any time.
- Sign-in options (each company chooses): **Employee ID** (no password, "Is this you?"), **6-digit email code**, or **Microsoft sign-in (Entra ID / SSO)**.
- One device at a time for Employee-ID players, to stop account sharing.

**Characters and rewards**
- Every player picks a **cartoon character** — 16 diverse, animated chibi characters plus 2 special characters: **Wren the explorer** and **Puff the bunny**.
- Players earn **coins** and spend them in the **store** on items for their character: hats, glasses, earrings, face items and backgrounds. Special characters can wear store items too.
- Moods and animations react to results (happy, cheering, thinking).

**Motivation loop**
- Daily streaks with flame badges, levels, personal bests.
- Individual leaderboards and **team battles** (by office, branch, region or department).
- **Hall of Fame** and gifts/rewards set by the company.
- A friendly in-app **guide** explaining how points, coins, streaks and levels work.

**My results**
- Personal history, accuracy, certificates earned and the ones to renew.

---

## 7. The company admin portal

Each client company gets its own admin portal with these tabs:

| Tab | What it does |
|---|---|
| **Dashboard** | Registered players, active players, plays, accuracy, answer speed, certification numbers, trends |
| **Quizzes** | Create, copy, schedule and approve Daily Sprints and certification exams; starter library; CSV import; question pictures; certificate signature & seal design |
| **Live quiz** | Pick a quiz, host a live game, open test players, see past sessions |
| **Polls** | Build, present, open/close, duplicate and export live polls |
| **Players** | Add, import, edit and remove players; roster upload; masked employee IDs |
| **Results** | Knowledge by topic, by team, most-missed and best-known questions, leaderboards, weekly gap trend, and a designed **downloadable PDF knowledge report** with recommended next steps |
| **Rewards** | Hall of Fame, gifts and prizes |
| **Security** | Audit log, sign-in rules, data retention (purge old plays), disqualify suspicious plays |
| **Admins** | Invite admins with five roles: **Owner, Admin, Editor, Host, Viewer** |
| **Branding** | Product name, tagline, logo, colours (with contrast checks so the brand always stays readable) |
| **Settings** | Offices/branches, departments, topics, features on/off, sign-in methods, invite link and QR code, admin authenticator requirement |

**Knowledge-gap analytics** is the core value for managers: every answer feeds a picture of which topics, questions and teams need attention, week by week — and the PDF report turns it into an executive-ready summary with "what to do next" recommendations.

---

## 8. The super admin console (the business owner)

The platform owner runs every client from one console:

- **Companies:** create a new client in a guided wizard (name, web address, template, owner email, brand, starter library), then edit, suspend or delete.
- **Links panel:** the player link, admin link and private invite link for each company, ready to send.
- **Usage per company:** players, active players and activity — useful for billing.
- **Question library:** shared starter content that new companies can start from.
- **Audit log** of every super-admin action.
- Protected by email + password, a required **authenticator app**, and a separate **super admin code** with lockout.

---

## 9. White-label branding

Every client sees **their** product, not ours:

- Their **product name** (e.g. "Harbor Academy"), tagline and logo everywhere — player app, admin portal, live game screens, poll screens, certificates and PDF reports.
- Their **colours**, automatically checked for readability, applied across the whole app.
- Their **wording** — "Branch/Department" or "Location/Department" templates.
- Their **own web address** inside the platform, and their own private invite link.
- Certificates carry their logo, signer and seal.

Great for resellers: a training company can sell Ant Arena to its own clients under its own name.

---

## 10. Security and trust

Built to pass corporate and financial-sector security reviews:

- **Tenant isolation at the database level** (Postgres Row-Level Security on every table): companies cannot see each other's data.
- **Server-side scoring:** answer keys never reach the browser, so results can't be faked.
- **Role-based access** with five admin roles and **maker-checker** approvals.
- **Authenticator-app (MFA) sign-in** for admins — optional or required per company; always required for the super admin.
- **Lost authenticator recovery** via a secure emailed link.
- **Private invite links** with secret keys, rotatable at any time.
- **Rate limits** on every guessable input (codes, PINs, sign-ins).
- **Full audit trail** per company and for the super admin, exportable.
- **Idle sign-out**, one-device-at-a-time for players.
- **Protection against injection attacks:** only fixed, parameterised server functions; inputs cleaned and validated on the server (text, images, answers, certificate designs, poll slides).
- **Strict security headers** (Content Security Policy and more) on the hosting.
- Anonymous, privacy-friendly polls; masked employee IDs option; data retention controls.

---

## 11. Technology and hosting

- **Front end:** React 18 + TypeScript + Vite — fast, modern, works on every device.
- **Back end:** Supabase (PostgreSQL, authentication, realtime updates).
- **Hosting:** Vercel (global CDN).
- **Realtime:** live games and polls update instantly on every screen; if realtime is busy, screens fall back to quick refreshes automatically.
- **Efficient by design:** screens pause network activity when a tab is hidden; images are compressed in the browser; audiences only download what's on screen.
- **Accessible:** keyboard controls, screen-reader labels, readable contrast in both light and dark modes, reduced-motion support.
- **Low running cost:** starts on free tiers; about US$25/month (Supabase Pro) once live games regularly exceed ~200 simultaneous phones.

---

## 12. The public website and free demo

- A marketing **landing page** with an illustrated hero scene, feature overview, "Who it's for", "How it works", security section and FAQ — pre-rendered for search engines, with social-share cards.
- **Try it free, no sign-up:** visitors enter a full **demo sandbox** in their browser — two fictional companies (Harbor Bank, Northwind Traders), a player app, admin portal, live quiz, polls and super admin console. Nothing is saved to the real database.
- **Contact sales** page with one-click email (copy, Gmail, Outlook, or mail app).
- A single-file offline demo can be built to email to prospects.

---

## 13. How a client goes live

1. **Day 0 — create the company** in the super admin console (about 5 minutes): name, address, template, brand, owner email.
2. **Send two links** to the client owner: the player link and the admin link.
3. **The client sets up:** invites their admins, adds offices/departments, uploads players or shares the private invite link/QR code, picks sign-in methods.
4. **Content:** start from the starter library, import questions from a spreadsheet, or write their own.
5. **Launch:** first daily sprint goes live; staff play two minutes a day.
6. **Engage:** host a live quiz at the next town hall; run polls in meetings.
7. **Measure:** check the dashboard weekly and send the PDF knowledge report to leadership.

Typical time to first game: **one day**.

---

## 14. Business model ideas

*(Suggestions to adapt — not fixed prices.)*

- **Per active employee per month**, with volume tiers.
- **Company plan tiers:**
  - *Starter* — Daily Sprint + leaderboards.
  - *Pro* — adds Live Quiz, Live Polls, analytics and the PDF report.
  - *Enterprise* — adds Certification, SSO, required MFA, maker-checker, priority support and custom content.
- **Event pass** — live quiz and polls for a conference or all-hands.
- **Content packs** — ready-made compliance, cyber-security or onboarding question sets.
- **Reseller / white-label licence** for training companies.
- **Setup and content-writing services.**

---

## 15. Why Ant Arena wins

1. **All-in-one:** daily learning, live games, polls and certification in one platform, one login and one report — competitors usually cover only one.
2. **Truly white-label:** the client's brand everywhere, including certificates and reports.
3. **Built for habit, not hours:** 2 minutes a day with streaks, coins and characters beats hour-long courses.
4. **Measurable:** knowledge gaps by topic and team, not just completion ticks.
5. **Enterprise-grade security** that passes bank-level reviews, yet simple for everyone else.
6. **No app to install:** works instantly on any phone or laptop.
7. **Delightful:** characters, animations, sounds and a game-show finale people talk about.
8. **Fast to launch:** a new client can be live in a day.

---

## 16. Ready-made copy for pitches and posters

**Headlines**
- Learning your team actually plays.
- Two minutes a day. Real knowledge. Your brand.
- Turn training into a game your people want to win.
- From compulsory to competitive.
- Every phone in the room. Every voice counted.

**Sub-headlines**
- Daily quiz sprints, big-screen live games, instant polls and certification — under your own name, logo and colours.
- See exactly where the knowledge gaps are, by team, week by week.
- No app to install. Enterprise-grade security. Live in a day.

**Poster bullets**
- 🎯 2-minute daily quizzes
- 🏆 Live game shows for town halls
- 📊 Instant polls, word clouds & Q&A
- 🎓 Certificates with your signature & seal
- 🔒 Bank-grade security
- 🎨 100% your brand

**Calls to action**
- Try it free — no sign-up.
- Book a demo.
- Scan to play.

**Elevator pitch (30 seconds)**
> "Most corporate training is long, boring and impossible to measure. Ant Arena replaces it with two-minute daily quiz games employees actually enjoy — with streaks, coins, characters and team battles — plus live game shows and polls for meetings, and certification exams with branded certificates. Everything carries the client's own brand, and managers get a clear report of what their teams know and where the gaps are. It runs in any browser, passes bank-level security reviews, and a new company can be live in a day."

**Visual assets available in the app**
- The illustrated forest-arena hero scene with Wren the explorer and Puff the bunny *(the current hero art resembles another game's style — replace it with original artwork before commercial use)*.
- 18 animated cartoon characters, the Ant Arena logo mark, colourful answer-tile shapes, podium and race-track scoreboards.
- Screenshots: live quiz lobby with giant PIN, answer tiles, race scoreboard, podium; poll word cloud, bar charts, pin-on-image; certificate; PDF report; admin dashboard.

**Brand palette (default)**
- Lime `#C6F432` · Orange `#FF5A1F` · Ink `#161512` · Paper `#F4F3EE` · Yellow `#FFD84D`

---

## 17. Feature checklist

**Daily learning**
- [x] Daily Sprint quizzes with scheduling (open and close dates)
- [x] 4 question types: multiple choice, true/false, match pairs, put in order
- [x] Question pictures and explanations
- [x] Server-side scoring, speed bonus, points, coins, streaks, levels
- [x] Individual leaderboards and team battles
- [x] Character selection (16 + 2 special) with store items
- [x] Hall of Fame and rewards
- [x] Starter question library and CSV import
- [x] Maker-checker approval

**Live quiz**
- [x] Game PIN + QR join, guest nicknames (optional)
- [x] Big-screen host view with timer, sound and animations
- [x] Answer reveal with explanations
- [x] Race-track scoreboard and podium finale
- [x] Results CSV
- [x] Light mode (default) and dark mode

**Live polls**
- [x] 10 question slide types + text and image slides
- [x] Pictures on any slide
- [x] Anonymous 6-digit code / QR join
- [x] Presenter controls: lock, results on phones, hide results, full screen
- [x] Q&A moderation (answered/hide)
- [x] CSV export
- [x] Light mode (default) and dark mode

**Certification**
- [x] Timed exams, pass mark, attempts, expiry
- [x] Printable branded certificates with unique IDs
- [x] Editable signature (draw, upload or typed) and seal (letters, wording, colour or stamp)

**Analytics**
- [x] Dashboard KPIs and trends
- [x] Knowledge by topic, team and question
- [x] Weekly gap trend
- [x] Downloadable PDF knowledge report with recommendations

**Administration**
- [x] Multi-company (multi-tenant) platform with super admin console
- [x] 5 admin roles
- [x] Branding: name, logo, colours, wording
- [x] Offices, departments, topics
- [x] Private invite links + QR
- [x] Sign-in: Employee ID, email code, Microsoft SSO

**Security**
- [x] Row-level tenant isolation
- [x] Admin MFA (optional/required), super admin MFA + code
- [x] Lost-authenticator email reset
- [x] Rate limits, audit logs, idle sign-out, one device per player
- [x] Server-side validation of all inputs, strict security headers

**Website**
- [x] Landing page, FAQ, contact sales, SEO pre-rendering
- [x] Free in-browser demo sandbox

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Super admin** | The platform owner who creates and manages client companies |
| **Company / tenant** | One client organisation with its own private space |
| **Owner / Admin / Editor / Host / Viewer** | Company admin roles, from full control to read-only |
| **Player** | An employee using the app |
| **Daily Sprint** | A short, scheduled self-paced quiz |
| **Live Quiz** | A real-time game hosted on a big screen, played on phones |
| **Live Poll** | An interactive presentation with audience voting |
| **Certification** | A timed exam that awards a certificate |
| **Streak** | Consecutive days a player has played |
| **Coins** | In-app currency earned by playing, spent in the store |
| **Team battle** | Leaderboard between offices, branches or departments |
| **Maker-checker** | One admin creates, another approves |
| **Invite link** | Private link with a secret key that lets staff join a company |
| **MFA** | Multi-factor authentication with an authenticator app |
