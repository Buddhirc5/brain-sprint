-- Phone notifications (Web Push): the devices that turned reminders on, what admins sent, and the daily reminder.
-- Safe to run more than once. Run after 0001–0022.
-- Sending happens in the "push" Edge Function (supabase/functions/push), which holds the Web Push private key.
-- Players and admins never read these tables directly: only the functions below (and the service role) can.

create table if not exists public.push_subs (
  endpoint    text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  tenant_id   text not null references public.tenants(id) on delete cascade,
  player_id   text not null references public.players(id) on delete cascade,
  p256dh      text not null check (length(p256dh) between 20 and 200),
  auth        text not null check (length(auth) between 8 and 100),
  created_at  bigint not null default private.now_ms(),
  updated_at  bigint not null default private.now_ms(),
  primary key (endpoint, tenant_id) -- a browser has one push address; it can belong to one card per company
);
create index if not exists push_subs_tenant_idx on public.push_subs (tenant_id);
create index if not exists push_subs_player_idx on public.push_subs (player_id);

create table if not exists public.push_sends (
  id         text primary key default private.new_id('ps-'),
  tenant_id  text not null references public.tenants(id) on delete cascade,
  at         bigint not null default private.now_ms(),
  actor      text not null,
  title      text not null,
  body       text not null,
  unit       text,                              -- one branch / department; null = everyone
  daily      boolean not null default false,    -- only players with a sprint or story still to play today
  auto       boolean not null default false,    -- sent by the daily schedule
  sent       int not null default 0,
  failed     int not null default 0
);
create index if not exists push_sends_tenant_idx on public.push_sends (tenant_id, at desc);

-- one scheduled reminder per company per day
create table if not exists public.push_daily (
  tenant_id  text not null references public.tenants(id) on delete cascade,
  day        text not null,
  primary key (tenant_id, day)
);

alter table public.push_subs  enable row level security;
alter table public.push_sends enable row level security;
alter table public.push_daily enable row level security;
revoke all on public.push_subs, public.push_sends, public.push_daily from anon, authenticated;

-- ---------------------------------------------------------------------
-- players: this device on / off
-- ---------------------------------------------------------------------
create or replace function public.push_subscribe(p_tid text, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare me text := public.my_player_id(p_tid);
begin
  if me is null then perform private.err('auth', 'Sign in to your player card first.'); end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    perform private.err('invalid', 'That push address isn''t valid.');
  end if;
  if coalesce(length(p_p256dh), 0) not between 20 and 200 or coalesce(length(p_auth), 0) not between 8 and 100 then
    perform private.err('invalid', 'That push key isn''t valid.');
  end if;
  insert into public.push_subs (endpoint, tenant_id, player_id, p256dh, auth)
  values (p_endpoint, p_tid, me, p_p256dh, p_auth)
  on conflict (endpoint, tenant_id) do update
    set player_id = excluded.player_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = private.now_ms();
  -- at most 5 devices per player: keep the newest
  delete from public.push_subs x
  where x.player_id = me
    and x.endpoint in (select s.endpoint from public.push_subs s where s.player_id = me order by s.updated_at desc offset 5);
end $$;

create or replace function public.push_unsubscribe(p_tid text, p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare me text := public.my_player_id(p_tid);
begin
  if me is null then return; end if;
  delete from public.push_subs where tenant_id = p_tid and endpoint = p_endpoint and player_id = me;
end $$;

-- ---------------------------------------------------------------------
-- admins: overview, and starting a send (the Edge Function calls this with the admin's sign-in)
-- ---------------------------------------------------------------------
create or replace function public.push_overview(p_tid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.req(p_tid, 'admin');
  return jsonb_build_object(
    'devices', (select count(*) from public.push_subs s join public.players p on p.id = s.player_id
                where s.tenant_id = p_tid and not p.locked),
    'players', (select count(distinct s.player_id) from public.push_subs s join public.players p on p.id = s.player_id
                where s.tenant_id = p_tid and not p.locked),
    'sends', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', x.id, 'at', x.at, 'actor', x.actor, 'title', x.title, 'body', x.body, 'unit', x.unit,
               'daily', nullif(x.daily, false), 'auto', nullif(x.auto, false), 'sent', x.sent, 'failed', x.failed)) order by x.at desc)
      from (select * from public.push_sends where tenant_id = p_tid order by at desc limit 100) x), '[]'::jsonb)
  );
end $$;

create or replace function public.push_begin(p_tid text, p_title text, p_body text, p_unit text, p_daily boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
  ti text := btrim(private.clean_text(p_title, 60));
  bo text := btrim(private.clean_text(p_body, 180));
  u text := nullif(btrim(private.clean_text(p_unit, 60)), '');
  last_at bigint;
  n int;
  sid text;
begin
  perform private.req(p_tid, 'admin');
  t := private.tenant_row(p_tid);
  if t.status <> 'active' then perform private.err('suspended', 'This company''s account is paused.'); end if;
  if ti = '' or bo = '' then perform private.err('invalid', 'Write a title and a message.'); end if;
  -- one message a minute and 20 a day per company (the daily schedule doesn't count)
  select max(x.at), count(*) filter (where x.at > private.now_ms() - 86400000) into last_at, n
  from public.push_sends x where x.tenant_id = p_tid and not x.auto;
  if last_at is not null and last_at > private.now_ms() - 60000 then
    perform private.err('rate_limited', 'One message a minute — try again shortly.', 60000 - (private.now_ms() - last_at));
  end if;
  if n >= 20 then perform private.err('rate_limited', 'That''s 20 messages today — try again tomorrow.', 3600000); end if;
  insert into public.push_sends (tenant_id, actor, title, body, unit, daily)
  values (p_tid, private.actor(), ti, bo, u, coalesce(p_daily, false))
  returning id into sid;
  perform private.log_t(p_tid, 'Notification sent', ti, coalesce(u, 'Everyone') || case when coalesce(p_daily, false) then ' · daily reminder' else '' end);
  return jsonb_build_object('id', sid, 'slug', t.slug, 'title', ti, 'body', bo, 'daily', coalesce(p_daily, false));
end $$;

-- ---------------------------------------------------------------------
-- service role only (the Edge Function): who gets a send, the results, and the daily schedule
-- ---------------------------------------------------------------------
create or replace function public.push_targets(p_send text) returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_sends x
  join public.push_subs s on s.tenant_id = x.tenant_id
  join public.players p on p.id = s.player_id and not p.locked
  where x.id = p_send
    and (x.unit is null or p.unit = x.unit)
    and (not x.daily or exists (
      select 1 from public.quizzes q
      where q.tenant_id = x.tenant_id and q.kind in ('sprint', 'story') and private.quiz_open(q)
        and not exists (select 1 from public.runs r where r.player_id = p.id and r.run_key = q.id and r.status = 'done')))
$$;

create or replace function public.push_done(p_send text, p_sent int, p_failed int, p_dead text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare tid text;
begin
  update public.push_sends set sent = greatest(0, p_sent), failed = greatest(0, p_failed) where id = p_send returning tenant_id into tid;
  -- addresses the push service says are gone (404 / 410): the app was removed or notifications turned off
  if tid is not null and p_dead is not null then
    delete from public.push_subs where tenant_id = tid and endpoint = any (p_dead);
  end if;
end $$;

-- Called hourly by the schedule: claims today's reminder for each company whose reminder hour it is now
-- (company time zone), and returns the sends to deliver.
create or replace function public.push_daily_claim() returns table (send_id text, tid text, slug text, title text, body text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t public.tenants; prod text; sid text;
begin
  for t in
    select * from public.tenants x
    where x.status = 'active'
      and coalesce((x.cfg -> 'push' ->> 'daily')::boolean, true)
      and extract(hour from (now() at time zone coalesce(x.tz, 'UTC')))::int = coalesce((x.cfg -> 'push' ->> 'hour')::int, 17)
      and exists (select 1 from public.push_subs s where s.tenant_id = x.id)
  loop
    insert into public.push_daily (tenant_id, day) values (t.id, private.today(t.id)) on conflict do nothing;
    if not found then continue; end if; -- already sent today
    prod := coalesce(nullif(btrim(t.branding ->> 'productName'), ''), 'Ant Arena');
    insert into public.push_sends (tenant_id, actor, title, body, daily, auto)
    values (t.id, 'schedule', left(prod || ': today''s sprint is ready', 60), 'Two minutes, one try. Keep your streak going 🔥', true, true)
    returning id into sid;
    send_id := sid; tid := t.id; slug := t.slug;
    title := left(prod || ': today''s sprint is ready', 60); body := 'Two minutes, one try. Keep your streak going 🔥';
    return next;
  end loop;
  delete from public.push_daily where day < to_char(now() - interval '14 days', 'YYYY-MM-DD');
end $$;

revoke all on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text, text),
  public.push_overview(text), public.push_begin(text, text, text, text, boolean),
  public.push_targets(text), public.push_done(text, int, int, text[]), public.push_daily_claim() from public, anon;
grant execute on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text, text),
  public.push_overview(text), public.push_begin(text, text, text, text, boolean) to authenticated;
revoke all on function public.push_targets(text), public.push_done(text, int, int, text[]), public.push_daily_claim() from authenticated;
grant execute on function public.push_targets(text), public.push_done(text, int, int, text[]), public.push_daily_claim() to service_role;
