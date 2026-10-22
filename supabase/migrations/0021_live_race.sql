-- Live quiz "race" mode: no timer. Everyone plays every question at their own pace, sees right/wrong after
-- each answer, and the big screen shows the race. The winner has the most right answers; ties go to the
-- fastest total answering time. The game ends by itself when everyone has finished (or when the host ends it).
-- The host switches race mode on in the lobby with live_set_race (live_create keeps its signature).
-- Safe to run more than once. Run after 0001–0020.

alter table public.live_sessions add column if not exists race boolean not null default false;
alter table public.live_players add column if not exists race_q int not null default 0; -- questions answered
alter table public.live_players add column if not exists correct int not null default 0;
alter table public.live_players add column if not exists total_ms bigint not null default 0;
alter table public.live_players add column if not exists q_shown_at bigint; -- when their current question was shown
alter table public.live_players add column if not exists finished_at bigint;

-- the session as clients see it: now with 'race'
create or replace function private.live_json(s public.live_sessions) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'id', s.id, 'tenantId', s.tenant_id, 'gid', s.gid, 'title', s.title, 'pin', s.pin, 'state', s.state,
    'qIndex', s.q_index, 'qStartedAt', s.q_started_at, 'qSeconds', s.q_seconds, 'total', s.total,
    'question', s.question, 'reveal', s.reveal, 'hostId', s.host_id, 'createdAt', s.created_at,
    'endedAt', s.ended_at, 'guests', s.guests, 'music', s.music, 'race', s.race,
    'players', (select count(*) from public.live_players p where p.session_id = s.id)))
$$;
revoke all on function private.live_json(public.live_sessions) from public, anon, authenticated;

-- host: switch race mode on or off while the game is still in the lobby
create or replace function public.live_set_race(p_sid text, p_race boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_sid for update;
  if not found then perform private.err('not_found', 'Game not found.'); end if;
  perform private.req(s.tenant_id, 'host');
  if s.state <> 'lobby' then perform private.err('conflict', 'The game has already started.'); end if;
  update public.live_sessions set race = coalesce(p_race, false) where id = p_sid returning * into s;
  return private.live_json(s);
end $$;

-- board rows. Host-led games: by score, then who joined first (p_hide takes back points not yet revealed).
-- Race: most right answers, then the fastest total time, then the furthest along; rows carry the race fields.
create or replace function private.live_board(p_sid text, p_hide boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nick', x.nick, 'look', x.look, 'score', x.sc, 'streak', x.streak,
      'lastPts', coalesce(x.last_pts, 0), 'lastOk', coalesce(x.last_ok, false))
      || case when x.race then jsonb_build_object('done', x.race_q, 'correct', x.correct, 'ms', x.total_ms, 'finished', x.finished_at is not null) else '{}'::jsonb end
    order by case when x.race then x.correct else 0 end desc, case when x.race then x.total_ms else 0 end,
      case when x.race then x.race_q else 0 end desc, x.sc desc, x.joined_at), '[]'::jsonb)
  from (
    select lp.*, s.race,
      lp.score - case when p_hide and not s.race and lp.answered_q is not distinct from s.q_index then coalesce(lp.last_pts, 0) else 0 end as sc
    from public.live_players lp join public.live_sessions s on s.id = lp.session_id
    where lp.session_id = p_sid
  ) x
$$;

-- host controls: a race starts everyone on question 1 at once; there is no shared question to reveal or move on
create or replace function public.live_control(p_sid text, p_action text, p_arg text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; lk public.live_keys; q jsonb; nplayers int;
begin
  select * into s from public.live_sessions where id = p_sid for update;
  if not found then perform private.err('not_found', 'Game not found.'); end if;
  perform private.req(s.tenant_id, 'host');
  select * into lk from public.live_keys where session_id = p_sid;

  if s.race and p_action in ('start', 'reveal', 'board', 'next') then
    if p_action = 'start' and s.state = 'lobby' then
      update public.live_sessions set state = 'question', q_index = 0, q_started_at = private.now_ms(), question = null, reveal = null where id = p_sid;
      update public.live_players set q_shown_at = private.now_ms() where session_id = p_sid;
    end if;
    return;
  end if;

  if p_action in ('start', 'next') then
    if p_action = 'start' and s.state <> 'lobby' then return; end if;
    if p_action = 'next' and s.q_index + 1 >= jsonb_array_length(lk.questions) then
      update public.live_sessions set state = 'ended', ended_at = private.now_ms(), question = null where id = p_sid;
      return;
    end if;
    -- open question #i (start → 0, next → i + 1)
    q := lk.questions -> (case when p_action = 'start' then 0 else s.q_index + 1 end);
    update public.live_sessions set
      q_index = case when p_action = 'start' then 0 else s.q_index + 1 end,
      state = 'question',
      q_started_at = private.now_ms(),
      q_seconds = greatest(5, least(120, coalesce(nullif(case when jsonb_typeof(q -> 'seconds') = 'number' then trunc((q ->> 'seconds')::numeric)::int end, 0), 20))),
      question = q - 'explain',
      reveal = null
    where id = p_sid;
  elsif p_action = 'reveal' then
    if s.state <> 'question' then return; end if;
    q := lk.questions -> s.q_index;
    perform private.live_settle(p_sid);
    update public.live_sessions set state = 'reveal',
      reveal = private.jclean(jsonb_build_object('canon', coalesce(lk.canon ->> s.q_index, ''), 'counts', private.live_counts(p_sid, q, s.q_index),
        'explain', q -> 'explain'))
    where id = p_sid;
  elsif p_action = 'board' then
    if s.state = 'question' then perform private.live_settle(p_sid); end if;
    update public.live_sessions set state = 'board' where id = p_sid;
  elsif p_action = 'end' then
    update public.live_sessions set state = 'ended', ended_at = private.now_ms(), question = null where id = p_sid;
    select count(*) into nplayers from public.live_players where session_id = p_sid;
    perform private.log_t(s.tenant_id, 'Live game ended', s.title, format('%s players', nplayers));
  elsif p_action = 'kick' then
    if p_arg is not null then delete from public.live_players where session_id = p_sid and id = p_arg; end if;
  else
    perform private.err('invalid', 'Unknown action.');
  end if;
end $$;

-- the watchLivePlayer payload: results stay hidden until the host reveals. In a race it also carries the
-- player's own next question (no answer), their progress, the last answer's result and the top of the race.
create or replace function public.live_player_view(p_sid text, p_lpid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions; lp public.live_players; lk public.live_keys; la public.live_answers; board jsonb; rank int := 0;
  answered boolean; revealed boolean; me jsonb; ahead jsonb; race jsonb;
begin
  perform private.need_user();
  select * into s from public.live_sessions where id = p_sid;
  if not found then perform private.err('not_found', 'Game not found.'); end if;
  select * into lp from public.live_players where id = p_lpid and session_id = p_sid;
  if found and lp.auth_uid <> auth.uid() then perform private.err('forbidden', 'Not your player.'); end if;
  revealed := s.state in ('reveal', 'board', 'ended');
  board := private.live_board(p_sid, not revealed);
  if lp.id is not null then
    select b.i::int into rank from jsonb_array_elements(board) with ordinality b(e, i) where b.e ->> 'id' = lp.id;
  end if;
  answered := lp.id is not null and lp.answered_q is not distinct from s.q_index;
  -- the player directly above you, once scores are public
  if revealed and coalesce(rank, 0) > 1 then
    ahead := jsonb_build_object('nick', board -> (rank - 2) ->> 'nick', 'score', (board -> (rank - 2) -> 'score'));
  end if;
  if lp.id is not null then
    me := private.jclean(jsonb_build_object('id', lp.id, 'sessionId', p_sid, 'playerId', lp.player_id, 'nick', lp.nick, 'look', lp.look,
      'score', case when revealed then lp.score else lp.score - case when answered then coalesce(lp.last_pts, 0) else 0 end end,
      'streak', lp.streak, 'joinedAt', lp.joined_at,
      'lastPts', case when revealed then lp.last_pts end, 'lastOk', case when revealed then lp.last_ok end));
  end if;
  if s.race and lp.id is not null then
    select * into lk from public.live_keys where session_id = p_sid;
    select * into la from public.live_answers where live_player_id = lp.id and q_index = lp.race_q - 1;
    race := private.jclean(jsonb_build_object(
      'q', case when s.state = 'question' and lp.race_q < jsonb_array_length(lk.questions) then (lk.questions -> lp.race_q) - 'explain' end,
      'index', lp.race_q, 'done', lp.race_q, 'correct', lp.correct, 'ms', lp.total_ms, 'finished', lp.finished_at is not null,
      'last', case when la.live_player_id is not null then private.jclean(jsonb_build_object('qIndex', la.q_index, 'ok', la.ok,
        'canon', coalesce(lk.canon ->> la.q_index, ''), 'c', la.c, 'explain', lk.questions -> la.q_index -> 'explain')) end,
      'board', coalesce((select jsonb_agg(b.e order by b.i) from jsonb_array_elements(board) with ordinality b(e, i) where b.i <= 5), '[]'::jsonb)));
  end if;
  return jsonb_build_object('session', private.live_json(s), 'me', me, 'rank', coalesce(rank, 0), 'count', jsonb_array_length(board),
    'answered', answered, 'lastOk', case when revealed and lp.id is not null then coalesce(lp.last_ok, false) end,
    'ahead', ahead, 'race', race, 'serverNow', private.now_ms());
end $$;

-- a race answer: the player's own next question, no time limit; the answering time is kept for tie-breaks
create or replace function private.live_race_answer(p_sid text, p_lpid text, p_qindex int, p_choice text, p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; lp public.live_players; lk public.live_keys; q jsonb; c text; ms bigint; now_ms bigint := private.now_ms();
  ok boolean; pts int; nq int; n int;
begin
  select * into s from public.live_sessions where id = p_sid for update;
  if not found or s.state <> 'question' then perform private.err('closed', 'This game isn''t running.'); end if;
  select * into lp from public.live_players where id = p_lpid and session_id = p_sid for update;
  if not found or lp.auth_uid <> p_uid then perform private.err('forbidden', 'Not your player.'); end if;
  select * into lk from public.live_keys where session_id = p_sid;
  nq := jsonb_array_length(lk.questions);
  if p_qindex is distinct from lp.race_q or lp.race_q >= nq then perform private.err('conflict', 'Already answered.'); end if;
  q := lk.questions -> p_qindex;
  c := left(coalesce(p_choice, ''), 4);
  if (q ->> 'type' = 'tf' and c not in ('T', 'F'))
     or (q ->> 'type' <> 'tf' and not (c ~ '^\d{1,3}$' and c::int < coalesce(jsonb_array_length(case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' end), 0))) then
    perform private.err('invalid', 'Pick an answer.');
  end if;
  -- from when this question was shown (a late joiner's clock starts when they joined); capped at 10 minutes
  ms := least(600000, greatest(0, now_ms - coalesce(lp.q_shown_at, greatest(s.q_started_at, lp.joined_at))));
  ok := (lk.canon ->> p_qindex) is not null and (lk.canon ->> p_qindex) = c;
  -- points stay for the record (500–1000 against a 30 s yardstick, plus the streak); the race is ranked on right answers, then time
  pts := private.live_points(ok, least(ms, 30000), 30000, lp.streak);
  update public.live_players set race_q = race_q + 1, correct = correct + case when ok then 1 else 0 end,
    total_ms = total_ms + ms, q_shown_at = now_ms,
    streak = case when ok then streak + 1 else 0 end, score = score + pts, last_pts = pts, last_ok = ok,
    finished_at = case when race_q + 1 >= nq then now_ms end
  where id = p_lpid;
  insert into public.live_answers (session_id, tenant_id, live_player_id, q_index, c, ms, ok, pts)
  values (p_sid, s.tenant_id, p_lpid, p_qindex, c, ms, ok, pts);
  -- everyone's across the line: the race is over
  if not exists (select 1 from public.live_players where session_id = p_sid and finished_at is null) then
    update public.live_sessions set state = 'ended', ended_at = now_ms, question = null where id = p_sid;
    select count(*) into n from public.live_players where session_id = p_sid;
    perform private.log_t(s.tenant_id, 'Live game ended', s.title, format('%s players · race finished', n));
  end if;
end $$;
revoke all on function private.live_race_answer(text, text, int, text, uuid) from public, anon, authenticated;

create or replace function public.live_answer(p_sid text, p_lpid text, p_qindex int, p_choice text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; s public.live_sessions; lp public.live_players; lk public.live_keys; q jsonb; c text; ms bigint; lim bigint; ok boolean; pts int;
begin
  uid := private.need_user();
  select * into s from public.live_sessions where id = p_sid;
  if found and s.race then
    perform private.live_race_answer(p_sid, p_lpid, p_qindex, p_choice, uid);
    return;
  end if;
  if not found or s.state <> 'question' or s.q_index is distinct from p_qindex then perform private.err('closed', 'Too late — this question has closed.'); end if;
  select * into lp from public.live_players where id = p_lpid and session_id = p_sid for update;
  if not found or lp.auth_uid <> uid then perform private.err('forbidden', 'Not your player.'); end if;
  if lp.answered_q is not distinct from p_qindex then perform private.err('conflict', 'Already answered.'); end if;
  ms := private.now_ms() - s.q_started_at;
  lim := s.q_seconds::bigint * 1000;
  if ms > lim + 1500 then perform private.err('closed', 'Time''s up.'); end if;
  select * into lk from public.live_keys where session_id = p_sid;
  q := lk.questions -> p_qindex;
  c := left(coalesce(p_choice, ''), 4);
  if (q ->> 'type' = 'tf' and c not in ('T', 'F'))
     or (q ->> 'type' <> 'tf' and not (c ~ '^\d{1,3}$' and c::int < coalesce(jsonb_array_length(case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' end), 0))) then
    perform private.err('invalid', 'Pick an answer.');
  end if;
  ok := (lk.canon ->> p_qindex) is not null and (lk.canon ->> p_qindex) = c;
  pts := private.live_points(ok, least(ms, lim), lim, lp.streak);
  update public.live_players set answered_q = p_qindex, streak = case when ok then streak + 1 else 0 end,
    score = score + pts, last_pts = pts, last_ok = ok
  where id = p_lpid;
  insert into public.live_answers (session_id, tenant_id, live_player_id, q_index, c, ms, ok, pts)
  values (p_sid, s.tenant_id, p_lpid, p_qindex, c, greatest(0, ms), ok, pts);
end $$;

-- 0020's helper, kept off the public API like the other private functions
revoke all on function private.untimed(numeric, text) from public, anon, authenticated;

grant execute on function public.live_set_race(text, boolean) to authenticated;
