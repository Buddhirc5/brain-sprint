-- =====================================================================
-- 0017 · new question types + second chance
--   * Question types swipe (sort cards left/right), bucket (sort things into
--     2–3 buckets) and story (a case study: scenes with 2–3 replies each).
--     Swipe and bucket keep their labels in "options" and cards in "items";
--     a case study keeps its scenes in "story". The answer key holds the right
--     side / bucket per item, or for a story how good each reply is (2/1/0).
--   * These three score partially: a share of 100 points for a share right,
--     no speed bonus (stored on the answer as "f"); fully right scores as usual.
--   * Second chance: after a daily quiz, each missed question can be tried
--     once more (retry_answer). A fix is worth 50 points, and never takes a
--     question to the 100 a right first answer earns, so first-try answers
--     always count for more. Stored on the answer: rt, rc (choice), rp.
--   * Points, coins and stats re-derive from answers as before
--     (private.run_points), so leaderboards and the store include all this.
--   Mirrors src/lib/answers.ts (partialScore) and src/lib/scoring.ts
--   (partialPoints, retryPoints, runPoints). Run after 0001–0016.
-- =====================================================================

-- keep a case study's scenes when a question is cleaned for the public table
create or replace function private.clean_question(q jsonb, p_with_explain boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(q) = 'object' then q else '{}'::jsonb end) e
  where e.key in ('id', 'type', 'topic', 'q', 'options', 'left', 'right', 'items', 'seconds')
     or (e.key = 'story' and jsonb_typeof(e.value) = 'object' and length(e.value::text) <= 20000)
     or (p_with_explain and e.key = 'explain' and jsonb_typeof(e.value) = 'string')
     or (e.key = 'img' and jsonb_typeof(e.value) = 'string'
         and length(e.value #>> '{}') <= 350000
         and (e.value #>> '{}') ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$')
$$;

-- share right (0–1, two decimals) for swipe / bucket / story; null for the other types (answers.partialScore)
create or replace function private.partial_score(p_type text, p_canon text, p_choice text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare want text[]; got text[]; rows text[]; quals text[]; tot numeric := 0; n int; i int;
begin
  if p_type is null or p_type not in ('swipe', 'bucket', 'story') then return null; end if;
  if p_canon is null or p_choice is null then return 0; end if;
  got := string_to_array(p_choice, ',');
  if p_type = 'story' then
    rows := string_to_array(p_canon, ';');
    n := coalesce(array_length(rows, 1), 0);
    if n = 0 or coalesce(array_length(got, 1), 0) <> n then return 0; end if;
    for i in 1..n loop
      if got[i] !~ '^[0-9]{1,2}$' then return 0; end if;
      quals := string_to_array(rows[i], ',');
      tot := tot + coalesce(nullif(quals[got[i]::int + 1], '')::numeric, 0);
    end loop;
    return round(tot / (2 * n), 2);
  end if;
  want := string_to_array(p_canon, ',');
  n := coalesce(array_length(want, 1), 0);
  if n = 0 or coalesce(array_length(got, 1), 0) <> n then return 0; end if;
  for i in 1..n loop
    if want[i] = got[i] then tot := tot + 1; end if;
  end loop;
  return round(tot / n, 2);
end $$;

-- points a partly right answer earned (scoring.partialPoints, never a full 100)
create or replace function private.partial_pts(e jsonb) returns int
language sql immutable set search_path = '' as $$
  select case when e ? 'f' then round(100 * least(0.99, greatest(0, coalesce((e ->> 'f')::numeric, 0))))::int else 0 end
$$;

-- points a second chance added (scoring.retryPoints): up to 50, and the answer stays below 100
create or replace function private.retry_pts(e jsonb) returns int
language sql immutable set search_path = '' as $$
  select case when coalesce(e ->> 'rt', '') not in ('1', 'true') or private.ans_ok(e) then 0
    else greatest(0, least(round(coalesce((e ->> 'rp')::numeric, 0))::int, 50, greatest(0, 99 - private.partial_pts(e)))) end
$$;

-- runPoints(r).total and whether the perfect bonus applies — now with partial answers and second chances
create or replace function private.run_points(p_ans jsonb, p_status text, p_total int, out total int, out perfect boolean)
language sql immutable set search_path = '' as $$
  with a as (select e from jsonb_array_elements(coalesce(p_ans, '[]'::jsonb)) e),
  s as (
    select
      coalesce(sum(case when private.ans_ok(e) then 100
        else least(private.partial_pts(e), greatest(0, round(coalesce((e ->> 'pts')::numeric, 0))::int)) end), 0)::int as base,
      coalesce(sum(case when private.ans_ok(e) then least(50, greatest(0, coalesce((e ->> 'pts')::numeric, 0) - 100)) else 0 end), 0)::int as speed,
      coalesce(sum(private.retry_pts(e)), 0)::int as retry,
      count(*) as n,
      bool_and(private.ans_ok(e)) as all_ok
    from a
  )
  select s.base + s.speed + s.retry + case when pf then 50 else 0 end, pf
  from s, lateral (select (p_status = 'done' and p_total > 0 and s.n = p_total and coalesce(s.all_ok, false)) as pf) x
$$;

-- a play as others see it: also hide second-chance choices and partial shares when answers are hidden
create or replace function private.run_json(r public.runs, p_hide_c boolean default false, p_hide_ok boolean default false) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'gid', r.gid, 'kind', r.kind, 'attempt', r.attempt, 'startedAt', r.started_at, 'qAt', r.q_at, 'finishedAt', r.finished_at,
    'status', r.status,
    'ans', case when not p_hide_c and not p_hide_ok then r.ans else coalesce((
      select jsonb_agg(
        e || case when p_hide_c then jsonb_build_object('c', null, 'rc', null) else '{}'::jsonb end
          || case when p_hide_ok then jsonb_build_object('ok', 0, 'pts', 0, 'f', null) else '{}'::jsonb end
        order by i)
      from jsonb_array_elements(r.ans) with ordinality as a(e, i)), '[]'::jsonb) end,
    'score', r.score, 'correct', r.correct, 'total', r.total, 'blur', r.blur, 'passed', r.passed))
$$;

-- save a quiz: the three new question types are allowed (live quizzes still take only mcq / tf)
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
  if kind is null or kind not in ('sprint', 'live', 'cert') then perform private.err('invalid', 'Unknown quiz type.'); end if;
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

-- answer a question: partial scoring for swipe / bucket / story
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

-- second chance: one more try at a question missed in a finished daily quiz (no timer, no speed bonus)
create or replace function public.retry_answer(p_tid text, p_gid text, p_index int, p_choice text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.players; g public.quizzes; r public.runs; k public.quiz_keys; q jsonb; a jsonb; new_ans jsonb;
  canon text; c text; f numeric; fixed boolean;
begin
  p := private.need_me(p_tid);
  select * into g from public.quizzes where tenant_id = p_tid and id = p_gid;
  if not found then perform private.err('not_found', 'Quiz not found.'); end if;
  if g.kind = 'cert' then perform private.err('forbidden', 'Exams don''t have a second chance.'); end if;
  select * into r from public.runs where player_id = p.id and gid = p_gid order by attempt desc limit 1 for update;
  if not found or r.status <> 'done' then perform private.err('closed', 'Finish the quiz first.'); end if;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(r.ans) or p_index >= jsonb_array_length(g.questions) then
    perform private.err('invalid', 'No such question.');
  end if;
  a := r.ans -> p_index;
  q := g.questions -> p_index;
  if private.ans_ok(a) then perform private.err('conflict', 'You got this one right the first time.'); end if;
  if coalesce(a ->> 'rt', '') in ('1', 'true') then perform private.err('conflict', 'This question has had its second chance.'); end if;
  select * into k from public.quiz_keys where tenant_id = p_tid and gid = p_gid;
  canon := k.answers ->> (q ->> 'id');
  c := case when p_choice is null then null else left(p_choice, 40) end;
  f := private.partial_score(q ->> 'type', canon, c);
  fixed := case when f is null then c is not null and canon is not null and canon = c else f >= 1 end;
  a := a || jsonb_build_object('rt', 1, 'rc', c, 'rp', case when fixed then 50 else 0 end);
  new_ans := jsonb_set(r.ans, array[p_index::text], a);
  update public.runs set ans = new_ans, score = (private.run_points(new_ans, status, total)).total
  where player_id = r.player_id and run_key = r.run_key
  returning * into r;
  update public.players set updated_at = private.now_ms() where id = p.id;
  return jsonb_build_object('fixed', fixed, 'canon', canon, 'rp', private.retry_pts(a), 'run', private.own_run_json(r))
    || case when coalesce(k.explains ? (q ->> 'id'), false) then jsonb_build_object('explain', k.explains -> (q ->> 'id')) else '{}'::jsonb end;
end $$;

revoke execute on function public.retry_answer(text, text, int, text) from public, anon;
grant execute on function public.retry_answer(text, text, int, text) to authenticated;
