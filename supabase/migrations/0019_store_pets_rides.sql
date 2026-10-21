-- Store: pets and rides (mirrors src/lib/catalog.ts). Backgrounds are no longer sold in the app;
-- their rows stay so anyone who bought one keeps it. Safe to run more than once.

alter table public.catalog_items drop constraint if exists catalog_items_slot_check;
alter table public.catalog_items add constraint catalog_items_slot_check check (slot in ('face', 'head', 'ears', 'bg', 'pet', 'ride', 'power'));

insert into public.catalog_items (id, slot, price, min_level, max_hold) values
  ('pet-cat', 'pet', 250, null, null),
  ('pet-bunny', 'pet', 250, null, null),
  ('pet-corgi', 'pet', 320, null, null),
  ('pet-panda', 'pet', 380, null, null),
  ('pet-owl', 'pet', 450, 4, null),
  ('pet-dragon', 'pet', 900, 8, null),
  ('ride-skate', 'ride', 200, null, null),
  ('ride-scooter', 'ride', 280, null, null),
  ('ride-bike', 'ride', 350, null, null),
  ('ride-tuktuk', 'ride', 500, 3, null),
  ('ride-hover', 'ride', 800, 6, null)
on conflict (id) do update set slot = excluded.slot, price = excluded.price, min_level = excluded.min_level, max_hold = excluded.max_hold;
