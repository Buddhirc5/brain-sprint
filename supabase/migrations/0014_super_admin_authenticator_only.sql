-- =====================================================================
-- 0014 · super admin: email + password + authenticator app, no code
--   The shared "super admin code" is gone. A super admin is anyone on
--   public.super_admins who is signed in AND has verified with their
--   authenticator app in this session (JWT aal = aal2). Every RLS policy
--   and function that calls public.is_super() now uses that rule.
--   The unlock / lock / change-code functions and their tables are dropped.
-- Run after 0001–0013.
-- =====================================================================

create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.super_admins s where s.email = private.my_email())
$$;

-- on the super admin list? (the console also asks for the authenticator)
create or replace function public.super_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('isSuperUser', exists (select 1 from public.super_admins a where a.email = private.my_email()))
$$;

create or replace function private.need_super() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super() then perform private.err('forbidden', 'Verify with your authenticator app to use the super admin console.'); end if;
end $$;

-- run ONCE from the Supabase SQL editor (never callable from the app)
create or replace function public.bootstrap_super_admin(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.valid_email(e) then raise exception 'invalid: Enter a valid email.'; end if;
  insert into public.super_admins (email) values (e) on conflict do nothing;
  insert into public.super_audit (actor, action, target, sev) values ('sql-editor', 'Super admin added', e, 'warn');
  return format('%s is a super admin. Sign in at #/super with this email and your password, then set up your authenticator app.', e);
end $$;

drop function if exists public.super_unlock(text);
drop function if exists public.super_lock();
drop function if exists public.super_change_code(text, text);
drop table if exists public.super_unlocks;
drop table if exists public.super_fails;
drop table if exists public.super_secret;
