-- Super admins must verify with an authenticator app (TOTP, session level aal2)
-- before the super admin code unlocks the console.

create or replace function public.super_unlock(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; f public.super_fails; h text; now_ms bigint := private.now_ms(); v_until bigint;
begin
  uid := private.need_user();
  if private.my_email() is null or not exists (select 1 from public.super_admins a where a.email = private.my_email()) then
    perform private.err('forbidden', 'This account isn''t a super admin.');
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    perform private.err('mfa_required', 'Verify with your authenticator app first.');
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
