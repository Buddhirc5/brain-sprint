-- Super admins (anyone on the super admin list, console unlocked or not) may approve their own
-- quiz changes when maker-checker is on. Everyone else still needs a second admin.

create or replace function private.is_super_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.super_admins s where s.email = private.my_email())
$$;
revoke all on function private.is_super_user() from public, anon, authenticated;

create or replace function public.my_access(p_tid text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', case when public.is_super() then 'owner' else public.tenant_role(p_tid) end,
    'isSuper', public.is_super(), 'superUser', private.is_super_user())
$$;

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
      if g.edited_by = private.actor() and not private.is_super_user() then
        perform private.err('forbidden', 'A different admin must approve your own changes.');
      end if;
      approved := private.actor();
    end if;
  end if;
  update public.quizzes set status = nxt, approved_by = approved, updated_at = private.now_ms() where tenant_id = p_tid and id = p_gid;
  perform private.log_t(p_tid, case when coalesce(p_approve, false) then 'Quiz approved' else 'Quiz status changed' end, g.title, nxt);
end $$;
