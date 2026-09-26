-- Two special player characters (Wren the explorer and Puff the bunny) use looks 16 and 17.
-- Same functions as in 0003, with the allowed look range raised from 0–15 to 0–17.
-- update_my_card also lets a player keep their current branch/department if an admin later removed it from the list.

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
      greatest(0, least(17, coalesce(trunc((p_input ->> 'look')::numeric), 0)))::int,
      now_ms, now_ms, now_ms, jsonb_build_array(jsonb_build_object('at', now_ms, 'dev', left(coalesce(p_device, ''), 60))), uid)
    returning * into p;
  exception when unique_violation then
    perform private.err('conflict', 'That Employee ID already has a player card. Sign in instead.');
  end;
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
    p.look := greatest(0, least(17, trunc((p_patch ->> 'look')::numeric)))::int;
  end if;
  if coalesce(p_patch ->> 'unit', '') <> '' and coalesce(p_patch ->> 'unitType', '') <> '' then
    ut := p_patch ->> 'unitType';
    if ut not in ('branch', 'dept') or (not (p.unit = (p_patch ->> 'unit') and p.unit_type = ut)
        and not ((case when ut = 'dept' then cfg -> 'departments' else cfg -> 'branches' end) ? (p_patch ->> 'unit'))) then
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
