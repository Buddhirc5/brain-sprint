-- =====================================================================
-- 0013 · more live-poll slide types, slide pictures, lighter reads
--   * New slide types: guess (guess the number), points (100 points),
--     grid (2×2 grid), pin (pin on image), and content slides text / image.
--   * Any slide may carry a picture ("img"): PNG/JPEG/WebP/GIF data: URL,
--     ≤ 200 000 characters each and ≤ 1 500 000 per poll (mirrors
--     src/lib/image.ts). Pin and image slides need one.
--   * Slides are cleaned on save (known fields only).
--   * The audience only receives the current slide's picture, never the
--     answer to a "guess" slide; poll_results no longer echoes pictures.
--   * poll_counts(): people per poll for the admin list in one query.
-- Run after 0001–0012.
-- =====================================================================

create or replace function private.slide_txt(v jsonb, n int) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'string' then to_jsonb(private.clean_text(v #>> '{}', n)) end
$$;

create or replace function private.slide_num(v jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' and abs((v #>> '{}')::numeric) <= 1000000000 then v end
$$;

create or replace function private.slide_img_ok(v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(v) = 'string' and length(v #>> '{}') <= 200000
     and (v #>> '{}') ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$'
$$;

-- keep only the fields a slide may have (mirrors engine.cleanSlide)
create or replace function private.clean_slide(sl jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', left(sl ->> 'id', 64),
    'type', sl ->> 'type',
    'prompt', coalesce(private.slide_txt(sl -> 'prompt', 200), '""'::jsonb),
    'options', case when jsonb_typeof(sl -> 'options') = 'array' then
      (select coalesce(jsonb_agg(to_jsonb(private.clean_text(case when jsonb_typeof(e) = 'string' then e #>> '{}' else '' end, 80)) order by i), '[]'::jsonb)
       from jsonb_array_elements(sl -> 'options') with ordinality a(e, i) where i <= 10) end,
    'multi', case when jsonb_typeof(sl -> 'multi') = 'boolean' then sl -> 'multi' end,
    'scaleMin', private.slide_num(sl -> 'scaleMin'),
    'scaleMax', private.slide_num(sl -> 'scaleMax'),
    'scaleLabels', case when jsonb_typeof(sl -> 'scaleLabels') = 'array' then
      jsonb_build_array(coalesce(private.slide_txt(sl -> 'scaleLabels' -> 0, 30), '""'::jsonb), coalesce(private.slide_txt(sl -> 'scaleLabels' -> 1, 30), '""'::jsonb)) end,
    'maxWords', private.slide_num(sl -> 'maxWords'),
    'img', case when private.slide_img_ok(sl -> 'img') then sl -> 'img' end,
    'body', private.slide_txt(sl -> 'body', 600),
    'numMin', private.slide_num(sl -> 'numMin'),
    'numMax', private.slide_num(sl -> 'numMax'),
    'numAnswer', private.slide_num(sl -> 'numAnswer'),
    'axes', case when jsonb_typeof(sl -> 'axes') = 'array' then
      jsonb_build_array(coalesce(private.slide_txt(sl -> 'axes' -> 0, 30), '""'::jsonb), coalesce(private.slide_txt(sl -> 'axes' -> 1, 30), '""'::jsonb)) end
  ))
$$;

create or replace function public.save_poll(p_tid text, p_poll jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; pid text := p_poll ->> 'id'; prev public.polls; had boolean; v_code text; v_slides jsonb; sl jsonb; tries int := 0; nsl int; img_total int := 0;
begin
  perform private.req(p_tid, 'editor');
  cfg := private.cfg_of(p_tid);
  if not coalesce((cfg -> 'features' ->> 'polls')::boolean, false) then perform private.err('forbidden', 'Polls are turned off for this company.'); end if;
  if pid is null or pid !~ '^[A-Za-z0-9_.:-]{1,64}$' then perform private.err('invalid', 'Poll id is invalid.'); end if;
  select * into prev from public.polls where id = pid for update;
  had := found;
  if had and prev.tenant_id <> p_tid then perform private.err('forbidden', 'Not your poll.'); end if;
  v_slides := case when jsonb_typeof(p_poll -> 'slides') = 'array' then p_poll -> 'slides' else '[]'::jsonb end;
  nsl := jsonb_array_length(v_slides);
  if nsl > 30 then perform private.err('invalid', '30 slides at most.'); end if;
  for sl in select e from jsonb_array_elements(v_slides) e loop
    if jsonb_typeof(sl) <> 'object' or coalesce(sl ->> 'id', '') = ''
       or coalesce(sl ->> 'type', '') not in ('mc', 'word', 'scale', 'open', 'qa', 'rank', 'guess', 'points', 'grid', 'pin', 'text', 'image') then
      perform private.err('invalid', 'A slide is malformed.');
    end if;
    if sl ? 'img' and not private.slide_img_ok(sl -> 'img') then
      perform private.err('invalid', 'Slide pictures must be PNG, JPEG, WebP or GIF and under about 150 KB.');
    end if;
    if sl ->> 'type' in ('pin', 'image') and not (sl ? 'img') then perform private.err('invalid', 'Add a picture to every Pin on image and Image slide.'); end if;
    img_total := img_total + coalesce(length(sl ->> 'img'), 0);
  end loop;
  if img_total > 1500000 then perform private.err('invalid', 'This poll''s pictures are too big together. Remove a picture or use smaller ones.'); end if;
  v_slides := (select coalesce(jsonb_agg(private.clean_slide(e) order by i), '[]'::jsonb) from jsonb_array_elements(v_slides) with ordinality a(e, i));
  v_code := case when had then prev.code else p_poll ->> 'code' end;
  loop
    if v_code is null or v_code !~ '^\d{6}$' or exists (select 1 from public.polls x where x.code = v_code and x.id <> pid) then
      v_code := (100000 + private.rand_int(900000))::text;
      continue;
    end if;
    tries := tries + 1;
    begin
      insert into public.polls as x (id, tenant_id, title, code, slides, current, status, show_results, locked, created_at, updated_at, created_by)
      values (pid, p_tid, coalesce(nullif(private.clean_text(p_poll ->> 'title', 120), ''), 'Untitled poll'), v_code, v_slides,
        greatest(0, least(greatest(nsl - 1, 0), coalesce(case when jsonb_typeof(p_poll -> 'current') = 'number' then trunc((p_poll ->> 'current')::numeric)::int end, 0))),
        case when p_poll ->> 'status' in ('draft', 'open', 'closed') then p_poll ->> 'status' else 'draft' end,
        coalesce((p_poll ->> 'showResults')::boolean, true), coalesce((p_poll ->> 'locked')::boolean, false),
        case when had then prev.created_at else private.now_ms() end, private.now_ms(),
        case when had then prev.created_by else private.actor() end)
      on conflict (id) do update set title = excluded.title, code = excluded.code, slides = excluded.slides, current = excluded.current,
        status = excluded.status, show_results = excluded.show_results, locked = excluded.locked, updated_at = excluded.updated_at;
      exit;
    exception when unique_violation then
      if tries > 20 then perform private.err('conflict', 'Could not find a free code. Try again.'); end if;
      v_code := null;
    end;
  end loop;
  insert into public.poll_pulse (poll_id, tenant_id) values (pid, p_tid) on conflict (poll_id) do nothing;
  if not had then perform private.log_t(p_tid, 'Poll created', coalesce(nullif(private.clean_text(p_poll ->> 'title', 120), ''), 'Untitled poll')); end if;
end $$;

-- the audience gets no "guess" answers and only the current slide's picture
create or replace function private.poll_json(p public.polls, p_host boolean) returns jsonb
language sql stable set search_path = '' as $$
  select private.jclean(jsonb_build_object(
    'id', p.id, 'tenantId', p.tenant_id, 'title', p.title, 'code', p.code,
    'slides', case
      when p_host then p.slides
      when p.status = 'open' then (select coalesce(jsonb_agg(case when i - 1 = p.current then e - 'numAnswer' else e - 'numAnswer' - 'img' end order by i), '[]'::jsonb)
                                   from jsonb_array_elements(p.slides) with ordinality a(e, i))
      else '[]'::jsonb end,
    'current', p.current, 'status', p.status, 'showResults', p.show_results, 'locked', p.locked,
    'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'createdBy', case when p_host then p.created_by end))
$$;

create or replace function public.poll_results(p_poll text, p_slide text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.polls; sl jsonb; host boolean;
begin
  select * into p from public.polls where id = p_poll;
  if not found then return null; end if;
  select e into sl from jsonb_array_elements(p.slides) e where e ->> 'id' = p_slide limit 1;
  if sl is null then return null; end if;
  if sl ->> 'type' in ('text', 'image') then return null; end if;
  host := private.poll_host(p);
  if not host and not (p.status = 'open' and (p.show_results or sl ->> 'type' = 'qa')) then return null; end if;
  return jsonb_build_object('host', host, 'slide', sl - 'img' - 'numAnswer', 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'pollId', r.poll_id, 'slideId', r.slide_id,
      'who', left(md5(r.poll_id || ':' || r.who::text), 16), 'value', r.value, 'at', r.at, 'votes', r.votes,
      'hidden', r.hidden, 'answered', r.answered) order by r.at)
    from public.poll_responses r where r.poll_id = p_poll and r.slide_id = p_slide and not r.hidden), '[]'::jsonb));
end $$;

-- engine.pollValueProblem → error message or null
create or replace function private.poll_value_problem(sl jsonb, v jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := sl ->> 'type'; n int; x jsonb; lo numeric; hi numeric; txt text; cnt int; tot numeric;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return 'Empty answer'; end if;
  n := coalesce(jsonb_array_length(case when jsonb_typeof(sl -> 'options') = 'array' then sl -> 'options' end), 0);
  if t = 'mc' then
    x := v -> 'choice';
    if jsonb_typeof(x) <> 'array' or jsonb_array_length(x) = 0
       or exists (select 1 from jsonb_array_elements(x) e where not private.is_int(e) or (e::text)::numeric < 0 or (e::text)::numeric >= n)
       or (not coalesce((sl ->> 'multi')::boolean, false) and jsonb_array_length(x) > 1) then
      return 'Pick an option';
    end if;
  elsif t = 'word' then
    x := v -> 'words';
    if jsonb_typeof(x) <> 'array' then return 'Type a word'; end if;
    select count(*) into cnt from jsonb_array_elements(x) e
      where private.norm_word(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e::text end) <> '';
    if cnt = 0 or jsonb_array_length(x) > coalesce(nullif((sl ->> 'maxWords')::int, 0), 3) then return 'Type a word'; end if;
  elsif t = 'scale' then
    x := v -> 'score';
    lo := coalesce((sl ->> 'scaleMin')::int, 1); hi := coalesce((sl ->> 'scaleMax')::int, 5);
    if x is null or not private.is_int(x) or (x::text)::numeric < lo or (x::text)::numeric > hi then return 'Pick a value'; end if;
  elsif t in ('open', 'qa') then
    txt := btrim(coalesce(v ->> 'text', ''));
    if length(txt) < 2 or length(txt) > 280 then return 'Write 2–280 characters'; end if;
  elsif t = 'rank' then
    x := v -> 'order';
    if jsonb_typeof(x) <> 'array' or jsonb_array_length(x) <> n
       or (select count(distinct e) from jsonb_array_elements(x) e) <> n
       or exists (select 1 from jsonb_array_elements(x) e where not private.is_int(e) or (e::text)::numeric < 0 or (e::text)::numeric >= n) then
      return 'Rank every option';
    end if;
  elsif t = 'guess' then
    lo := case when jsonb_typeof(sl -> 'numMin') = 'number' then (sl ->> 'numMin')::numeric else 0 end;
    hi := case when jsonb_typeof(sl -> 'numMax') = 'number' then (sl ->> 'numMax')::numeric else 100 end;
    if hi <= lo then hi := lo + 1; end if;
    if jsonb_typeof(v -> 'num') <> 'number' or (v ->> 'num')::numeric < lo or (v ->> 'num')::numeric > hi then
      return format('Enter a number from %s to %s', lo, hi);
    end if;
  elsif t = 'points' then
    x := v -> 'alloc';
    if jsonb_typeof(x) <> 'array' or jsonb_array_length(x) <> n
       or exists (select 1 from jsonb_array_elements(x) e where not private.is_int(e) or (e::text)::numeric < 0 or (e::text)::numeric > 100) then
      return 'Share out your points';
    end if;
    select sum((e::text)::numeric) into tot from jsonb_array_elements(x) e;
    if tot < 1 or tot > 100 then return 'Give out 1–100 points'; end if;
  elsif t = 'grid' then
    x := v -> 'xy';
    if jsonb_typeof(x) <> 'array' or jsonb_array_length(x) <> n
       or exists (select 1 from jsonb_array_elements(x) e
                  where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
                     or exists (select 1 from jsonb_array_elements(e) c where not private.is_int(c) or (c::text)::numeric < 1 or (c::text)::numeric > 10)) then
      return 'Place every item';
    end if;
  elsif t = 'pin' then
    x := v -> 'pin';
    if jsonb_typeof(x) <> 'array' or jsonb_array_length(x) <> 2
       or exists (select 1 from jsonb_array_elements(x) e where not private.is_int(e) or (e::text)::numeric < 0 or (e::text)::numeric > 1000) then
      return 'Tap the picture to drop your pin';
    end if;
  elsif t in ('text', 'image') then
    return 'This slide doesn''t take answers';
  end if;
  return null;
end $$;

create or replace function public.poll_respond(p_poll text, p_slide text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; p public.polls; sl jsonb; bad text; clean jsonb; t text; mine int; total int;
begin
  uid := private.need_user();
  select * into p from public.polls where id = p_poll;
  if not found or p.status <> 'open' then perform private.err('closed', 'This poll is closed.'); end if;
  sl := p.slides -> p.current;
  if sl is null or sl ->> 'id' is distinct from p_slide then perform private.err('closed', 'The presenter has moved on.'); end if;
  if p.locked then perform private.err('closed', 'Voting is closed for this question.'); end if;
  bad := private.poll_value_problem(sl, p_value);
  if bad is not null then perform private.err('invalid', bad); end if;
  t := sl ->> 'type';
  clean := case
    when t in ('open', 'qa') then jsonb_build_object('text', private.clean_text(p_value ->> 'text', 280))
    when t = 'word' then jsonb_build_object('words', (select jsonb_agg(to_jsonb(private.clean_text(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e::text end, 25)) order by i)
                                                     from jsonb_array_elements(p_value -> 'words') with ordinality a(e, i)))
    when t = 'mc' then jsonb_build_object('choice', p_value -> 'choice')
    when t = 'scale' then jsonb_build_object('score', p_value -> 'score')
    when t = 'rank' then jsonb_build_object('order', p_value -> 'order')
    when t = 'guess' then jsonb_build_object('num', round((p_value ->> 'num')::numeric, 2))
    when t = 'points' then jsonb_build_object('alloc', p_value -> 'alloc')
    when t = 'grid' then jsonb_build_object('xy', p_value -> 'xy')
    when t = 'pin' then jsonb_build_object('pin', p_value -> 'pin')
  end;
  perform pg_advisory_xact_lock(hashtextextended('poll:' || p_poll || ':' || uid::text, 0));
  if t = 'qa' then
    select count(*) into mine from public.poll_responses where poll_id = p_poll and slide_id = p_slide and who = uid;
    if mine >= 5 then perform private.err('rate_limited', 'You''ve asked 5 questions already.'); end if;
  end if;
  select count(*) into total from public.poll_responses where poll_id = p_poll;
  if total >= 20000 and (t = 'qa' or not exists (select 1 from public.poll_responses where poll_id = p_poll and slide_id = p_slide and who = uid and not is_qa)) then
    perform private.err('closed', 'This poll has reached its response limit.');
  end if;
  if t = 'qa' then
    insert into public.poll_responses (id, poll_id, tenant_id, slide_id, is_qa, who, value, at, votes)
    values (private.new_id('r-'), p_poll, p.tenant_id, p_slide, true, uid, clean, private.now_ms(), 0);
  else
    insert into public.poll_responses (id, poll_id, tenant_id, slide_id, is_qa, who, value, at)
    values (private.new_id('r-'), p_poll, p.tenant_id, p_slide, false, uid, clean, private.now_ms())
    on conflict (poll_id, slide_id, who) where not is_qa do update set value = excluded.value, at = excluded.at;
  end if;
  insert into public.poll_audience (poll_id, auth_uid) values (p_poll, uid) on conflict do nothing;
  perform private.poll_bump(p_poll);
end $$;

-- people who answered anything, per poll (admin list) — one query instead of one per slide
create or replace function public.poll_counts(p_tid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'host');
  return coalesce((select jsonb_object_agg(x.poll_id, x.n) from (
    select r.poll_id, count(distinct r.who) as n from public.poll_responses r
    where r.poll_id in (select p.id from public.polls p where p.tenant_id = p_tid) group by r.poll_id) x), '{}'::jsonb);
end $$;

revoke all on function private.slide_txt(jsonb, int), private.slide_num(jsonb), private.slide_img_ok(jsonb), private.clean_slide(jsonb) from public, anon, authenticated;
revoke all on function public.poll_counts(text) from public, anon;
grant execute on function public.poll_counts(text) to authenticated;
