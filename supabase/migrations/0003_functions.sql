-- =====================================================================
-- Ant Arena — 0003 functions (the whole server-side API)
--
-- Every function is SECURITY DEFINER with an empty search_path (all names
-- are schema-qualified). Rules mirror src/api/demo/index.ts (DemoApi),
-- src/api/engine.ts and src/lib/scoring.ts exactly — change them together.
--
-- Errors are raised as '<code>: <message>' or '<code>:<waitMs>: <message>'
-- where code ∈ auth | forbidden | not_found | invalid | conflict |
-- rate_limited | suspended | closed. The client maps them to ApiError.
-- Functions that must RECORD a failure (wrong super code, unknown Employee
-- ID) return {"error": {"code", "message", "wait"}} instead of raising,
-- because raising would roll the failure counter back.
-- =====================================================================

-- =====================================================================
-- 1. internal helpers (schema private)
-- =====================================================================

create or replace function private.err(p_code text, p_msg text, p_wait bigint default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code || coalesce(':' || p_wait::text, '') || ': ' || p_msg;
end $$;

-- the same failure as a value (for functions that must commit a counter first)
create or replace function private.err_json(p_code text, p_msg text, p_wait bigint default null) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('error', jsonb_strip_nulls(jsonb_build_object('code', p_code, 'message', p_msg, 'wait', p_wait)))
$$;

create or replace function private.rand_int(n int) returns int
language sql volatile set search_path = '' as $$
  select (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % n)::int
$$;

-- drop top-level null members so optional TS fields are simply absent
create or replace function private.jclean(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(j) e where e.value <> 'null'::jsonb
$$;

-- JS Math.round for non-negative numbers
create or replace function private.js_round(x double precision) returns bigint
language sql immutable set search_path = '' as $$
  select floor(x + 0.5)::bigint
$$;

-- lib/security.ts cleanText: strip control and bidi-override characters, cap length
create or replace function private.clean_text(s text, maxlen int default 400) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(coalesce(s, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F‪-‮⁦-⁩]', '', 'g'), maxlen)
$$;

create or replace function private.clean_name(s text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(private.clean_text(s, 400), '\s+', ' ', 'g')), 40)
$$;

-- lib/security.ts validName: a letter, then letters/space/.'- (2–40 chars).
-- ASCII is checked exactly; any non-ASCII character counts as a letter (Sinhala, Tamil… names).
create or replace function private.valid_name(s text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(s ~ '^([A-Za-z]|[^\x01-\x7F])([A-Za-z .''-]|[^\x01-\x7F]){1,39}$', false)
$$;

create or replace function private.norm_emp_id(s text) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(upper(coalesce(s, '')), '[^A-Z0-9-]', '', 'g'), 12)
$$;

create or replace function private.valid_emp_id(s text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(s ~ '^[A-Z0-9-]{3,12}$', false)
$$;

create or replace function private.valid_email(s text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(s ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', false) and length(s) <= 254
$$;

create or replace function private.mask_id(s text) returns text
language sql immutable set search_path = '' as $$
  select case when length(coalesce(s, '')) <= 2 then '••' else '••' || right(s, 2) end
$$;

-- lib/security.ts publicName
create or replace function private.public_name(p_name text, p_last_initial boolean) returns text
language plpgsql immutable set search_path = '' as $$
declare parts text[];
begin
  if not p_last_initial then return p_name; end if;
  parts := regexp_split_to_array(btrim(p_name), '\s+');
  if array_length(parts, 1) > 1 then
    return parts[1] || ' ' || left(parts[array_length(parts, 1)], 1) || '.';
  end if;
  return parts[1];
end $$;

-- "First L." used on live-game boards and the "Is this you?" card
create or replace function private.first_last_initial(p_name text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare parts text[];
begin
  parts := regexp_split_to_array(btrim(p_name), '\s+');
  return jsonb_build_object('first', parts[1],
    'lastInitial', case when array_length(parts, 1) > 1 then left(parts[array_length(parts, 1)], 1) || '.' else '' end);
end $$;

-- engine.normWord (validation only; aggregation runs the TS engine)
create or replace function private.norm_word(w text) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(regexp_replace(lower(btrim(coalesce(w, ''))), '\s+', ' ', 'g'), '[^a-z0-9 ''\u0080-￿-]', '', 'g'), 25)
$$;

create or replace function private.is_int(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(j) = 'number' and (j::text)::numeric = trunc((j::text)::numeric)
$$;

-- ---------------------------------------------------------------------
-- rate limits (5 misses, then 1 min doubling to a cap; counters decay after 1 h of quiet)
-- ---------------------------------------------------------------------
create or replace function private.client_ip() returns text
language plpgsql stable set search_path = '' as $$
declare h text := current_setting('request.headers', true);
begin
  if h is null or h = '' then return ''; end if;
  -- prefer headers set by Supabase's edge; X-Forwarded-For's first hop can be client-supplied
  return btrim(split_part(coalesce((h::jsonb) ->> 'cf-connecting-ip', (h::jsonb) ->> 'x-real-ip', (h::jsonb) ->> 'x-forwarded-for', ''), ',', 1));
exception when others then return '';
end $$;

-- ms still locked for this key (0 = free)
create or replace function private.rate_wait(p_key text) returns bigint
language sql stable security definer set search_path = '' as $$
  select greatest(0, coalesce((select r.until from public.rate_limits r where r.key = p_key), 0) - private.now_ms())
$$;

create or replace function private.rate_fail(p_key text, p_max int default 5, p_base bigint default 60000, p_cap bigint default 600000) returns bigint
language plpgsql security definer set search_path = '' as $$
declare r public.rate_limits; now_ms bigint := private.now_ms();
begin
  insert into public.rate_limits as x (key, n, until, updated_at) values (p_key, 1, 0, now_ms)
  on conflict (key) do update set
    n = case when x.updated_at < now_ms - 3600000 and x.until < now_ms then 1 else x.n + 1 end,
    updated_at = now_ms
  returning * into r;
  if r.n >= p_max then
    update public.rate_limits set until = now_ms + least(p_cap, p_base * (2 ^ least(r.n - p_max, 20))::bigint)
    where key = p_key returning * into r;
  end if;
  -- keep the table small
  if private.rand_int(50) = 0 then
    delete from public.rate_limits where until < now_ms and updated_at < now_ms - 86400000;
  end if;
  return greatest(0, r.until - now_ms);
end $$;

create or replace function private.rate_ok(p_key text) returns void
language sql security definer set search_path = '' as $$
  delete from public.rate_limits where key = p_key
$$;

-- raise rate_limited if any of the keys is locked
create or replace function private.rate_check(p_keys text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; w bigint;
begin
  foreach k in array p_keys loop
    w := private.rate_wait(k);
    if w > 0 then
      perform private.err('rate_limited', format('Too many tries. Try again in %s min.', ceil(w / 60000.0)::int), w);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- identity, roles, audit
-- ---------------------------------------------------------------------
create or replace function private.need_user() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then perform private.err('auth', 'Please sign in.'); end if;
  return auth.uid();
end $$;

create or replace function private.actor() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_email(), auth.uid()::text, 'system')
$$;

create or replace function private.tenant_row(p_tid text) returns public.tenants
language plpgsql stable security definer set search_path = '' as $$
declare t public.tenants;
begin
  select * into t from public.tenants where id = p_tid;
  if not found then perform private.err('not_found', 'Company not found.'); end if;
  return t;
end $$;

create or replace function private.cfg_of(p_tid text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.cfg_norm(t.cfg, t.template) from public.tenants t where t.id = p_tid
$$;

-- DemoApi.req: the caller's role, at least p_min (super admins count as owner)
create or replace function private.req(p_tid text, p_min text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text;
begin
  if public.is_super() then return 'owner'; end if;
  r := public.tenant_role(p_tid);
  if r is null or private.role_rank(r) < private.role_rank(p_min) then
    perform private.err('forbidden', 'You don''t have permission for that.');
  end if;
  return r;
end $$;

create or replace function private.need_super() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super() then perform private.err('forbidden', 'Unlock the super admin console first.'); end if;
end $$;

create or replace function private.log_t(p_tid text, p_action text, p_target text default null, p_detail text default null, p_sev text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (tenant_id, actor, action, target, detail, sev)
  values (p_tid, private.actor(), p_action, p_target, p_detail, p_sev);
  -- keep the latest 2000 entries per tenant (checked now and then)
  if private.rand_int(20) = 0 then
    delete from public.audit_log a where a.tenant_id = p_tid and a.at < (
      select b.at from public.audit_log b where b.tenant_id = p_tid order by b.at desc offset 2000 limit 1);
  end if;
end $$;

create or replace function private.log_s(p_action text, p_target text default null, p_detail text default null, p_sev text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.super_audit (actor, action, target, detail, sev) values (private.actor(), p_action, p_target, p_detail, p_sev);
  if private.rand_int(20) = 0 then
    delete from public.super_audit a where a.at < (select b.at from public.super_audit b order by b.at desc offset 2000 limit 1);
  end if;
end $$;

-- DemoApi.needMe: the caller's player card (locked for update), tenant must be active
create or replace function private.need_me(p_tid text) returns public.players
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; p public.players;
begin
  t := private.tenant_row(p_tid);
  if t.status <> 'active' then perform private.err('suspended', 'This company''s account is paused.'); end if;
  if auth.uid() is null then perform private.err('auth', 'You''re signed out. Sign in again.'); end if;
  select * into p from public.players where tenant_id = p_tid and auth_uid = auth.uid() for update;
  if not found then perform private.err('auth', 'You''re signed out. Sign in again.'); end if;
  if p.locked then perform private.err('forbidden', 'This player card is locked. Ask your admin.'); end if;
  return p;
end $$;

-- "today" in the tenant's time zone (YYYY-MM-DD)
create or replace function private.today(p_tid text) returns text
language sql stable security definer set search_path = '' as $$
  select to_char((now() at time zone coalesce((select t.tz from public.tenants t where t.id = p_tid), 'UTC'))::date, 'YYYY-MM-DD')
$$;

-- lib/games.ts isOpen
create or replace function private.quiz_open(q public.quizzes) returns boolean
language sql stable security definer set search_path = '' as $$
  select q.status = 'live'
     and (coalesce(q.date, '') = '' or q.date <= private.today(q.tenant_id))
     and (coalesce(q.until, '') = '' or q.until >= private.today(q.tenant_id))
$$;

-- =====================================================================
-- 2. scoring rules (lib/scoring.ts, engine.ts)
-- =====================================================================

-- limitMs: sprint clamp(Number(minutes) || 2, 0.5, 10); cert clamp(Number(minutes) || 10, 1, 180) — × 60 000
create or replace function private.limit_ms(p_minutes numeric, p_kind text default 'sprint') returns double precision
language sql immutable set search_path = '' as $$
  select case when p_kind = 'cert'
    then least(180, greatest(1, case when coalesce(p_minutes, 0) = 0 then 10 else p_minutes end))
    else least(10, greatest(0.5, case when coalesce(p_minutes, 0) = 0 then 2 else p_minutes end)) end::double precision * 60000
$$;

-- answerPoints(ok, ms, share)
create or replace function private.answer_points(p_ok boolean, p_ms double precision, p_share double precision) returns int
language sql immutable set search_path = '' as $$
  select case when not p_ok then 0 else 100 + private.js_round(50 * greatest(0, 1 - p_ms / p_share))::int end
$$;

-- engine.livePoints(ok, ms, limitMs, streakBefore)
create or replace function private.live_points(p_ok boolean, p_ms double precision, p_limit double precision, p_streak int) returns int
language sql immutable set search_path = '' as $$
  select case when not p_ok then 0
    else private.js_round(500 + 500 * greatest(0, least(1, 1 - p_ms / p_limit)))::int + least(500, p_streak * 100) end
$$;

create or replace function private.ans_ok(a jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(a ->> 'ok', '0') in ('1', 'true')
$$;

-- runPoints(r).total and whether the perfect bonus applies
create or replace function private.run_points(p_ans jsonb, p_status text, p_total int, out total int, out perfect boolean)
language sql immutable set search_path = '' as $$
  with a as (select e from jsonb_array_elements(coalesce(p_ans, '[]'::jsonb)) e),
  s as (
    select
      coalesce(sum(case when private.ans_ok(e) then 100 else 0 end), 0)::int as base,
      coalesce(sum(case when private.ans_ok(e) then least(50, greatest(0, coalesce((e ->> 'pts')::numeric, 0) - 100)) else 0 end), 0)::int as speed,
      count(*) as n,
      bool_and(private.ans_ok(e)) as all_ok
    from a
  )
  select s.base + s.speed + case when pf then 50 else 0 end, pf
  from s, lateral (select (p_status = 'done' and p_total > 0 and s.n = p_total and coalesce(s.all_ok, false)) as pf) x
$$;

-- runCoins(r).total
create or replace function private.run_coins(p_ans jsonb, p_status text, p_total int) returns int
language sql immutable set search_path = '' as $$
  select case when p_status <> 'done' then 0 else
    (select count(*) from jsonb_array_elements(coalesce(p_ans, '[]'::jsonb)) e where private.ans_ok(e))::int * 10
    + 5 + case when (private.run_points(p_ans, p_status, p_total)).perfect then 25 else 0 end end
$$;

-- levelOf(points).level: level L starts at 200 × L × (L − 1)
create or replace function private.level_of(p_points bigint) returns int
language plpgsql immutable set search_path = '' as $$
declare l int := 1;
begin
  while 200::bigint * (l + 1) * l <= p_points loop l := l + 1; end loop;
  return l;
end $$;

-- statsOf(p, dq): points, coins (incl. streak bonus & shields), level, shields owned.
-- Certification runs never count (validRuns ignores kind = 'cert').
create or replace function private.player_stats(p_pid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.players; tz text; dq jsonb;
  pts bigint := 0; coins_runs bigint := 0; bonus bigint := 0; spent bigint := 0;
  d date; n int; prev int := null; cur int := 0; best int := 0; used int := 0; gap int; avail int;
  shields bigint[];
begin
  select * into p from public.players where id = p_pid;
  if not found then return null; end if;
  select t.tz into tz from public.tenants t where t.id = p.tenant_id;
  select x.runs into dq from public.disqualified x where x.tenant_id = p.tenant_id;
  dq := coalesce(dq, '{}'::jsonb);

  select coalesce(sum((private.run_points(r.ans, r.status, r.total)).total), 0),
         coalesce(sum(private.run_coins(r.ans, r.status, r.total)), 0)
    into pts, coins_runs
  from public.runs r
  where r.player_id = p.id and r.status = 'done' and r.kind <> 'cert' and not (dq ? (p.id || ':' || r.gid));

  select coalesce(array_agg(((x ->> 'at')::bigint) order by (x ->> 'at')::bigint), '{}')
    into shields
  from jsonb_array_elements(case when jsonb_typeof(p.purchases) = 'array' then p.purchases else '[]'::jsonb end) x
  where x ->> 'id' = 'shield';

  -- streakOf: distinct play days (tenant time zone), shields cover missed days
  for d in
    select distinct (to_timestamp(r.finished_at / 1000.0) at time zone coalesce(tz, 'UTC'))::date as day
    from public.runs r
    where r.player_id = p.id and r.status = 'done' and r.kind <> 'cert' and r.finished_at is not null and not (dq ? (p.id || ':' || r.gid))
    order by 1
  loop
    n := d - date '1970-01-01';
    if prev is null then cur := 1;
    else
      gap := n - prev - 1;
      if gap = 0 then cur := cur + 1;
      else
        select count(*) into avail from unnest(shields) s where s < (prev + 1)::bigint * 86400000;
        if gap <= avail - used then used := used + gap; cur := cur + 1; else cur := 1; end if;
      end if;
    end if;
    best := greatest(best, cur);
    bonus := bonus + case when cur >= 2 then least(50, 5 * cur) else 0 end;
    prev := n;
  end loop;

  select coalesce(sum(ci.price), 0) into spent
  from jsonb_array_elements(case when jsonb_typeof(p.purchases) = 'array' then p.purchases else '[]'::jsonb end) x
  join public.catalog_items ci on ci.id = x ->> 'id';

  return jsonb_build_object(
    'points', pts,
    'coinsEarned', coins_runs + bonus,
    'coinsSpent', spent,
    'coins', greatest(0, coins_runs + bonus - spent),
    'level', private.level_of(pts),
    'bestStreak', best,
    'shieldsOwned', coalesce(array_length(shields, 1), 0) - used);
end $$;

-- =====================================================================
-- 3. JSON shapes (match src/types.ts)
-- =====================================================================

create or replace function private.tenant_json(t public.tenants) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'template', t.template,
    'branding', t.branding, 'labels', t.labels, 'cfg', private.cfg_norm(t.cfg, t.template), 'createdAt', t.created_at)
$$;

create or replace function private.tenant_pub_json(t public.tenants) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'template', t.template,
    'branding', t.branding, 'labels', t.labels, 'features', c -> 'features', 'signIn', c -> 'signIn',
    'pubCfg', jsonb_build_object('branches', c -> 'branches', 'departments', c -> 'departments', 'maskIds', c -> 'maskIds',
      'lastInitialOnly', c -> 'lastInitialOnly', 'retentionDays', c -> 'retentionDays', 'requireAllowlist', c -> 'requireAllowlist'))
  from (select private.cfg_norm(t.cfg, t.template) as c) x
$$;

-- a play. p_hide_c: drop the chosen answers (other players' plays);
-- p_hide_ok: hide right/wrong (a certification exam that can still be retaken)
create or replace function private.run_json(r public.runs, p_hide_c boolean default false, p_hide_ok boolean default false) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'gid', r.gid, 'kind', r.kind, 'attempt', r.attempt, 'startedAt', r.started_at, 'qAt', r.q_at, 'finishedAt', r.finished_at,
    'status', r.status,
    'ans', case when not p_hide_c and not p_hide_ok then r.ans else coalesce((
      select jsonb_agg(
        e || case when p_hide_c then jsonb_build_object('c', null) else '{}'::jsonb end
          || case when p_hide_ok then jsonb_build_object('ok', 0, 'pts', 0) else '{}'::jsonb end
        order by i)
      from jsonb_array_elements(r.ans) with ordinality as a(e, i)), '[]'::jsonb) end,
    'score', r.score, 'correct', r.correct, 'total', r.total, 'blur', r.blur, 'passed', r.passed))
$$;

-- is this play's result final? (anything but a certification exam that can still be retaken)
create or replace function private.run_final(r public.runs) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when q.kind is distinct from 'cert' then true
    else r.status = 'done' and (coalesce(r.passed, false) or r.attempt >= greatest(1, coalesce((q.cert ->> 'attempts')::int, 1))) end
  from (select 1) one left join public.quizzes q on q.tenant_id = r.tenant_id and q.id = r.gid
$$;

-- the caller's own play as they may see it
create or replace function private.own_run_json(r public.runs) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.run_json(r, false, not private.run_final(r))
$$;

-- mode: 'admin' (everything), 'own' (the caller's card), 'public' (others, masked)
create or replace function private.player_json(p public.players, p_mode text, p_last_initial boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'uid', p.id,
    'empId', case when p_mode = 'public' then private.mask_id(p.emp_id) else p.emp_id end,
    'email', case when p_mode = 'public' then null else p.email end,
    'name', case when p_mode = 'public' then private.public_name(p.name, p_last_initial) else p.name end,
    'unitType', p.unit_type, 'unit', p.unit, 'look', p.look, 'equipped', p.equipped, 'purchases', p.purchases,
    'consentAt', p.consent_at, 'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'demo', case when p.demo then true end,
    'locked', case when p.locked then true end,
    'logins', case when p_mode = 'public' then null else p.logins end,
    'runs', coalesce((
      select jsonb_object_agg(r.run_key, case p_mode
        when 'admin' then private.run_json(r)
        when 'own' then private.own_run_json(r)
        else private.run_json(r, true, false) end)
      from public.runs r where r.player_id = p.id), '{}'::jsonb)))
$$;

-- questions (no explanations) + optionally explanations merged back (admins)
create or replace function private.game_json(q public.quizzes, p_explains jsonb default null) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'id', q.id, 'kind', q.kind, 'title', q.title, 'desc', q.descr, 'date', q.date, 'until', q.until,
    'minutes', q.minutes, 'color', q.color, 'status', q.status, 'order', q.ord,
    'questions', case when p_explains is null then q.questions else coalesce((
      select jsonb_agg(case when p_explains ? (e ->> 'id') then e || jsonb_build_object('explain', p_explains -> (e ->> 'id')) else e end order by i)
      from jsonb_array_elements(q.questions) with ordinality as a(e, i)), '[]'::jsonb) end,
    'cert', q.cert, 'createdAt', q.created_at, 'updatedAt', q.updated_at,
    'createdBy', q.created_by, 'editedBy', q.edited_by, 'approvedBy', q.approved_by))
$$;

create or replace function private.live_json(s public.live_sessions) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'id', s.id, 'tenantId', s.tenant_id, 'gid', s.gid, 'title', s.title, 'pin', s.pin, 'state', s.state,
    'qIndex', s.q_index, 'qStartedAt', s.q_started_at, 'qSeconds', s.q_seconds, 'total', s.total,
    'question', s.question, 'reveal', s.reveal, 'hostId', s.host_id, 'createdAt', s.created_at,
    'endedAt', s.ended_at, 'guests', s.guests, 'music', s.music))
$$;

create or replace function private.poll_json(p public.polls, p_host boolean) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'id', p.id, 'tenantId', p.tenant_id, 'title', p.title, 'code', p.code,
    'slides', case when p_host or p.status = 'open' then p.slides else '[]'::jsonb end,
    'current', p.current, 'status', p.status, 'showResults', p.show_results, 'locked', p.locked,
    'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'createdBy', case when p_host then p.created_by end))
$$;

create or replace function private.audit_json(a public.audit_log) returns jsonb
language sql immutable set search_path = '' as $$
  select private.jclean(jsonb_build_object('id', a.id, 'at', a.at, 'actor', a.actor, 'action', a.action, 'target', a.target, 'detail', a.detail, 'sev', a.sev))
$$;

create or replace function private.member_json(m public.tenant_members) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.jclean(jsonb_build_object('email', m.email, 'role', m.role, 'userId', m.user_id, 'invitedAt', m.invited_at, 'joinedAt', m.joined_at,
    'mfa', case when m.user_id is not null then exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified') end))
$$;

create or replace function private.gift_json(g public.gifts) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', g.id, 'period', g.period, 'kind', g.kind, 'winner', g.winner, 'label', g.label, 'prize', g.prize, 'at', g.at, 'by', g.by)
$$;

-- =====================================================================
-- 4. tenants (public), access, invites
-- =====================================================================

-- anyone (even not signed in): enough to render a tenant's sign-in page
create or replace function public.tenant_public(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.tenant_pub_json(t) from public.tenants t where t.slug = lower(btrim(coalesce(p_slug, '')))
$$;

create or replace function public.my_access(p_tid text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', case when public.is_super() then 'owner' else public.tenant_role(p_tid) end, 'isSuper', public.is_super())
$$;

-- after an admin signs in: pending invites for their verified email become memberships
create or replace function public.accept_invites() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare em text; m record; v_out jsonb := '[]'::jsonb;
begin
  perform private.need_user();
  em := private.my_email();
  if em is null then return v_out; end if;
  for m in
    update public.tenant_members tm set user_id = auth.uid(), joined_at = private.now_ms()
    where tm.email = em and tm.user_id is null
    returning tm.tenant_id, tm.email, tm.role
  loop
    perform private.log_t(m.tenant_id, 'Admin joined', m.email, m.role);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('tenantId', t.id, 'slug', t.slug, 'role', tm.role) order by t.name), '[]'::jsonb) into v_out
  from public.tenant_members tm join public.tenants t on t.id = tm.tenant_id
  where tm.email = em;
  return v_out;
end $$;

create or replace function public.my_tenants() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenantId', t.id, 'slug', t.slug, 'name', t.name, 'role', tm.role) order by t.name), '[]'::jsonb)
  from public.tenant_members tm join public.tenants t on t.id = tm.tenant_id
  where tm.email = private.my_email()
$$;

-- =====================================================================
-- 5. tenant snapshot (TenantData) — admins get everything, players a masked view
-- =====================================================================
create or replace function public.tenant_snapshot(p_tid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.tenants; role text; admin boolean; me text; cfg jsonb; li boolean;
  players jsonb; games jsonb; gifts jsonb; dq jsonb;
begin
  t := private.tenant_row(p_tid);
  role := case when public.is_super() then 'owner' else public.tenant_role(p_tid) end;
  admin := role is not null;
  if not admin and t.status <> 'active' then perform private.err('suspended', 'This company''s account is paused.'); end if;
  me := public.my_player_id(p_tid);
  cfg := private.cfg_norm(t.cfg, t.template);
  li := coalesce((cfg ->> 'lastInitialOnly')::boolean, false);

  if admin then
    select coalesce(jsonb_object_agg(p.id, private.player_json(p, 'admin')), '{}'::jsonb) into players from public.players p where p.tenant_id = p_tid;
    select coalesce(jsonb_object_agg(q.id, private.game_json(q, coalesce(k.explains, '{}'::jsonb))), '{}'::jsonb) into games
    from public.quizzes q left join public.quiz_keys k on k.tenant_id = q.tenant_id and k.gid = q.id where q.tenant_id = p_tid;
  elsif me is not null then
    select coalesce(jsonb_object_agg(p.id, private.player_json(p, case when p.id = me then 'own' else 'public' end, li)), '{}'::jsonb) into players
    from public.players p where p.tenant_id = p_tid;
    select coalesce(jsonb_object_agg(q.id, private.game_json(q)), '{}'::jsonb) into games
    from public.quizzes q where q.tenant_id = p_tid and q.status in ('live', 'closed') and q.kind <> 'live';
  else
    -- not linked to a player card yet: tenant settings only
    players := '{}'::jsonb; games := '{}'::jsonb;
  end if;

  if admin or me is not null then
    select coalesce(jsonb_object_agg(g.id, private.gift_json(g)), '{}'::jsonb) into gifts from public.gifts g where g.tenant_id = p_tid;
    select jsonb_build_object('runs', coalesce((select x.runs from public.disqualified x where x.tenant_id = p_tid), '{}'::jsonb)) into dq;
  else
    gifts := '{}'::jsonb; dq := '{"runs":{}}'::jsonb;
  end if;

  return jsonb_build_object(
    'tenant', private.tenant_json(t),
    'games', games, 'players', players, 'gifts', gifts, 'dq', dq,
    'keys', case when admin then coalesce((select jsonb_object_agg(k.gid, jsonb_build_object('gid', k.gid, 'answers', k.answers, 'updatedAt', k.updated_at))
      from public.quiz_keys k where k.tenant_id = p_tid), '{}'::jsonb) else '{}'::jsonb end,
    'roster', case when admin then (select jsonb_build_object('salt', r.salt, 'hashes', to_jsonb(r.hashes), 'updatedAt', r.updated_at)
      from public.rosters r where r.tenant_id = p_tid) end,
    'audit', case when admin then coalesce((select jsonb_agg(private.audit_json(a) order by a.at desc)
      from (select * from public.audit_log a where a.tenant_id = p_tid order by a.at desc limit 2000) a), '[]'::jsonb) else '[]'::jsonb end,
    'admins', case when admin then coalesce((select jsonb_agg(private.member_json(m) order by m.invited_at)
      from public.tenant_members m where m.tenant_id = p_tid), '[]'::jsonb) else '[]'::jsonb end,
    'polls', case when admin then coalesce((select jsonb_object_agg(p.id, private.poll_json(p, true))
      from public.polls p where p.tenant_id = p_tid), '{}'::jsonb) else '{}'::jsonb end,
    'live', case when admin then coalesce((select jsonb_agg(private.live_json(s) order by s.created_at desc)
      from (select * from public.live_sessions s where s.tenant_id = p_tid order by s.created_at desc limit 30) s), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

-- =====================================================================
-- 6. player identity
-- =====================================================================

create or replace function public.my_player(p_tid text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.player_json(p, 'own')
  from public.players p
  where p.tenant_id = p_tid and p.auth_uid = auth.uid() and auth.uid() is not null and not p.locked
$$;

-- "Is this you?" card for an Employee ID. Misses are rate limited per user and per IP.
create or replace function public.player_lookup(p_tid text, p_emp_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; v_emp text; p public.players; k_user text; k_ip text; nm jsonb; keys text[];
begin
  t := private.tenant_row(p_tid);
  if not coalesce((private.cfg_norm(t.cfg, t.template) -> 'signIn' ->> 'empId')::boolean, false) then
    perform private.err('forbidden', 'Employee ID sign-in is turned off.');
  end if;
  v_emp := private.norm_emp_id(p_emp_id);
  k_user := 'lookup:' || p_tid || ':' || coalesce(auth.uid()::text, 'anon');
  k_ip := 'lookup-ip:' || p_tid || ':' || private.client_ip();
  keys := array[k_user] || case when private.client_ip() <> '' then array[k_ip] else '{}'::text[] end;
  perform private.rate_check(keys);
  select * into p from public.players x where x.tenant_id = p_tid and x.emp_id = v_emp;
  if not found or p.locked then
    perform private.rate_fail(k_user);
    if private.client_ip() <> '' then perform private.rate_fail(k_ip, 100, 60000, 300000); end if;
    return null;
  end if;
  perform private.rate_ok(k_user);
  nm := private.first_last_initial(p.name);
  return nm || jsonb_build_object('unit', p.unit, 'unitType', p.unit_type,
    'level', (private.player_stats(p.id) ->> 'level')::int, 'look', p.look);
end $$;

-- bind this sign-in to the card with that Employee ID (one device at a time).
-- Unknown IDs count as misses (same limiter as lookup), so returns {error} instead of raising.
create or replace function public.player_claim(p_tid text, p_emp_id text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; v_emp text; p public.players; uid uuid; k_user text; k_ip text; w bigint;
begin
  uid := private.need_user();
  v_emp := private.norm_emp_id(p_emp_id);
  t := private.tenant_row(p_tid);
  if t.status <> 'active' then perform private.err('suspended', 'This company''s account is paused.'); end if;
  if not coalesce((private.cfg_norm(t.cfg, t.template) -> 'signIn' ->> 'empId')::boolean, false) then
    perform private.err('forbidden', 'Employee ID sign-in is turned off.');
  end if;
  k_user := 'lookup:' || p_tid || ':' || uid::text;
  k_ip := 'lookup-ip:' || p_tid || ':' || private.client_ip();
  perform private.rate_check(array[k_user] || case when private.client_ip() <> '' then array[k_ip] else '{}'::text[] end);
  select * into p from public.players x where x.tenant_id = p_tid and x.emp_id = v_emp for update;
  if not found then
    w := private.rate_fail(k_user);
    if private.client_ip() <> '' then perform private.rate_fail(k_ip, 100, 60000, 300000); end if;
    return private.err_json('not_found', 'No player card with that Employee ID.');
  end if;
  if p.locked then perform private.err('forbidden', 'This player card is locked. Ask your admin.'); end if;
  update public.players set auth_uid = null where tenant_id = p_tid and auth_uid = uid and id <> p.id;
  update public.players set
    auth_uid = uid,
    logins = (jsonb_build_array(jsonb_build_object('at', private.now_ms(), 'dev', left(coalesce(p_device, ''), 60))) || coalesce(
      (select jsonb_agg(e order by i) from jsonb_array_elements(p.logins) with ordinality a(e, i) where i <= 9), '[]'::jsonb)),
    updated_at = private.now_ms()
  where players.id = p.id
  returning * into p;
  return private.player_json(p, 'own');
end $$;

create or replace function public.player_register(p_tid text, p_input jsonb, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; t public.tenants; cfg jsonb; emp text; nm text; ut text; unit text; r public.rosters; em text; p public.players; now_ms bigint := private.now_ms();
begin
  uid := private.need_user();
  emp := private.norm_emp_id(p_input ->> 'empId');
  nm := private.clean_name(p_input ->> 'name');
  if not private.valid_emp_id(emp) then perform private.err('invalid', 'Employee ID should be 3–12 letters or numbers.'); end if;
  if not private.valid_name(nm) then perform private.err('invalid', 'Please enter your name (letters only).'); end if;
  t := private.tenant_row(p_tid);
  cfg := private.cfg_norm(t.cfg, t.template);
  if coalesce((cfg ->> 'requireAllowlist')::boolean, false) then
    select * into r from public.rosters where tenant_id = p_tid;
    if not found or not (encode(extensions.digest(r.salt || emp, 'sha256'), 'hex') = any (r.hashes)) then
      perform private.err('forbidden', 'This Employee ID isn''t on the staff list. Ask your admin.');
    end if;
  end if;
  ut := case when p_input ->> 'unitType' = 'dept' then 'dept' else 'branch' end;
  if (p_input ->> 'unitType') is distinct from ut then perform private.err('invalid', 'Pick your unit from the list.'); end if;
  unit := p_input ->> 'unit';
  if unit is null or not ((case when ut = 'dept' then cfg -> 'departments' else cfg -> 'branches' end) ? unit) then
    perform private.err('invalid', 'Pick your unit from the list.');
  end if;
  if t.status <> 'active' then perform private.err('suspended', 'This company''s account is paused.'); end if;
  perform 1 from public.players where tenant_id = p_tid and emp_id = emp;
  if found then perform private.err('conflict', 'That Employee ID already has a player card. Sign in instead.'); end if;
  em := private.my_email();
  if not coalesce((cfg -> 'signIn' ->> 'empId')::boolean, false) and em is null then
    perform private.err('forbidden', 'Sign in with your work email first.');
  end if;
  perform 1 from public.players where tenant_id = p_tid and auth_uid = uid;
  if found then perform private.err('conflict', 'You already have a player card here.'); end if;
  if em is null and nullif(btrim(coalesce(p_input ->> 'email', '')), '') is not null then
    em := lower(btrim(p_input ->> 'email'));
    if not private.valid_email(em) then perform private.err('invalid', 'Enter a valid email.'); end if;
  end if;
  begin
    insert into public.players (tenant_id, id, emp_id, email, name, unit_type, unit, look, consent_at, created_at, updated_at, logins, auth_uid)
    values (p_tid, private.new_id('p-'), emp, em, nm, ut, unit,
      greatest(0, least(15, coalesce(trunc((p_input ->> 'look')::numeric), 0)))::int,
      now_ms, now_ms, now_ms, jsonb_build_array(jsonb_build_object('at', now_ms, 'dev', left(coalesce(p_device, ''), 60))), uid)
    returning * into p;
  exception when unique_violation then
    perform private.err('conflict', 'That Employee ID already has a player card. Sign in instead.');
  end;
  return private.player_json(p, 'own');
end $$;

-- after email-code / Microsoft sign-in: bind to the card that has this (verified) email
create or replace function public.player_link_email(p_tid text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; em text; t public.tenants; p public.players;
begin
  uid := private.need_user();
  em := private.my_email();
  if em is null then return null; end if;
  t := private.tenant_row(p_tid);
  if t.status <> 'active' then perform private.err('suspended', 'This company''s account is paused.'); end if;
  select * into p from public.players x where x.tenant_id = p_tid and x.email = em order by x.created_at limit 1 for update;
  if not found then return null; end if;
  if p.locked then perform private.err('forbidden', 'This player card is locked. Ask your admin.'); end if;
  update public.players set auth_uid = null where tenant_id = p_tid and auth_uid = uid and id <> p.id;
  update public.players set
    auth_uid = uid,
    logins = (jsonb_build_array(jsonb_build_object('at', private.now_ms(), 'dev', left(coalesce(p_device, ''), 60))) || coalesce(
      (select jsonb_agg(e order by i) from jsonb_array_elements(p.logins) with ordinality a(e, i) where i <= 9), '[]'::jsonb))
  where players.id = p.id
  returning * into p;
  return private.player_json(p, 'own');
end $$;

create or replace function public.update_my_card(p_tid text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.players; cfg jsonb; nm text; eq jsonb := '{}'::jsonb; s record; ut text;
begin
  p := private.need_me(p_tid);
  cfg := private.cfg_of(p_tid);
  if p_patch ? 'name' and p_patch -> 'name' <> 'null'::jsonb then
    nm := private.clean_name(p_patch ->> 'name');
    if not private.valid_name(nm) then perform private.err('invalid', 'Please enter your name (letters only).'); end if;
    p.name := nm;
  end if;
  if p_patch ? 'look' and jsonb_typeof(p_patch -> 'look') = 'number' then
    p.look := greatest(0, least(15, trunc((p_patch ->> 'look')::numeric)))::int;
  end if;
  if coalesce(p_patch ->> 'unit', '') <> '' and coalesce(p_patch ->> 'unitType', '') <> '' then
    ut := p_patch ->> 'unitType';
    if ut not in ('branch', 'dept') or not ((case when ut = 'dept' then cfg -> 'departments' else cfg -> 'branches' end) ? (p_patch ->> 'unit')) then
      perform private.err('invalid', 'Pick from the list.');
    end if;
    p.unit := p_patch ->> 'unit';
    p.unit_type := ut;
  end if;
  if jsonb_typeof(p_patch -> 'equipped') = 'object' then
    -- you can only wear what you own, in its own slot
    for s in select e.key as slot, p_patch -> 'equipped' ->> e.key as item from jsonb_each(p_patch -> 'equipped') e loop
      if s.item is not null and s.item <> ''
         and exists (select 1 from jsonb_array_elements(p.purchases) x where x ->> 'id' = s.item)
         and exists (select 1 from public.catalog_items ci where ci.id = s.item and ci.slot = s.slot) then
        eq := eq || jsonb_build_object(s.slot, s.item);
      end if;
    end loop;
    p.equipped := eq;
  end if;
  update public.players set name = p.name, look = p.look, unit = p.unit, unit_type = p.unit_type, equipped = p.equipped, updated_at = private.now_ms()
  where id = p.id;
end $$;

create or replace function public.buy_item(p_tid text, p_item text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.players; cfg jsonb; it public.catalog_items; st jsonb; owned int;
begin
  p := private.need_me(p_tid); -- row locked: no double spending
  cfg := private.cfg_of(p_tid);
  if not coalesce((cfg -> 'features' ->> 'store')::boolean, false) or not coalesce((cfg -> 'features' ->> 'coins')::boolean, false) then
    perform private.err('forbidden', 'The store is turned off.');
  end if;
  select * into it from public.catalog_items where id = p_item;
  if not found then perform private.err('not_found', 'No such item.'); end if;
  st := private.player_stats(p.id);
  select count(*) into owned from jsonb_array_elements(p.purchases) x where x ->> 'id' = p_item;
  if it.slot <> 'power' and owned > 0 then perform private.err('conflict', 'You already own this.'); end if;
  if it.slot = 'power' and (st ->> 'shieldsOwned')::int >= coalesce(it.max_hold, 1) then
    perform private.err('conflict', format('You can hold %s at most.', coalesce(it.max_hold, 1)));
  end if;
  if it.min_level is not null and (st ->> 'level')::int < it.min_level then
    perform private.err('forbidden', format('Unlocks at level %s.', it.min_level));
  end if;
  if (st ->> 'coins')::int < it.price then perform private.err('invalid', 'Not enough coins yet.'); end if;
  update public.players
  set purchases = purchases || jsonb_build_array(jsonb_build_object('id', p_item, 'at', private.now_ms())), updated_at = private.now_ms()
  where id = p.id;
end $$;

-- =====================================================================
-- 7. plays — sprint & certification, scored here with the server clock
-- =====================================================================

create or replace function public.start_run(p_tid text, p_gid text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.players; cfg jsonb; g public.quizzes; r public.runs; n int; nq int;
begin
  p := private.need_me(p_tid); -- locks the player row: one start at a time
  cfg := private.cfg_of(p_tid);
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found or g.kind = 'live' then perform private.err('not_found', 'Quiz not found.'); end if;
  if (g.kind = 'sprint' and not coalesce((cfg -> 'features' ->> 'sprint')::boolean, false))
     or (g.kind = 'cert' and not coalesce((cfg -> 'features' ->> 'cert')::boolean, false)) then
    perform private.err('forbidden', 'This mode is turned off.');
  end if;
  if not private.quiz_open(g) then perform private.err('closed', 'This quiz isn''t open.'); end if;
  nq := jsonb_array_length(g.questions);
  if nq = 0 then perform private.err('invalid', 'This quiz has no questions.'); end if;
  select * into r from public.runs where player_id = p.id and gid = p_gid order by attempt desc limit 1 for update;
  if found and r.status = 'playing' then return private.own_run_json(r); end if;
  n := coalesce(r.attempt, 1);
  if found and r.status = 'done' then
    if g.kind <> 'cert' then return private.own_run_json(r); end if;
    if coalesce(r.passed, false) then perform private.err('conflict', 'You''ve already passed this exam.'); end if;
    if n >= coalesce((g.cert ->> 'attempts')::int, 1) then perform private.err('closed', 'No attempts left.'); end if;
    n := n + 1;
  end if;
  insert into public.runs (tenant_id, player_id, run_key, gid, kind, attempt, status, ans, started_at, score, correct, total, blur)
  values (p_tid, p.id, case when n > 1 then p_gid || '~' || n else p_gid end, p_gid, g.kind, n, 'playing', '[]'::jsonb, private.now_ms(), 0, 0, nq, 0)
  returning * into r;
  update public.players set updated_at = private.now_ms() where id = p.id;
  return private.own_run_json(r);
end $$;

-- the player sees question #index now: stamp the server clock (idempotent)
create or replace function public.show_question(p_tid text, p_gid text, p_index int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.players; r public.runs;
begin
  p := private.need_me(p_tid);
  perform 1 from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found then perform private.err('not_found', 'Quiz not found.'); end if;
  select * into r from public.runs where player_id = p.id and gid = p_gid order by attempt desc limit 1 for update;
  if not found or r.status <> 'playing' then perform private.err('closed', 'This play has finished.'); end if;
  if p_index is distinct from jsonb_array_length(r.ans) then perform private.err('invalid', 'Out of order.'); end if;
  if r.q_at is null then
    update public.runs set q_at = private.now_ms() where player_id = r.player_id and run_key = r.run_key returning * into r;
  end if;
  return private.own_run_json(r);
end $$;

create or replace function public.answer(p_tid text, p_gid text, p_index int, p_choice text, p_blur int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.players; g public.quizzes; r public.runs; k public.quiz_keys; q jsonb; canon text; c text;
  now_ms bigint := private.now_ms(); v_qat bigint; used double precision; lim double precision; left_ms double precision;
  ms double precision; ok boolean; pts int; hide boolean; nq int;
begin
  p := private.need_me(p_tid);
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found then perform private.err('not_found', 'Quiz not found.'); end if;
  select * into r from public.runs where player_id = p.id and gid = p_gid order by attempt desc limit 1 for update;
  if not found or r.status <> 'playing' then perform private.err('closed', 'This play has finished.'); end if;
  nq := jsonb_array_length(g.questions);
  if p_index is distinct from jsonb_array_length(r.ans) or p_index >= nq then perform private.err('invalid', 'Already answered.'); end if;
  q := g.questions -> p_index;
  select * into k from public.quiz_keys where tenant_id = p_tid and gid = p_gid;
  canon := k.answers ->> (q ->> 'id');
  -- the clock runs from when the question was shown; if the client skipped show_question,
  -- it runs from the previous answer (or the start), so skipping never earns speed points
  v_qat := coalesce(r.q_at, r.last_at, r.started_at);
  select coalesce(sum((e ->> 'ms')::double precision), 0) into used from jsonb_array_elements(r.ans) e;
  lim := private.limit_ms(g.minutes, g.kind);
  left_ms := lim - used;
  ms := now_ms - v_qat;
  c := case when p_choice is null then null else left(p_choice, 40) end;
  if ms > left_ms + 1500 then c := null; end if; -- too late: the quiz clock ran out (GRACE_MS)
  ms := greatest(0, least(ms, greatest(0, left_ms)));
  ok := c is not null and canon is not null and canon = c;
  pts := case when g.kind = 'cert' then (case when ok then 1 else 0 end)
              else private.answer_points(ok, ms, lim / greatest(1, nq)) end;
  update public.runs set
    ans = ans || jsonb_build_array(jsonb_build_object('ok', case when ok then 1 else 0 end, 'ms', ms::bigint, 'c', c, 'pts', pts)),
    q_at = null,
    last_at = now_ms,
    blur = greatest(blur, least(100000, greatest(0, coalesce(p_blur, 0)))),
    correct = correct + case when ok then 1 else 0 end
  where player_id = r.player_id and run_key = r.run_key
  returning * into r;
  update public.players set updated_at = now_ms where id = p.id;
  hide := g.kind = 'cert';
  return jsonb_build_object(
    'ok', case when hide then null else to_jsonb(ok) end,
    'canon', case when hide then null else to_jsonb(canon) end,
    'pts', case when hide then 0 else pts end,
    'run', private.own_run_json(r))
    || case when not hide and coalesce(k.explains ? (q ->> 'id'), false) then jsonb_build_object('explain', k.explains -> (q ->> 'id')) else '{}'::jsonb end;
end $$;

create or replace function public.finish_run(p_tid text, p_gid text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.players; g public.quizzes; r public.runs; nq int; filled jsonb; corr int; key jsonb;
begin
  p := private.need_me(p_tid);
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found then perform private.err('not_found', 'Quiz not found.'); end if;
  select * into r from public.runs where player_id = p.id and gid = p_gid order by attempt desc limit 1 for update;
  if not found then perform private.err('not_found', 'No play found.'); end if;
  if r.status = 'playing' then
    nq := jsonb_array_length(g.questions);
    filled := r.ans;
    while jsonb_array_length(filled) < nq loop
      filled := filled || '[{"ok":0,"ms":0,"c":null,"pts":0,"sk":1}]'::jsonb;
    end loop;
    select count(*) into corr from jsonb_array_elements(filled) e where private.ans_ok(e);
    update public.runs set
      ans = filled, status = 'done', finished_at = private.now_ms(), q_at = null, correct = corr, total = nq,
      score = case when g.kind = 'cert' then corr else (private.run_points(filled, 'done', nq)).total end,
      passed = case when g.kind = 'cert' then (corr::numeric / greatest(1, nq)) * 100 >= coalesce((g.cert ->> 'passPct')::numeric, 80) end
    where player_id = r.player_id and run_key = r.run_key
    returning * into r;
    update public.players set updated_at = private.now_ms() where id = p.id;
  end if;
  -- certification answers: only when asked for AND the exam can't be retaken
  if g.kind = 'cert' and coalesce((g.cert ->> 'showAnswers')::boolean, false) and private.run_final(r) then
    select k.answers into key from public.quiz_keys k where k.tenant_id = p_tid and k.gid = p_gid;
  end if;
  return private.jclean(jsonb_build_object('run', private.own_run_json(r), 'key', key));
end $$;

-- =====================================================================
-- 8. tenant admin (role matrix: editor+ quizzes/polls, host+ live/poll control,
--    admin+ players/config/brand/gifts/dq/roster/members; owners manage owners)
-- =====================================================================

create or replace function private.default_branding() returns jsonb
language sql immutable set search_path = '' as $$
  select '{"productName":"Ant Arena","tagline":"Daily quizzes, live games and polls for your team","primary":"#C6F432","accent":"#FF5A1F","ink":"#161512","paper":"#F4F3EE"}'::jsonb
$$;

create or replace function private.template_labels(p_template text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_template = 'bank'
    then '{"branch":"Branch","branches":"Branches","dept":"Department","depts":"Departments","battle":"Branch Battle"}'::jsonb
    else '{"branch":"Location","branches":"Locations","dept":"Department","depts":"Departments","battle":"Team Battle"}'::jsonb end
$$;

-- keep only the fields a question may have (so no answer can ride along into the public table)
create or replace function private.clean_question(q jsonb, p_with_explain boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(q) = 'object' then q else '{}'::jsonb end) e
  where e.key in ('id', 'type', 'topic', 'q', 'options', 'left', 'right', 'items', 'seconds')
     or (p_with_explain and e.key = 'explain' and jsonb_typeof(e.value) = 'string')
$$;

create or replace function public.save_quiz(p_tid text, p_draft jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  role text; cfg jsonb; g jsonb; ans jsonb; v_gid text; kind text; st text; qs jsonb; q jsonb; qid text;
  prev public.quizzes; prev_key public.quiz_keys; had_prev boolean; approved text; explains jsonb := '{}'::jsonb; pub jsonb := '[]'::jsonb;
  full_new jsonb := '[]'::jsonb; full_prev jsonb; answers jsonb := '{}'::jsonb; seen text[] := '{}'; now_ms bigint := private.now_ms();
  dt text; un text; mins numeric;
begin
  role := private.req(p_tid, 'editor');
  cfg := private.cfg_of(p_tid);
  g := p_draft -> 'game';
  ans := coalesce(p_draft -> 'key' -> 'answers', '{}'::jsonb);
  if jsonb_typeof(g) <> 'object' then perform private.err('invalid', 'Quiz is missing.'); end if;
  v_gid := g ->> 'id';
  if v_gid is null or v_gid !~ '^[A-Za-z0-9_.:-]{1,64}$' then perform private.err('invalid', 'Quiz id is invalid.'); end if;
  kind := g ->> 'kind';
  if kind is null or kind not in ('sprint', 'live', 'cert') then perform private.err('invalid', 'Unknown quiz type.'); end if;
  qs := case when jsonb_typeof(g -> 'questions') = 'array' then g -> 'questions' else '[]'::jsonb end;
  if jsonb_array_length(qs) > 50 then perform private.err('invalid', '50 questions at most.'); end if;
  for q in select e from jsonb_array_elements(qs) e loop
    qid := q ->> 'id';
    if qid is null or qid = '' or length(qid) > 64 or qid = any (seen) then perform private.err('invalid', 'Every question needs its own id.'); end if;
    seen := seen || qid;
    if coalesce(ans ->> qid, '') = '' then perform private.err('invalid', 'Every question needs an answer.'); end if;
    if coalesce(q ->> 'type', '') not in ('mcq', 'tf', 'match', 'order') then perform private.err('invalid', 'Unknown question type.'); end if;
    if kind = 'live' and q ->> 'type' not in ('mcq', 'tf') then
      perform private.err('invalid', 'Live quizzes use multiple-choice and true/false questions.');
    end if;
    pub := pub || jsonb_build_array(private.clean_question(q, false));
    full_new := full_new || jsonb_build_array(private.clean_question(q, true));
    if jsonb_typeof(q -> 'explain') = 'string' then explains := explains || jsonb_build_object(qid, left(q ->> 'explain', 2000)); end if;
    answers := answers || jsonb_build_object(qid, left(ans ->> qid, 200));
  end loop;
  st := coalesce(g ->> 'status', 'draft');
  if st not in ('draft', 'pending', 'live', 'closed') then st := 'draft'; end if;

  select * into prev from public.quizzes where tenant_id = p_tid and id = v_gid for update;
  had_prev := found;
  if had_prev then
    select * into prev_key from public.quiz_keys where tenant_id = p_tid and gid = prev.id;
    select coalesce(jsonb_agg(case when coalesce(prev_key.explains ? (e ->> 'id'), false)
      then e || jsonb_build_object('explain', prev_key.explains -> (e ->> 'id')) else e end order by i), '[]'::jsonb)
      into full_prev from jsonb_array_elements(prev.questions) with ordinality a(e, i);
  end if;
  approved := case when had_prev then prev.approved_by end;
  -- maker-checker: editors can't publish directly; any change to a live quiz (questions OR answers) goes back to pending
  if coalesce((cfg ->> 'makerChecker')::boolean, false) and st = 'live' and kind <> 'live' then
    if private.role_rank(role) < private.role_rank('admin') or not had_prev or prev.status <> 'live'
       or full_prev is distinct from full_new or coalesce(prev_key.answers, '{}'::jsonb) is distinct from answers then
      st := 'pending';
    end if;
    approved := null;
  end if;

  dt := nullif(g ->> 'date', ''); un := nullif(g ->> 'until', '');
  if dt is not null and dt !~ '^\d{4}-\d{2}-\d{2}$' then perform private.err('invalid', 'Dates look like YYYY-MM-DD.'); end if;
  if un is not null and un !~ '^\d{4}-\d{2}-\d{2}$' then perform private.err('invalid', 'Dates look like YYYY-MM-DD.'); end if;
  mins := case when jsonb_typeof(g -> 'minutes') = 'number' then (g ->> 'minutes')::numeric else 2 end;

  insert into public.quizzes as x (tenant_id, id, kind, title, descr, date, until, minutes, color, status, ord, questions, cert,
    created_at, updated_at, created_by, edited_by, approved_by)
  values (p_tid, v_gid, kind, private.clean_text(coalesce(g ->> 'title', 'Untitled quiz'), 120), nullif(private.clean_text(g ->> 'desc', 1000), ''),
    dt, un, mins,
    case when g ->> 'color' in ('lime', 'orange', 'pink', 'blue', 'blush', 'ink') then g ->> 'color' else 'lime' end,
    st, case when jsonb_typeof(g -> 'order') = 'number' then trunc((g ->> 'order')::numeric)::int end,
    pub, case when jsonb_typeof(g -> 'cert') = 'object' then g -> 'cert' end,
    case when had_prev then prev.created_at else now_ms end, now_ms,
    case when had_prev then coalesce(prev.created_by, private.actor()) else private.actor() end, private.actor(), approved)
  on conflict (tenant_id, id) do update set
    kind = excluded.kind, title = excluded.title, descr = excluded.descr, date = excluded.date, until = excluded.until,
    minutes = excluded.minutes, color = excluded.color, status = excluded.status, ord = excluded.ord, questions = excluded.questions,
    cert = excluded.cert, updated_at = excluded.updated_at, created_by = excluded.created_by, edited_by = excluded.edited_by,
    approved_by = excluded.approved_by;
  insert into public.quiz_keys (tenant_id, gid, answers, explains, updated_at) values (p_tid, v_gid, answers, explains, now_ms)
  on conflict (tenant_id, gid) do update set answers = excluded.answers, explains = excluded.explains, updated_at = excluded.updated_at;
  perform private.log_t(p_tid, case when had_prev then 'Quiz edited' else 'Quiz created' end,
    private.clean_text(coalesce(g ->> 'title', ''), 120), format('%s · %s questions · %s', kind, jsonb_array_length(qs), st));
end $$;

create or replace function public.set_quiz_status(p_tid text, p_gid text, p_status text, p_approve boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare role text; cfg jsonb; g public.quizzes; nxt text := p_status; approved text;
begin
  role := private.req(p_tid, 'editor');
  if p_status is null or p_status not in ('draft', 'pending', 'live', 'closed') then perform private.err('invalid', 'Unknown status.'); end if;
  cfg := private.cfg_of(p_tid);
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid for update;
  if not found then perform private.err('not_found', 'Quiz not found.'); end if;
  approved := g.approved_by;
  if p_status = 'live' and coalesce((cfg ->> 'makerChecker')::boolean, false) and g.kind <> 'live' then
    if not coalesce(p_approve, false) then nxt := 'pending';
    else
      if private.role_rank(role) < private.role_rank('admin') then perform private.err('forbidden', 'Only an admin can approve.'); end if;
      if g.edited_by = private.actor() and not public.is_super() then
        perform private.err('forbidden', 'A different admin must approve your own changes.');
      end if;
      approved := private.actor();
    end if;
  end if;
  update public.quizzes set status = nxt, approved_by = approved, updated_at = private.now_ms() where tenant_id = p_tid and id = p_gid;
  perform private.log_t(p_tid, case when coalesce(p_approve, false) then 'Quiz approved' else 'Quiz status changed' end, g.title, nxt);
end $$;

create or replace function public.delete_quiz(p_tid text, p_gid text) returns void
language plpgsql security definer set search_path = '' as $$
declare title text;
begin
  perform private.req(p_tid, 'editor');
  delete from public.quizzes where tenant_id = p_tid and id = p_gid returning quizzes.title into title;
  perform private.log_t(p_tid, 'Quiz deleted', coalesce(title, p_gid), null, 'warn');
end $$;

create or replace function public.save_config(p_tid text, p_cfg jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tenants;
begin
  perform private.req(p_tid, 'admin');
  if jsonb_typeof(p_cfg) <> 'object' then perform private.err('invalid', 'Settings are missing.'); end if;
  t := private.tenant_row(p_tid);
  update public.tenants set cfg = private.cfg_norm(p_cfg, t.template) where id = p_tid;
  perform private.log_t(p_tid, 'Settings changed', null, null, 'warn');
end $$;

create or replace function public.save_brand(p_tid text, p_branding jsonb, p_labels jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; logo text := p_branding ->> 'logo';
begin
  if logo is not null and length(logo) > 200000 then perform private.err('invalid', 'Logo is too large (150 KB max).'); end if;
  if logo is not null and logo !~ '^data:image/(png|jpeg|svg\+xml|webp);' then perform private.err('invalid', 'Logo must be PNG, JPEG, SVG or WebP.'); end if;
  perform private.req(p_tid, 'admin');
  t := private.tenant_row(p_tid);
  update public.tenants set
    branding = private.default_branding() || coalesce(case when jsonb_typeof(p_branding) = 'object' then p_branding end, '{}'::jsonb)
      || jsonb_build_object('productName', coalesce(nullif(private.clean_text(p_branding ->> 'productName', 40), ''), 'Ant Arena')),
    labels = private.template_labels(t.template) || coalesce(case when jsonb_typeof(p_labels) = 'object' then p_labels end, '{}'::jsonb)
  where id = p_tid;
  perform private.log_t(p_tid, 'Branding changed');
end $$;

create or replace function public.admin_patch_player(p_tid text, p_uid text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.players; e text; lk boolean;
begin
  perform private.req(p_tid, 'admin');
  select * into p from public.players where tenant_id = p_tid and id = p_uid for update;
  if not found then perform private.err('not_found', 'Player not found.'); end if;
  if p_patch ? 'empId' and p_patch -> 'empId' <> 'null'::jsonb then
    e := private.norm_emp_id(p_patch ->> 'empId');
    if not private.valid_emp_id(e) then perform private.err('invalid', 'Employee ID should be 3–12 letters or numbers.'); end if;
    perform 1 from public.players where tenant_id = p_tid and id <> p_uid and emp_id = e;
    if found then perform private.err('conflict', 'Another card already uses that ID.'); end if;
    p.emp_id := e;
  end if;
  if p_patch ? 'name' and p_patch -> 'name' <> 'null'::jsonb then p.name := private.clean_name(p_patch ->> 'name'); end if;
  if p_patch ? 'unit' and p_patch -> 'unit' <> 'null'::jsonb then p.unit := private.clean_text(p_patch ->> 'unit', 80); end if;
  if p_patch ->> 'unitType' in ('branch', 'dept') then p.unit_type := p_patch ->> 'unitType'; end if;
  if p_patch ? 'email' then p.email := nullif(lower(btrim(coalesce(p_patch ->> 'email', ''))), ''); end if;
  if p_patch ? 'locked' and jsonb_typeof(p_patch -> 'locked') = 'boolean' then
    lk := (p_patch ->> 'locked')::boolean;
    p.locked := lk;
    if lk then p.auth_uid := null; end if;
  end if;
  update public.players set emp_id = p.emp_id, name = p.name, unit = p.unit, unit_type = p.unit_type, email = p.email,
    locked = p.locked, auth_uid = p.auth_uid, updated_at = private.now_ms()
  where id = p_uid;
  perform private.log_t(p_tid, case when lk is true then 'Player locked' when lk is false then 'Player unlocked' else 'Player edited' end,
    p.name, null, case when lk is true then 'warn' else 'info' end);
end $$;

create or replace function public.admin_sign_out_player(p_tid text, p_uid text) returns void
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  perform private.req(p_tid, 'admin');
  update public.players set auth_uid = null where tenant_id = p_tid and id = p_uid returning name into nm;
  if nm is null then perform private.err('not_found', 'Player not found.'); end if;
  perform private.log_t(p_tid, 'Player signed out of all devices', nm, null, 'warn');
end $$;

create or replace function public.admin_delete_player(p_tid text, p_uid text) returns void
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  perform private.req(p_tid, 'admin');
  delete from public.players where tenant_id = p_tid and id = p_uid returning name into nm;
  perform private.log_t(p_tid, 'Player deleted', coalesce(nm, p_uid), null, 'alert');
end $$;

create or replace function public.admin_reset_run(p_tid text, p_uid text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  perform private.req(p_tid, 'admin');
  select name into nm from public.players where tenant_id = p_tid and id = p_uid;
  delete from public.runs where tenant_id = p_tid and player_id = p_uid and run_key = p_key;
  if nm is null or not found then perform private.err('not_found', 'Play not found.'); end if;
  perform private.log_t(p_tid, 'Play reset', nm, p_key, 'warn');
end $$;

create or replace function public.admin_import_players(p_tid text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; emp text; nm text; added int := 0; skipped int := 0; now_ms bigint := private.now_ms(); em text;
begin
  perform private.req(p_tid, 'admin');
  if jsonb_typeof(p_rows) <> 'array' then perform private.err('invalid', 'Nothing to import.'); end if;
  for r in select e from jsonb_array_elements(p_rows) with ordinality a(e, i) where i <= 5000 loop
    emp := private.norm_emp_id(r ->> 'empId');
    nm := private.clean_name(r ->> 'name');
    em := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
    if not private.valid_emp_id(emp) or not private.valid_name(nm) or exists (select 1 from public.players where tenant_id = p_tid and emp_id = emp) then
      skipped := skipped + 1;
      continue;
    end if;
    insert into public.players (tenant_id, id, emp_id, email, name, unit_type, unit, look, consent_at, created_at, updated_at)
    values (p_tid, private.new_id('p-'), emp, em, nm, case when r ->> 'unitType' = 'dept' then 'dept' else 'branch' end,
      private.clean_text(coalesce(r ->> 'unit', ''), 80), private.rand_int(16), 0, now_ms, now_ms);
    added := added + 1;
  end loop;
  perform private.log_t(p_tid, 'Players imported', null, format('%s added, %s skipped', added, skipped));
  return jsonb_build_object('added', added, 'skipped', skipped);
end $$;

create or replace function public.save_dq(p_tid text, p_dq jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'admin');
  insert into public.disqualified (tenant_id, runs, updated_at)
  values (p_tid, coalesce(case when jsonb_typeof(p_dq -> 'runs') = 'object' then p_dq -> 'runs' end, '{}'::jsonb), private.now_ms())
  on conflict (tenant_id) do update set runs = excluded.runs, updated_at = excluded.updated_at;
  perform private.log_t(p_tid, 'Disqualifications updated', null, null, 'warn');
end $$;

create or replace function public.save_roster(p_tid text, p_roster jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare hs text[];
begin
  perform private.req(p_tid, 'admin');
  if p_roster is null or jsonb_typeof(p_roster) <> 'object' then
    delete from public.rosters where tenant_id = p_tid;
    perform private.log_t(p_tid, 'Staff allowlist removed', null, null, 'warn');
    return;
  end if;
  if coalesce(p_roster ->> 'salt', '') = '' or jsonb_typeof(p_roster -> 'hashes') <> 'array' then perform private.err('invalid', 'Allowlist is malformed.'); end if;
  select coalesce(array_agg(distinct lower(h)), '{}') into hs from jsonb_array_elements_text(p_roster -> 'hashes') h;
  if exists (select 1 from unnest(hs) h where h !~ '^[0-9a-f]{64}$') then perform private.err('invalid', 'Allowlist hashes must be SHA-256 hex.'); end if;
  if coalesce(array_length(hs, 1), 0) > 200000 then perform private.err('invalid', 'Allowlist is too long.'); end if;
  insert into public.rosters (tenant_id, salt, hashes, updated_at) values (p_tid, p_roster ->> 'salt', hs, private.now_ms())
  on conflict (tenant_id) do update set salt = excluded.salt, hashes = excluded.hashes, updated_at = excluded.updated_at;
  perform private.log_t(p_tid, 'Staff allowlist updated', null, format('%s IDs', coalesce(array_length(hs, 1), 0)), 'warn');
end $$;

create or replace function public.save_gift(p_tid text, p_gift jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare gid text := p_gift ->> 'id';
begin
  perform private.req(p_tid, 'admin');
  if gid is null or gid = '' or length(gid) > 64 then perform private.err('invalid', 'Gift id is missing.'); end if;
  if coalesce(p_gift ->> 'kind', '') not in ('weekly', 'improved', 'branch') then perform private.err('invalid', 'Unknown gift type.'); end if;
  insert into public.gifts (tenant_id, id, period, kind, winner, label, prize, at, by)
  values (p_tid, gid, private.clean_text(p_gift ->> 'period', 40), p_gift ->> 'kind', private.clean_text(p_gift ->> 'winner', 80),
    private.clean_text(p_gift ->> 'label', 120), private.clean_text(p_gift ->> 'prize', 200),
    coalesce(case when jsonb_typeof(p_gift -> 'at') = 'number' then (p_gift ->> 'at')::bigint end, private.now_ms()), private.actor())
  on conflict (tenant_id, id) do update set period = excluded.period, kind = excluded.kind, winner = excluded.winner, label = excluded.label,
    prize = excluded.prize, at = excluded.at, by = excluded.by;
  perform private.log_t(p_tid, 'Gift recorded', private.clean_text(p_gift ->> 'label', 120), private.clean_text(p_gift ->> 'prize', 200));
end $$;

create or replace function public.delete_gift(p_tid text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'admin');
  delete from public.gifts where tenant_id = p_tid and id = p_id;
  perform private.log_t(p_tid, 'Gift removed', null, p_id, 'warn');
end $$;

create or replace function public.purge_runs(p_tid text, p_before bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.req(p_tid, 'admin');
  delete from public.runs where tenant_id = p_tid and coalesce(finished_at, started_at) < p_before;
  get diagnostics n = row_count;
  perform private.log_t(p_tid, 'Old plays purged',
    null, format('%s plays before %s', n, to_char(to_timestamp(p_before / 1000.0) at time zone 'UTC', 'YYYY-MM-DD')), 'warn');
  return n;
end $$;

-- UI events worth auditing (exports, unlocks…). Any admin role.
create or replace function public.audit_add(p_tid text, p_entry jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'viewer');
  perform private.log_t(p_tid, private.clean_text(p_entry ->> 'action', 80), nullif(private.clean_text(p_entry ->> 'target', 200), ''),
    nullif(private.clean_text(p_entry ->> 'detail', 300), ''),
    case when p_entry ->> 'sev' in ('info', 'warn', 'alert') then p_entry ->> 'sev' end);
end $$;

create or replace function public.invite_admin(p_tid text, p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, ''))); mine text;
begin
  if not private.valid_email(e) then perform private.err('invalid', 'Enter a valid email.'); end if;
  if coalesce(p_role, '') not in ('owner', 'admin', 'editor', 'host', 'viewer') then perform private.err('invalid', 'Unknown role.'); end if;
  mine := private.req(p_tid, 'admin');
  if p_role = 'owner' and mine <> 'owner' then perform private.err('forbidden', 'Only an owner can add owners.'); end if;
  perform 1 from public.tenant_members where tenant_id = p_tid and email = e;
  if found then perform private.err('conflict', 'That email is already an admin.'); end if;
  insert into public.tenant_members (tenant_id, email, role, invited_at) values (p_tid, e, p_role, private.now_ms());
  perform private.log_t(p_tid, 'Admin invited', e, p_role, 'warn');
end $$;

create or replace function public.set_admin_role(p_tid text, p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare mine text; m public.tenant_members; owners int;
begin
  if coalesce(p_role, '') not in ('owner', 'admin', 'editor', 'host', 'viewer') then perform private.err('invalid', 'Unknown role.'); end if;
  mine := private.req(p_tid, 'admin');
  select * into m from public.tenant_members where tenant_id = p_tid and email = lower(btrim(p_email)) for update;
  if not found then perform private.err('not_found', 'Admin not found.'); end if;
  if (p_role = 'owner' or m.role = 'owner') and mine <> 'owner' then perform private.err('forbidden', 'Only an owner can change owners.'); end if;
  select count(*) into owners from public.tenant_members where tenant_id = p_tid and role = 'owner';
  if m.role = 'owner' and p_role <> 'owner' and owners < 2 then perform private.err('invalid', 'Keep at least one owner.'); end if;
  update public.tenant_members set role = p_role where tenant_id = p_tid and email = m.email;
  perform private.log_t(p_tid, 'Admin role changed', m.email, p_role, 'warn');
end $$;

create or replace function public.remove_admin(p_tid text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare mine text; m public.tenant_members; owners int;
begin
  mine := private.req(p_tid, 'admin');
  select * into m from public.tenant_members where tenant_id = p_tid and email = lower(btrim(p_email)) for update;
  if not found then return; end if;
  if m.role = 'owner' and mine <> 'owner' then perform private.err('forbidden', 'Only an owner can remove an owner.'); end if;
  select count(*) into owners from public.tenant_members where tenant_id = p_tid and role = 'owner';
  if m.role = 'owner' and owners < 2 then perform private.err('invalid', 'Keep at least one owner.'); end if;
  delete from public.tenant_members where tenant_id = p_tid and email = m.email;
  perform private.log_t(p_tid, 'Admin removed', m.email, null, 'alert');
end $$;

-- the starter library (contains answers): tenant admins and super admins only
create or replace function public.library_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.need_user();
  if not public.is_super() and not exists (
    select 1 from public.tenant_members m where m.user_id = auth.uid() or m.email = private.my_email()) then
    perform private.err('forbidden', 'You don''t have permission for that.');
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'topic', l.topic, 'industry', l.industry,
    'questions', l.questions, 'answers', l.answers) order by l.ord, l.id) from public.library l), '[]'::jsonb);
end $$;

create or replace function private.copy_library_item(p_tid text, l public.library, p_minutes numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare gid text := private.new_id('g', 6); now_ms bigint := private.now_ms();
begin
  insert into public.quizzes (tenant_id, id, kind, title, descr, minutes, color, status, questions, created_at, updated_at, created_by)
  values (p_tid, gid, 'sprint', l.title, null, p_minutes, 'lime', 'draft',
    coalesce((select jsonb_agg(private.clean_question(e, false) order by i) from jsonb_array_elements(l.questions) with ordinality a(e, i)), '[]'::jsonb),
    now_ms, now_ms, private.actor());
  insert into public.quiz_keys (tenant_id, gid, answers, explains, updated_at)
  values (p_tid, gid, l.answers,
    coalesce((select jsonb_object_agg(e ->> 'id', e -> 'explain') from jsonb_array_elements(l.questions) e where jsonb_typeof(e -> 'explain') = 'string'), '{}'::jsonb),
    now_ms);
end $$;

create or replace function public.import_library(p_tid text, p_ids text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare l public.library; n int := 0;
begin
  perform private.req(p_tid, 'editor');
  for l in select * from public.library where id = any (coalesce(p_ids, '{}')) order by ord, id loop
    perform private.copy_library_item(p_tid, l, least(10, greatest(1, ceil(jsonb_array_length(l.questions) * 0.5))));
    n := n + 1;
  end loop;
  perform private.log_t(p_tid, 'Starter quizzes copied', null, format('%s quizzes', n));
  return n;
end $$;

-- =====================================================================
-- 9. live quiz (game-show style)
-- =====================================================================

create or replace function public.live_create(p_tid text, p_gid text, p_guests boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; g public.quizzes; k public.quiz_keys; qs jsonb; canon jsonb; s public.live_sessions; sid text; v_pin text; tries int := 0;
begin
  perform private.req(p_tid, 'host');
  cfg := private.cfg_of(p_tid);
  if not coalesce((cfg -> 'features' ->> 'live')::boolean, false) then perform private.err('forbidden', 'Live quiz is turned off for this company.'); end if;
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found then perform private.err('not_found', 'Quiz not found.'); end if;
  select * into k from public.quiz_keys where tenant_id = p_tid and gid = p_gid;
  -- full questions (with explanations) of the playable types, and their answers, by index
  select coalesce(jsonb_agg(case when coalesce(k.explains ? (e ->> 'id'), false) then e || jsonb_build_object('explain', k.explains -> (e ->> 'id')) else e end order by i), '[]'::jsonb),
         coalesce(jsonb_agg(coalesce(k.answers -> (e ->> 'id'), 'null'::jsonb) order by i), '[]'::jsonb)
    into qs, canon
  from jsonb_array_elements(g.questions) with ordinality a(e, i)
  where e ->> 'type' in ('mcq', 'tf');
  if jsonb_array_length(qs) = 0 then perform private.err('invalid', 'Live games need multiple-choice or true/false questions.'); end if;
  sid := private.new_id('ls-', 12);
  loop
    tries := tries + 1;
    v_pin := (100000 + private.rand_int(900000))::text;
    begin
      insert into public.live_sessions (id, tenant_id, gid, title, pin, state, q_index, q_started_at, q_seconds, total, host_id, created_at, guests)
      values (sid, p_tid, p_gid, g.title, v_pin, 'lobby', -1, 0, 20, jsonb_array_length(qs), auth.uid(), private.now_ms(),
        coalesce(p_guests, false) and coalesce((cfg -> 'signIn' ->> 'liveGuests')::boolean, false))
      returning * into s;
      exit;
    exception when unique_violation then
      if tries > 20 then perform private.err('conflict', 'Could not find a free PIN. Try again.'); end if;
    end;
  end loop;
  insert into public.live_keys (session_id, tenant_id, questions, canon) values (sid, p_tid, qs, canon);
  perform private.log_t(p_tid, 'Live game started', g.title, 'PIN ' || v_pin);
  return private.live_json(s);
end $$;

-- players who didn't answer the question that just closed lose their streak
create or replace function private.live_settle(p_sid text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_sid;
  if s.last_reveal_q is not distinct from s.q_index then return; end if;
  update public.live_sessions set last_reveal_q = s.q_index where id = p_sid;
  update public.live_players set streak = 0, last_pts = 0, last_ok = false
  where session_id = p_sid and answered_q is distinct from s.q_index;
end $$;

create or replace function private.live_counts(p_sid text, p_q jsonb, p_index int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg((select count(*) from public.live_answers a
      where a.session_id = p_sid and a.q_index = p_index
        and (case when p_q ->> 'type' = 'tf' then (case when a.c = 'T' then 0 else 1 end) else (case when a.c ~ '^\d{1,3}$' then a.c::int else -1 end) end) = o.i
    ) order by o.i), '[]'::jsonb)
  from generate_series(0, (case when p_q ->> 'type' = 'tf' then 2 else coalesce(jsonb_array_length(case when jsonb_typeof(p_q -> 'options') = 'array' then p_q -> 'options' end), 0) end) - 1) as o(i)
$$;

create or replace function public.live_control(p_sid text, p_action text, p_arg text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; lk public.live_keys; q jsonb; nplayers int;
begin
  select * into s from public.live_sessions where id = p_sid for update;
  if not found then perform private.err('not_found', 'Game not found.'); end if;
  perform private.req(s.tenant_id, 'host');
  select * into lk from public.live_keys where session_id = p_sid;

  if p_action in ('start', 'next') then
    if p_action = 'start' and s.state <> 'lobby' then return; end if;
    if p_action = 'next' and s.q_index + 1 >= jsonb_array_length(lk.questions) then
      update public.live_sessions set state = 'ended', ended_at = private.now_ms(), question = null where id = p_sid;
      return;
    end if;
    -- open question #i (start → 0, next → i + 1)
    q := lk.questions -> (case when p_action = 'start' then 0 else s.q_index + 1 end);
    update public.live_sessions set
      q_index = case when p_action = 'start' then 0 else s.q_index + 1 end,
      state = 'question',
      q_started_at = private.now_ms(),
      q_seconds = greatest(5, least(120, coalesce(nullif(case when jsonb_typeof(q -> 'seconds') = 'number' then trunc((q ->> 'seconds')::numeric)::int end, 0), 20))),
      question = q - 'explain',
      reveal = null
    where id = p_sid;
  elsif p_action = 'reveal' then
    if s.state <> 'question' then return; end if;
    q := lk.questions -> s.q_index;
    perform private.live_settle(p_sid);
    update public.live_sessions set state = 'reveal',
      reveal = private.jclean(jsonb_build_object('canon', coalesce(lk.canon ->> s.q_index, ''), 'counts', private.live_counts(p_sid, q, s.q_index),
        'explain', q -> 'explain'))
    where id = p_sid;
  elsif p_action = 'board' then
    if s.state = 'question' then perform private.live_settle(p_sid); end if;
    update public.live_sessions set state = 'board' where id = p_sid;
  elsif p_action = 'end' then
    update public.live_sessions set state = 'ended', ended_at = private.now_ms(), question = null where id = p_sid;
    select count(*) into nplayers from public.live_players where session_id = p_sid;
    perform private.log_t(s.tenant_id, 'Live game ended', s.title, format('%s players', nplayers));
  elsif p_action = 'kick' then
    if p_arg is not null then delete from public.live_players where session_id = p_sid and id = p_arg; end if;
  else
    perform private.err('invalid', 'Unknown action.');
  end if;
end $$;

-- board rows sorted by score, then who joined first. p_hide: take back points not yet revealed
create or replace function private.live_board(p_sid text, p_hide boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nick', x.nick, 'look', x.look, 'score', x.sc, 'streak', x.streak,
    'lastPts', coalesce(x.last_pts, 0), 'lastOk', coalesce(x.last_ok, false)) order by x.sc desc, x.joined_at), '[]'::jsonb)
  from (
    select lp.*, lp.score - case when p_hide and lp.answered_q is not distinct from s.q_index then coalesce(lp.last_pts, 0) else 0 end as sc
    from public.live_players lp join public.live_sessions s on s.id = lp.session_id
    where lp.session_id = p_sid
  ) x
$$;

create or replace function public.live_host_view(p_sid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions; lk public.live_keys; q jsonb; answered int;
begin
  select * into s from public.live_sessions where id = p_sid;
  if not found then perform private.err('not_found', 'Game not found.'); end if;
  perform private.req(s.tenant_id, 'host');
  select * into lk from public.live_keys where session_id = p_sid;
  q := lk.questions -> s.q_index;
  select count(*) into answered from public.live_answers where session_id = p_sid and q_index = s.q_index;
  return jsonb_build_object('session', private.live_json(s), 'players', private.live_board(p_sid, false), 'answered', answered,
    'counts', case when q is null then '[]'::jsonb else private.live_counts(p_sid, q, s.q_index) end,
    'serverNow', private.now_ms()); -- lets the client correct countdowns for device clock skew
end $$;

create or replace function public.live_find(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pin text := btrim(coalesce(p_pin, '')); s public.live_sessions; k_user text; k_ip text; slug text;
begin
  if v_pin !~ '^\d{6}$' then return null; end if;
  k_user := 'pin:' || coalesce(auth.uid()::text, 'anon');
  k_ip := 'pin-ip:' || private.client_ip();
  perform private.rate_check(array[k_user] || case when private.client_ip() <> '' then array[k_ip] else '{}'::text[] end);
  select * into s from public.live_sessions x where x.pin = v_pin and x.state <> 'ended';
  if not found then
    perform private.rate_fail(k_user, 10);
    if private.client_ip() <> '' then perform private.rate_fail(k_ip, 200, 60000, 300000); end if;
    return null;
  end if;
  perform private.rate_ok(k_user);
  select t.slug into slug from public.tenants t where t.id = s.tenant_id;
  return jsonb_build_object('sessionId', s.id, 'tenantId', s.tenant_id, 'slug', slug, 'title', s.title, 'guests', s.guests);
end $$;

create or replace function public.live_join(p_sid text, p_nick text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; s public.live_sessions; existing text; card public.players; nm text; lk int; v_nick text; k int := 2; nm_parts jsonb; v_id text;
begin
  uid := private.need_user();
  select * into s from public.live_sessions where id = p_sid for update; -- serialise joins (unique nicknames)
  if not found or s.state = 'ended' then perform private.err('closed', 'This game has ended.'); end if;
  perform 1 from public.tenants where id = s.tenant_id and status = 'active';
  if not found then perform private.err('suspended', 'This company''s account is paused.'); end if;
  select lp.id into existing from public.live_players lp where lp.session_id = p_sid and lp.auth_uid = uid;
  if existing is not null then return jsonb_build_object('livePlayerId', existing); end if;
  if (select count(*) from public.live_players where session_id = p_sid) >= 1000 then perform private.err('closed', 'This game is full.'); end if;
  select * into card from public.players where tenant_id = s.tenant_id and auth_uid = uid and not locked;
  if found then
    nm_parts := private.first_last_initial(card.name);
    nm := (nm_parts ->> 'first') || case when nm_parts ->> 'lastInitial' <> '' then ' ' || (nm_parts ->> 'lastInitial') else '' end;
    lk := card.look;
  else
    if not s.guests then perform private.err('auth', 'Sign in with your player card to join this game.'); end if;
    nm := private.clean_name(p_nick);
    if length(nm) < 2 or length(nm) > 16 then perform private.err('invalid', 'Pick a nickname of 2–16 characters.'); end if;
    lk := private.rand_int(16);
    card := null;
  end if;
  v_nick := nm;
  while exists (select 1 from public.live_players where session_id = p_sid and lower(live_players.nick) = lower(v_nick)) loop
    v_nick := nm || ' ' || k;
    k := k + 1;
  end loop;
  v_id := private.new_id('lp-', 10);
  insert into public.live_players (id, session_id, tenant_id, player_id, auth_uid, nick, look, score, streak, joined_at)
  values (v_id, p_sid, s.tenant_id, card.id, uid, v_nick, lk, 0, 0, private.now_ms());
  return jsonb_build_object('livePlayerId', v_id);
end $$;

-- the watchLivePlayer payload: results stay hidden until the host reveals
create or replace function public.live_player_view(p_sid text, p_lpid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions; lp public.live_players; board jsonb; rank int := 0; answered boolean; revealed boolean; me jsonb; ahead jsonb;
begin
  perform private.need_user();
  select * into s from public.live_sessions where id = p_sid;
  if not found then perform private.err('not_found', 'Game not found.'); end if;
  select * into lp from public.live_players where id = p_lpid and session_id = p_sid;
  if found and lp.auth_uid <> auth.uid() then perform private.err('forbidden', 'Not your player.'); end if;
  revealed := s.state in ('reveal', 'board', 'ended');
  board := private.live_board(p_sid, not revealed);
  if lp.id is not null then
    select b.i::int into rank from jsonb_array_elements(board) with ordinality b(e, i) where b.e ->> 'id' = lp.id;
  end if;
  answered := lp.id is not null and lp.answered_q is not distinct from s.q_index;
  -- the player directly above you, once scores are public
  if revealed and coalesce(rank, 0) > 1 then
    ahead := jsonb_build_object('nick', board -> (rank - 2) ->> 'nick', 'score', (board -> (rank - 2) -> 'score'));
  end if;
  if lp.id is not null then
    me := private.jclean(jsonb_build_object('id', lp.id, 'sessionId', p_sid, 'playerId', lp.player_id, 'nick', lp.nick, 'look', lp.look,
      'score', case when revealed then lp.score else lp.score - case when answered then coalesce(lp.last_pts, 0) else 0 end end,
      'streak', lp.streak, 'joinedAt', lp.joined_at,
      'lastPts', case when revealed then lp.last_pts end, 'lastOk', case when revealed then lp.last_ok end));
  end if;
  return jsonb_build_object('session', private.live_json(s), 'me', me, 'rank', coalesce(rank, 0), 'count', jsonb_array_length(board),
    'answered', answered, 'lastOk', case when revealed and lp.id is not null then coalesce(lp.last_ok, false) end,
    'ahead', ahead, 'serverNow', private.now_ms());
end $$;

create or replace function public.live_answer(p_sid text, p_lpid text, p_qindex int, p_choice text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; s public.live_sessions; lp public.live_players; lk public.live_keys; q jsonb; c text; ms bigint; lim bigint; ok boolean; pts int;
begin
  uid := private.need_user();
  select * into s from public.live_sessions where id = p_sid;
  if not found or s.state <> 'question' or s.q_index is distinct from p_qindex then perform private.err('closed', 'Too late — this question has closed.'); end if;
  select * into lp from public.live_players where id = p_lpid and session_id = p_sid for update;
  if not found or lp.auth_uid <> uid then perform private.err('forbidden', 'Not your player.'); end if;
  if lp.answered_q is not distinct from p_qindex then perform private.err('conflict', 'Already answered.'); end if;
  ms := private.now_ms() - s.q_started_at;
  lim := s.q_seconds::bigint * 1000;
  if ms > lim + 1500 then perform private.err('closed', 'Time''s up.'); end if;
  select * into lk from public.live_keys where session_id = p_sid;
  q := lk.questions -> p_qindex;
  c := left(coalesce(p_choice, ''), 4);
  if (q ->> 'type' = 'tf' and c not in ('T', 'F'))
     or (q ->> 'type' <> 'tf' and not (c ~ '^\d{1,3}$' and c::int < coalesce(jsonb_array_length(case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' end), 0))) then
    perform private.err('invalid', 'Pick an answer.');
  end if;
  ok := (lk.canon ->> p_qindex) is not null and (lk.canon ->> p_qindex) = c;
  pts := private.live_points(ok, least(ms, lim), lim, lp.streak);
  update public.live_players set answered_q = p_qindex, streak = case when ok then streak + 1 else 0 end,
    score = score + pts, last_pts = pts, last_ok = ok
  where id = p_lpid;
  insert into public.live_answers (session_id, tenant_id, live_player_id, q_index, c, ms, ok, pts)
  values (p_sid, s.tenant_id, p_lpid, p_qindex, c, greatest(0, ms), ok, pts);
end $$;

-- =====================================================================
-- 10. live polls (interactive)
-- =====================================================================

create or replace function private.poll_host(p public.polls) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(p.tenant_id, 'host')
$$;

create or replace function private.poll_bump(p_poll text) returns void
language sql security definer set search_path = '' as $$
  update public.poll_pulse set rev = rev + 1, at = private.now_ms() where poll_id = p_poll
$$;

create or replace function public.save_poll(p_tid text, p_poll jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; pid text := p_poll ->> 'id'; prev public.polls; had boolean; v_code text; v_slides jsonb; sl jsonb; tries int := 0; nsl int;
begin
  perform private.req(p_tid, 'editor');
  cfg := private.cfg_of(p_tid);
  if not coalesce((cfg -> 'features' ->> 'polls')::boolean, false) then perform private.err('forbidden', 'Polls are turned off for this company.'); end if;
  if pid is null or pid !~ '^[A-Za-z0-9_.:-]{1,64}$' then perform private.err('invalid', 'Poll id is invalid.'); end if;
  select * into prev from public.polls where id = pid for update;
  had := found;
  if had and prev.tenant_id <> p_tid then perform private.err('forbidden', 'Not your poll.'); end if;
  v_slides := case when jsonb_typeof(p_poll -> 'slides') = 'array' then p_poll -> 'slides' else '[]'::jsonb end;
  nsl := jsonb_array_length(v_slides);
  if nsl > 30 then perform private.err('invalid', '30 slides at most.'); end if;
  for sl in select e from jsonb_array_elements(v_slides) e loop
    if jsonb_typeof(sl) <> 'object' or coalesce(sl ->> 'id', '') = '' or coalesce(sl ->> 'type', '') not in ('mc', 'word', 'scale', 'open', 'qa', 'rank') then
      perform private.err('invalid', 'A slide is malformed.');
    end if;
  end loop;
  v_code := case when had then prev.code else p_poll ->> 'code' end;
  loop
    if v_code is null or v_code !~ '^\d{6}$' or exists (select 1 from public.polls x where x.code = v_code and x.id <> pid) then
      v_code := (100000 + private.rand_int(900000))::text;
      continue;
    end if;
    tries := tries + 1;
    begin
      insert into public.polls as x (id, tenant_id, title, code, slides, current, status, show_results, locked, created_at, updated_at, created_by)
      values (pid, p_tid, coalesce(nullif(private.clean_text(p_poll ->> 'title', 120), ''), 'Untitled poll'), v_code, v_slides,
        greatest(0, least(greatest(nsl - 1, 0), coalesce(case when jsonb_typeof(p_poll -> 'current') = 'number' then trunc((p_poll ->> 'current')::numeric)::int end, 0))),
        case when p_poll ->> 'status' in ('draft', 'open', 'closed') then p_poll ->> 'status' else 'draft' end,
        coalesce((p_poll ->> 'showResults')::boolean, true), coalesce((p_poll ->> 'locked')::boolean, false),
        case when had then prev.created_at else private.now_ms() end, private.now_ms(),
        case when had then prev.created_by else private.actor() end)
      on conflict (id) do update set title = excluded.title, code = excluded.code, slides = excluded.slides, current = excluded.current,
        status = excluded.status, show_results = excluded.show_results, locked = excluded.locked, updated_at = excluded.updated_at;
      exit;
    exception when unique_violation then
      if tries > 20 then perform private.err('conflict', 'Could not find a free code. Try again.'); end if;
      v_code := null;
    end;
  end loop;
  insert into public.poll_pulse (poll_id, tenant_id) values (pid, p_tid) on conflict (poll_id) do nothing;
  if not had then perform private.log_t(p_tid, 'Poll created', coalesce(nullif(private.clean_text(p_poll ->> 'title', 120), ''), 'Untitled poll')); end if;
end $$;

create or replace function public.delete_poll(p_tid text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare title text;
begin
  perform private.req(p_tid, 'editor');
  delete from public.polls where id = p_id and tenant_id = p_tid returning polls.title into title;
  if title is not null then perform private.log_t(p_tid, 'Poll deleted', title, null, 'warn'); end if;
end $$;

create or replace function public.poll_control(p_poll text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_poll for update;
  if not found then perform private.err('not_found', 'Poll not found.'); end if;
  perform private.req(p.tenant_id, 'host');
  if jsonb_typeof(p_patch -> 'current') = 'number' then
    p.current := greatest(0, least(jsonb_array_length(p.slides) - 1, trunc((p_patch ->> 'current')::numeric)::int));
    p.locked := false;
  end if;
  if p_patch ->> 'status' in ('draft', 'open', 'closed') then p.status := p_patch ->> 'status'; end if;
  if jsonb_typeof(p_patch -> 'showResults') = 'boolean' then p.show_results := (p_patch ->> 'showResults')::boolean; end if;
  if jsonb_typeof(p_patch -> 'locked') = 'boolean' then p.locked := (p_patch ->> 'locked')::boolean; end if;
  update public.polls set current = p.current, status = p.status, show_results = p.show_results, locked = p.locked, updated_at = private.now_ms()
  where id = p_poll;
end $$;

create or replace function public.poll_find(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c text := regexp_replace(coalesce(p_code, ''), '\s', '', 'g'); p public.polls; k_user text; k_ip text;
begin
  if c !~ '^\d{6}$' then return null; end if;
  k_user := 'poll:' || coalesce(auth.uid()::text, 'anon');
  k_ip := 'poll-ip:' || private.client_ip();
  perform private.rate_check(array[k_user] || case when private.client_ip() <> '' then array[k_ip] else '{}'::text[] end);
  select * into p from public.polls x where x.code = c and x.status = 'open';
  if not found then
    perform private.rate_fail(k_user, 10);
    if private.client_ip() <> '' then perform private.rate_fail(k_ip, 200, 60000, 300000); end if;
    return null;
  end if;
  perform private.rate_ok(k_user);
  if auth.uid() is not null then
    insert into public.poll_audience (poll_id, auth_uid) values (p.id, auth.uid()) on conflict do nothing;
  end if;
  return jsonb_build_object('pollId', p.id, 'title', p.title, 'slug', (select t.slug from public.tenants t where t.id = p.tenant_id));
end $$;

-- audience-safe poll (watchPoll). Joins the caller to the poll's audience (realtime).
create or replace function public.poll_public(p_poll text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.polls; host boolean;
begin
  select * into p from public.polls where id = p_poll;
  if not found then return null; end if;
  host := private.poll_host(p);
  if auth.uid() is not null and not host and p.status = 'open' then
    insert into public.poll_audience (poll_id, auth_uid) values (p.id, auth.uid()) on conflict do nothing;
  end if;
  return private.poll_json(p, host);
end $$;

-- responses for one slide (hidden ones left out), for engine.aggregate() in the client.
-- `who` is a per-poll pseudonym. null when the caller may not see results.
create or replace function public.poll_results(p_poll text, p_slide text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.polls; sl jsonb; host boolean;
begin
  select * into p from public.polls where id = p_poll;
  if not found then return null; end if;
  select e into sl from jsonb_array_elements(p.slides) e where e ->> 'id' = p_slide limit 1;
  if sl is null then return null; end if;
  host := private.poll_host(p);
  if not host and not (p.status = 'open' and (p.show_results or sl ->> 'type' = 'qa')) then return null; end if;
  return jsonb_build_object('host', host, 'slide', sl, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'pollId', r.poll_id, 'slideId', r.slide_id,
      'who', left(md5(r.poll_id || ':' || r.who::text), 16), 'value', r.value, 'at', r.at, 'votes', r.votes,
      'hidden', r.hidden, 'answered', r.answered) order by r.at)
    from public.poll_responses r where r.poll_id = p_poll and r.slide_id = p_slide and not r.hidden), '[]'::jsonb));
end $$;

-- engine.pollValueProblem → error message or null
create or replace function private.poll_value_problem(sl jsonb, v jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := sl ->> 'type'; n int; x jsonb; lo int; hi int; txt text; cnt int;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return 'Empty answer'; end if;
  n := coalesce(jsonb_array_length(case when jsonb_typeof(sl -> 'options') = 'array' then sl -> 'options' end), 0);
  if t = 'mc' then
    x := v -> 'choice';
    if jsonb_typeof(x) <> 'array' or jsonb_array_length(x) = 0
       or exists (select 1 from jsonb_array_elements(x) e where not private.is_int(e) or (e::text)::numeric < 0 or (e::text)::numeric >= n)
       or (not coalesce((sl ->> 'multi')::boolean, false) and jsonb_array_length(x) > 1) then
      return 'Pick an option';
    end if;
  elsif t = 'word' then
    x := v -> 'words';
    if jsonb_typeof(x) <> 'array' then return 'Type a word'; end if;
    select count(*) into cnt from jsonb_array_elements(x) e
      where private.norm_word(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e::text end) <> '';
    if cnt = 0 or jsonb_array_length(x) > coalesce(nullif((sl ->> 'maxWords')::int, 0), 3) then return 'Type a word'; end if;
  elsif t = 'scale' then
    x := v -> 'score';
    lo := coalesce((sl ->> 'scaleMin')::int, 1); hi := coalesce((sl ->> 'scaleMax')::int, 5);
    if x is null or not private.is_int(x) or (x::text)::numeric < lo or (x::text)::numeric > hi then return 'Pick a value'; end if;
  elsif t in ('open', 'qa') then
    txt := btrim(coalesce(v ->> 'text', ''));
    if length(txt) < 2 or length(txt) > 280 then return 'Write 2–280 characters'; end if;
  elsif t = 'rank' then
    x := v -> 'order';
    if jsonb_typeof(x) <> 'array' or jsonb_array_length(x) <> n
       or (select count(distinct e) from jsonb_array_elements(x) e) <> n
       or exists (select 1 from jsonb_array_elements(x) e where not private.is_int(e) or (e::text)::numeric < 0 or (e::text)::numeric >= n) then
      return 'Rank every option';
    end if;
  end if;
  return null;
end $$;

create or replace function public.poll_respond(p_poll text, p_slide text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; p public.polls; sl jsonb; bad text; clean jsonb; t text; mine int; total int;
begin
  uid := private.need_user();
  select * into p from public.polls where id = p_poll;
  if not found or p.status <> 'open' then perform private.err('closed', 'This poll is closed.'); end if;
  sl := p.slides -> p.current;
  if sl is null or sl ->> 'id' is distinct from p_slide then perform private.err('closed', 'The presenter has moved on.'); end if;
  if p.locked then perform private.err('closed', 'Voting is closed for this question.'); end if;
  bad := private.poll_value_problem(sl, p_value);
  if bad is not null then perform private.err('invalid', bad); end if;
  t := sl ->> 'type';
  clean := case
    when t in ('open', 'qa') then jsonb_build_object('text', private.clean_text(p_value ->> 'text', 280))
    when t = 'word' then jsonb_build_object('words', (select jsonb_agg(to_jsonb(private.clean_text(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e::text end, 25)) order by i)
                                                     from jsonb_array_elements(p_value -> 'words') with ordinality a(e, i)))
    when t = 'mc' then jsonb_build_object('choice', p_value -> 'choice')
    when t = 'scale' then jsonb_build_object('score', p_value -> 'score')
    when t = 'rank' then jsonb_build_object('order', p_value -> 'order')
  end;
  -- one respondent at a time per poll row is fine; serialise the size/limit checks
  perform pg_advisory_xact_lock(hashtextextended('poll:' || p_poll || ':' || uid::text, 0));
  if t = 'qa' then
    select count(*) into mine from public.poll_responses where poll_id = p_poll and slide_id = p_slide and who = uid;
    if mine >= 5 then perform private.err('rate_limited', 'You''ve asked 5 questions already.'); end if;
  end if;
  select count(*) into total from public.poll_responses where poll_id = p_poll;
  if total >= 20000 and (t = 'qa' or not exists (select 1 from public.poll_responses where poll_id = p_poll and slide_id = p_slide and who = uid and not is_qa)) then
    perform private.err('closed', 'This poll has reached its response limit.');
  end if;
  if t = 'qa' then
    insert into public.poll_responses (id, poll_id, tenant_id, slide_id, is_qa, who, value, at, votes)
    values (private.new_id('r-'), p_poll, p.tenant_id, p_slide, true, uid, clean, private.now_ms(), 0);
  else
    insert into public.poll_responses (id, poll_id, tenant_id, slide_id, is_qa, who, value, at)
    values (private.new_id('r-'), p_poll, p.tenant_id, p_slide, false, uid, clean, private.now_ms())
    on conflict (poll_id, slide_id, who) where not is_qa do update set value = excluded.value, at = excluded.at;
  end if;
  insert into public.poll_audience (poll_id, auth_uid) values (p_poll, uid) on conflict do nothing;
  perform private.poll_bump(p_poll);
end $$;

-- slideId → my last answer (Q&A questions are not "answers")
create or replace function public.poll_my_responses(p_poll text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(r.slide_id, r.value), '{}'::jsonb)
  from public.poll_responses r
  where r.poll_id = p_poll and r.who = auth.uid() and auth.uid() is not null and not r.is_qa
$$;

create or replace function public.qa_vote(p_poll text, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; p public.polls; r public.poll_responses;
begin
  uid := private.need_user();
  select * into p from public.polls where id = p_poll;
  if not found or p.status <> 'open' then perform private.err('closed', 'This poll is closed.'); end if;
  select * into r from public.poll_responses where id = p_response and poll_id = p_poll for update;
  if not found then perform private.err('not_found', 'Question not found.'); end if;
  delete from public.poll_votes where response_id = p_response and voter = uid;
  if found then
    update public.poll_responses set votes = greatest(0, votes - 1) where id = p_response;
  else
    insert into public.poll_votes (response_id, voter) values (p_response, uid);
    update public.poll_responses set votes = votes + 1 where id = p_response;
  end if;
  perform private.poll_bump(p_poll);
end $$;

create or replace function public.qa_moderate(p_poll text, p_response text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if not found then perform private.err('not_found', 'Poll not found.'); end if;
  perform private.req(p.tenant_id, 'host');
  update public.poll_responses set
    hidden = case when jsonb_typeof(p_patch -> 'hidden') = 'boolean' then (p_patch ->> 'hidden')::boolean else hidden end,
    answered = case when jsonb_typeof(p_patch -> 'answered') = 'boolean' then (p_patch ->> 'answered')::boolean else answered end
  where id = p_response and poll_id = p_poll;
  perform private.poll_bump(p_poll);
end $$;

-- =====================================================================
-- 11. super admin (emails in super_admins + the shared super code)
--     5 wrong codes → locked 1 min, doubling up to 15 min; unlock lasts 30 min.
-- =====================================================================

create or replace function public.super_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'isSuperUser', coalesce(x.is_su, false),
    'unlockedUntil', case when coalesce(x.is_su, false) then coalesce((select u.until from public.super_unlocks u where u.user_id = auth.uid()), 0) else 0 end,
    'codeIsDefault', coalesce((select s.is_default from public.super_secret s where s.id = 1), true))
  from (select exists (select 1 from public.super_admins a where a.email = private.my_email()) as is_su) x
$$;

-- returns {until} or {error:{code,message,wait}} (the failure counter must survive)
create or replace function public.super_unlock(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; f public.super_fails; h text; now_ms bigint := private.now_ms(); v_until bigint;
begin
  uid := private.need_user();
  if private.my_email() is null or not exists (select 1 from public.super_admins a where a.email = private.my_email()) then
    perform private.err('forbidden', 'This account isn''t a super admin.');
  end if;
  select * into f from public.super_fails where user_id = uid for update;
  if found and f.until > now_ms then
    return private.err_json('rate_limited', format('Too many wrong codes. Try again in %s min.', ceil((f.until - now_ms) / 60000.0)::int), f.until - now_ms);
  end if;
  select s.hash into h from public.super_secret s where s.id = 1;
  if h is null or extensions.crypt(coalesce(p_code, ''), h) <> h then
    insert into public.super_fails as x (user_id, n, until, updated_at) values (uid, 1, 0, now_ms)
    on conflict (user_id) do update set n = x.n + 1, updated_at = now_ms
    returning * into f;
    if f.n >= 5 then
      update public.super_fails set until = now_ms + least(900000, 60000 * (2 ^ least(f.n - 5, 10))::bigint) where user_id = uid returning * into f;
    end if;
    perform private.log_s('Wrong super admin code', null, format('attempt %s', f.n), case when f.n >= 5 then 'alert' else 'warn' end);
    if f.until > now_ms then
      return private.err_json('rate_limited', 'Too many wrong codes. Locked for a while.', f.until - now_ms);
    end if;
    return private.err_json('auth', format('That code isn''t right. %s tries left.', greatest(0, 5 - f.n)));
  end if;
  delete from public.super_fails where user_id = uid;
  v_until := now_ms + 30 * 60000;
  insert into public.super_unlocks (user_id, until) values (uid, v_until) on conflict (user_id) do update set until = excluded.until;
  perform private.log_s('Super admin unlocked');
  return jsonb_build_object('until', v_until);
end $$;

create or replace function public.super_lock() returns void
language sql security definer set search_path = '' as $$
  delete from public.super_unlocks where user_id = auth.uid()
$$;

create or replace function public.super_change_code(p_old text, p_new text) returns void
language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  perform private.need_super();
  select s.hash into h from public.super_secret s where s.id = 1 for update;
  if h is null or extensions.crypt(coalesce(p_old, ''), h) <> h then perform private.err('auth', 'The current code isn''t right.'); end if;
  if length(coalesce(p_new, '')) < 8 or p_new !~ '[A-Za-z]' or p_new !~ '[0-9]' then
    perform private.err('invalid', 'Use 8+ characters with letters and numbers.');
  end if;
  if lower(p_new) = 'sandeepa' then perform private.err('invalid', 'Pick something other than the starting code.'); end if;
  update public.super_secret set hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), is_default = false, updated_at = private.now_ms() where id = 1;
  perform private.log_s('Super admin code changed', null, null, 'warn');
end $$;

create or replace function private.usage(p_tid text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with since as (select private.now_ms() - 30::bigint * 86400000 as t),
  r as (select r.player_id, coalesce(r.finished_at, r.started_at) as at from public.runs r where r.tenant_id = p_tid)
  select jsonb_build_object(
    'players', (select count(*) from public.players p where p.tenant_id = p_tid),
    'activePlayers30', (select count(distinct r.player_id) from r, since where r.at >= since.t),
    'runs30', (select count(*) from r, since where r.at >= since.t),
    'quizzes', (select count(*) from public.quizzes q where q.tenant_id = p_tid),
    'liveSessions30', (select count(*) from public.live_sessions l, since where l.tenant_id = p_tid and l.created_at >= since.t),
    'polls', (select count(*) from public.polls p where p.tenant_id = p_tid),
    'admins', (select count(*) from public.tenant_members m where m.tenant_id = p_tid),
    'lastActive', coalesce((select max(r.at) from r), 0))
$$;

create or replace function public.super_tenants() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.need_super();
  return coalesce((select jsonb_agg(private.tenant_json(t) || jsonb_build_object('usage', private.usage(t.id)) order by t.created_at desc)
    from public.tenants t), '[]'::jsonb);
end $$;

create or replace function private.slug_problem(p_slug text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_slug is null or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$' then 'Use 3–32 lowercase letters, numbers or dashes for the web address.'
    when p_slug in ('super', 'join', 'vote', 'admin', 'api', 'www', 'app') then 'That address is reserved.'
  end
$$;

create or replace function public.super_create_tenant(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_slug text := lower(btrim(coalesce(p_input ->> 'slug', ''))); v_email text := lower(btrim(coalesce(p_input ->> 'ownerEmail', '')));
  nm text := btrim(private.clean_text(p_input ->> 'name', 80)); tpl text := p_input ->> 'template'; t public.tenants; bad text; l public.library;
begin
  bad := private.slug_problem(v_slug);
  if bad is not null then perform private.err('invalid', bad); end if;
  if not private.valid_email(v_email) then perform private.err('invalid', 'Enter the owner''s email.'); end if;
  if length(nm) < 2 then perform private.err('invalid', 'Enter the company name.'); end if;
  if tpl is null or tpl not in ('generic', 'bank') then perform private.err('invalid', 'Pick a template.'); end if;
  perform private.need_super();
  perform 1 from public.tenants x where x.slug = v_slug;
  if found then perform private.err('conflict', 'That web address is taken.'); end if;
  insert into public.tenants (id, slug, name, status, template, branding, labels, cfg, created_at)
  values (private.new_id('t-', 6), v_slug, nm, 'active', tpl,
    private.default_branding() || coalesce(case when jsonb_typeof(p_input -> 'branding') = 'object' then p_input -> 'branding' end, '{}'::jsonb),
    private.template_labels(tpl), private.default_cfg(tpl), private.now_ms())
  returning * into t;
  insert into public.tenant_members (tenant_id, email, role, invited_at) values (t.id, v_email, 'owner', private.now_ms());
  if coalesce((p_input ->> 'starter')::boolean, false) then
    for l in select * from public.library x where x.industry = 'any' or (tpl = 'bank' and x.industry = 'bank') order by x.ord, x.id loop
      perform private.copy_library_item(t.id, l, 3);
    end loop;
  end if;
  perform private.log_s('Company created', nm, format('%s · owner %s', v_slug, v_email));
  perform private.log_t(t.id, 'Company created', null, format('owner %s', v_email));
  return private.tenant_json(t);
end $$;

create or replace function public.super_update_tenant(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; bad text; ns text;
begin
  perform private.need_super();
  select * into t from public.tenants where id = p_id for update;
  if not found then perform private.err('not_found', 'Company not found.'); end if;
  if p_patch ? 'slug' and p_patch ->> 'slug' is distinct from t.slug then
    ns := lower(btrim(coalesce(p_patch ->> 'slug', '')));
    bad := private.slug_problem(ns);
    if bad is not null then perform private.err('invalid', 'Invalid web address.'); end if;
    perform 1 from public.tenants x where x.slug = ns and x.id <> p_id;
    if found then perform private.err('conflict', 'That web address is taken.'); end if;
    t.slug := ns;
  end if;
  if p_patch ? 'name' then
    if length(btrim(private.clean_text(p_patch ->> 'name', 80))) < 2 then perform private.err('invalid', 'Enter the company name.'); end if;
    t.name := btrim(private.clean_text(p_patch ->> 'name', 80));
  end if;
  if p_patch ? 'status' then
    if p_patch ->> 'status' not in ('active', 'suspended') then perform private.err('invalid', 'Unknown status.'); end if;
    t.status := p_patch ->> 'status';
  end if;
  if p_patch ? 'template' then
    if p_patch ->> 'template' not in ('generic', 'bank') then perform private.err('invalid', 'Pick a template.'); end if;
    t.template := p_patch ->> 'template';
  end if;
  if jsonb_typeof(p_patch -> 'branding') = 'object' then t.branding := p_patch -> 'branding'; end if;
  if jsonb_typeof(p_patch -> 'labels') = 'object' then t.labels := p_patch -> 'labels'; end if;
  if jsonb_typeof(p_patch -> 'cfg') = 'object' then t.cfg := private.cfg_norm(p_patch -> 'cfg', t.template); end if;
  update public.tenants set slug = t.slug, name = t.name, status = t.status, template = t.template, branding = t.branding, labels = t.labels, cfg = t.cfg
  where id = p_id;
  perform private.log_s(case when p_patch ? 'status' then 'Company ' || t.status else 'Company updated' end, t.name, null,
    case when p_patch ->> 'status' = 'suspended' then 'warn' else 'info' end);
end $$;

create or replace function public.super_delete_tenant(p_id text, p_confirm_slug text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tenants;
begin
  perform private.need_super();
  select * into t from public.tenants where id = p_id for update;
  if not found then perform private.err('not_found', 'Company not found.'); end if;
  if p_confirm_slug is distinct from t.slug then perform private.err('invalid', 'Type the web address exactly to confirm.'); end if;
  delete from public.tenants where id = p_id; -- cascades to every tenant table
  perform private.log_s('Company deleted', t.name, t.slug, 'alert');
end $$;

create or replace function public.super_admins_list(p_tid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.need_super();
  return coalesce((select jsonb_agg(private.member_json(m) order by m.invited_at) from public.tenant_members m where m.tenant_id = p_tid), '[]'::jsonb);
end $$;

create or replace function public.super_invite(p_tid text, p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  perform private.need_super();
  perform public.invite_admin(p_tid, p_email, p_role);
  select t.name into nm from public.tenants t where t.id = p_tid;
  perform private.log_s('Admin invited', lower(btrim(p_email)), format('%s · %s', nm, p_role));
end $$;

create or replace function public.super_audit_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.need_super();
  return coalesce((select jsonb_agg(private.jclean(jsonb_build_object('id', a.id, 'at', a.at, 'actor', a.actor, 'action', a.action,
    'target', a.target, 'detail', a.detail, 'sev', a.sev)) order by a.at desc)
    from (select * from public.super_audit order by at desc limit 2000) a), '[]'::jsonb);
end $$;

create or replace function public.super_save_library(p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare it jsonb; i int := 0;
begin
  perform private.need_super();
  if jsonb_typeof(p_items) <> 'array' then perform private.err('invalid', 'Library must be a list.'); end if;
  for it in select e from jsonb_array_elements(p_items) e loop
    if coalesce(it ->> 'id', '') = '' or jsonb_typeof(it -> 'questions') <> 'array' or jsonb_typeof(it -> 'answers') <> 'object' then
      perform private.err('invalid', 'A library set is malformed.');
    end if;
  end loop;
  delete from public.library;
  for it in select e from jsonb_array_elements(p_items) e loop
    i := i + 1;
    insert into public.library (id, title, topic, industry, questions, answers, ord)
    values (it ->> 'id', coalesce(it ->> 'title', ''), coalesce(it ->> 'topic', ''),
      case when it ->> 'industry' = 'bank' then 'bank' else 'any' end, it -> 'questions', it -> 'answers', i)
    on conflict (id) do update set title = excluded.title, topic = excluded.topic, industry = excluded.industry,
      questions = excluded.questions, answers = excluded.answers, ord = excluded.ord;
  end loop;
  perform private.log_s('Starter library updated', null, format('%s sets', jsonb_array_length(p_items)));
end $$;

-- ---------------------------------------------------------------------
-- bootstrap: run ONCE from the Supabase SQL editor (never callable from the app)
--   select public.bootstrap_super_admin('you@company.com');
-- ---------------------------------------------------------------------
create or replace function public.bootstrap_super_admin(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.valid_email(e) then raise exception 'invalid: Enter a valid email.'; end if;
  insert into public.super_admins (email) values (e) on conflict do nothing;
  insert into public.super_secret (id, hash, is_default) values (1, extensions.crypt('Sandeepa', extensions.gen_salt('bf', 10)), true)
  on conflict (id) do nothing;
  insert into public.super_audit (actor, action, target, sev) values ('sql-editor', 'Super admin added', e, 'warn');
  return format('%s is a super admin. Sign in with this email, open #/super and unlock with the code (starting code: Sandeepa — change it).', e);
end $$;

-- the starting super code (changed on first use from the console)
insert into public.super_secret (id, hash, is_default)
values (1, extensions.crypt('Sandeepa', extensions.gen_salt('bf', 10)), true)
on conflict (id) do nothing;

-- =====================================================================
-- 12. grants — nothing is executable unless listed here
-- =====================================================================
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke usage on schema private from public, anon, authenticated;

-- used inside RLS policies
grant execute on function public.is_super(), public.tenant_role(text), public.has_role(text, text), public.my_player_id(text),
  public.in_live_session(text), public.in_poll_audience(text) to authenticated;

-- works before sign-in (renders the tenant's sign-in page)
grant execute on function public.tenant_public(text) to anon, authenticated;

grant execute on function
  public.my_access(text), public.accept_invites(), public.my_tenants(), public.tenant_snapshot(text),
  public.my_player(text), public.player_lookup(text, text), public.player_claim(text, text, text), public.player_register(text, jsonb, text),
  public.player_link_email(text, text), public.update_my_card(text, jsonb), public.buy_item(text, text),
  public.start_run(text, text), public.show_question(text, text, int), public.answer(text, text, int, text, int), public.finish_run(text, text),
  public.save_quiz(text, jsonb), public.set_quiz_status(text, text, text, boolean), public.delete_quiz(text, text),
  public.save_config(text, jsonb), public.save_brand(text, jsonb, jsonb),
  public.admin_patch_player(text, text, jsonb), public.admin_sign_out_player(text, text), public.admin_delete_player(text, text),
  public.admin_reset_run(text, text, text), public.admin_import_players(text, jsonb),
  public.save_dq(text, jsonb), public.save_roster(text, jsonb), public.save_gift(text, jsonb), public.delete_gift(text, text),
  public.purge_runs(text, bigint), public.audit_add(text, jsonb),
  public.invite_admin(text, text, text), public.set_admin_role(text, text, text), public.remove_admin(text, text),
  public.library_list(), public.import_library(text, text[]),
  public.live_create(text, text, boolean), public.live_control(text, text, text), public.live_host_view(text),
  public.live_find(text), public.live_join(text, text), public.live_player_view(text, text), public.live_answer(text, text, int, text),
  public.save_poll(text, jsonb), public.delete_poll(text, text), public.poll_control(text, jsonb), public.poll_find(text),
  public.poll_public(text), public.poll_results(text, text), public.poll_respond(text, text, jsonb), public.poll_my_responses(text),
  public.qa_vote(text, text), public.qa_moderate(text, text, jsonb),
  public.super_status(), public.super_unlock(text), public.super_lock(), public.super_change_code(text, text),
  public.super_tenants(), public.super_create_tenant(jsonb), public.super_update_tenant(text, jsonb), public.super_delete_tenant(text, text),
  public.super_admins_list(text), public.super_invite(text, text, text), public.super_audit_list(), public.super_save_library(jsonb)
to authenticated;

-- bootstrap_super_admin: deliberately NOT granted (SQL editor / service role only)
grant execute on function public.bootstrap_super_admin(text) to service_role;

-- =====================================================================
-- 13. realtime — tables whose changes drive live screens (RLS applies)
-- =====================================================================
do $$
declare tbl text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach tbl in array array['tenants', 'tenant_members', 'quizzes', 'quiz_keys', 'players', 'runs', 'gifts', 'disqualified', 'rosters',
    'audit_log', 'live_sessions', 'live_players', 'live_answers', 'polls', 'poll_pulse', 'poll_responses'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
