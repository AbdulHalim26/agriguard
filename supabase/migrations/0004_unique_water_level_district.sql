-- Fix M3: upsertWaterLevel() memakai onConflict: 'district' (PostgREST ON CONFLICT),
-- sehingga dibutuhkan unique index pada water_levels.district. Tanpa ini upsert
-- gagal dengan error 42P10 ("no unique or exclusion constraint matching ON CONFLICT").
create unique index if not exists water_levels_district_key on water_levels(district);
