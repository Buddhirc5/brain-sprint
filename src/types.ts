/* =====================================================================
   Ant Arena — shared data model (multi-tenant, white-label).
   Each type maps to a table (see supabase/migrations). The browser never
   receives answer keys: players get questions only, and scoring happens
   on the server (Postgres functions), or inside the demo engine.
   ===================================================================== */

export type QType = "mcq" | "tf" | "match" | "order";
export type UnitType = "branch" | "dept"; // labelled per tenant (Branch/Department, Location/Department…)
export type GameStatus = "draft" | "pending" | "live" | "closed";
export type QuizKind = "sprint" | "live" | "cert";
export type CardColor = "lime" | "orange" | "pink" | "blue" | "blush" | "ink";
export type Role = "owner" | "admin" | "editor" | "host" | "viewer";

/* ---------------- tenants & white-label ---------------- */
export interface Branding {
  productName: string; // shown in headers, e.g. "Ant Arena" or "Harbor Academy"
  tagline?: string;
  logo?: string; // data: URL (PNG/SVG/JPEG, ≤ 150 KB)
  primary: string; // main accent (buttons, highlights) — default neon lime
  accent: string; // second accent — default orange
  ink: string; // dark surfaces & text
  paper: string; // page background
}

export interface Labels {
  branch: string; // "Branch" | "Location" | "Store"…
  branches: string;
  dept: string; // "Department" | "Team"…
  depts: string;
  battle: string; // "Branch Battle" | "Team Battle"
}

export interface Features {
  sprint: boolean; // daily self-paced quizzes
  live: boolean; // game-show style live quiz
  polls: boolean; // interactive live polls
  cert: boolean; // certification exams
  coins: boolean;
  store: boolean;
  streaks: boolean;
  avatars: boolean;
  rewards: boolean; // Hall of Fame & gifts
  battle: boolean; // unit leaderboard
}

export interface SignIn {
  empId: boolean; // Employee ID + "Is this you?" (no password)
  emailOtp: boolean; // 6-digit code by email
  sso: boolean; // Microsoft Entra ID (configure in Supabase first)
  liveGuests: boolean; // allow a nickname-only join for live quizzes
  adminAuth: "password" | "magic" | "both";
  adminMfa: boolean; // require an authenticator app for admins
}

export interface OrgConfig {
  branches: string[];
  departments: string[];
  topics: string[];
  maskIds: boolean;
  lastInitialOnly: boolean;
  adminIdleMin: number;
  retentionDays: number;
  requireAllowlist: boolean;
  makerChecker: boolean;
  exportMask: boolean;
  minQ: number;
  maxQ: number;
  features: Features;
  signIn: SignIn;
}

export interface Tenant {
  id: string;
  slug: string; // URL name: /#/t/<slug>
  name: string; // legal/company name
  status: "active" | "suspended";
  template: "generic" | "bank";
  branding: Branding;
  labels: Labels;
  cfg: OrgConfig;
  createdAt: number;
}
/** What anyone (not signed in) may see about a tenant: enough to render its sign-in page. */
export type TenantPublic = Pick<Tenant, "id" | "slug" | "name" | "status" | "template" | "branding" | "labels"> & {
  features: Features;
  signIn: SignIn;
  joinKeyRequired?: boolean; // new players need the private invite link (#/t/<slug>/k/<KEY>)
  pubCfg: Pick<OrgConfig, "branches" | "departments" | "maskIds" | "lastInitialOnly" | "retentionDays" | "requireAllowlist">;
};

/* ---------------- quizzes ---------------- */
/** A question as PLAYERS receive it — never contains the answer. */
export interface Question {
  id: string;
  type: QType;
  topic: string;
  q: string;
  explain?: string; // sent to players only after they answer (server returns it)
  options?: string[]; // mcq
  left?: string[]; // match: terms in display order
  right?: string[]; // match: meanings, stored shuffled
  items?: string[]; // order: steps, stored shuffled
  seconds?: number; // live quiz: time for this question (default 20)
  img?: string; // optional picture: data: URL (PNG/JPEG/WebP/GIF, ≤ 350k chars), compressed in the browser
}

export interface CertSettings {
  passPct: number; // e.g. 80
  attempts: number; // max attempts (1–5)
  certTitle: string; // "Certified in AML Basics"
  validMonths: number; // 0 = never expires
  showAnswers: boolean; // show right answers after the exam ends
  // printed on the certificate (all optional — see src/lib/cert.ts)
  signName?: string; // "Jane Perera"
  signRole?: string; // "Head of Learning"
  signImg?: string; // drawn or uploaded signature: data: URL with transparency
  sealText?: string; // centre of the seal, 1–4 characters (default: product initials)
  sealLabel?: string; // small text under it (default "Certified")
  sealColor?: SealColor;
  sealImg?: string; // the company's own stamp, replaces the drawn seal
}
export type SealColor = "ink" | "navy" | "crimson" | "forest" | "gold";

export interface Game {
  id: string;
  kind: QuizKind;
  title: string;
  desc?: string;
  date?: string; // YYYY-MM-DD show from
  until?: string; // YYYY-MM-DD close after
  minutes: number; // whole-quiz time (sprint/cert)
  color: CardColor;
  status: GameStatus;
  order?: number;
  questions: Question[];
  cert?: CertSettings;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  editedBy?: string;
  approvedBy?: string;
}

/** Answer key — admins only (table quiz_keys). qid → canonical answer
 *  (mcq index "2", tf "T"/"F", match/order comma-joined indices). */
export interface AnswerKey {
  gid: string;
  answers: Record<string, string>;
  updatedAt: number;
}

/* ---------------- players & plays ---------------- */
export interface Ans {
  ok: 0 | 1;
  ms: number;
  c: string | null;
  pts: number;
  sk?: 1;
}

export interface Run {
  gid: string;
  kind?: QuizKind; // set by the server; certification runs don't count toward points, coins or streaks
  attempt?: number; // certification attempts (1…n); sprint = 1
  startedAt: number;
  qAt?: number;
  finishedAt?: number;
  status: "playing" | "done";
  ans: Ans[];
  score: number;
  correct: number;
  total: number;
  blur?: number;
  passed?: boolean; // certification
}
/** Runs are keyed by quiz id; certification attempts after the first are keyed "<quizId>~<n>". */
export const runKey = (gid: string, attempt = 1) => (attempt > 1 ? `${gid}~${attempt}` : gid);

export interface Equipped {
  face?: string;
  head?: string;
  ears?: string;
  bg?: string;
}
export interface Purchase {
  id: string;
  at: number;
}

export interface Player {
  uid: string; // player id (not the auth id)
  empId: string; // admins only in production; masked for players
  email?: string; // admins only
  name: string;
  unitType: UnitType;
  unit: string;
  look: number;
  equipped?: Equipped;
  purchases?: Purchase[];
  consentAt: number;
  createdAt: number;
  updatedAt: number;
  runs?: Record<string, Run>;
  demo?: boolean;
  locked?: boolean;
  logins?: { at: number; dev: string }[];
}

export interface Roster {
  salt: string;
  hashes: string[];
  updatedAt: number;
}
export interface Disqualified {
  runs: Record<string, { at: number; by: string; reason: string }>;
}
export interface Gift {
  id: string;
  period: string;
  kind: "weekly" | "improved" | "branch";
  winner: string;
  label: string;
  prize: string;
  at: number;
  by: string;
}
export interface AuditEntry {
  id: string;
  at: number;
  actor: string; // email or player/user id
  action: string;
  target?: string;
  detail?: string;
  sev?: "info" | "warn" | "alert";
}
export interface AdminMember {
  email: string;
  role: Role;
  userId?: string; // set once they have signed in
  invitedAt: number;
  joinedAt?: number;
  mfa?: boolean;
}

/* ---------------- live quiz (game-show style) ---------------- */
export type LiveState = "lobby" | "question" | "reveal" | "board" | "ended";
export interface LiveSession {
  id: string;
  tenantId: string;
  gid: string;
  title: string;
  pin: string; // 6 digits
  state: LiveState;
  qIndex: number; // current question (-1 in lobby)
  qStartedAt: number; // server time the current question opened
  qSeconds: number;
  total: number;
  question?: Question; // current question (no answer) while state is question/reveal
  reveal?: { canon: string; counts: number[]; explain?: string }; // during reveal
  hostId: string;
  createdAt: number;
  endedAt?: number;
  guests: boolean;
  music?: boolean;
  players?: number; // how many joined (admin lists)
}
export interface LivePlayer {
  id: string; // live player id
  sessionId: string;
  playerId?: string; // tenant player card (if signed in)
  nick: string;
  look: number;
  score: number;
  streak: number;
  joinedAt: number;
  lastPts?: number;
  lastOk?: boolean;
}
export interface LiveAnswer {
  sessionId: string;
  livePlayerId: string;
  qIndex: number;
  c: string;
  ms: number;
  ok: boolean;
  pts: number;
}
export interface LiveBoardRow {
  id: string;
  nick: string;
  look: number;
  score: number;
  streak: number;
  lastPts: number;
  lastOk: boolean;
}
export interface LiveHostView {
  session: LiveSession;
  players: LiveBoardRow[]; // sorted by score
  answered: number; // answers for the current question
  counts: number[]; // per option for the current question (host only)
}

/* ---------------- live polls (interactive) ---------------- */
export type SlideType = "mc" | "word" | "scale" | "open" | "qa" | "rank" | "guess" | "points" | "grid" | "pin" | "text" | "image";
export interface Slide {
  id: string;
  type: SlideType;
  prompt: string;
  options?: string[]; // mc, rank
  multi?: boolean; // mc: allow several choices
  scaleMin?: number; // scale (1–5 or 1–10)
  scaleMax?: number;
  scaleLabels?: [string, string];
  maxWords?: number; // word cloud entries per person (1–3)
  img?: string; // optional picture (data: URL, see lib/pollImage) — required for "pin" and "image"
  body?: string; // "text" slide: paragraph under the heading
  numMin?: number; // "guess": allowed range (default 0–100)
  numMax?: number;
  numAnswer?: number; // "guess": the right number, revealed on the big screen (optional)
  axes?: [string, string]; // "grid": x-axis and y-axis labels (each rated 1–10)
}
export interface Poll {
  id: string;
  tenantId: string;
  title: string;
  code: string; // 6 digits
  slides: Slide[];
  current: number; // slide shown now
  status: "draft" | "open" | "closed";
  showResults: boolean; // audience sees results on their phones
  locked: boolean; // stop taking responses on the current slide
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
}
export type PollValue =
  | { choice: number[] }
  | { words: string[] }
  | { score: number }
  | { text: string }
  | { order: number[] }
  | { num: number } // guess the number
  | { alloc: number[] } // 100 points: points per option (sum 1–100)
  | { xy: [number, number][] } // 2×2 grid: [x, y] (1–10) per item
  | { pin: [number, number] }; // pin on image: x, y in thousandths of the picture
export interface PollResponse {
  id: string;
  pollId: string;
  slideId: string;
  who: string; // anonymous respondent id
  value: PollValue;
  at: number;
  votes?: number; // Q&A upvotes
  hidden?: boolean; // moderated
  answered?: boolean; // Q&A marked answered
}
export interface SlideResults {
  slideId: string;
  n: number; // respondents
  counts?: number[]; // mc
  words?: { w: string; n: number }[]; // word cloud
  avg?: number; // scale
  dist?: number[]; // scale distribution
  texts?: PollResponse[]; // open / qa (sorted by votes for qa)
  rank?: { i: number; score: number }[]; // rank: Borda score
  bins?: { lo: number; hi: number; n: number }[]; // guess: histogram
  median?: number; // guess
  points?: number[]; // 100 points: average points per option
  grid?: ({ x: number; y: number } | null)[]; // 2×2 grid: average position per item
  pins?: [number, number][]; // pin on image
}

/* ---------------- super admin ---------------- */
export interface TenantUsage {
  players: number;
  activePlayers30: number;
  runs30: number;
  quizzes: number;
  liveSessions30: number;
  polls: number;
  admins: number;
  lastActive: number;
}
export interface LibraryItem {
  id: string;
  title: string;
  topic: string;
  industry: "any" | "bank";
  questions: Question[];
  answers: Record<string, string>;
}
