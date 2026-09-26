-- =====================================================================
-- 0004 · question images + Knowledge World flag
--   * Questions may carry an optional picture ("img"): a data: URL that the
--     admin portal resizes and compresses in the browser. Only PNG, JPEG,
--     WebP and GIF are kept, up to 350 000 characters (~250 KB) each
--     (mirrors src/lib/image.ts). Anything else is dropped on save.
--   * features.world (Knowledge World, a 3D mini game) needs no server
--     support: it lives in cfg.features and defaults to off in the client.
-- Run after 0001–0003.
-- =====================================================================

create or replace function private.clean_question(q jsonb, p_with_explain boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(q) = 'object' then q else '{}'::jsonb end) e
  where e.key in ('id', 'type', 'topic', 'q', 'options', 'left', 'right', 'items', 'seconds')
     or (p_with_explain and e.key = 'explain' and jsonb_typeof(e.value) = 'string')
     or (e.key = 'img' and jsonb_typeof(e.value) = 'string'
         and length(e.value #>> '{}') <= 350000
         and (e.value #>> '{}') ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$')
$$;
