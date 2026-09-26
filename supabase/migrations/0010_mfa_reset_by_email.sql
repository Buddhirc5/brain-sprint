-- Lost authenticator: an admin who opens an emailed sign-in link (magic link / email code)
-- may remove their own authenticator within 10 minutes, then set up a new one.
-- Proof of email ownership comes from the session's amr claim (set by Supabase Auth, not the browser).
-- Password-only sessions can never do this. Every reset is audited.

create or replace function public.mfa_reset_self() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  em text := private.my_email();
  ok boolean;
  m record;
begin
  if uid is null or em is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    perform private.err('auth', 'Sign in first.');
  end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email')
      and (a ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 600
  ) into ok;
  if not ok then
    perform private.err('forbidden', 'Open the reset link from your email first (it works for 10 minutes).');
  end if;

  delete from auth.mfa_factors where user_id = uid;

  for m in select distinct tenant_id from public.tenant_members where user_id = uid or email = em loop
    perform private.log_t(m.tenant_id, 'Authenticator reset', em, 'Authenticator removed with an emailed reset link', 'warn');
  end loop;
  if exists (select 1 from public.super_admins s where s.email = em) then
    perform private.log_s('Authenticator reset', em, 'Authenticator removed with an emailed reset link', 'warn');
  end if;
end $$;

revoke all on function public.mfa_reset_self() from public, anon;
grant execute on function public.mfa_reset_self() to authenticated;
