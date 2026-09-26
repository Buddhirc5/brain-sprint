-- Rename the product from "Brain Sprint" to "Ant Arena".
-- 1. New companies get "Ant Arena" as their default product name.
-- 2. Saving branding with an empty product name falls back to "Ant Arena".
-- 3. Companies still using the old default name are renamed (companies with their own name are untouched).

create or replace function private.default_branding() returns jsonb
language sql immutable set search_path = '' as $$
  select '{"productName":"Ant Arena","tagline":"Daily quizzes, live games and polls for your team","primary":"#C6F432","accent":"#FF5A1F","ink":"#161512","paper":"#F4F3EE"}'::jsonb
$$;

create or replace function public.save_brand(p_tid text, p_branding jsonb, p_labels jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; logo text := p_branding ->> 'logo';
begin
  if logo is not null and length(logo) > 200000 then perform private.err('invalid', 'Logo is too large (150 KB max).'); end if;
  if logo is not null and logo !~ '^data:image/(png|jpeg|svg\+xml|webp);' then perform private.err('invalid', 'Logo must be PNG, JPEG, SVG or WebP.'); end if;
  perform private.req(p_tid, 'admin');
  t := private.tenant_row(p_tid);
  update public.tenants set
    branding = private.default_branding() || coalesce(case when jsonb_typeof(p_branding) = 'object' then p_branding end, '{}'::jsonb)
      || jsonb_build_object('productName', coalesce(nullif(private.clean_text(p_branding ->> 'productName', 40), ''), 'Ant Arena')),
    labels = private.template_labels(t.template) || coalesce(case when jsonb_typeof(p_labels) = 'object' then p_labels end, '{}'::jsonb)
  where id = p_tid;
  perform private.log_t(p_tid, 'Branding changed');
end $$;

update public.tenants
   set branding = jsonb_set(branding, '{productName}', '"Ant Arena"')
 where branding ->> 'productName' = 'Brain Sprint';
