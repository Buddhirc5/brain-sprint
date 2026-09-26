-- =====================================================================
-- 0005 · live games carry their player count
--   The admin "Recent games" list showed "–" for finished games because the
--   count was only fetched for games still running. live_json now includes
--   'players' (people who joined). Run after 0001–0004.
-- =====================================================================
create or replace function private.live_json(s public.live_sessions) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'id', s.id, 'tenantId', s.tenant_id, 'gid', s.gid, 'title', s.title, 'pin', s.pin, 'state', s.state,
    'qIndex', s.q_index, 'qStartedAt', s.q_started_at, 'qSeconds', s.q_seconds, 'total', s.total,
    'question', s.question, 'reveal', s.reveal, 'hostId', s.host_id, 'createdAt', s.created_at,
    'endedAt', s.ended_at, 'guests', s.guests, 'music', s.music,
    'players', (select count(*) from public.live_players p where p.session_id = s.id)))
$$;
revoke all on function private.live_json(public.live_sessions) from public, anon, authenticated;
