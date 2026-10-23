-- Admins can delete a finished live game (its players, answers and key go with it via ON DELETE CASCADE).
-- Safe to run more than once. Run after 0001–0021.
create or replace function public.live_delete(p_sid text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_sid for update;
  if not found then return; end if;
  perform private.req(s.tenant_id, 'admin');
  if s.state <> 'ended' then perform private.err('conflict', 'End the game before deleting it.'); end if;
  delete from public.live_sessions where id = p_sid;
  perform private.log_t(s.tenant_id, 'Live game deleted', s.title, 'PIN ' || s.pin);
end $$;
revoke all on function public.live_delete(text) from public, anon;
grant execute on function public.live_delete(text) to authenticated;
