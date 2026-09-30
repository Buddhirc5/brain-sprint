/* =====================================================================
   The one contract between the UI and a backend.
   • SupabaseApi (src/api/supabase) — production: Postgres + RLS + Auth + Realtime.
   • DemoApi     (src/api/demo)     — runs entirely in this browser (localStorage +
                                     BroadcastChannel), for demos and development.
   Both must behave the same. Anything security-relevant (scoring, answer keys,
   tenant isolation, roles, super-admin authenticator) is enforced by the backend, never
   by the UI. Every method throws ApiError on failure.
   ===================================================================== */
import type {
  AdminMember, AnswerKey, AuditEntry, Disqualified, Game, Gift, LibraryItem, LiveHostView, LiveSession,
  OrgConfig, Player, Poll, PollResponse, PollValue, Question, Role, Roster, Run, SlideResults, Tenant,
  TenantPublic, TenantUsage, Branding, Labels, Equipped, UnitType,
} from "../types";

export type Unsub = () => void;

export class ApiError extends Error {
  constructor(public code: ApiCode, message: string, public wait?: number) {
    super(message);
  }
}
export type ApiCode =
  | "auth" // not signed in / wrong credentials
  | "forbidden" // signed in but not allowed
  | "not_found"
  | "invalid" // bad input
  | "conflict" // e.g. Employee ID already used
  | "rate_limited" // too many tries; `wait` ms
  | "suspended" // tenant suspended
  | "closed" // quiz/poll/session not open
  | "network";

/* ---------------- auth ---------------- */
export interface AuthUser {
  id: string;
  email?: string;
  anonymous: boolean;
}
export interface MfaState {
  enrolled: boolean;
  verified: boolean; // this session passed MFA (aal2)
  canReset?: boolean; // signed in from an emailed link in the last 10 minutes: may remove a lost authenticator
  factorId?: string;
}

/** Everything a tenant screen needs, kept live by watchTenant(). Admin-only parts are empty for players. */
export interface TenantData {
  tenant: Tenant;
  games: Record<string, Game>;
  players: Record<string, Player>; // players see public fields only (no empId/email unless maskIds off → empId masked anyway)
  gifts: Record<string, Gift>;
  dq: Disqualified;
  /* admin only */
  keys: Record<string, AnswerKey>;
  roster: Roster | null;
  audit: AuditEntry[];
  admins: AdminMember[];
  polls: Record<string, Poll>;
  live: LiveSession[]; // recent live sessions
}

export interface Access {
  role: Role | null; // tenant admin role, or null
  isSuper: boolean; // super admin AND verified with their authenticator app in this session
  superUser?: boolean; // on the super admin list (unlocked or not): may approve their own quiz changes
}

export interface LookupCard {
  first: string;
  lastInitial: string;
  unit: string;
  unitType: UnitType;
  level: number;
  look: number;
}

export interface RegisterInput {
  empId: string;
  name: string;
  unitType: UnitType;
  unit: string;
  look: number;
  email?: string;
}

export interface AnswerResult {
  ok: boolean | null; // null when hidden (certification exams)
  canon: string | null; // right answer, null when hidden
  explain?: string;
  pts: number;
  run: Run;
}

export interface QuizDraft {
  game: Game;
  key: AnswerKey;
}

export interface NewTenantInput {
  name: string;
  slug: string;
  template: "generic" | "bank";
  ownerEmail: string;
  branding?: Partial<Branding>;
  starter: boolean; // copy the starter library as draft quizzes
}

export interface Api {
  readonly mode: "demo" | "supabase";

  /* ---- auth ---- */
  user(): AuthUser | null;
  onAuth(cb: (u: AuthUser | null) => void): Unsub;
  signInPassword(email: string, password: string): Promise<void>;
  signUpPassword(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  sendMagicLink(email: string, redirectTo: string): Promise<void>;
  sendEmailCode(email: string): Promise<void>; // 6-digit one-time code
  verifyEmailCode(email: string, code: string): Promise<void>;
  signInMicrosoft(redirectTo: string): Promise<void>;
  signInAnonymous(): Promise<void>; // players using Employee ID, poll voters, live guests
  resetPassword(email: string, redirectTo: string): Promise<void>;
  updatePassword(pw: string): Promise<void>;
  signOut(): Promise<void>;
  mfaState(): Promise<MfaState>;
  mfaEnroll(): Promise<{ factorId: string; qr: string; secret: string }>; // qr = SVG markup or data URL
  mfaVerify(factorId: string, code: string): Promise<void>;
  /** Lost authenticator: email this account a sign-in link (opened on this device, it allows mfaReset for 10 minutes). */
  mfaResetSend(redirectTo: string): Promise<void>;
  /** Remove this account's authenticator(s) — only from a session opened by that emailed link. Audited. */
  mfaReset(): Promise<void>;
  /** demo only: the last email "sent" (codes/links), so the demo can show it on screen */
  demoOutbox?(): { to: string; body: string; at: number; code?: string; link?: string } | null;

  /* ---- tenants (public) ---- */
  tenantBySlug(slug: string): Promise<TenantPublic | null>;
  access(tenantId: string): Promise<Access>;
  /** Called after an admin signs in: turns pending invites for their email into memberships. */
  acceptInvites(): Promise<{ tenantId: string; slug: string; role: Role }[]>;
  myTenants(): Promise<{ tenantId: string; slug: string; name: string; role: Role }[]>;

  /* ---- live tenant data ---- */
  watchTenant(tenantId: string, cb: (d: TenantData) => void, onErr?: (e: ApiError) => void): Unsub;
  /** Force a refresh (players poll rather than stream, to stay within realtime limits). */
  refresh(tenantId: string): void;

  /* ---- player identity ---- */
  myPlayer(tenantId: string): Promise<Player | null>; // null = not linked, or signed in elsewhere
  playerLookup(tenantId: string, empId: string): Promise<LookupCard | null>;
  playerClaim(tenantId: string, empId: string, device: string): Promise<Player>;
  /** Present the private invite key; true = accepted (this sign-in may now look up, claim and register). Rate limited. */
  joinCompany(tenantId: string, key: string): Promise<boolean>;
  /** Admins: the company's invite key and whether it is required. */
  joinKeyGet(tenantId: string): Promise<{ key: string; required: boolean; rotatedAt: number }>;
  joinKeySet(tenantId: string, required: boolean, rotate?: boolean): Promise<{ key: string; required: boolean; rotatedAt: number }>;
  playerRegister(tenantId: string, input: RegisterInput, device: string): Promise<Player>;
  /** After email code / Microsoft sign-in: link to the card with this email, if any. */
  playerLinkEmail(tenantId: string, device: string): Promise<Player | null>;
  updateMyCard(tenantId: string, patch: { name?: string; look?: number; equipped?: Equipped; unit?: string; unitType?: UnitType }): Promise<void>;
  buyItem(tenantId: string, itemId: string): Promise<void>;

  /* ---- plays (sprint & certification) — scored on the server ---- */
  startRun(tenantId: string, gid: string): Promise<Run>;
  showQuestion(tenantId: string, gid: string, index: number): Promise<Run>; // stamps qAt
  answer(tenantId: string, gid: string, index: number, choice: string | null, blur: number): Promise<AnswerResult>;
  finishRun(tenantId: string, gid: string): Promise<{ run: Run; key?: Record<string, string> }>; // key only for cert with showAnswers

  /* ---- tenant admin ---- */
  saveQuiz(tenantId: string, draft: QuizDraft): Promise<void>;
  setQuizStatus(tenantId: string, gid: string, status: Game["status"], approve?: boolean): Promise<void>;
  deleteQuiz(tenantId: string, gid: string): Promise<void>;
  saveConfig(tenantId: string, cfg: OrgConfig): Promise<void>;
  saveBrand(tenantId: string, branding: Branding, labels: Labels): Promise<void>;
  adminPatchPlayer(tenantId: string, uid: string, patch: Partial<Pick<Player, "name" | "unit" | "unitType" | "empId" | "email" | "locked">>): Promise<void>;
  adminSignOutPlayer(tenantId: string, uid: string): Promise<void>;
  adminDeletePlayer(tenantId: string, uid: string): Promise<void>;
  adminResetRun(tenantId: string, uid: string, runKey: string): Promise<void>;
  adminImportPlayers(tenantId: string, rows: RegisterInput[]): Promise<{ added: number; skipped: number }>;
  saveDQ(tenantId: string, dq: Disqualified): Promise<void>;
  saveRoster(tenantId: string, r: Roster | null): Promise<void>;
  saveGift(tenantId: string, g: Gift): Promise<void>;
  deleteGift(tenantId: string, id: string): Promise<void>;
  purgeRuns(tenantId: string, before: number): Promise<number>;
  audit(tenantId: string, e: Omit<AuditEntry, "id" | "at" | "actor">): Promise<void>;
  inviteAdmin(tenantId: string, email: string, role: Role): Promise<void>;
  setAdminRole(tenantId: string, email: string, role: Role): Promise<void>;
  removeAdmin(tenantId: string, email: string): Promise<void>;
  library(): Promise<LibraryItem[]>;
  importLibrary(tenantId: string, ids: string[]): Promise<number>;
  download(filename: string, text: string, mime?: string): void;

  /* ---- live quiz (game-show style) ---- */
  liveCreate(tenantId: string, gid: string, opts: { guests: boolean }): Promise<LiveSession>;
  /** host actions: start → question → reveal → board → next question … → ended */
  liveControl(sessionId: string, action: "start" | "reveal" | "board" | "next" | "end" | "kick", arg?: string): Promise<void>;
  watchLiveHost(sessionId: string, cb: (v: LiveHostView) => void): Unsub;
  liveFind(pin: string): Promise<{ sessionId: string; tenantId: string; slug: string; title: string; guests: boolean } | null>;
  liveJoin(sessionId: string, nick?: string): Promise<{ livePlayerId: string }>; // uses the player card when signed in
  watchLivePlayer(sessionId: string, livePlayerId: string, cb: (v: { session: LiveSession; me: import("../types").LivePlayer | null; rank: number; count: number; answered: boolean; lastOk: boolean | null; ahead?: { nick: string; score: number } | null }) => void): Unsub;
  liveAnswer(sessionId: string, livePlayerId: string, qIndex: number, choice: string): Promise<void>;

  /* ---- live polls (interactive) ---- */
  savePoll(tenantId: string, poll: Poll): Promise<void>;
  deletePoll(tenantId: string, id: string): Promise<void>;
  pollControl(pollId: string, patch: Partial<Pick<Poll, "current" | "status" | "showResults" | "locked">>): Promise<void>;
  pollFind(code: string): Promise<{ pollId: string; title: string; slug: string } | null>;
  watchPoll(pollId: string, cb: (p: Poll) => void): Unsub; // audience-safe view
  watchPollResults(pollId: string, slideId: string, cb: (r: SlideResults) => void): Unsub;
  readPollResults(pollId: string, slideId: string): Promise<SlideResults | null>; // one-off read (exports)
  pollCounts(tenantId: string): Promise<Record<string, number>>; // pollId → people who answered anything
  pollRespond(pollId: string, slideId: string, value: PollValue): Promise<void>;
  pollMyResponses(pollId: string): Promise<Record<string, PollValue>>; // slideId → my last answer
  qaVote(pollId: string, responseId: string): Promise<void>;
  qaModerate(pollId: string, responseId: string, patch: Partial<Pick<PollResponse, "hidden" | "answered">>): Promise<void>;

  /* ---- super admin ---- */
  superStatus(): Promise<{ isSuperUser: boolean }>; // on the super admin list (access also needs the authenticator: mfaState)
  superTenants(): Promise<(Tenant & { usage: TenantUsage })[]>;
  superCreateTenant(input: NewTenantInput): Promise<Tenant>;
  superUpdateTenant(id: string, patch: Partial<Pick<Tenant, "name" | "slug" | "status" | "template" | "branding" | "labels" | "cfg">>): Promise<void>;
  superDeleteTenant(id: string, confirmSlug: string): Promise<void>;
  superAdmins(tenantId: string): Promise<AdminMember[]>;
  superInvite(tenantId: string, email: string, role: Role): Promise<void>;
  superAudit(): Promise<AuditEntry[]>;
  superSaveLibrary(items: LibraryItem[]): Promise<void>;
}

/* shared helpers for implementations */
export const PIN_RE = /^\d{6}$/;
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export type { Question };
