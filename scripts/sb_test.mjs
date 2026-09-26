// End-to-end test of the Supabase backend (supabase/migrations + seed) through the REAL
// client class (src/api/supabase) and raw supabase-js calls that try to break the rules.
//
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \   (or JWT_SECRET=… to mint both)
//   [DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres]  (optional: coin/streak parity check via psql)
//   node scripts/sb_test.mjs
//
// Needs: email confirmations OFF (local stack), anonymous sign-ins ON, MFA TOTP ON.
// Works with `supabase start` (defaults below are the CLI's local values).
process.env.TZ = "UTC"; // TS streak rules use local days; the test tenant's tz is UTC
import { build } from "esbuild";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SECRET = process.env.JWT_SECRET || "super-secret-jwt-token-with-at-least-32-characters-long";

/* ---------- keys ---------- */
const b64u = (b) => Buffer.from(b).toString("base64url");
function mint(role) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ iss: "supabase-demo", role, exp: 1983812996 }));
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
const ANON = process.env.SUPABASE_ANON_KEY || mint("anon");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || mint("service_role");

/* ---------- bundle the real client + TS rules ---------- */
const out = mkdtempSync(join(tmpdir(), "sbtest-"));
await build({
  stdin: {
    contents: `export { createSupabaseApi } from "./src/api/supabase/index.ts";
               export { statsOf, runPoints } from "./src/lib/scoring.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(out, "client.mjs"),
  nodePaths: [join(root, "node_modules")],
  logLevel: "error",
});
const { createSupabaseApi, statsOf, runPoints } = await import(pathToFileURL(join(out, "client.mjs")).href);
globalThis.window = { location: { href: "http://localhost:5173/" } }; // signUp uses window.location.href

/* ---------- tiny test harness ---------- */
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(name);
    console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : "");
  }
}
async function rejects(p, code, name, msgRe) {
  try {
    await p;
    ok(false, name + " (should have failed)");
  } catch (e) {
    ok(e && e.code === code && (!msgRe || msgRe.test(e.message)), name, { code: e?.code, message: e?.message });
  }
}
const statsNoCert = (p, dq) => statsOf({ ...p, runs: Object.fromEntries(Object.entries(p.runs || {}).filter(([, r]) => r.kind !== "cert")) }, dq);
const section = (s) => console.log("\n■ " + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = randomBytes(3).toString("hex");
const mail = (n) => `${n}-${run}@test.local`;
const PW = "Correct-Horse-9";

/* ---------- TOTP (RFC 6238) for MFA ---------- */
function totp(secret) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alpha.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

async function newApi() {
  return createSupabaseApi(URL_, ANON);
}
async function adminUser(email) {
  const api = await newApi();
  const r = await api.signUpPassword(email, PW);
  if (r.needsConfirm) throw new Error("Email confirmations must be OFF for this test (local stack).");
  return api;
}
async function withMfa(api) {
  const e = await api.mfaEnroll();
  await api.mfaVerify(e.factorId, totp(e.secret));
  return e;
}
/** raw supabase-js client acting as the same signed-in user */
async function raw(api) {
  const { data } = await api.sb.auth.getSession();
  return createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
}
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anonRaw = createClient(URL_, ANON, { auth: { persistSession: false } });
const snap = (api, tid) =>
  new Promise((res, rej) => {
    const stop = api.watchTenant(tid, (d) => { stop(); res(d); }, (e) => { stop(); rej(e); });
  });
const once = (subscribe) =>
  new Promise((res) => {
    let stop = () => {};
    stop = subscribe((v) => { setTimeout(() => stop(), 0); res(v); });
  });

/* =============================================================== */
section("super admin bootstrap & unlock");
const superEmail = mail("super");
const sup = await adminUser(superEmail);
{
  const r = await (await raw(sup)).rpc("bootstrap_super_admin", { p_email: superEmail });
  ok(!!r.error, "signed-in users cannot call bootstrap_super_admin", r.error?.message);
  const s = await service.rpc("bootstrap_super_admin", { p_email: superEmail });
  ok(!s.error, "service role bootstraps a super admin", s.error);
}
{
  const st = await sup.superStatus();
  ok(st.isSuperUser && st.unlockedUntil === 0, "superStatus before unlock", st);
  await rejects(sup.superTenants(), "forbidden", "super console locked until unlocked");
  await rejects(sup.superUnlock("wrong-code-1"), "auth", "wrong super code", /tries left/);
  const u = await sup.superUnlock("Sandeepa");
  ok(u.until > Date.now() + 29 * 60_000, "unlock lasts 30 min", u);
  ok((await sup.superStatus()).codeIsDefault === true || process.env.SB_CODE_CHANGED, "code is still the default");
  await rejects(sup.superChangeCode("nope", "Abcdefgh12"), "auth", "change code needs the current code");
  await rejects(sup.superChangeCode("Sandeepa", "short1"), "invalid", "new code must be 8+ letters+digits");
  if (process.env.SB_TEST_CHANGE_CODE) {
    // changes the real code; restore with: update super_secret set hash = crypt('Sandeepa', gen_salt('bf')), is_default = true;
    await sup.superChangeCode("Sandeepa", "Harbour2026x");
    ok((await sup.superStatus()).codeIsDefault === false, "code changed");
    await sup.superLock();
    await rejects(sup.superUnlock("Sandeepa"), "auth", "old code no longer works");
    await sup.superUnlock("Harbour2026x");
    ok((await sup.superStatus()).unlockedUntil > Date.now(), "new code unlocks");
  }
}

section("tenants");
const slugA = `acme-${run}`, slugB = `other-${run}`;
const ownerEmail = mail("owner"), editorEmail = mail("editor"), ownerBEmail = mail("ownerb");
await rejects(sup.superCreateTenant({ name: "X", slug: "admin", template: "generic", ownerEmail, starter: false }), "invalid", "reserved slug rejected");
await rejects(sup.superCreateTenant({ name: "X Co", slug: "Bad Slug", template: "generic", ownerEmail, starter: false }), "invalid", "slug rules");
const tA = await sup.superCreateTenant({ name: "Acme Bank", slug: slugA, template: "bank", ownerEmail, starter: true, branding: { primary: "#123456" } });
ok(tA.slug === slugA && tA.cfg.makerChecker === true && tA.cfg.signIn.adminMfa === true && tA.branding.primary === "#123456", "bank tenant created with bank defaults", tA);
const tB = await sup.superCreateTenant({ name: "Other Co", slug: slugB, template: "generic", ownerEmail: ownerBEmail, starter: false });
await rejects(sup.superCreateTenant({ name: "Dup", slug: slugA, template: "generic", ownerEmail, starter: false }), "conflict", "duplicate slug");
{
  const list = await sup.superTenants();
  const a = list.find((t) => t.id === tA.id);
  ok(a && a.usage.quizzes === 9 && a.usage.admins === 1 && a.usage.players === 0, "superTenants with usage (starter library copied: 6 any + 3 bank)", a?.usage);
  const admins = await sup.superAdmins(tA.id);
  ok(admins.length === 1 && admins[0].role === "owner" && admins[0].email === ownerEmail, "superAdmins lists the pending owner", admins);
  const pub = await sup.tenantBySlug(slugA);
  ok(pub && pub.id === tA.id && pub.pubCfg && pub.features && !("cfg" in pub), "tenantBySlug returns the public part only", pub);
  const r = await anonRaw.rpc("tenant_public", { p_slug: slugA });
  ok(!r.error && r.data?.id === tA.id, "tenant_public works without signing in", r.error);
  const r2 = await anonRaw.rpc("tenant_snapshot", { p_tid: tA.id });
  ok(!!r2.error, "tenant_snapshot is not callable without signing in", r2.error?.message);
}

section("owner joins, MFA gate (bank template requires admin MFA)");
const owner = await adminUser(ownerEmail);
{
  const inv = await owner.acceptInvites();
  ok(inv.length === 1 && inv[0].tenantId === tA.id && inv[0].role === "owner", "acceptInvites binds the owner", inv);
  const mt = await owner.myTenants();
  ok(mt.length === 1 && mt[0].name === "Acme Bank", "myTenants", mt);
  const acc = await owner.access(tA.id);
  ok(acc.role === null, "no admin role before MFA on an MFA-required tenant", acc);
  await rejects(owner.saveConfig(tA.id, tA.cfg), "forbidden", "admin write blocked before MFA");
  const st0 = await owner.mfaState();
  ok(!st0.enrolled && !st0.verified, "mfaState before enrol", st0);
  const e = await withMfa(owner);
  ok(/^data:image\/svg\+xml/.test(e.qr) && e.secret.length >= 16, "mfaEnroll returns QR data URL + secret");
  const st1 = await owner.mfaState();
  ok(st1.enrolled && st1.verified, "mfaState after verify (aal2)", st1);
  ok((await owner.access(tA.id)).role === "owner", "owner role after MFA");
  ok((await owner.access(tB.id)).role === null, "no role in another tenant");
}

section("admin snapshot, library, maker-checker");
let dA = await snap(owner, tA.id);
ok(Object.keys(dA.games).length === 9 && Object.keys(dA.keys).length === 9, "starter quizzes + keys visible to admin");
{
  const g = Object.values(dA.games)[0];
  ok(g.status === "draft" && g.kind === "sprint" && g.questions.some((q) => q.explain), "copied starter quiz is a draft with explanations (admin view)");
  ok(dA.admins.length === 1 && dA.admins[0].mfa === true, "admins list shows MFA", dA.admins);
  ok(dA.audit.some((a) => a.action === "Company created") && dA.audit.some((a) => a.action === "Admin joined"), "tenant audit trail");
  const lib = await owner.library();
  ok(lib.length === 9 && lib[0].answers && lib[0].questions.length, "library() for admins");
  const n = await owner.importLibrary(tA.id, [lib[0].id, "nope"]);
  ok(n === 1, "importLibrary copies selected sets", n);
}
await owner.inviteAdmin(tA.id, editorEmail, "editor");
await rejects(owner.inviteAdmin(tA.id, editorEmail, "viewer"), "conflict", "duplicate invite");
const editor = await adminUser(editorEmail);
await editor.acceptInvites();
await withMfa(editor);
ok((await editor.access(tA.id)).role === "editor", "editor role");
await rejects(editor.saveConfig(tA.id, tA.cfg), "forbidden", "editor cannot change settings");
await rejects(editor.inviteAdmin(tA.id, mail("x"), "viewer"), "forbidden", "editor cannot invite admins");

const now = Date.now();
const Q = {
  game: {
    id: "q-sprint-" + run, kind: "sprint", title: "Sprint One", minutes: 2, color: "lime", status: "live", createdAt: now, updatedAt: now,
    questions: [
      { id: "a1", type: "mcq", topic: "Cyber", q: "Pick C", options: ["A", "B", "C", "D"], explain: "Because C." },
      { id: "a2", type: "tf", topic: "Cyber", q: "Sky is green", explain: "It is blue." },
      { id: "a3", type: "order", topic: "Ops", q: "Order", items: ["x", "y", "z"], answer: "LEAK" },
    ],
  },
  key: { gid: "q-sprint-" + run, answers: { a1: "2", a2: "F", a3: "0,1,2" }, updatedAt: now },
};
await rejects(editor.saveQuiz(tA.id, { ...Q, key: { ...Q.key, answers: { a1: "2" } } }), "invalid", "every question needs an answer");
await editor.saveQuiz(tA.id, Q);
dA = await snap(owner, tA.id);
ok(dA.games[Q.game.id].status === "pending", "maker-checker: editor's live quiz goes to pending", dA.games[Q.game.id].status);
ok(!JSON.stringify(dA.games[Q.game.id]).includes("LEAK"), "unknown question fields are stripped");
await rejects(editor.setQuizStatus(tA.id, Q.game.id, "live", true), "forbidden", "editor cannot approve");
await owner.setQuizStatus(tA.id, Q.game.id, "live", true);
dA = await snap(owner, tA.id);
ok(dA.games[Q.game.id].status === "live" && dA.games[Q.game.id].approvedBy === ownerEmail, "admin approves → live", dA.games[Q.game.id]);
// owner edits and tries to approve own edit
await owner.saveQuiz(tA.id, { ...Q, key: { ...Q.key, answers: { ...Q.key.answers, a2: "T" } } });
dA = await snap(owner, tA.id);
ok(dA.games[Q.game.id].status === "pending", "changing an answer of a live quiz needs re-approval");
await rejects(owner.setQuizStatus(tA.id, Q.game.id, "live", true), "forbidden", "cannot approve your own change", /different admin/);
await editor.saveQuiz(tA.id, { ...Q, game: { ...Q.game, status: "pending" } }); // editor restores the key
await owner.setQuizStatus(tA.id, Q.game.id, "live", true);
ok((await snap(owner, tA.id)).games[Q.game.id].status === "live", "approved after another admin's edit");

const C = {
  game: {
    id: "q-cert-" + run, kind: "cert", title: "AML Cert", minutes: 5, color: "blue", status: "pending", createdAt: now, updatedAt: now,
    cert: { passPct: 100, attempts: 2, certTitle: "Certified", validMonths: 12, showAnswers: true },
    questions: [
      { id: "c1", type: "mcq", topic: "AML", q: "Pick B", options: ["A", "B"], explain: "B!" },
      { id: "c2", type: "tf", topic: "AML", q: "True?", explain: "True." },
    ],
  },
  key: { gid: "q-cert-" + run, answers: { c1: "1", c2: "T" }, updatedAt: now },
};
await editor.saveQuiz(tA.id, C);
await owner.setQuizStatus(tA.id, C.game.id, "live", true);
const L = {
  game: {
    id: "q-live-" + run, kind: "live", title: "Live Fun", minutes: 2, color: "pink", status: "draft", createdAt: now, updatedAt: now,
    questions: [
      { id: "l1", type: "mcq", topic: "Fun", q: "2+2?", options: ["3", "4", "5"], explain: "Four.", seconds: 20 },
      { id: "l2", type: "tf", topic: "Fun", q: "Water is wet", seconds: 10 },
    ],
  },
  key: { gid: "q-live-" + run, answers: { l1: "1", l2: "T" }, updatedAt: now },
};
await rejects(editor.saveQuiz(tA.id, { ...L, game: { ...L.game, questions: [{ id: "l9", type: "order", topic: "x", q: "x", items: ["a"] }] }, key: { ...L.key, answers: { l9: "0" } } }), "invalid", "live quizzes: mcq/tf only");
await editor.saveQuiz(tA.id, L);

section("players: register, lookup, claim, masking");
const p1 = await newApi();
await p1.signInAnonymous();
ok(p1.user()?.anonymous === true, "anonymous sign-in");
const p2 = await newApi();
await p2.signInAnonymous();
ok(p1.user().id !== p2.user().id, "separate anonymous identities");
await rejects(p1.playerRegister(tA.id, { empId: "E1001", name: "Nimal Perera", unitType: "branch", unit: "Nowhere", look: 3 }, "test"), "invalid", "unit must be from the list");
await rejects(p1.playerRegister(tA.id, { empId: "E1", name: "Nimal Perera", unitType: "branch", unit: "City Branch", look: 3 }, "test"), "invalid", "Employee ID rules");
const me1 = await p1.playerRegister(tA.id, { empId: "e1001", name: "  Nimal   Perera ", unitType: "branch", unit: "City Branch", look: 3 }, "node test");
ok(me1.empId === "E1001" && me1.name === "Nimal Perera" && me1.logins.length === 1, "register normalises ID and name", me1);
await rejects(p2.playerRegister(tA.id, { empId: "E1001", name: "Kamal Silva", unitType: "dept", unit: "IT", look: 1 }, "t"), "conflict", "Employee ID already used");
await rejects(p1.playerRegister(tA.id, { empId: "E1003", name: "Nimal Two", unitType: "dept", unit: "IT", look: 1 }, "t"), "conflict", "one card per sign-in");
const me2 = await p2.playerRegister(tA.id, { empId: "E1002", name: "Kamal Silva", unitType: "dept", unit: "IT", look: 1 }, "t");
{
  const card = await p2.playerLookup(tA.id, "e1001");
  ok(card && card.first === "Nimal" && card.lastInitial === "P." && card.unit === "City Branch" && card.level === 1 && !("empId" in card), "lookup card is minimal", card);
  ok((await p2.playerLookup(tA.id, "ZZZ999")) === null, "unknown ID → null");
  const mp = await p1.myPlayer(tA.id);
  ok(mp && mp.uid === me1.uid, "myPlayer");
  const d1 = await snap(p1, tA.id);
  const other = d1.players[me2.uid], mine = d1.players[me1.uid];
  ok(other.empId === "••02" && other.email === undefined && other.logins === undefined, "others' cards are masked", other);
  ok(mine.empId === "E1001" && Array.isArray(mine.logins), "own card in full");
  ok(Object.keys(d1.keys).length === 0 && d1.roster === null && d1.audit.length === 0 && d1.admins.length === 0 && Object.keys(d1.polls).length === 0, "no admin data for players");
  const gids = Object.keys(d1.games).sort();
  ok(gids.length === 2 && gids.includes(Q.game.id) && gids.includes(C.game.id), "players see live sprint/cert quizzes only", gids);
  ok(!JSON.stringify(d1.games).includes("explain") && !JSON.stringify(d1.games).includes('"answers"'), "no explanations or answers in player quiz data");
  const dOther = await snap(p1, tB.id);
  ok(Object.keys(dOther.players).length === 0 && Object.keys(dOther.games).length === 0, "another tenant shows nothing to a non-member");
}

section("sprint play — server clock and scoring");
{
  const r0 = await p1.startRun(tA.id, Q.game.id);
  ok(r0.status === "playing" && r0.total === 3 && r0.ans.length === 0, "startRun", r0);
  const r0b = await p1.startRun(tA.id, Q.game.id);
  ok(r0b.startedAt === r0.startedAt, "startRun resumes the same play");
  await rejects(p1.showQuestion(tA.id, Q.game.id, 1), "invalid", "questions in order");
  const s = await p1.showQuestion(tA.id, Q.game.id, 0);
  ok(typeof s.qAt === "number", "showQuestion stamps qAt");
  await sleep(300);
  const a1 = await p1.answer(tA.id, Q.game.id, 0, "2", 0);
  ok(a1.ok === true && a1.canon === "2" && a1.explain === "Because C." && a1.pts > 100 && a1.pts <= 150, "right answer: points + explanation", a1);
  await rejects(p1.answer(tA.id, Q.game.id, 0, "2", 0), "invalid", "cannot answer twice");
  await p1.showQuestion(tA.id, Q.game.id, 1);
  const a2 = await p1.answer(tA.id, Q.game.id, 1, "T", 2);
  ok(a2.ok === false && a2.canon === "F" && a2.pts === 0, "wrong answer", a2);
  const a3 = await p1.answer(tA.id, Q.game.id, 2, "0,1,2", 0); // skipped showQuestion: clock runs from previous answer
  ok(a3.ok === true && a3.run.ans[2].ms >= 0 && a3.run.blur === 2, "answer without showQuestion still timed; blur kept", a3.run);
  const f = await p1.finishRun(tA.id, Q.game.id);
  ok(f.run.status === "done" && f.run.score === runPoints(f.run).total && f.run.correct === 2 && f.key === undefined, "finishRun: score = runPoints()", f.run);
  const again = await p1.startRun(tA.id, Q.game.id);
  ok(again.status === "done", "sprint can't be replayed");
  // p2 plays quickly
  await p2.startRun(tA.id, Q.game.id);
  await p2.showQuestion(tA.id, Q.game.id, 0);
  await p2.answer(tA.id, Q.game.id, 0, "2", 0);
  await p2.finishRun(tA.id, Q.game.id);
  const d2 = await snap(p2, tA.id);
  const p1run = d2.players[me1.uid].runs[Q.game.id];
  ok(p1run && p1run.ans.every((a) => a.c === null) && p1run.score === f.run.score, "other players' choices are hidden (leaderboard data only)", p1run);
  ok(d2.players[me2.uid].runs[Q.game.id].ans[1].sk === 1, "unanswered questions are marked skipped");
}

section("certification — hidden results, attempts, answers at the end");
{
  await p1.startRun(tA.id, C.game.id);
  await p1.showQuestion(tA.id, C.game.id, 0);
  const x = await p1.answer(tA.id, C.game.id, 0, "1", 0);
  ok(x.ok === null && x.canon === null && x.pts === 0 && x.explain === undefined && x.run.ans[0].ok === 0, "cert answers are hidden (even in the run)", x);
  await p1.showQuestion(tA.id, C.game.id, 1);
  await p1.answer(tA.id, C.game.id, 1, "F", 0);
  const f1 = await p1.finishRun(tA.id, C.game.id);
  ok(f1.run.status === "done" && f1.run.passed === false && f1.run.score === 1 && f1.key === undefined, "failed attempt 1: no answer key while a retake remains", f1);
  const d = await snap(p1, tA.id);
  ok(d.players[me1.uid].runs[C.game.id].ans.every((a) => a.ok === 0), "own retakeable cert attempt hides right/wrong in snapshot");
  const r2 = await p1.startRun(tA.id, C.game.id);
  ok(r2.attempt === 2 && r2.status === "playing", "attempt 2", r2);
  await p1.showQuestion(tA.id, C.game.id, 0);
  await p1.answer(tA.id, C.game.id, 0, "1", 0);
  await p1.showQuestion(tA.id, C.game.id, 1);
  await p1.answer(tA.id, C.game.id, 1, "T", 0);
  const f2 = await p1.finishRun(tA.id, C.game.id);
  ok(f2.run.passed === true && f2.key && f2.key.c1 === "1", "passed attempt 2: answers shown", f2);
  await rejects(p1.startRun(tA.id, C.game.id), "conflict", "already passed");
  const d3 = await snap(owner, tA.id);
  ok(d3.players[me1.uid].runs[`${C.game.id}~2`]?.passed === true, "attempts keyed gid~n");
  ok(d3.players[me1.uid].runs[`${C.game.id}~2`].kind === "cert" && d3.players[me1.uid].runs[Q.game.id].kind === "sprint", "runs carry the quiz kind");
  ok((await p1.myPlayer(tA.id)).runs[C.game.id].kind === "cert", "myPlayer runs carry kind");
}

section("store — coins computed on the server (statsOf)");
{
  const dAdm = await snap(owner, tA.id);
  const st = statsNoCert(dAdm.players[me1.uid], dAdm.dq);
  if (st.coins >= 100) {
    await p1.buyItem(tA.id, "bg-mint");
    ok((await p1.myPlayer(tA.id)).purchases.some((x) => x.id === "bg-mint"), "buy with enough coins");
  } else await rejects(p1.buyItem(tA.id, "bg-mint"), "invalid", `not enough coins (TS says ${st.coins})`, /Not enough coins/);
  await rejects(p1.buyItem(tA.id, "crown"), st.coins >= 900 ? "forbidden" : "forbidden", "level-locked item", /Unlocks at level 8/);
  await rejects(p1.buyItem(tA.id, "no-such"), "not_found", "unknown item");
  await p1.updateMyCard(tA.id, { equipped: { face: "shades", bg: "bg-mint" }, look: 99, name: "Nimal Perera" });
  const mp = await p1.myPlayer(tA.id);
  ok(mp.look === 15 && (mp.equipped.face === undefined), "can only wear owned items; look clamped", mp.equipped);
}

section("store — purchase rules with earned coins; server clock");
{
  // give p1 a history of perfect plays (service role writes directly, like an import)
  const DAY = 864e5;
  const rows = Array.from({ length: 8 }, (_, i) => ({
    tenant_id: tA.id, player_id: me1.uid, run_key: "hist" + i, gid: "hist" + i, attempt: 1, status: "done", total: 2, correct: 2,
    ans: [{ ok: 1, ms: 1000, c: "0", pts: 150 }, { ok: 1, ms: 1000, c: "0", pts: 150 }],
    started_at: Date.now() - (20 + i) * DAY, finished_at: Date.now() - (20 + i) * DAY + 5000,
  }));
  const ins = await service.from("runs").insert(rows);
  ok(!ins.error, "service role can seed history", ins.error);
  const dAdm = await snap(owner, tA.id);
  const st = statsNoCert(dAdm.players[me1.uid], dAdm.dq);
  ok(st.coins >= 400, "TS statsOf sees enough coins", st.coins);
  await p1.buyItem(tA.id, "specs");
  await rejects(p1.buyItem(tA.id, "specs"), "conflict", "already own");
  await p1.buyItem(tA.id, "shield");
  await p1.buyItem(tA.id, "shield");
  await rejects(p1.buyItem(tA.id, "shield"), "conflict", "shield: hold 2 at most", /2 at most/);
  await p1.updateMyCard(tA.id, { equipped: { face: "specs", head: "specs" } });
  const mp = await p1.myPlayer(tA.id);
  ok(mp.equipped.face === "specs" && mp.equipped.head === undefined && mp.purchases.length === 3, "equip owned item in its slot only", mp.equipped);
  const after = statsNoCert((await snap(owner, tA.id)).players[me1.uid], dAdm.dq);
  ok(after.coins === st.coins - 150 - 240, "coins spent match catalog prices", { before: st.coins, after: after.coins });
  // server clock: a sprint answer after the whole-quiz time counts as no answer
  const p7 = await newApi();
  await p7.signInAnonymous();
  const me7 = await p7.playerRegister(tA.id, { empId: "E7007", name: "Late Larry", unitType: "dept", unit: "IT", look: 1 }, "t");
  await p7.startRun(tA.id, Q.game.id);
  await p7.showQuestion(tA.id, Q.game.id, 0);
  await service.from("runs").update({ q_at: Date.now() - 200_000 }).eq("player_id", me7.uid).eq("run_key", Q.game.id);
  const late = await p7.answer(tA.id, Q.game.id, 0, "2", 0);
  ok(late.ok === false && late.run.ans[0].c === null && late.run.ans[0].ms === 120_000, "answer after the quiz clock ran out scores nothing", late.run.ans[0]);
  await p7.startRun(tA.id, C.game.id);
  await p7.showQuestion(tA.id, C.game.id, 0);
  await service.from("runs").update({ q_at: Date.now() - 200_000 }).eq("player_id", me7.uid).eq("run_key", C.game.id);
  const cl = await p7.answer(tA.id, C.game.id, 0, "1", 0);
  ok(cl.run.ans[0].c === "1" && cl.run.ans[0].ms >= 199_000, "cert clock is longer (5 min here; cert limit clamp(minutes||10, 1, 180))", cl.run.ans[0]);
  await service.from("runs").update({ q_at: Date.now() - 400_000 }).eq("player_id", me7.uid).eq("run_key", C.game.id);
  const cl2 = await p7.answer(tA.id, C.game.id, 1, "T", 0);
  ok(cl2.run.ans[1].c === null, "cert answer after its clock ran out counts as none", cl2.run.ans[1]);
  // cert plays don't change coins/level: points before == after finishing a passed cert exam
  const lvl0 = (await p2.playerLookup(tA.id, "E7007"));
  ok(lvl0 && lvl0.level === 1, "lookup level ignores cert");
}

section("direct table access is blocked (RLS + grants)");
{
  const r = await raw(p1);
  const keys = await r.from("quiz_keys").select("*");
  ok(!keys.error && keys.data.length === 0, "player reads no answer keys", keys);
  const runs = await r.from("runs").select("*");
  ok(!runs.error && runs.data.length === 0, "player reads no raw runs");
  const pl = await r.from("players").select("*");
  ok(!pl.error && pl.data.length === 0, "player reads no raw player rows (emails, IDs)");
  const qz = await r.from("quizzes").select("*");
  ok(!qz.error && qz.data.length === 2 && qz.data.every((q) => q.tenant_id === tA.id && q.kind !== "live") && !JSON.stringify(qz.data).includes("explain"), "player reads released quizzes of own tenant only", qz.data?.map((q) => q.id));
  const ins = await r.from("runs").insert({ tenant_id: tA.id, player_id: me1.uid, run_key: "x", gid: "x" });
  ok(!!ins.error, "player cannot insert runs", ins.error?.message);
  const up = await r.from("players").update({ purchases: [] }).eq("id", me1.uid);
  ok(!!up.error, "player cannot update players", up.error?.message);
  const upq = await r.from("quizzes").update({ status: "live" }).eq("id", L.game.id);
  ok(!!upq.error, "player cannot update quizzes");
  for (const t of ["library", "live_keys", "super_secret", "super_admins", "rate_limits", "poll_votes", "super_unlocks"]) {
    const x = await r.from(t).select("*");
    ok(!!x.error || x.data.length === 0, `no access to ${t}`, x.data?.length);
  }
  const lib = await r.rpc("library_list");
  ok(!!lib.error && /forbidden/.test(lib.error.message), "players cannot read the library (it has answers)");
  const sq = await r.rpc("save_quiz", { p_tid: tA.id, p_draft: Q });
  ok(!!sq.error && /^forbidden/.test(sq.error.message), "players cannot call admin RPCs");
  const priv = await r.rpc("player_stats", { p_pid: me1.uid });
  ok(!!priv.error, "private helpers are not exposed");
  const ownerRaw = await raw(owner);
  const ok1 = await ownerRaw.from("quiz_keys").select("gid").eq("tenant_id", tA.id);
  ok(!ok1.error && ok1.data.length >= 10, "admin (aal2) can read keys (realtime needs it)", ok1.data?.length);
  const ok2 = await ownerRaw.from("players").select("id").eq("tenant_id", tB.id);
  ok(!ok2.error && ok2.data.length === 0, "admin reads nothing from another tenant");
  const w = await ownerRaw.from("tenants").update({ status: "active" }).eq("id", tA.id);
  ok(!!w.error, "admins cannot write tables directly either");
  await rejects(owner.saveQuiz(tB.id, Q), "forbidden", "admin cannot write into another tenant");
  await rejects(p1.startRun(tB.id, "x"), "auth", "player has no card in another tenant");
}

section("claim, lock, allowlist, email linking");
{
  const p3 = await newApi();
  await p3.signInAnonymous();
  await rejects(p3.playerClaim(tA.id, "NOPE1"), "not_found", "claim unknown ID");
  const c = await p3.playerClaim(tA.id, "E1001", "phone");
  ok(c.uid === me1.uid && c.logins[0].dev === "phone", "claim binds this device", c.logins);
  ok((await p1.myPlayer(tA.id)) === null, "old device signed out (one device at a time)");
  await p1.playerClaim(tA.id, "E1001", "laptop");
  await owner.adminPatchPlayer(tA.id, me2.uid, { locked: true });
  ok((await p2.myPlayer(tA.id)) === null, "locked card: signed out");
  await rejects(p2.playerClaim(tA.id, "E1002", "x"), "forbidden", "locked card cannot be claimed");
  ok((await p3.playerLookup(tA.id, "E1002")) === null, "locked card hidden from lookup");
  await owner.adminPatchPlayer(tA.id, me2.uid, { locked: false });
  await p2.playerClaim(tA.id, "E1002", "x");
  // allowlist
  const salt = randomBytes(8).toString("hex");
  const h = (id) => createHash("sha256").update(salt + id).digest("hex");
  await owner.saveRoster(tA.id, { salt, hashes: [h("E2001")], updatedAt: Date.now() });
  await owner.saveConfig(tA.id, { ...tA.cfg, requireAllowlist: true });
  const p4 = await newApi();
  await p4.signInAnonymous();
  await rejects(p4.playerRegister(tA.id, { empId: "E2002", name: "Not Listed", unitType: "dept", unit: "IT", look: 0 }, "x"), "forbidden", "allowlist blocks unknown IDs", /staff list/);
  const ok4 = await p4.playerRegister(tA.id, { empId: "E2001", name: "Listed Person", unitType: "dept", unit: "IT", look: 0, email: mail("listed") }, "x");
  ok(ok4.empId === "E2001", "allowlisted ID registers");
  await owner.saveConfig(tA.id, { ...tA.cfg, requireAllowlist: false });
  // email linking: a user who signs in with that (verified) email gets the card
  const p5 = await adminUser(mail("listed"));
  const linked = await p5.playerLinkEmail(tA.id, "work pc");
  ok(linked && linked.uid === ok4.uid, "playerLinkEmail binds the card with the verified email", linked);
  ok((await p5.access(tA.id)).role === null, "a player with an email is not an admin");
  // import
  const imp = await owner.adminImportPlayers(tA.id, [
    { empId: "E3001", name: "Imported One", unitType: "branch", unit: "City Branch", look: 0 },
    { empId: "E1001", name: "Dup", unitType: "branch", unit: "City Branch", look: 0 },
    { empId: "!!", name: "Bad", unitType: "branch", unit: "City Branch", look: 0 },
  ]);
  ok(imp.added === 1 && imp.skipped === 2, "adminImportPlayers", imp);
  await rejects(owner.adminPatchPlayer(tA.id, me2.uid, { empId: "E1001" }), "conflict", "admin cannot reuse an Employee ID");
}

section("rate limits");
{
  const p6 = await newApi();
  await p6.signInAnonymous();
  for (let i = 0; i < 5; i++) await p6.playerLookup(tA.id, "MISS" + i);
  await rejects(p6.playerLookup(tA.id, "E1001"), "rate_limited", "5 misses → lookup locked");
  try {
    await p6.playerLookup(tA.id, "E1001");
  } catch (e) {
    ok(e.wait > 50_000 && e.wait <= 60_000, "rate_limited carries wait ms", e.wait);
  }
  await rejects(p6.playerClaim(tA.id, "E1001", "x"), "rate_limited", "claim shares the lookup limiter");
}

section("live quiz (Kahoot-style)");
{
  const s = await owner.liveCreate(tA.id, L.game.id, { guests: false });
  ok(/^\d{6}$/.test(s.pin) && s.state === "lobby" && s.total === 2 && !("canon" in s), "liveCreate", s);
  const found = await p1.liveFind(s.pin);
  ok(found && found.sessionId === s.id && found.slug === slugA, "liveFind", found);
  ok((await p1.liveFind("000000")) === null, "liveFind miss → null");
  const j1 = await p1.liveJoin(s.id);
  const j1b = await p1.liveJoin(s.id);
  ok(j1.livePlayerId === j1b.livePlayerId, "joining twice returns the same live player");
  const j2 = await p2.liveJoin(s.id);
  const guest = await newApi();
  await guest.signInAnonymous();
  await rejects(guest.liveJoin(s.id, "Guesty"), "auth", "guests need a card when guest mode is off");
  let v = await once((cb) => p1.watchLivePlayer(s.id, j1.livePlayerId, cb));
  ok(v.session.state === "lobby" && v.me.nick === "Nimal P." && v.count === 2, "player view in lobby", v);
  await rejects(p1.liveControl(s.id, "start"), "forbidden", "players cannot control the game");
  await owner.liveControl(s.id, "start");
  const r = await raw(p1);
  const row = await r.from("live_sessions").select("*").eq("id", s.id).single();
  ok(!row.error && row.data.state === "question" && !JSON.stringify(row.data.question).includes("explain") && row.data.reveal === null, "participant can read the session row (realtime) without answers", row.data);
  const lk = await r.from("live_keys").select("*");
  ok(!!lk.error || lk.data.length === 0, "live answer keys are never readable");
  await rejects(p1.liveAnswer(s.id, j1.livePlayerId, 0, "9"), "invalid", "invalid option");
  await rejects(p2.liveAnswer(s.id, j1.livePlayerId, 0, "1"), "forbidden", "cannot answer as someone else");
  await sleep(200);
  await p1.liveAnswer(s.id, j1.livePlayerId, 0, "1");
  await rejects(p1.liveAnswer(s.id, j1.livePlayerId, 0, "1"), "conflict", "one answer per question");
  await p2.liveAnswer(s.id, j2.livePlayerId, 0, "0");
  v = await once((cb) => p1.watchLivePlayer(s.id, j1.livePlayerId, cb));
  ok(v.answered === true && v.me.score === 0 && v.me.lastOk === undefined && v.lastOk === null && v.session.reveal === undefined && !v.ahead, "results (and 'ahead') hidden until reveal", v);
  let h = await once((cb) => owner.watchLiveHost(s.id, cb));
  ok(h.answered === 2 && h.counts.join() === "1,1,0" && h.players.length === 2, "host view counts answers", h);
  await owner.liveControl(s.id, "reveal");
  v = await once((cb) => p1.watchLivePlayer(s.id, j1.livePlayerId, cb));
  ok(v.me.score >= 900 && v.me.score <= 1000 && v.me.lastOk === true && v.lastOk === true && v.rank === 1 && v.session.reveal.canon === "1" && v.session.reveal.explain === "Four.", "reveal: Kahoot points (500–1000 by speed)", v);
  const s1 = v.me.score;
  ok(v.ahead === null || v.ahead === undefined, "leader has nobody ahead", v.ahead);
  const v2 = await once((cb) => p2.watchLivePlayer(s.id, j2.livePlayerId, cb));
  ok(v2.rank === 2 && v2.ahead && v2.ahead.nick === "Nimal P." && v2.ahead.score === s1, "ahead = the player directly above (after reveal)", v2.ahead);
  await owner.liveControl(s.id, "next");
  await p2.liveAnswer(s.id, j2.livePlayerId, 1, "T");
  await owner.liveControl(s.id, "board");
  v = await once((cb) => p1.watchLivePlayer(s.id, j1.livePlayerId, cb));
  ok(v.me.streak === 0 && v.me.score === s1 && v.lastOk === false, "no answer → streak reset (settle)", v.me);
  h = await once((cb) => owner.watchLiveHost(s.id, cb));
  ok(h.players.find((x) => x.id === j2.livePlayerId).streak === 1, "right answer → streak 1");
  await owner.liveControl(s.id, "next");
  h = await once((cb) => owner.watchLiveHost(s.id, cb));
  ok(h.session.state === "ended" && h.session.endedAt > 0, "next after the last question ends the game");
  await rejects(p1.liveAnswer(s.id, j1.livePlayerId, 1, "T"), "closed", "no answers after the end");
  ok((await p1.liveFind(s.pin)) === null, "ended game can't be found");
  const dl = await snap(owner, tA.id);
  ok(dl.live.length === 1 && dl.live[0].id === s.id, "recent live sessions in admin snapshot");
  // guest mode
  const tcfg = (await snap(owner, tA.id)).tenant.cfg;
  await owner.saveConfig(tA.id, { ...tcfg, signIn: { ...tcfg.signIn, liveGuests: true } });
  const s2 = await owner.liveCreate(tA.id, L.game.id, { guests: true });
  ok(s2.guests === true, "guest game");
  await rejects(guest.liveJoin(s2.id, "x"), "invalid", "nickname length");
  const g1 = await guest.liveJoin(s2.id, "Nimal P.");
  const gv = await once((cb) => guest.watchLivePlayer(s2.id, g1.livePlayerId, cb));
  ok(gv.me.nick === "Nimal P.", "guest nickname");
  const pj = await p1.liveJoin(s2.id);
  const pv = await once((cb) => p1.watchLivePlayer(s2.id, pj.livePlayerId, cb));
  ok(pv.me.nick === "Nimal P. 2", "duplicate nicknames get a number", pv.me.nick);
  const peek = await (await raw(guest)).rpc("live_player_view", { p_sid: s2.id, p_lpid: pv.me.id });
  ok(!!peek.error && /forbidden/.test(peek.error.message), "cannot watch another player's private view");
  await owner.liveControl(s2.id, "kick", g1.livePlayerId);
  const gv2 = await once((cb) => guest.watchLivePlayer(s2.id, g1.livePlayerId, cb));
  ok(gv2.me === null, "kicked player sees me = null");
  await owner.liveControl(s2.id, "end");
  // server clock for live answers
  const s3 = await owner.liveCreate(tA.id, L.game.id, { guests: false });
  const j3 = await p1.liveJoin(s3.id);
  await owner.liveControl(s3.id, "start");
  await service.from("live_sessions").update({ q_started_at: Date.now() - 25_000 }).eq("id", s3.id);
  await rejects(p1.liveAnswer(s3.id, j3.livePlayerId, 0, "1"), "closed", "live answer after time + grace is refused", /Time's up/);
  await owner.liveControl(s3.id, "end");
  for (let i = 0; i < 10; i++) await guest.liveFind(String(100000 + i));
  await rejects(guest.liveFind("123456"), "rate_limited", "PIN guessing is rate limited");
}

section("polls (Mentimeter-style)");
{
  const pollId = "poll-" + run;
  const poll = {
    id: pollId, tenantId: tA.id, title: "Team pulse", code: "", current: 0, status: "open", showResults: true, locked: false, createdAt: 0, updatedAt: 0,
    slides: [
      { id: "s1", type: "mc", prompt: "Mood?", options: ["Great", "Good", "Okay", "Tired"] },
      { id: "s2", type: "word", prompt: "One word", maxWords: 2 },
      { id: "s3", type: "scale", prompt: "Rate", scaleMin: 1, scaleMax: 5 },
      { id: "s4", type: "qa", prompt: "Questions?" },
      { id: "s5", type: "rank", prompt: "Rank", options: ["a", "b", "c"] },
    ],
  };
  await rejects(p1.savePoll(tA.id, poll), "forbidden", "players cannot create polls");
  await editor.savePoll(tA.id, poll);
  const ap = (await snap(owner, tA.id)).polls[pollId];
  ok(ap && /^\d{6}$/.test(ap.code) && ap.createdBy === editorEmail, "savePoll assigns a code", ap);
  const f = await p1.pollFind(ap.code);
  ok(f && f.pollId === pollId && f.slug === slugA, "pollFind returns the company slug", f);
  const pv = await once((cb) => p1.watchPoll(pollId, cb));
  ok(pv.slides.length === 5 && pv.createdBy === undefined, "audience poll view (no creator email)", pv);
  await p1.pollRespond(pollId, "s1", { choice: [1] });
  await p1.pollRespond(pollId, "s1", { choice: [2] }); // replaces
  await p2.pollRespond(pollId, "s1", { choice: [2] });
  await rejects(p1.pollRespond(pollId, "s1", { choice: [9] }), "invalid", "mc validation", /Pick an option/);
  await rejects(p1.pollRespond(pollId, "s1", { choice: [0, 1] }), "invalid", "single choice only");
  await rejects(p1.pollRespond(pollId, "s3", { score: 3 }), "closed", "only the current slide", /moved on/);
  let res = await once((cb) => p1.watchPollResults(pollId, "s1", cb));
  ok(res.n === 2 && res.counts.join() === "0,0,2,0", "mc results (one answer per person)", res);
  ok(JSON.stringify(await p1.pollMyResponses(pollId)) === JSON.stringify({ s1: { choice: [2] } }), "pollMyResponses");
  await owner.pollControl(pollId, { current: 1 });
  await p1.pollRespond(pollId, "s2", { words: ["Happy", "the"] });
  await p2.pollRespond(pollId, "s2", { words: ["happy!"] });
  res = await once((cb) => p1.watchPollResults(pollId, "s2", cb));
  ok(res.words.length === 1 && res.words[0].w === "happy" && res.words[0].n === 2, "word cloud (normalised, stop-words dropped)", res.words);
  await rejects(p1.pollRespond(pollId, "s2", { words: ["a", "b", "c"] }), "invalid", "max words");
  await owner.pollControl(pollId, { current: 3 });
  for (let i = 0; i < 5; i++) await p1.pollRespond(pollId, "s4", { text: "Question number " + i });
  await rejects(p1.pollRespond(pollId, "s4", { text: "One more please" }), "rate_limited", "Q&A: 5 questions per person");
  res = await once((cb) => p2.watchPollResults(pollId, "s4", cb));
  ok(res.texts.length === 5 && res.texts.every((t) => t.who === ""), "Q&A visible to audience, anonymised", res.texts?.[0]);
  const qid = res.texts[4].id;
  await p2.qaVote(pollId, qid);
  res = await once((cb) => p2.watchPollResults(pollId, "s4", cb));
  ok(res.texts[0].id === qid && res.texts[0].votes === 1, "upvote sorts to the top", res.texts[0]);
  await p2.qaVote(pollId, qid);
  await rejects(p1.qaModerate(pollId, qid, { hidden: true }), "forbidden", "audience cannot moderate");
  await owner.qaModerate(pollId, qid, { hidden: true });
  res = await once((cb) => owner.watchPollResults(pollId, "s4", cb));
  ok(res.texts.length === 4 && res.texts.every((t) => t.who !== ""), "hidden questions drop out; host sees pseudonymous ids");
  await owner.pollControl(pollId, { current: 4, showResults: false });
  await rejects(p1.pollRespond(pollId, "s5", { order: [0, 0, 1] }), "invalid", "rank validation");
  await p1.pollRespond(pollId, "s5", { order: [2, 0, 1] });
  let gotHidden = true;
  const stop = p1.watchPollResults(pollId, "s5", () => (gotHidden = false));
  await sleep(700);
  stop();
  ok(gotHidden, "audience gets no results when showResults is off");
  res = await once((cb) => owner.watchPollResults(pollId, "s5", cb));
  ok(res.rank[0].i === 2 && res.rank[0].score === 3, "rank (Borda) for host", res.rank);
  await owner.pollControl(pollId, { locked: true });
  await rejects(p1.pollRespond(pollId, "s5", { order: [0, 1, 2] }), "closed", "locked slide");
  const r = await raw(p1);
  const rr = await r.from("poll_responses").select("*");
  ok(!rr.error && rr.data.length === 0, "audience cannot read raw responses");
  const pr = await r.from("polls").select("id");
  ok(!pr.error && pr.data.length === 1 && pr.data[0].id === pollId, "audience can read only polls they joined (realtime)");
  await owner.pollControl(pollId, { status: "closed" });
  const closed = await once((cb) => p1.watchPoll(pollId, cb));
  ok(closed.status === "closed" && closed.slides.length === 0, "closed poll hides slides from the audience");
  await rejects(p1.pollRespond(pollId, "s5", { order: [0, 1, 2] }), "closed", "closed poll");
  ok((await p1.pollFind(ap.code)) === null, "closed poll can't be found");
  await rejects(editor.deletePoll(tB.id, pollId), "forbidden", "cannot delete from another tenant");
}

section("admin housekeeping");
{
  await owner.saveGift(tA.id, { id: "gift1", period: "2026-W39", kind: "weekly", winner: me1.uid, label: "Top scorer", prize: "Voucher", at: Date.now(), by: "spoofed" });
  let d = await snap(p1, tA.id);
  ok(d.gifts.gift1 && d.gifts.gift1.by === ownerEmail, "gift visible to players; 'by' set by the server", d.gifts.gift1);
  await owner.saveDQ(tA.id, { runs: { [`${me2.uid}:${Q.game.id}`]: { at: Date.now(), by: ownerEmail, reason: "test" } } });
  d = await snap(p1, tA.id);
  ok(Object.keys(d.dq.runs).length === 1, "disqualifications visible to players (leaderboards)");
  await owner.deleteGift(tA.id, "gift1");
  await owner.audit(tA.id, { action: "Exported results", detail: "csv", sev: "info" });
  await owner.adminResetRun(tA.id, me2.uid, Q.game.id);
  await rejects(owner.adminResetRun(tA.id, me2.uid, Q.game.id), "not_found", "reset of a missing play");
  ok((await owner.purgeRuns(tA.id, 0)) === 0, "purgeRuns before 1970 purges nothing");
  await rejects(owner.removeAdmin(tA.id, ownerEmail), "invalid", "keep at least one owner");
  await rejects(owner.setAdminRole(tA.id, ownerEmail, "admin"), "invalid", "keep at least one owner (role change)");
  await owner.setAdminRole(tA.id, editorEmail, "host");
  ok((await editor.access(tA.id)).role === "host", "role changed");
  await rejects(editor.saveQuiz(tA.id, Q), "forbidden", "host cannot edit quizzes");
  await owner.removeAdmin(tA.id, editorEmail);
  ok((await editor.access(tA.id)).role === null, "removed admin has no role");
  d = await snap(owner, tA.id);
  const acts = d.audit.map((a) => a.action);
  for (const a of ["Quiz created", "Quiz approved", "Player locked", "Players imported", "Live game started", "Live game ended", "Poll created", "Gift recorded", "Admin role changed", "Admin removed", "Exported results", "Play reset"])
    ok(acts.includes(a), `audit: ${a}`);
  await owner.saveBrand(tA.id, { ...d.tenant.branding, productName: "Acme Academy‮" }, d.tenant.labels);
  ok((await owner.tenantBySlug(slugA)).branding.productName === "Acme Academy", "branding saved and cleaned");
  await rejects(owner.saveBrand(tA.id, { ...d.tenant.branding, logo: "javascript:alert(1)" }, d.tenant.labels), "invalid", "logo must be an image data URL");
  await owner.deleteQuiz(tA.id, L.game.id);
  ok(!(await snap(owner, tA.id)).games[L.game.id], "deleteQuiz");
}

section("super admin — manage tenants");
{
  await sup.superInvite(tB.id, mail("bb"), "admin");
  ok((await sup.superAdmins(tB.id)).length === 2, "superInvite");
  await sup.superUpdateTenant(tB.id, { status: "suspended", name: "Other Co Ltd" });
  const pb = await sup.tenantBySlug(slugB);
  ok(pb.status === "suspended" && pb.name === "Other Co Ltd", "suspend tenant");
  const pz = await newApi();
  await pz.signInAnonymous();
  await rejects(pz.playerRegister(tB.id, { empId: "E9", name: "Zed Zed", unitType: "dept", unit: "IT", look: 0 }, "x"), "invalid", "(ID too short)");
  await rejects(pz.playerRegister(tB.id, { empId: "E999", name: "Zed Zed", unitType: "dept", unit: "IT", look: 0 }, "x"), "suspended", "suspended tenant refuses players");
  await rejects(sup.superUpdateTenant(tB.id, { slug: slugA }), "conflict", "slug taken");
  const aud = await sup.superAudit();
  ok(aud.some((a) => a.action === "Company created") && aud.some((a) => a.action === "Wrong super admin code") && aud.some((a) => a.action === "Company suspended"), "super audit trail");
  await rejects(sup.superDeleteTenant(tB.id, "wrong"), "invalid", "delete needs the exact slug");
  await sup.superDeleteTenant(tB.id, slugB);
  ok((await sup.tenantBySlug(slugB)) === null, "tenant deleted");
  const lib = await owner.library();
  await sup.superSaveLibrary(lib);
  ok((await owner.library()).length === lib.length, "superSaveLibrary");
  await sup.superLock();
  await rejects(sup.superTenants(), "forbidden", "locked again");
  // wrong codes → lockout
  for (let i = 0; i < 4; i++) await sup.superUnlock("bad" + i).catch(() => undefined);
  await rejects(sup.superUnlock("bad5"), "rate_limited", "5 wrong codes → locked");
  await rejects(sup.superUnlock("Sandeepa"), "rate_limited", "even the right code waits out the lock");
}

/* ---------- optional: coin/streak parity (SQL vs TS) through psql ---------- */
if (process.env.DATABASE_URL) {
  section("statsOf parity (SQL private.player_stats vs TS statsOf)");
  const psql = (sql) => execFileSync("psql", [process.env.DATABASE_URL, "-qAtX", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();
  const DAY = 864e5;
  const day0 = Math.floor(Date.now() / DAY) * DAY + 10 * 3600e3; // 10:00 UTC today
  const scenarios = [
    { name: "3-day streak", days: [-2, -1, 0], shields: [] },
    { name: "gap covered by a shield", days: [-5, -4, -2, -1], shields: [-10] },
    { name: "gap too long", days: [-8, -4, -3], shields: [-20] },
    { name: "shield bought after the gap doesn't count", days: [-6, -4], shields: [-3] },
    { name: "two shields cover two days", days: [-9, -6, -5], shields: [-30, -29] },
  ];
  for (const sc of scenarios) {
    const pid = "p-par-" + randomBytes(4).toString("hex");
    const purchases = [{ id: "bg-mint", at: day0 - 40 * DAY }, ...sc.shields.map((d) => ({ id: "shield", at: day0 + d * DAY }))];
    const runs0 = sc.days.map((d, i) => {
      const ans = [
        { ok: 1, ms: 3000, c: "1", pts: 100 + (i % 3) * 17 },
        { ok: i % 2, ms: 5000, c: "0", pts: i % 2 ? 142 : 0 },
      ];
      return { gid: "g" + i, kind: "sprint", attempt: 1, startedAt: day0 + d * DAY - 60000, finishedAt: day0 + d * DAY, status: "done", ans, score: 0, correct: 1 + (i % 2), total: 2 };
    });
    // a perfect certification run on a day that would otherwise extend the streak — must not count
    const runs = [...runs0, { gid: "gcert", kind: "cert", attempt: 1, startedAt: day0 - 3 * DAY - 60000, finishedAt: day0 - 3 * DAY, status: "done",
      ans: [{ ok: 1, ms: 1000, c: "1", pts: 1 }, { ok: 1, ms: 1000, c: "T", pts: 1 }], score: 2, correct: 2, total: 2 }];
    const q = (v) => "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
    psql(`insert into public.players (tenant_id, id, emp_id, name, unit_type, unit, purchases) values ('${tA.id}', '${pid}', '${pid.slice(-8).toUpperCase()}', 'Parity Test', 'branch', 'X', ${q(purchases)}::jsonb);` +
      runs.map((r) => `insert into public.runs (tenant_id, player_id, run_key, gid, kind, attempt, status, ans, started_at, finished_at, correct, total) values ('${tA.id}', '${pid}', '${r.gid}', '${r.gid}', '${r.kind}', 1, 'done', ${q(r.ans)}::jsonb, ${r.startedAt}, ${r.finishedAt}, ${r.correct}, ${r.total});`).join(""));
    const sqlStats = JSON.parse(psql(`select private.player_stats('${pid}')`));
    const ts = statsNoCert({ uid: pid, purchases, runs: Object.fromEntries(runs.map((r) => [r.gid, r])) }, null);
    ok(sqlStats.points === ts.points && sqlStats.coins === ts.coins && sqlStats.coinsEarned === ts.coinsEarned && sqlStats.level === ts.level.level && sqlStats.shieldsOwned === ts.streak.shieldsOwned && sqlStats.bestStreak === ts.streak.best,
      `parity: ${sc.name}`, { sql: sqlStats, ts: { points: ts.points, coins: ts.coins, earned: ts.coinsEarned, level: ts.level.level, shields: ts.streak.shieldsOwned, best: ts.streak.best } });
    psql(`delete from public.players where id = '${pid}'`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log("Failed:\n - " + failures.join("\n - "));
process.exit(fail ? 1 : 0);
