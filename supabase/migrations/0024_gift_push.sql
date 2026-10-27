-- Hall of Fame: tell the winner on their phone when an admin records their gift (once per gift).
-- Safe to run more than once. Run after 0023.
alter table public.push_sends add column if not exists player_id text;

create or replace function public.push_begin_gift(p_tid text, p_gift text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.gifts; t public.tenants; sid text := 'ps-gift-' || p_gift; ti text; bo text; u text; pl text;
begin
  perform private.req(p_tid, 'admin');
  t := private.tenant_row(p_tid);
  select * into g from public.gifts where tenant_id = p_tid and id = p_gift;
  if not found then perform private.err('not_found', 'Gift not found.'); end if;
  if exists (select 1 from public.push_sends where id = sid) then return null; end if; -- already told
  if g.winner like 'unit:%' then u := substr(g.winner, 6); else pl := g.winner; end if;
  ti := case when u is not null then left(u || ' won! 🏆', 60) else 'You won! 🏆' end;
  bo := left(g.label || ' · ' || g.period || '. Open ' || coalesce(nullif(btrim(t.branding ->> 'productName'), ''), 'Ant Arena')
        || ' to see and share your award card.', 180);
  insert into public.push_sends (id, tenant_id, actor, title, body, unit, player_id, auto)
  values (sid, p_tid, private.actor(), ti, bo, u, pl, true);
  return jsonb_build_object('id', sid, 'slug', t.slug, 'title', ti, 'body', bo, 'daily', false);
end $$;

create or replace function public.push_targets(p_send text) returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_sends x
  join public.push_subs s on s.tenant_id = x.tenant_id
  join public.players p on p.id = s.player_id and not p.locked
  where x.id = p_send
    and (x.unit is null or p.unit = x.unit)
    and (x.player_id is null or p.id = x.player_id)
    and (not x.daily or exists (
      select 1 from public.quizzes q
      where q.tenant_id = x.tenant_id and q.kind in ('sprint', 'story') and private.quiz_open(q)
        and not exists (select 1 from public.runs r where r.player_id = p.id and r.run_key = q.id and r.status = 'done')))
$$;

revoke all on function public.push_begin_gift(text, text) from public, anon;
grant execute on function public.push_begin_gift(text, text) to authenticated;
revoke all on function public.push_targets(text) from public, anon, authenticated;
grant execute on function public.push_targets(text) to service_role;
