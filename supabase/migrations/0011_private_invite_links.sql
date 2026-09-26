-- Private invite links: a company's player link carries a random join key (#/t/<slug>/k/<KEY>).
-- When the key is required, new players can't look up, claim or register a player card without it,
-- so guessing a company address is not enough. Players already signed in keep working.
-- Admins can copy the link, turn the requirement on/off and rotate the key (old links stop working).

create table if not exists public.join_keys (
  tenant_id  text primary key references public.tenants(id) on delete cascade,
  key        text not null,
  required   boolean not null default true,
  rotated_at bigint not null default private.now_ms()
);
create table if not exists public.join_passes (
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id   uuid not null,
  at        bigint not null default private.now_ms(),
  primary key (tenant_id, user_id)
);
alter table public.join_keys enable row level security;
alter table public.join_passes enable row level security;
revoke all on public.join_keys, public.join_passes from anon, authenticated;

-- 10 characters from an unambiguous alphabet (no 0/O, 1/I/L): about 50 bits
create or replace function private.new_join_key() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(10) as b) x, generate_series(0, 9) i
$$;

-- existing companies get a key but keep open links until an admin turns the requirement on
insert into public.join_keys (tenant_id, key, required)
select t.id, private.new_join_key(), false from public.tenants t
on conflict (tenant_id) do nothing;

-- new companies: key required from day one
create or replace function private.tenant_join_key_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.join_keys (tenant_id, key, required) values (new.id, private.new_join_key(), true)
  on conflict (tenant_id) do nothing;
  return new;
end $$;
drop trigger if exists tenant_join_key on public.tenants;
create trigger tenant_join_key after insert on public.tenants for each row execute function private.tenant_join_key_trg();

create or replace function private.join_ok(p_tid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((select k.required from public.join_keys k where k.tenant_id = p_tid), false)
      or exists (select 1 from public.join_passes j where j.tenant_id = p_tid and j.user_id = auth.uid())
$$;

-- a visitor presents the key from their invite link; rate limited per user and per IP
create or replace function public.join_company(p_tid text, p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid; k public.join_keys; k_user text; k_ip text;
begin
  uid := private.need_user();
  k_user := 'join:' || p_tid || ':' || uid::text;
  k_ip := 'join-ip:' || p_tid || ':' || private.client_ip();
  perform private.rate_check(array[k_user] || case when private.client_ip() <> '' then array[k_ip] else '{}'::text[] end);
  select * into k from public.join_keys where tenant_id = p_tid;
  if not found then return true; end if;
  if upper(regexp_replace(coalesce(p_key, ''), '[^A-Za-z0-9]', '', 'g')) <> k.key then
    perform private.rate_fail(k_user);
    if private.client_ip() <> '' then perform private.rate_fail(k_ip, 50, 60000, 600000); end if;
    return false;
  end if;
  perform private.rate_ok(k_user);
  insert into public.join_passes (tenant_id, user_id) values (p_tid, uid)
  on conflict (tenant_id, user_id) do update set at = excluded.at;
  return true;
end $$;

-- admins: see the key, require it or not, rotate it
create or replace function public.join_key_get(p_tid text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.join_keys;
begin
  perform private.req(p_tid, 'admin');
  insert into public.join_keys (tenant_id, key, required) values (p_tid, private.new_join_key(), false) on conflict (tenant_id) do nothing;
  select * into k from public.join_keys where tenant_id = p_tid;
  return jsonb_build_object('key', k.key, 'required', k.required, 'rotatedAt', k.rotated_at);
end $$;

create or replace function public.join_key_set(p_tid text, p_required boolean, p_rotate boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'admin');
  perform public.join_key_get(p_tid);
  update public.join_keys set required = coalesce(p_required, required) where tenant_id = p_tid;
  if coalesce(p_rotate, false) then
    update public.join_keys set key = private.new_join_key(), rotated_at = private.now_ms() where tenant_id = p_tid;
    delete from public.join_passes where tenant_id = p_tid;
    perform private.log_t(p_tid, 'Invite link rotated', null, 'Old player invite links stop working', 'warn');
  else
    perform private.log_t(p_tid, 'Invite link setting', null, case when p_required then 'Invite link required' else 'Invite link optional' end);
  end if;
  return public.join_key_get(p_tid);
end $$;

-- company page: tell the app whether an invite link is needed (never the key itself)
create or replace function private.tenant_pub_json(t public.tenants) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'template', t.template,
    'branding', t.branding, 'labels', t.labels, 'features', c -> 'features', 'signIn', c -> 'signIn',
    'joinKeyRequired', coalesce((select k.required from public.join_keys k where k.tenant_id = t.id), false),
    'pubCfg', jsonb_build_object('branches', c -> 'branches', 'departments', c -> 'departments', 'maskIds', c -> 'maskIds',
      'lastInitialOnly', c -> 'lastInitialOnly', 'retentionDays', c -> 'retentionDays', 'requireAllowlist', c -> 'requireAllowlist'))
  from (select private.cfg_norm(t.cfg, t.template) as c) x
$$;

-- player entry points now check the invite link
create or replace function public.player_lookup(p_tid text, p_emp_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; v_emp text; p public.players; k_user text; k_ip text; nm jsonb; keys text[];
begin
  t := private.tenant_row(p_tid);
  if not private.join_ok(p_tid) then perform private.err('forbidden', 'Use the invite link from your company to join.'); end if;
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

create or replace function public.player_claim(p_tid text, p_emp_id text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; v_emp text; p public.players; uid uuid; k_user text; k_ip text; w bigint;
begin
  uid := private.need_user();
  v_emp := private.norm_emp_id(p_emp_id);
  t := private.tenant_row(p_tid);
  if not private.join_ok(p_tid) then perform private.err('forbidden', 'Use the invite link from your company to join.'); end if;
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
  if not private.join_ok(p_tid) then perform private.err('forbidden', 'Use the invite link from your company to join.'); end if;
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
      greatest(0, least(17, coalesce(trunc((p_input ->> 'look')::numeric), 0)))::int,
      now_ms, now_ms, now_ms, jsonb_build_array(jsonb_build_object('at', now_ms, 'dev', left(coalesce(p_device, ''), 60))), uid)
    returning * into p;
  exception when unique_violation then
    perform private.err('conflict', 'That Employee ID already has a player card. Sign in instead.');
  end;
  return private.player_json(p, 'own');
end $$;

revoke all on function public.join_company(text, text), public.join_key_get(text), public.join_key_set(text, boolean, boolean) from public, anon;
grant execute on function public.join_company(text, text), public.join_key_get(text), public.join_key_set(text, boolean, boolean) to authenticated;
revoke all on function private.join_ok(text), private.new_join_key(), private.tenant_join_key_trg() from public, anon, authenticated;
