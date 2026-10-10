-- Fix M3: upsertWaterLevel() memakai onConflict: 'district' sehingga PostgREST
-- membutuhkan UNIQUE CONSTRAINT pada water_levels.district.
--
-- Migration 0004 menambahkan unique INDEX water_levels_district_key; di sini
-- index tersebut dikonversi menjadi proper CONSTRAINT dengan nama yang sama.
-- Idempotent: aman dijalankan beberapa kali (dan tetap aman bila 0004 belum
-- pernah dijalankan).
do $$
begin
  -- Hapus unique index bebas (milik 0004) bila belum menjadi milik constraint,
  -- agar nama index/constraint tidak bentrok.
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'water_levels'
      and indexname = 'water_levels_district_key'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'water_levels_district_key'
      and conrelid = 'public.water_levels'::regclass
  ) then
    drop index water_levels_district_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'water_levels_district_key'
      and conrelid = 'public.water_levels'::regclass
  ) then
    alter table water_levels
      add constraint water_levels_district_key unique (district);
  end if;
end $$;