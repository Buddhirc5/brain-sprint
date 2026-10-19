-- =====================================================================
-- 0016 · how staff are organised + joining from a live game
--   * cfg.units: 'both' (default) | 'branch' | 'dept'. A company can use
--     branches and departments, or only one of them. New players (and
--     players changing their unit) can only pick an enabled kind; existing
--     players keep theirs. Sent to the player app in pubCfg.
--   * Opening a live game with its PIN lets that person into the company
--     even when a private invite link is required: the PIN is only shown in
--     the room, changes every game, and PIN guesses are rate limited. So a
--     brand-new player can scan the QR, create their card and play.
-- Run after 0001–0015.
-- =====================================================================

-- player app: tell it which kinds of unit to offer
create or replace function private.tenant_pub_json(t public.tenants) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'template', t.template,
    'branding', t.branding, 'labels', t.labels, 'features', c -> 'features', 'signIn', c -> 'signIn',
    'joinKeyRequired', coalesce((select k.required from public.join_keys k where k.tenant_id = t.id), false),
    'pubCfg', jsonb_build_object('units', coalesce(c -> 'units', '"both"'::jsonb), 'branches', c -> 'branches', 'departments', c -> 'departments',
      'maskIds', c -> 'maskIds', 'lastInitialOnly', c -> 'lastInitialOnly', 'retentionDays', c -> 'retentionDays', 'requireAllowlist', c -> 'requireAllowlist'))
  from (select private.cfg_norm(t.cfg, t.template) as c) x
$$;

-- a player's unit kind must be enabled for the company (checked on sign-up and on a change of kind)
create or replace function private.players_unit_kind() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m text;
begin
  if tg_op = 'UPDATE' and new.unit_type is not distinct from old.unit_type then return new; end if;
  select coalesce(t.cfg ->> 'units', 'both') into m from public.tenants t where t.id = new.tenant_id;
  if (m = 'branch' and new.unit_type = 'dept') or (m = 'dept' and new.unit_type = 'branch') then
    perform private.err('invalid', 'Pick your unit from the list.');
  end if;
  return new;
end $$;

drop trigger if exists players_unit_kind on public.players;
create trigger players_unit_kind before insert or update of unit_type on public.players
  for each row execute function private.players_unit_kind();

-- settings: keep 'units' to the three known values
create or replace function public.save_config(p_tid text, p_cfg jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; c jsonb;
begin
  perform private.req(p_tid, 'admin');
  if jsonb_typeof(p_cfg) <> 'object' then perform private.err('invalid', 'Settings are missing.'); end if;
  c := p_cfg;
  if not (coalesce(c ->> 'units', 'both') in ('both', 'branch', 'dept')) then c := c - 'units'; end if;
  t := private.tenant_row(p_tid);
  update public.tenants set cfg = private.cfg_norm(c, t.template) where id = p_tid;
  perform private.log_t(p_tid, 'Settings changed', null, null, 'warn');
end $$;

-- a live game's PIN also opens the company to the person who entered it
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
  if auth.uid() is not null then
    insert into public.join_passes (tenant_id, user_id) values (s.tenant_id, auth.uid()) on conflict do nothing;
  end if;
  select t.slug into slug from public.tenants t where t.id = s.tenant_id;
  return jsonb_build_object('sessionId', s.id, 'tenantId', s.tenant_id, 'slug', slug, 'title', s.title, 'guests', s.guests);
end $$;

revoke all on function private.players_unit_kind() from public, anon, authenticated;
