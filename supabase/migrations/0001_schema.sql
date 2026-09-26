-- =====================================================================
-- Ant Arena — 0001 schema
-- Multi-tenant quiz SaaS. Every tenant-owned row carries tenant_id.
-- Times are bigint epoch milliseconds (same as the TypeScript types).
-- All writes happen through SECURITY DEFINER functions (0003); the
-- browser only ever gets SELECT on a few tables, filtered by RLS (0002).
-- Apply in order: 0001 → 0002 → 0003 → seed.sql
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- internal helpers live here; this schema is NOT exposed through the API
create schema if not exists private;
revoke all on schema private from public;

-- current time in epoch milliseconds (wall clock, not transaction start)
create or replace function private.now_ms() returns bigint
language sql volatile set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- random id with a prefix, e.g. private.new_id('p-') → 'p-4f1c9a0b7e2d4c11'
create or replace function private.new_id(p text, bytes int default 8) returns text
language sql volatile set search_path = '' as $$
  select p || encode(extensions.gen_random_bytes(bytes), 'hex')
$$;

-- ---------------------------------------------------------------------
-- tenants & admins
-- ---------------------------------------------------------------------
create table public.tenants (
  id          text primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'),
  name        text not null,
  status      text not null default 'active' check (status in ('active', 'suspended')),
  template    text not null default 'generic' check (template in ('generic', 'bank')),
  branding    jsonb not null default '{}'::jsonb,
  labels      jsonb not null default '{}'::jsonb,
  cfg         jsonb not null default '{}'::jsonb,
  -- IANA time zone used for "today" (quiz open dates, streak days). Not part of the TS type.
  tz          text not null default 'UTC',
  created_at  bigint not null default private.now_ms()
);

create table public.tenant_members (
  tenant_id   text not null references public.tenants(id) on delete cascade,
  email       text not null check (email = lower(email)),
  role        text not null check (role in ('owner', 'admin', 'editor', 'host', 'viewer')),
  user_id     uuid,
  invited_at  bigint not null default private.now_ms(),
  joined_at   bigint,
  primary key (tenant_id, email)
);
create index tenant_members_email_idx on public.tenant_members (email);
create index tenant_members_user_idx on public.tenant_members (user_id);

-- ---------------------------------------------------------------------
-- super admin
-- ---------------------------------------------------------------------
create table public.super_admins (
  email     text primary key check (email = lower(email)),
  added_at  bigint not null default private.now_ms()
);
create table public.super_secret (
  id          int primary key default 1 check (id = 1),
  hash        text not null, -- bcrypt via pgcrypto crypt()
  is_default  boolean not null default true,
  updated_at  bigint not null default private.now_ms()
);
create table public.super_unlocks (
  user_id  uuid primary key,
  until    bigint not null
);
create table public.super_fails (
  user_id     uuid primary key,
  n           int not null default 0,
  until       bigint not null default 0,
  updated_at  bigint not null default private.now_ms()
);
create table public.super_audit (
  id      text primary key default private.new_id('e-'),
  at      bigint not null default private.now_ms(),
  actor   text not null,
  action  text not null,
  target  text,
  detail  text,
  sev     text check (sev in ('info', 'warn', 'alert'))
);
create index super_audit_at_idx on public.super_audit (at desc);

-- ---------------------------------------------------------------------
-- players & plays
-- ---------------------------------------------------------------------
create table public.players (
  tenant_id   text not null references public.tenants(id) on delete cascade,
  id          text primary key,
  emp_id      text not null,
  email       text check (email is null or email = lower(email)),
  name        text not null,
  unit_type   text not null check (unit_type in ('branch', 'dept')),
  unit        text not null,
  look        int not null default 0,
  equipped    jsonb not null default '{}'::jsonb,
  purchases   jsonb not null default '[]'::jsonb,
  consent_at  bigint not null default 0,
  created_at  bigint not null default private.now_ms(),
  updated_at  bigint not null default private.now_ms(),
  demo        boolean not null default false,
  locked      boolean not null default false,
  logins      jsonb not null default '[]'::jsonb,
  auth_uid    uuid, -- the Supabase auth user currently bound to this card (one device at a time)
  unique (tenant_id, emp_id),
  unique (tenant_id, auth_uid)
);
create index players_tenant_idx on public.players (tenant_id);
create index players_email_idx on public.players (tenant_id, email);
create index players_auth_idx on public.players (auth_uid);

create table public.quizzes (
  tenant_id    text not null references public.tenants(id) on delete cascade,
  id           text not null check (length(id) between 1 and 64),
  kind         text not null check (kind in ('sprint', 'live', 'cert')),
  title        text not null,
  descr        text,
  date         text, -- YYYY-MM-DD show from
  until        text, -- YYYY-MM-DD close after
  minutes      numeric not null default 2,
  color        text not null default 'lime',
  status       text not null default 'draft' check (status in ('draft', 'pending', 'live', 'closed')),
  ord          int,
  -- questions as PLAYERS may see them: no answers and no explanations
  questions    jsonb not null default '[]'::jsonb,
  cert         jsonb,
  created_at   bigint not null default private.now_ms(),
  updated_at   bigint not null default private.now_ms(),
  created_by   text,
  edited_by    text,
  approved_by  text,
  primary key (tenant_id, id)
);
create index quizzes_status_idx on public.quizzes (tenant_id, status);

-- answer keys + explanations: never readable by players
create table public.quiz_keys (
  tenant_id   text not null,
  gid         text not null,
  answers     jsonb not null default '{}'::jsonb, -- qid → canonical answer
  explains    jsonb not null default '{}'::jsonb, -- qid → explanation (sent only after answering)
  updated_at  bigint not null default private.now_ms(),
  primary key (tenant_id, gid),
  foreign key (tenant_id, gid) references public.quizzes (tenant_id, id) on delete cascade
);

create table public.runs (
  tenant_id    text not null references public.tenants(id) on delete cascade,
  player_id    text not null references public.players(id) on delete cascade,
  run_key      text not null, -- gid, or gid~n for certification attempt n > 1
  gid          text not null,
  kind         text not null default 'sprint' check (kind in ('sprint', 'live', 'cert')), -- the quiz's kind when played
  attempt      int not null default 1,
  status       text not null default 'playing' check (status in ('playing', 'done')),
  ans          jsonb not null default '[]'::jsonb,
  q_at         bigint, -- server time the current question was shown
  last_at      bigint, -- server time of the last answer (clock anchor when q_at is missing)
  started_at   bigint not null default private.now_ms(),
  finished_at  bigint,
  score        int not null default 0,
  correct      int not null default 0,
  total        int not null default 0,
  blur         int not null default 0,
  passed       boolean,
  primary key (player_id, run_key)
);
create index runs_tenant_idx on public.runs (tenant_id, finished_at);
create index runs_gid_idx on public.runs (tenant_id, gid);

create table public.gifts (
  tenant_id  text not null references public.tenants(id) on delete cascade,
  id         text not null,
  period     text not null default '',
  kind       text not null check (kind in ('weekly', 'improved', 'branch')),
  winner     text not null default '',
  label      text not null default '',
  prize      text not null default '',
  at         bigint not null default private.now_ms(),
  by         text not null default '',
  primary key (tenant_id, id)
);

-- disqualified plays: { runs: { "<playerId>:<gid>": { at, by, reason } } }
create table public.disqualified (
  tenant_id   text primary key references public.tenants(id) on delete cascade,
  runs        jsonb not null default '{}'::jsonb,
  updated_at  bigint not null default private.now_ms()
);

-- staff allowlist: sha256(salt || empId) hex hashes
create table public.rosters (
  tenant_id   text primary key references public.tenants(id) on delete cascade,
  salt        text not null,
  hashes      text[] not null default '{}',
  updated_at  bigint not null default private.now_ms()
);

create table public.audit_log (
  tenant_id  text not null references public.tenants(id) on delete cascade,
  id         text primary key default private.new_id('e-'),
  at         bigint not null default private.now_ms(),
  actor      text not null,
  action     text not null,
  target     text,
  detail     text,
  sev        text check (sev in ('info', 'warn', 'alert'))
);
create index audit_log_tenant_idx on public.audit_log (tenant_id, at desc);

-- ---------------------------------------------------------------------
-- live quiz (game-show style)
-- ---------------------------------------------------------------------
create table public.live_sessions (
  id              text primary key,
  tenant_id       text not null references public.tenants(id) on delete cascade,
  gid             text not null,
  title           text not null,
  pin             text not null check (pin ~ '^\d{6}$'),
  state           text not null default 'lobby' check (state in ('lobby', 'question', 'reveal', 'board', 'ended')),
  q_index         int not null default -1,
  q_started_at    bigint not null default 0,
  q_seconds       int not null default 20,
  total           int not null default 0,
  question        jsonb, -- current question WITHOUT answer/explanation
  reveal          jsonb, -- { canon, counts, explain } only once revealed
  host_id         uuid,
  created_at      bigint not null default private.now_ms(),
  ended_at        bigint,
  guests          boolean not null default false,
  music           boolean,
  last_reveal_q   int
);
create unique index live_sessions_pin_open_idx on public.live_sessions (pin) where state <> 'ended';
create index live_sessions_tenant_idx on public.live_sessions (tenant_id, created_at desc);

-- host-only copy of the questions and canonical answers for a session (no policies: functions only)
create table public.live_keys (
  session_id  text primary key references public.live_sessions(id) on delete cascade,
  tenant_id   text not null references public.tenants(id) on delete cascade,
  questions   jsonb not null, -- full questions incl. explanations
  canon       jsonb not null  -- array of canonical answers, by question index
);

create table public.live_players (
  id           text primary key,
  session_id   text not null references public.live_sessions(id) on delete cascade,
  tenant_id    text not null references public.tenants(id) on delete cascade,
  player_id    text,
  auth_uid     uuid not null,
  nick         text not null,
  look         int not null default 0,
  score        int not null default 0,
  streak       int not null default 0,
  joined_at    bigint not null default private.now_ms(),
  last_pts     int,
  last_ok      boolean,
  answered_q   int,
  unique (session_id, auth_uid)
);
create index live_players_session_idx on public.live_players (session_id);

create table public.live_answers (
  session_id      text not null references public.live_sessions(id) on delete cascade,
  tenant_id       text not null references public.tenants(id) on delete cascade,
  live_player_id  text not null,
  q_index         int not null,
  c               text not null,
  ms              int not null,
  ok              boolean not null,
  pts             int not null,
  at              bigint not null default private.now_ms(),
  primary key (live_player_id, q_index)
);
create index live_answers_session_idx on public.live_answers (session_id, q_index);

-- ---------------------------------------------------------------------
-- live polls (interactive)
-- ---------------------------------------------------------------------
create table public.polls (
  id            text primary key check (length(id) between 1 and 64),
  tenant_id     text not null references public.tenants(id) on delete cascade,
  title         text not null default 'Untitled poll',
  code          text not null unique check (code ~ '^\d{6}$'),
  slides        jsonb not null default '[]'::jsonb,
  current       int not null default 0,
  status        text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  show_results  boolean not null default true,
  locked        boolean not null default false,
  created_at    bigint not null default private.now_ms(),
  updated_at    bigint not null default private.now_ms(),
  created_by    text
);
create index polls_tenant_idx on public.polls (tenant_id);

-- who has joined a poll (by code) — lets the audience receive realtime updates for that poll only
create table public.poll_audience (
  poll_id   text not null references public.polls(id) on delete cascade,
  auth_uid  uuid not null,
  at        bigint not null default private.now_ms(),
  primary key (poll_id, auth_uid)
);

-- a tiny row bumped on every response/moderation, so the audience can be notified
-- without being able to read raw responses
create table public.poll_pulse (
  poll_id    text primary key references public.polls(id) on delete cascade,
  tenant_id  text not null references public.tenants(id) on delete cascade,
  rev        bigint not null default 0,
  at         bigint not null default private.now_ms()
);

create table public.poll_responses (
  id         text primary key,
  poll_id    text not null references public.polls(id) on delete cascade,
  tenant_id  text not null references public.tenants(id) on delete cascade,
  slide_id   text not null,
  is_qa      boolean not null default false,
  who        uuid not null,
  value      jsonb not null,
  at         bigint not null default private.now_ms(),
  votes      int not null default 0,
  hidden     boolean not null default false,
  answered   boolean not null default false
);
create index poll_responses_slide_idx on public.poll_responses (poll_id, slide_id);
-- one answer per person per slide, except Q&A
create unique index poll_responses_one_idx on public.poll_responses (poll_id, slide_id, who) where not is_qa;

create table public.poll_votes (
  response_id  text not null references public.poll_responses(id) on delete cascade,
  voter        uuid not null,
  primary key (response_id, voter)
);

-- ---------------------------------------------------------------------
-- starter library, store catalog, rate limits
-- ---------------------------------------------------------------------
create table public.library (
  id         text primary key,
  title      text not null,
  topic      text not null default '',
  industry   text not null default 'any' check (industry in ('any', 'bank')),
  questions  jsonb not null default '[]'::jsonb, -- full questions incl. explanations
  answers    jsonb not null default '{}'::jsonb,
  ord        int not null default 0
);

-- mirrors src/lib/catalog.ts (prices are rules, so they live with the schema)
create table public.catalog_items (
  id         text primary key,
  slot       text not null check (slot in ('face', 'head', 'ears', 'bg', 'power')),
  price      int not null,
  min_level  int,
  max_hold   int
);
insert into public.catalog_items (id, slot, price, min_level, max_hold) values
  ('specs', 'face', 150, null, null),
  ('shades', 'face', 250, null, null),
  ('phones', 'head', 400, null, null),
  ('cap', 'head', 300, null, null),
  ('bow', 'head', 220, null, null),
  ('beanie', 'head', 260, null, null),
  ('crown', 'head', 900, 8, null),
  ('hearts', 'ears', 200, null, null),
  ('hoops', 'ears', 180, null, null),
  ('studs', 'ears', 140, null, null),
  ('bg-sunset', 'bg', 100, null, null),
  ('bg-bubble', 'bg', 100, null, null),
  ('bg-ocean', 'bg', 100, null, null),
  ('bg-mint', 'bg', 100, null, null),
  ('bg-galaxy', 'bg', 350, 5, null),
  ('shield', 'power', 120, null, 2)
on conflict (id) do update set slot = excluded.slot, price = excluded.price, min_level = excluded.min_level, max_hold = excluded.max_hold;

create table public.rate_limits (
  key         text primary key,
  n           int not null default 0,
  until       bigint not null default 0,
  updated_at  bigint not null default private.now_ms()
);
