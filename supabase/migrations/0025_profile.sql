-- Profile quizzes (personality / work-style): no right answers. Each option adds weight to one or more traits;
-- the top two traits pick the profile type. Results are private: the player and the company's admins see them.
-- One try each; admins can reset. Safe to run more than once. Run after 0024.

alter table public.quizzes drop constraint if exists quizzes_kind_check;
alter table public.quizzes add constraint quizzes_kind_check check (kind in ('sprint', 'live', 'cert', 'story', 'profile'));
alter table public.quizzes add column if not exists profile jsonb; -- traits, profile types, consistency checks (public)

create table if not exists public.profile_results (
  tenant_id  text not null,
  gid        text not null,
  player_id  text not null references public.players(id) on delete cascade,
  at         bigint not null default private.now_ms(),
  choices    jsonb not null,  -- option index per question
  result     jsonb not null,  -- { pct, hits, top, type, mixed, n }
  primary key (gid, player_id),
  foreign key (tenant_id, gid) references public.quizzes (tenant_id, id) on delete cascade
);
create index if not exists profile_results_tenant_idx on public.profile_results (tenant_id, gid);
alter table public.profile_results enable row level security;
revoke all on public.profile_results from anon, authenticated;

create or replace function private.game_json(q public.quizzes, p_explains jsonb default null) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'id', q.id, 'kind', q.kind, 'title', q.title, 'desc', q.descr, 'date', q.date, 'until', q.until,
    'minutes', q.minutes, 'color', q.color, 'status', q.status, 'order', q.ord,
    'questions', case when p_explains is null then q.questions else coalesce((
      select jsonb_agg(case when p_explains ? (e ->> 'id') then e || jsonb_build_object('explain', p_explains -> (e ->> 'id')) else e end order by i)
      from jsonb_array_elements(q.questions) with ordinality as a(e, i)), '[]'::jsonb) end,
    'cert', q.cert, 'profile', q.profile, 'createdAt', q.created_at, 'updatedAt', q.updated_at,
    'createdBy', q.created_by, 'editedBy', q.edited_by, 'approvedBy', q.approved_by))
$$;

create or replace function public.save_quiz(p_tid text, p_draft jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  role text; cfg jsonb; g jsonb; ans jsonb; v_gid text; kind text; st text; qs jsonb; q jsonb; qid text;
  prev public.quizzes; prev_key public.quiz_keys; had_prev boolean; approved text; explains jsonb := '{}'::jsonb; pub jsonb := '[]'::jsonb;
  full_new jsonb := '[]'::jsonb; full_prev jsonb; answers jsonb := '{}'::jsonb; seen text[] := '{}'; now_ms bigint := private.now_ms();
  dt text; un text; mins numeric; prof jsonb;
begin
  role := private.req(p_tid, 'editor');
  cfg := private.cfg_of(p_tid);
  g := p_draft -> 'game';
  ans := coalesce(p_draft -> 'key' -> 'answers', '{}'::jsonb);
  if jsonb_typeof(g) <> 'object' then perform private.err('invalid', 'Quiz is missing.'); end if;
  v_gid := g ->> 'id';
  if v_gid is null or v_gid !~ '^[A-Za-z0-9_.:-]{1,64}$' then perform private.err('invalid', 'Quiz id is invalid.'); end if;
  kind := g ->> 'kind';
  if kind is null or kind not in ('sprint', 'live', 'cert', 'story', 'profile') then perform private.err('invalid', 'Unknown quiz type.'); end if;
  qs := case when jsonb_typeof(g -> 'questions') = 'array' then g -> 'questions' else '[]'::jsonb end;
  if jsonb_array_length(qs) > 50 then perform private.err('invalid', '50 questions at most.'); end if;
  for q in select e from jsonb_array_elements(qs) e loop
    qid := q ->> 'id';
    if qid is null or qid = '' or length(qid) > 64 or qid = any (seen) then perform private.err('invalid', 'Every question needs its own id.'); end if;
    seen := seen || qid;
    if coalesce(ans ->> qid, '') = '' then perform private.err('invalid', 'Every question needs an answer.'); end if;
    if coalesce(q ->> 'type', '') not in ('mcq', 'tf', 'match', 'order', 'swipe', 'bucket', 'story', 'pick') then perform private.err('invalid', 'Unknown question type.'); end if;
    if q ->> 'type' = 'story' and (jsonb_typeof(q -> 'story') <> 'object' or length((q -> 'story')::text) > 20000) then
      perform private.err('invalid', 'A case study is missing its scenes, or is too long.');
    end if;
    if kind = 'story' and q ->> 'type' <> 'story' then
      perform private.err('invalid', 'Story Mode holds case studies only.');
    end if;
    if (kind = 'profile') <> (q ->> 'type' = 'pick') then
      perform private.err('invalid', 'A profile quiz holds profile questions only.');
    end if;
    -- profile answers: the trait weights of each option, e.g. "0:2,3:1;1:2;2:2;4:2"
    if q ->> 'type' = 'pick' and (ans ->> qid) !~ '^[0-9:,;]{1,200}$' then
      perform private.err('invalid', 'A profile question is missing its trait weights.');
    end if;
    if kind = 'live' and q ->> 'type' not in ('mcq', 'tf') then
      perform private.err('invalid', 'Live quizzes use multiple-choice and true/false questions.');
    end if;
    pub := pub || jsonb_build_array(private.clean_question(q, false));
    full_new := full_new || jsonb_build_array(private.clean_question(q, true));
    if jsonb_typeof(q -> 'explain') = 'string' then explains := explains || jsonb_build_object(qid, left(q ->> 'explain', 2000)); end if;
    answers := answers || jsonb_build_object(qid, left(ans ->> qid, 200));
  end loop;
  st := coalesce(g ->> 'status', 'draft');
  if st not in ('draft', 'pending', 'live', 'closed') then st := 'draft'; end if;

  select * into prev from public.quizzes where tenant_id = p_tid and id = v_gid for update;
  had_prev := found;
  if had_prev then
    select * into prev_key from public.quiz_keys where tenant_id = p_tid and gid = prev.id;
    select coalesce(jsonb_agg(case when coalesce(prev_key.explains ? (e ->> 'id'), false)
      then e || jsonb_build_object('explain', prev_key.explains -> (e ->> 'id')) else e end order by i), '[]'::jsonb)
      into full_prev from jsonb_array_elements(prev.questions) with ordinality a(e, i);
  end if;
  approved := case when had_prev then prev.approved_by end;
  -- maker-checker: editors can't publish directly; any change to a live quiz (questions OR answers) goes back to pending
  if coalesce((cfg ->> 'makerChecker')::boolean, false) and st = 'live' and kind <> 'live' then
    if private.role_rank(role) < private.role_rank('admin') or not had_prev or prev.status <> 'live'
       or full_prev is distinct from full_new or coalesce(prev_key.answers, '{}'::jsonb) is distinct from answers then
      st := 'pending';
    end if;
    approved := null;
  end if;

  dt := nullif(g ->> 'date', ''); un := nullif(g ->> 'until', '');
  if dt is not null and dt !~ '^\d{4}-\d{2}-\d{2}$' then perform private.err('invalid', 'Dates look like YYYY-MM-DD.'); end if;
  if un is not null and un !~ '^\d{4}-\d{2}-\d{2}$' then perform private.err('invalid', 'Dates look like YYYY-MM-DD.'); end if;
  mins := case when jsonb_typeof(g -> 'minutes') = 'number' then (g ->> 'minutes')::numeric else 2 end;
  prof := case when kind = 'profile' and jsonb_typeof(g -> 'profile') = 'object' and length((g -> 'profile')::text) <= 40000 then g -> 'profile' end;
  if kind = 'profile' and (prof is null or jsonb_array_length(coalesce(prof -> 'traits', '[]'::jsonb)) not between 2 and 6) then
    perform private.err('invalid', 'A profile quiz needs 2–6 traits.');
  end if;

  insert into public.quizzes as x (tenant_id, id, kind, title, descr, date, until, minutes, color, status, ord, questions, cert, profile,
    created_at, updated_at, created_by, edited_by, approved_by)
  values (p_tid, v_gid, kind, private.clean_text(coalesce(g ->> 'title', 'Untitled quiz'), 120), nullif(private.clean_text(g ->> 'desc', 1000), ''),
    dt, un, mins,
    case when g ->> 'color' in ('lime', 'orange', 'pink', 'blue', 'blush', 'ink') then g ->> 'color' else 'lime' end,
    st, case when jsonb_typeof(g -> 'order') = 'number' then trunc((g ->> 'order')::numeric)::int end,
    pub, case when jsonb_typeof(g -> 'cert') = 'object' then g -> 'cert' end, prof,
    case when had_prev then prev.created_at else now_ms end, now_ms,
    case when had_prev then coalesce(prev.created_by, private.actor()) else private.actor() end, private.actor(), approved)
  on conflict (tenant_id, id) do update set
    kind = excluded.kind, title = excluded.title, descr = excluded.descr, date = excluded.date, until = excluded.until,
    minutes = excluded.minutes, color = excluded.color, status = excluded.status, ord = excluded.ord, questions = excluded.questions,
    cert = excluded.cert, profile = excluded.profile, updated_at = excluded.updated_at, created_by = excluded.created_by, edited_by = excluded.edited_by,
    approved_by = excluded.approved_by;
  insert into public.quiz_keys (tenant_id, gid, answers, explains, updated_at) values (p_tid, v_gid, answers, explains, now_ms)
  on conflict (tenant_id, gid) do update set answers = excluded.answers, explains = excluded.explains, updated_at = excluded.updated_at;
  perform private.log_t(p_tid, case when had_prev then 'Quiz edited' else 'Quiz created' end,
    private.clean_text(coalesce(g ->> 'title', ''), 120), format('%s · %s questions · %s', kind, jsonb_array_length(qs), st));
end $$;

-- The result, worked out from the hidden weights (src/lib/profile.ts computeProfile does the same).
create or replace function private.profile_compute(g public.quizzes, k public.quiz_keys, p_choices jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  nt int := jsonb_array_length(coalesce(g.profile -> 'traits', '[]'::jsonb));
  nq int := jsonb_array_length(g.questions);
  score numeric[] := array_fill(0::numeric, array[nt]); mx numeric[] := array_fill(0::numeric, array[nt]);
  qmax numeric[]; hits int[] := array_fill(0, array[nt]); dom int[] := array_fill(-1, array[nq]);
  pct int[] := array_fill(0, array[nt]); ord int[];
  opts text[]; ent text; parts text[]; t int; w numeric; c int; i int; o int; best numeric; d int; ty int := -1; a int; b int;
  chk jsonb; mixed boolean := false; x int; y int; qi int; qj int;
begin
  if nt < 2 then perform private.err('invalid', 'This profile quiz has no traits.'); end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) <> nq then perform private.err('invalid', 'Answer every question.'); end if;
  for i in 0..nq - 1 loop
    opts := string_to_array(coalesce(k.answers ->> (g.questions -> i ->> 'id'), ''), ';');
    if (p_choices ->> i) !~ '^[0-9]{1,2}$' then perform private.err('invalid', 'Answer every question.'); end if;
    c := (p_choices ->> i)::int;
    if c >= coalesce(array_length(opts, 1), 0) then perform private.err('invalid', 'Answer every question.'); end if;
    qmax := array_fill(0::numeric, array[nt]);
    for o in 1..array_length(opts, 1) loop
      best := 0; d := -1;
      foreach ent in array string_to_array(opts[o], ',') loop
        parts := string_to_array(ent, ':');
        if coalesce(array_length(parts, 1), 0) <> 2 then continue; end if;
        t := parts[1]::int; w := parts[2]::numeric;
        if t < 0 or t >= nt then continue; end if;
        qmax[t + 1] := greatest(qmax[t + 1], w);
        if o = c + 1 then
          score[t + 1] := score[t + 1] + w;
          if w > best then best := w; d := t; end if;
        end if;
      end loop;
      if o = c + 1 and d >= 0 then hits[d + 1] := hits[d + 1] + 1; dom[i + 1] := d; end if;
    end loop;
    for t in 1..nt loop mx[t] := mx[t] + qmax[t]; end loop;
  end loop;
  for t in 1..nt loop pct[t] := case when mx[t] > 0 then round(100 * score[t] / mx[t])::int else 0 end; end loop;
  select array_agg(s.n - 1 order by pct[s.n] desc, s.n) into ord from generate_series(1, nt) s(n);
  a := ord[1]; b := ord[2];
  select (e.n - 1)::int into ty from jsonb_array_elements(coalesce(g.profile -> 'types', '[]'::jsonb)) with ordinality e(v, n)
  where ((e.v ->> 'a')::int = a and (e.v ->> 'b')::int = b) or ((e.v ->> 'a')::int = b and (e.v ->> 'b')::int = a) limit 1;
  for chk in select v from jsonb_array_elements(coalesce(g.profile -> 'checks', '[]'::jsonb)) v loop
    qi := (chk -> 'q' ->> 0)::int; qj := (chk -> 'q' ->> 1)::int; x := (chk -> 't' ->> 0)::int; y := (chk -> 't' ->> 1)::int;
    if qi between 0 and nq - 1 and qj between 0 and nq - 1
       and ((dom[qi + 1] = x and dom[qj + 1] = y) or (dom[qi + 1] = y and dom[qj + 1] = x)) then mixed := true; end if;
  end loop;
  return jsonb_build_object('pct', to_jsonb(pct), 'hits', to_jsonb(hits), 'top', jsonb_build_array(a, b), 'type', coalesce(ty, -1), 'mixed', mixed, 'n', nq);
end $$;

-- A player takes a profile quiz: once (an admin can reset it).
create or replace function public.profile_submit(p_tid text, p_gid text, p_choices jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.players; g public.quizzes; k public.quiz_keys; res jsonb;
begin
  p := private.need_me(p_tid);
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found or g.kind <> 'profile' then perform private.err('not_found', 'Quiz not found.'); end if;
  if not private.quiz_open(g) then perform private.err('closed', 'This quiz isn''t open.'); end if;
  if exists (select 1 from public.profile_results where gid = p_gid and player_id = p.id) then
    perform private.err('conflict', 'You''ve already taken this one. Ask your admin if you''d like to retake it.');
  end if;
  select * into k from public.quiz_keys where tenant_id = p_tid and gid = p_gid;
  res := private.profile_compute(g, k, p_choices);
  insert into public.profile_results (tenant_id, gid, player_id, choices, result) values (p_tid, p_gid, p.id, p_choices, res);
  return res || jsonb_build_object('at', private.now_ms());
end $$;

-- The signed-in player's own results: gid → result.
create or replace function public.profile_mine(p_tid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me text := public.my_player_id(p_tid);
begin
  if me is null then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(r.gid, r.result || jsonb_build_object('at', r.at)) from public.profile_results r
                   where r.tenant_id = p_tid and r.player_id = me), '{}'::jsonb);
end $$;

-- Admins: everyone's result for one profile quiz (never the answers).
create or replace function public.profile_results(p_tid text, p_gid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'viewer');
  return coalesce((select jsonb_agg(jsonb_build_object('uid', r.player_id, 'at', r.at, 'result', r.result) order by r.at desc)
                   from public.profile_results r where r.tenant_id = p_tid and r.gid = p_gid), '[]'::jsonb);
end $$;

-- Admins: let a player take it again.
create or replace function public.profile_reset(p_tid text, p_gid text, p_uid text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'admin');
  delete from public.profile_results where tenant_id = p_tid and gid = p_gid and player_id = p_uid;
  perform private.log_t(p_tid, 'Profile reset', p_gid, p_uid);
end $$;

revoke all on function public.profile_submit(text, text, jsonb), public.profile_mine(text), public.profile_results(text, text),
  public.profile_reset(text, text, text) from public, anon;
grant execute on function public.profile_submit(text, text, jsonb), public.profile_mine(text), public.profile_results(text, text),
  public.profile_reset(text, text, text) to authenticated;
revoke all on function private.profile_compute(public.quizzes, public.quiz_keys, jsonb) from public, anon, authenticated;
