-- Sprints can switch the timer off: minutes = 0 means "no time limit".
-- An untimed sprint gets an hour (like Story Mode) and its right answers earn no speed bonus.
-- Safe to run more than once.

-- untimed: Story Mode, or a sprint saved with 0 minutes (mirrors untimed() in src/lib/scoring.ts)
create or replace function private.untimed(p_minutes numeric, p_kind text default 'sprint') returns boolean
language sql immutable set search_path = '' as $$
  select p_kind = 'story' or (coalesce(p_kind, 'sprint') = 'sprint' and coalesce(p_minutes, 2) = 0)
$$;

-- limitMs: untimed 60; sprint clamp(minutes, 0.5, 10); cert clamp(minutes, 1, 180) — × 60 000
create or replace function private.limit_ms(p_minutes numeric, p_kind text default 'sprint') returns double precision
language sql immutable set search_path = '' as $$
  select case when private.untimed(p_minutes, p_kind) then 60
    when p_kind = 'cert' then least(180, greatest(1, case when coalesce(p_minutes, 0) = 0 then 10 else p_minutes end))
    else least(10, greatest(0.5, coalesce(p_minutes, 2))) end::double precision * 60000
$$;

-- answer: untimed answers (Story Mode, sprints without a timer) earn no speed bonus
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
              when ok and private.untimed(g.minutes, g.kind) then 100 -- Story Mode or a sprint without a timer: own pace, no speed bonus
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

