-- =====================================================================
-- 0012 · editable certificate signature & seal
--   Certification exams can carry who signs the certificate (name, job
--   title, a drawn or uploaded signature image) and a custom seal
--   (letters, wording, colour, or the company's own stamp image).
--   A trigger keeps quizzes.cert to the known fields and limits — mirrors
--   src/lib/cert.ts (images: PNG/JPEG/WebP/GIF data: URLs ≤ 120 000 chars).
-- Run after 0001–0011.
-- =====================================================================

create or replace function private.clean_cert_img(v jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'string' and length(v #>> '{}') <= 120000
                   and (v #>> '{}') ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$'
              then v end
$$;

create or replace function private.clean_cert_txt(v jsonb, n int) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'string' then to_jsonb(nullif(btrim(private.clean_text(v #>> '{}', n)), '')) end
$$;

create or replace function private.clean_cert(c jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(c) <> 'object' then null else jsonb_strip_nulls(jsonb_build_object(
    'passPct', case when jsonb_typeof(c -> 'passPct') = 'number' then to_jsonb(least(100, greatest(1, round((c ->> 'passPct')::numeric)))) end,
    'attempts', case when jsonb_typeof(c -> 'attempts') = 'number' then to_jsonb(least(5, greatest(1, round((c ->> 'attempts')::numeric)))) end,
    'certTitle', private.clean_cert_txt(c -> 'certTitle', 80),
    'validMonths', case when jsonb_typeof(c -> 'validMonths') = 'number' then to_jsonb(least(120, greatest(0, round((c ->> 'validMonths')::numeric)))) end,
    'showAnswers', case when jsonb_typeof(c -> 'showAnswers') = 'boolean' then c -> 'showAnswers' end,
    'signName', private.clean_cert_txt(c -> 'signName', 60),
    'signRole', private.clean_cert_txt(c -> 'signRole', 60),
    'signImg', private.clean_cert_img(c -> 'signImg'),
    'sealText', private.clean_cert_txt(c -> 'sealText', 4),
    'sealLabel', private.clean_cert_txt(c -> 'sealLabel', 18),
    'sealColor', case when c ->> 'sealColor' in ('ink', 'navy', 'crimson', 'forest', 'gold') then c -> 'sealColor' end,
    'sealImg', private.clean_cert_img(c -> 'sealImg')
  )) end
$$;

create or replace function private.quizzes_clean_cert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.cert := private.clean_cert(new.cert);
  return new;
end $$;

drop trigger if exists quizzes_clean_cert on public.quizzes;
create trigger quizzes_clean_cert before insert or update of cert on public.quizzes
  for each row execute function private.quizzes_clean_cert();

revoke all on function private.clean_cert_img(jsonb), private.clean_cert_txt(jsonb, int), private.clean_cert(jsonb), private.quizzes_clean_cert() from public, anon, authenticated;
