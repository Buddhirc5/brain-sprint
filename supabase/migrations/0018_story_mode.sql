-- Story Mode: case studies become their own quiz kind ('story'), told as comic-book episodes.
-- Untimed (an hour), no speed bonus, and a Story Mode quiz holds case studies only.
-- Scenes may now name a character design (look) and moods; clean_question keeps the story object whole.
-- Safe to run more than once.

alter table public.quizzes drop constraint if exists quizzes_kind_check;
alter table public.quizzes add constraint quizzes_kind_check check (kind in ('sprint', 'live', 'cert', 'story'));
alter table public.runs drop constraint if exists runs_kind_check;
alter table public.runs add constraint runs_kind_check check (kind in ('sprint', 'live', 'cert', 'story'));

-- limitMs: sprint clamp(minutes, 0.5, 10); cert clamp(minutes, 1, 180); story 60 — × 60 000
create or replace function private.limit_ms(p_minutes numeric, p_kind text default 'sprint') returns double precision
language sql immutable set search_path = '' as $$
  select case when p_kind = 'story' then 60
    when p_kind = 'cert' then least(180, greatest(1, case when coalesce(p_minutes, 0) = 0 then 10 else p_minutes end))
    else least(10, greatest(0.5, case when coalesce(p_minutes, 0) = 0 then 2 else p_minutes end)) end::double precision * 60000
$$;

-- save a quiz: Story Mode quizzes allowed (case studies only)
create or replace function public.save_quiz(p_tid text, p_draft jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  role text; cfg jsonb; g jsonb; ans jsonb; v_gid text; kind text; st text; qs jsonb; q jsonb; qid text;
  prev public.quizzes; prev_key public.quiz_keys; had_prev boolean; approved text; explains jsonb := '{}'::jsonb; pub jsonb := '[]'::jsonb;
  full_new jsonb := '[]'::jsonb; full_prev jsonb; answers jsonb := '{}'::jsonb; seen text[] := '{}'; now_ms bigint := private.now_ms();
  dt text; un text; mins numeric;
begin
  role := private.req(p_tid, 'editor');
  cfg := private.cfg_of(p_tid);
  g := p_draft -> 'game';
  ans := coalesce(p_draft -> 'key' -> 'answers', '{}'::jsonb);
  if jsonb_typeof(g) <> 'object' then perform private.err('invalid', 'Quiz is missing.'); end if;
  v_gid := g ->> 'id';
  if v_gid is null or v_gid !~ '^[A-Za-z0-9_.:-]{1,64}$' then perform private.err('invalid', 'Quiz id is invalid.'); end if;
  kind := g ->> 'kind';
  if kind is null or kind not in ('sprint', 'live', 'cert', 'story') then perform private.err('invalid', 'Unknown quiz type.'); end if;
  qs := case when jsonb_typeof(g -> 'questions') = 'array' then g -> 'questions' else '[]'::jsonb end;
  if jsonb_array_length(qs) > 50 then perform private.err('invalid', '50 questions at most.'); end if;
  for q in select e from jsonb_array_elements(qs) e loop
    qid := q ->> 'id';
    if qid is null or qid = '' or length(qid) > 64 or qid = any (seen) then perform private.err('invalid', 'Every question needs its own id.'); end if;
    seen := seen || qid;
    if coalesce(ans ->> qid, '') = '' then perform private.err('invalid', 'Every question needs an answer.'); end if;
    if coalesce(q ->> 'type', '') not in ('mcq', 'tf', 'match', 'order', 'swipe', 'bucket', 'story') then perform private.err('invalid', 'Unknown question type.'); end if;
    if q ->> 'type' = 'story' and (jsonb_typeof(q -> 'story') <> 'object' or length((q -> 'story')::text) > 20000) then
      perform private.err('invalid', 'A case study is missing its scenes, or is too long.');
    end if;
    if kind = 'story' and q ->> 'type' <> 'story' then
      perform private.err('invalid', 'Story Mode holds case studies only.');
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

  insert into public.quizzes as x (tenant_id, id, kind, title, descr, date, until, minutes, color, status, ord, questions, cert,
    created_at, updated_at, created_by, edited_by, approved_by)
  values (p_tid, v_gid, kind, private.clean_text(coalesce(g ->> 'title', 'Untitled quiz'), 120), nullif(private.clean_text(g ->> 'desc', 1000), ''),
    dt, un, mins,
    case when g ->> 'color' in ('lime', 'orange', 'pink', 'blue', 'blush', 'ink') then g ->> 'color' else 'lime' end,
    st, case when jsonb_typeof(g -> 'order') = 'number' then trunc((g ->> 'order')::numeric)::int end,
    pub, case when jsonb_typeof(g -> 'cert') = 'object' then g -> 'cert' end,
    case when had_prev then prev.created_at else now_ms end, now_ms,
    case when had_prev then coalesce(prev.created_by, private.actor()) else private.actor() end, private.actor(), approved)
  on conflict (tenant_id, id) do update set
    kind = excluded.kind, title = excluded.title, descr = excluded.descr, date = excluded.date, until = excluded.until,
    minutes = excluded.minutes, color = excluded.color, status = excluded.status, ord = excluded.ord, questions = excluded.questions,
    cert = excluded.cert, updated_at = excluded.updated_at, created_by = excluded.created_by, edited_by = excluded.edited_by,
    approved_by = excluded.approved_by;
  insert into public.quiz_keys (tenant_id, gid, answers, explains, updated_at) values (p_tid, v_gid, answers, explains, now_ms)
  on conflict (tenant_id, gid) do update set answers = excluded.answers, explains = excluded.explains, updated_at = excluded.updated_at;
  perform private.log_t(p_tid, case when had_prev then 'Quiz edited' else 'Quiz created' end,
    private.clean_text(coalesce(g ->> 'title', ''), 120), format('%s · %s questions · %s', kind, jsonb_array_length(qs), st));
end $$;

-- answer: Story Mode answers earn no speed bonus
create or replace function public.answer(p_tid text, p_gid text, p_index int, p_choice text, p_blur int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.players; g public.quizzes; r public.runs; k public.quiz_keys; q jsonb; canon text; c text;
  now_ms bigint := private.now_ms(); v_qat bigint; used double precision; lim double precision; left_ms double precision;
  ms double precision; ok boolean; pts int; hide boolean; nq int; f numeric;
begin
  p := private.need_me(p_tid);
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found then perform private.err('not_found', 'Quiz not found.'); end if;
  select * into r from public.runs where player_id = p.id and gid = p_gid order by attempt desc limit 1 for update;
  if not found or r.status <> 'playing' then perform private.err('closed', 'This play has finished.'); end if;
  nq := jsonb_array_length(g.questions);
  if p_index is distinct from jsonb_array_length(r.ans) or p_index >= nq then perform private.err('invalid', 'Already answered.'); end if;
  q := g.questions -> p_index;
  select * into k from public.quiz_keys where tenant_id = p_tid and gid = p_gid;
  canon := k.answers ->> (q ->> 'id');
  -- the clock runs from when the question was shown; if the client skipped show_question,
  -- it runs from the previous answer (or the start), so skipping never earns speed points
  v_qat := coalesce(r.q_at, r.last_at, r.started_at);
  select coalesce(sum((e ->> 'ms')::double precision), 0) into used from jsonb_array_elements(r.ans) e;
  lim := private.limit_ms(g.minutes, g.kind);
  left_ms := lim - used;
  ms := now_ms - v_qat;
  c := case when p_choice is null then null else left(p_choice, 40) end;
  if ms > left_ms + 1500 then c := null; end if; -- too late: the quiz clock ran out (GRACE_MS)
  ms := greatest(0, least(ms, greatest(0, left_ms)));
  -- swipe / bucket / case study score a share; the others are right or wrong
  f := private.partial_score(q ->> 'type', canon, c);
  ok := case when f is null then c is not null and canon is not null and canon = c else f >= 1 end;
  pts := case when g.kind = 'cert' then (case when ok then 1 else 0 end)
              when ok and g.kind = 'story' then 100 -- Story Mode: read at your own pace, no speed bonus
              when ok then private.answer_points(true, ms, lim / greatest(1, nq))
              when coalesce(f, 0) > 0 then round(100 * least(f, 0.99))::int
              else 0 end;
  update public.runs set
    ans = ans || jsonb_build_array(jsonb_build_object('ok', case when ok then 1 else 0 end, 'ms', ms::bigint, 'c', c, 'pts', pts)
      || case when not ok and coalesce(f, 0) > 0 and g.kind <> 'cert' then jsonb_build_object('f', f) else '{}'::jsonb end),
    q_at = null,
    last_at = now_ms,
    blur = greatest(blur, least(100000, greatest(0, coalesce(p_blur, 0)))),
    correct = correct + case when ok then 1 else 0 end
  where player_id = r.player_id and run_key = r.run_key
  returning * into r;
  update public.players set updated_at = now_ms where id = p.id;
  hide := g.kind = 'cert';
  return jsonb_build_object(
    'ok', case when hide then null else to_jsonb(ok) end,
    'canon', case when hide then null else to_jsonb(canon) end,
    'pts', case when hide then 0 else pts end,
    'run', private.own_run_json(r))
    || case when not hide and coalesce(k.explains ? (q ->> 'id'), false) then jsonb_build_object('explain', k.explains -> (q ->> 'id')) else '{}'::jsonb end;
end $$;
