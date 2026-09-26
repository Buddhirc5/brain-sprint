-- =====================================================================
-- Brain Sprint — 0002 security: RLS on every table, role helpers, grants
--
-- Model
--   • The browser NEVER writes tables directly. INSERT/UPDATE/DELETE are
--     revoked from anon/authenticated; every change goes through a
--     SECURITY DEFINER function in 0003 that checks the caller's role.
--   • SELECT is granted on a handful of tables so admins can use Realtime
--     (postgres_changes respects RLS) and players can read public quiz
--     data. Row filters below decide who sees which rows.
--   • Answer keys, explanations, emails, Employee IDs, raw run choices and
--     live answer keys are never selectable by players; players get their
--     tenant data through public.tenant_snapshot(), which masks them.
-- Roles: viewer < host < editor < admin < owner. A super admin (email in
-- super_admins AND unlocked with the super code) counts as owner everywhere.
-- =====================================================================

-- ---------------------------------------------------------------------
-- internal helpers (schema private — not exposed through the API)
-- ---------------------------------------------------------------------
create or replace function private.role_rank(r text) returns int
language sql immutable set search_path = '' as $$
  select case r when 'viewer' then 0 when 'host' then 1 when 'editor' then 2 when 'admin' then 3 when 'owner' then 4 else -1 end
$$;

-- mirrors engine.defaultCfg(template)
create or replace function private.default_cfg(p_template text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'branches', case when p_template = 'bank'
      then '["Head Office","City Branch","Harbour Branch","Hill Branch","Airport Branch"]'::jsonb
      else '["Head Office","North Office","South Office","Remote"]'::jsonb end,
    'departments', case when p_template = 'bank'
      then '["Branch Banking","Operations","Retail Credit","Corporate Banking","Digital Banking","Cards","Treasury","Compliance","Risk","IT","HR","Finance"]'::jsonb
      else '["Sales","Operations","Customer Service","Finance","HR","IT","Marketing"]'::jsonb end,
    'topics', case when p_template = 'bank'
      then '["AML & Compliance","Cyber Security","Digital & Payments","Products & Services","Operations","Customer Experience","General Knowledge"]'::jsonb
      else '["Company Policies","Cyber Security","Data Privacy","Customer Service","Health & Safety","Products","General Knowledge"]'::jsonb end,
    'maskIds', true,
    'lastInitialOnly', false,
    'adminIdleMin', 15,
    'retentionDays', 365,
    'requireAllowlist', false,
    'makerChecker', p_template = 'bank',
    'exportMask', p_template = 'bank',
    'minQ', 1,
    'maxQ', 10,
    'features', '{"sprint":true,"live":true,"polls":true,"cert":true,"coins":true,"store":true,"streaks":true,"avatars":true,"rewards":true,"battle":true}'::jsonb,
    'signIn', jsonb_build_object('empId', true, 'emailOtp', true, 'sso', false, 'liveGuests', false, 'adminAuth', 'both', 'adminMfa', p_template = 'bank')
  )
$$;

-- mirrors engine.normalizeCfg(c, template)
create or replace function private.cfg_norm(c jsonb, p_template text) returns jsonb
language sql immutable set search_path = '' as $$
  select d || coalesce(case when jsonb_typeof(c) = 'object' then c end, '{}'::jsonb)
           || jsonb_build_object(
                'features', (d->'features') || coalesce(case when jsonb_typeof(c->'features') = 'object' then c->'features' end, '{}'::jsonb),
                'signIn',   (d->'signIn')   || coalesce(case when jsonb_typeof(c->'signIn') = 'object' then c->'signIn' end, '{}'::jsonb))
  from (select private.default_cfg(p_template) as d) x
$$;

-- the caller's verified email (null for anonymous users and unconfirmed emails)
create or replace function private.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid()
    and coalesce(u.is_anonymous, false) = false
    and u.email is not null
    and u.email_confirmed_at is not null
$$;

create or replace function private.is_anon() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) or private.my_email() is null
$$;

-- ---------------------------------------------------------------------
-- public helpers (used by RLS policies; safe to call — they only describe the caller)
-- ---------------------------------------------------------------------
create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.super_admins s where s.email = private.my_email())
     and exists (select 1 from public.super_unlocks u where u.user_id = auth.uid() and u.until > private.now_ms())
$$;

-- the caller's admin role in a tenant, or null. Suspended tenants give no role.
-- When the tenant requires admin MFA, the role only counts in an aal2 session.
create or replace function public.tenant_role(tid text) returns text
language sql stable security definer set search_path = '' as $$
  select m.role
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  where m.tenant_id = tid
    and t.status = 'active'
    and auth.uid() is not null
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and (m.user_id = auth.uid() or m.email = private.my_email())
    and (
      not coalesce((private.cfg_norm(t.cfg, t.template) -> 'signIn' ->> 'adminMfa')::boolean, false)
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
  order by private.role_rank(m.role) desc
  limit 1
$$;

create or replace function public.has_role(tid text, min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super() or coalesce(private.role_rank(public.tenant_role(tid)) >= private.role_rank(min_role), false)
$$;

-- the caller's (unlocked) player card in an active tenant
create or replace function public.my_player_id(tid text) returns text
language sql stable security definer set search_path = '' as $$
  select p.id
  from public.players p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.tenant_id = tid and p.auth_uid = auth.uid() and auth.uid() is not null and not p.locked
  limit 1
$$;

-- is the caller in this live game / poll audience? (definer: the membership tables are not readable)
create or replace function public.in_live_session(sid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.live_players lp where lp.session_id = sid and lp.auth_uid = auth.uid())
$$;

create or replace function public.in_poll_audience(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.poll_audience a where a.poll_id = pid and a.auth_uid = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- Row Level Security — enabled on EVERY table
-- ---------------------------------------------------------------------
alter table public.tenants         enable row level security;
alter table public.tenant_members  enable row level security;
alter table public.super_admins    enable row level security;
alter table public.super_secret    enable row level security;
alter table public.super_unlocks   enable row level security;
alter table public.super_fails     enable row level security;
alter table public.super_audit     enable row level security;
alter table public.players         enable row level security;
alter table public.quizzes         enable row level security;
alter table public.quiz_keys       enable row level security;
alter table public.runs            enable row level security;
alter table public.gifts           enable row level security;
alter table public.disqualified    enable row level security;
alter table public.rosters         enable row level security;
alter table public.audit_log       enable row level security;
alter table public.live_sessions   enable row level security;
alter table public.live_keys       enable row level security;
alter table public.live_players    enable row level security;
alter table public.live_answers    enable row level security;
alter table public.polls           enable row level security;
alter table public.poll_audience   enable row level security;
alter table public.poll_pulse      enable row level security;
alter table public.poll_responses  enable row level security;
alter table public.poll_votes      enable row level security;
alter table public.library         enable row level security;
alter table public.catalog_items   enable row level security;
alter table public.rate_limits     enable row level security;

-- Tables with NO policies (deny all to API users; functions only):
--   super_admins, super_secret, super_unlocks, super_fails, live_keys,
--   poll_audience, poll_votes, library, rate_limits

create policy tenants_admin_read on public.tenants
  for select to authenticated using (public.has_role(id, 'viewer'));

create policy members_read on public.tenant_members
  for select to authenticated using (public.has_role(tenant_id, 'viewer') or user_id = auth.uid());

create policy super_audit_read on public.super_audit
  for select to authenticated using (public.is_super());

-- players: admins only (players get a masked public view via tenant_snapshot())
create policy players_admin_read on public.players
  for select to authenticated using (public.has_role(tenant_id, 'viewer'));

-- quizzes hold no answers/explanations; players see released sprint/cert quizzes of their own tenant
create policy quizzes_read on public.quizzes
  for select to authenticated using (
    public.has_role(tenant_id, 'viewer')
    or (status in ('live', 'closed') and kind <> 'live' and public.my_player_id(tenant_id) is not null)
  );

-- answer keys: any admin role (matches the admin snapshot); never players
create policy quiz_keys_admin_read on public.quiz_keys
  for select to authenticated using (public.has_role(tenant_id, 'viewer'));

-- runs carry every choice a player made — admins only (players get sanitised runs via tenant_snapshot())
create policy runs_admin_read on public.runs
  for select to authenticated using (public.has_role(tenant_id, 'viewer'));

create policy gifts_read on public.gifts
  for select to authenticated using (public.has_role(tenant_id, 'viewer') or public.my_player_id(tenant_id) is not null);

create policy dq_read on public.disqualified
  for select to authenticated using (public.has_role(tenant_id, 'viewer') or public.my_player_id(tenant_id) is not null);

create policy rosters_admin_read on public.rosters
  for select to authenticated using (public.has_role(tenant_id, 'viewer'));

create policy audit_admin_read on public.audit_log
  for select to authenticated using (public.has_role(tenant_id, 'viewer'));

-- live sessions hold no answers until reveal; participants and tenant admins may read
create policy live_sessions_read on public.live_sessions
  for select to authenticated using (
    public.has_role(tenant_id, 'viewer')
    or public.in_live_session(id)
  );

create policy live_players_read on public.live_players
  for select to authenticated using (public.has_role(tenant_id, 'viewer') or auth_uid = auth.uid());

create policy live_answers_admin_read on public.live_answers
  for select to authenticated using (public.has_role(tenant_id, 'viewer'));

create policy polls_read on public.polls
  for select to authenticated using (
    public.has_role(tenant_id, 'viewer')
    or public.in_poll_audience(id)
  );

create policy poll_pulse_read on public.poll_pulse
  for select to authenticated using (
    public.has_role(tenant_id, 'viewer')
    or public.in_poll_audience(poll_id)
  );

create policy poll_responses_admin_read on public.poll_responses
  for select to authenticated using (public.has_role(tenant_id, 'viewer'));

create policy catalog_read on public.catalog_items
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- table privileges: SELECT only, and only where a policy exists
-- (Supabase grants ALL to anon/authenticated by default — take it back)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  public.tenants, public.tenant_members, public.super_audit, public.players, public.quizzes, public.quiz_keys,
  public.runs, public.gifts, public.disqualified, public.rosters, public.audit_log, public.live_sessions,
  public.live_players, public.live_answers, public.polls, public.poll_pulse, public.poll_responses, public.catalog_items
to authenticated;

-- new tables/functions created later in public must be granted explicitly
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- helper functions used inside policies must be executable by the querying role
revoke execute on function public.is_super(), public.tenant_role(text), public.has_role(text, text), public.my_player_id(text),
  public.in_live_session(text), public.in_poll_audience(text) from public, anon;
grant execute on function public.is_super(), public.tenant_role(text), public.has_role(text, text), public.my_player_id(text),
  public.in_live_session(text), public.in_poll_audience(text) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
