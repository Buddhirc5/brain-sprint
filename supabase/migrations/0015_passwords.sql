-- =====================================================================
-- 0015 · passwords: change your own, super admin resets for company admins
--   * verify_my_password(): checks the caller's current password (rate
--     limited) before the app changes it with supabase.auth.updateUser().
--   * super_admin_reset_password(): a verified super admin either
--       - logs an emailed reset link (the app then sends it), or
--       - sets a temporary password for a company admin. That admin is
--         signed out everywhere and has NO admin rights until they choose
--         a new password (enforced by public.tenant_role()).
--   * pw_status() / pw_changed(): the "choose a new password" step.
--     pw_changed() only clears the flag once the password really changed.
--   Super admins can't be reset from the console (use the email link on
--   the Supabase dashboard or bootstrap a new super admin).
-- Run after 0001–0014.
-- =====================================================================

create table if not exists public.pw_must_change (
  user_id    uuid primary key,
  temp_hash  text not null,          -- auth.users.encrypted_password right after the reset
  set_by     text,
  at         bigint not null default private.now_ms()
);
alter table public.pw_must_change enable row level security;
revoke all on public.pw_must_change from anon, authenticated;

-- is the caller's current password right? (5 misses → wait, doubling)
create or replace function public.verify_my_password(p_password text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.need_user(); h text; k text;
begin
  k := 'pw:' || uid::text;
  perform private.rate_check(array[k]);
  select u.encrypted_password into h from auth.users u where u.id = uid;
  if h is null or h = '' or extensions.crypt(coalesce(p_password, ''), h) <> h then
    perform private.rate_fail(k, 5);
    return false;
  end if;
  perform private.rate_ok(k);
  return true;
end $$;

-- must the caller choose a new password before doing anything?
create or replace function public.pw_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mustChange', exists (select 1 from public.pw_must_change p where p.user_id = auth.uid()))
$$;

-- after supabase.auth.updateUser({password}): clear the flag if the password is no longer the temporary one
create or replace function public.pw_changed() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.need_user(); p public.pw_must_change; h text;
begin
  select * into p from public.pw_must_change where user_id = uid;
  if not found then return true; end if;
  select u.encrypted_password into h from auth.users u where u.id = uid;
  if h is null or h = p.temp_hash then return false; end if;
  delete from public.pw_must_change where user_id = uid;
  insert into public.super_audit (actor, action, target, sev) values (coalesce(private.my_email(), uid::text), 'Temporary password replaced', private.my_email(), 'info');
  return true;
end $$;

-- p_new = null → log an emailed reset link; otherwise set a temporary password (10+ chars, letters and numbers)
create or replace function public.super_admin_reset_password(p_tid text, p_email text, p_new text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, ''))); uid uuid; nm text; h text;
begin
  perform private.need_super();
  select t.name into nm from public.tenants t where t.id = p_tid;
  if nm is null then perform private.err('not_found', 'Company not found.'); end if;
  if not exists (select 1 from public.tenant_members m where m.tenant_id = p_tid and m.email = e) then
    perform private.err('not_found', 'That email isn''t an admin of this company.');
  end if;
  if exists (select 1 from public.super_admins s where s.email = e) then
    perform private.err('forbidden', 'Super admin passwords can''t be reset here.');
  end if;
  select u.id into uid from auth.users u where lower(u.email) = e and coalesce(u.is_anonymous, false) = false limit 1;
  if uid is null then perform private.err('not_found', 'This admin hasn''t created an account yet — they can set a password on first sign-in.'); end if;

  if p_new is null then
    perform private.log_s('Admin password reset link sent', e, nm, 'warn');
    return;
  end if;
  if length(p_new) < 10 or p_new !~ '[A-Za-z]' or p_new !~ '[0-9]' then
    perform private.err('invalid', 'Use 10+ characters with letters and numbers.');
  end if;
  h := extensions.crypt(p_new, extensions.gen_salt('bf', 10));
  update auth.users set encrypted_password = h, updated_at = now() where id = uid;
  insert into public.pw_must_change (user_id, temp_hash, set_by) values (uid, h, private.my_email())
  on conflict (user_id) do update set temp_hash = excluded.temp_hash, set_by = excluded.set_by, at = private.now_ms();
  -- sign them out everywhere (their current access token also loses admin rights: see tenant_role)
  delete from auth.sessions where user_id = uid;
  perform private.log_s('Admin temporary password set', e, nm, 'warn');
  perform private.log_t(p_tid, 'Temporary password set by super admin', e, null, 'warn');
end $$;

-- admin rights never count while a temporary password is waiting to be replaced
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
    and not exists (select 1 from public.pw_must_change p where p.user_id = auth.uid())
  order by private.role_rank(m.role) desc
  limit 1
$$;

revoke all on function public.verify_my_password(text), public.pw_status(), public.pw_changed(), public.super_admin_reset_password(text, text, text) from public, anon;
grant execute on function public.verify_my_password(text), public.pw_status(), public.pw_changed(), public.super_admin_reset_password(text, text, text) to authenticated;
