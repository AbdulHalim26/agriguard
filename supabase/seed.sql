-- Seed data for demo (per §11)
-- 1 poktan: "Poktan Sukamaju — Karawang" (invite_code: DEMO01)
-- Akun: 2 petani, 1 ppl, 1 dinas (login via OTP mock 123456)
-- 5 lahan dengan polygon koordinat asli sekitar Karawang
-- 10 damage_reports: variasi status AI, verified & belum verified
-- water_levels: 2 entri district terkini

-- Insert poktan
insert into poktan (id, name, village, district, invite_code)
values (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Poktan Sukamaju — Karawang',
  'Sukamaju',
  'Telukjambe Timur',
  'DEMO01'
);

-- Note: Auth users will be created via Supabase Auth with email alias {phone}@otp.agriguard.id
-- Profiles will be created automatically via handle_new_user trigger
-- We'll insert profiles manually here for demo (assuming auth users exist)

-- Petani 1: 081234567890 -> 6281234567890@otp.agriguard.id
insert into profiles (id, phone, full_name, role, poktan_id)
values (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  '6281234567890',
  'Budi Santoso',
  'petani',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
);

-- Petani 2: 081234567891 -> 6281234567891@otp.agriguard.id
insert into profiles (id, phone, full_name, role, poktan_id)
values (
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  '6281234567891',
  'Siti Rahayu',
  'petani',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
);

-- PPL: 081234567892 -> 6281234567892@otp.agriguard.id
insert into profiles (id, phone, full_name, role, poktan_id)
values (
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  '6281234567892',
  'Pak PPL Sutrisno',
  'ppl',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
);

-- Dinas: 081234567893 -> 6281234567893@otp.agriguard.id
insert into profiles (id, phone, full_name, role, poktan_id)
values (
  'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  '6281234567893',
  'Bu Dinas Lestari',
  'dinas',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
);

-- 5 lahan dengan polygon koordinat Karawang (Telukjambe area)
-- Lahan 1: Budi Santoso
insert into lahan (id, poktan_id, owner_id, name, area_hectares, polygon)
values (
  'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Sawah Budi Blok A',
  0.75,
  '[[107.285,-6.312],[107.286,-6.312],[107.286,-6.313],[107.285,-6.313],[107.285,-6.312]]'::jsonb
);

-- Lahan 2: Budi Santoso
insert into lahan (id, poktan_id, owner_id, name, area_hectares, polygon)
values (
  'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Sawah Budi Blok B',
  0.50,
  '[[107.287,-6.311],[107.288,-6.311],[107.288,-6.312],[107.287,-6.312],[107.287,-6.311]]'::jsonb
);

-- Lahan 3: Siti Rahayu
insert into lahan (id, poktan_id, owner_id, name, area_hectares, polygon)
values (
  'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Sawah Siti Blok 1',
  1.00,
  '[[107.283,-6.314],[107.284,-6.314],[107.284,-6.315],[107.283,-6.315],[107.283,-6.314]]'::jsonb
);

-- Lahan 4: Siti Rahayu
insert into lahan (id, poktan_id, owner_id, name, area_hectares, polygon)
values (
  'f3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Sawah Siti Blok 2',
  0.60,
  '[[107.289,-6.310],[107.290,-6.310],[107.290,-6.311],[107.289,-6.311],[107.289,-6.310]]'::jsonb
);

-- Lahan 5: Shared/Other petani in same poktan
insert into lahan (id, poktan_id, owner_id, name, area_hectares, polygon)
values (
  'f4eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Sawah Bersama',
  1.20,
  '[[107.281,-6.316],[107.282,-6.316],[107.282,-6.317],[107.281,-6.317],[107.281,-6.316]]'::jsonb
);

-- 10 damage_reports with varied AI status, verification states
-- Report 1: Budi, Lahan 1, aman, verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified, verified_by, verified_at, verification_note)
values (
  '10eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report1_1.jpg'],
  'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  'aman',
  0.92,
  5.0,
  -6.3125,
  107.2855,
  now() - interval '5 days',
  '11111111-1111-1111-1111-111111111111',
  true,
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  now() - interval '4 days',
  'Tervalidasi: kondisi aman, tidak ada kerusakan banjir.'
);

-- Report 2: Budi, Lahan 1, rusak_ringan, verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified, verified_by, verified_at, verification_note)
values (
  '11eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report2_1.jpg'],
  'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567',
  'rusak_ringan',
  0.78,
  25.0,
  -6.3124,
  107.2856,
  now() - interval '4 days',
  '22222222-2222-2222-2222-222222222222',
  true,
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  now() - interval '3 days',
  'Tervalidasi: kerusakan ringan pada batang padi muda.'
);

-- Report 3: Budi, Lahan 2, rusak_berat, verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified, verified_by, verified_at, verification_note)
values (
  '12eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report3_1.jpg'],
  'c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
  'rusak_berat',
  0.88,
  75.0,
  -6.3115,
  107.2875,
  now() - interval '3 days',
  '33333333-3333-3333-3333-333333333333',
  true,
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  now() - interval '2 days',
  'Tervalidasi: kerusakan berat, padi tenggelam total.'
);

-- Report 4: Budi, Lahan 2, aman, not verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified)
values (
  '13eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report4_1.jpg'],
  'd4e5f6789012345678901234567890abcdef1234567890abcdef1234567890',
  'aman',
  0.85,
  3.0,
  -6.3116,
  107.2874,
  now() - interval '2 days',
  '44444444-4444-4444-4444-444444444444',
  false
);

-- Report 5: Budi, Lahan 5, rusak_ringan, not verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified)
values (
  '14eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f4eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report5_1.jpg'],
  'e5f6789012345678901234567890abcdef1234567890abcdef123456789012',
  'rusak_ringan',
  0.72,
  30.0,
  -6.3165,
  107.2815,
  now() - interval '1 day',
  '55555555-5555-5555-5555-555555555555',
  false
);

-- Report 6: Siti, Lahan 3, aman, verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified, verified_by, verified_at, verification_note)
values (
  '15eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report6_1.jpg'],
  'f6789012345678901234567890abcdef1234567890abcdef12345678901234',
  'aman',
  0.95,
  2.0,
  -6.3145,
  107.2835,
  now() - interval '5 days',
  '66666666-6666-6666-6666-666666666666',
  true,
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  now() - interval '4 days',
  'Tervalidasi: tanaman sehat, drainase lancar.'
);

-- Report 7: Siti, Lahan 3, rusak_berat, not verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified)
values (
  '16eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report7_1.jpg'],
  '789012345678901234567890abcdef1234567890abcdef1234567890123456',
  'rusak_berat',
  0.91,
  82.0,
  -6.3146,
  107.2834,
  now() - interval '2 days',
  '77777777-7777-7777-7777-777777777777',
  false
);

-- Report 8: Siti, Lahan 4, rusak_ringan, verified
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified, verified_by, verified_at, verification_note)
values (
  '17eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report8_1.jpg'],
  '89012345678901234567890abcdef1234567890abcdef12345678901234567',
  'rusak_ringan',
  0.68,
  22.0,
  -6.3105,
  107.2895,
  now() - interval '3 days',
  '88888888-8888-8888-8888-888888888888',
  true,
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  now() - interval '2 days',
  'Tervalidasi: ada genangan tapi tanaman bisa pulih.'
);

-- Report 9: Siti, Lahan 4, aman, not verified (recent)
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified)
values (
  '18eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report9_1.jpg'],
  '9012345678901234567890abcdef1234567890abcdef123456789012345678',
  'aman',
  0.89,
  8.0,
  -6.3104,
  107.2896,
  now() - interval '6 hours',
  '99999999-9999-9999-9999-999999999999',
  false
);

-- Report 10: Siti, Lahan 5, rusak_berat, not verified (recent)
insert into damage_reports (id, user_id, lahan_id, photo_paths, photo_hash, ai_status, ai_confidence, ai_damage_pct, latitude, longitude, client_created_at, idempotency_key, is_verified)
values (
  '19eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'f4eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  ARRAY['photos/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/report10_1.jpg'],
  '012345678901234567890abcdef1234567890abcdef1234567890123456789',
  'rusak_berat',
  0.84,
  68.0,
  -6.3164,
  107.2816,
  now() - interval '2 hours',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  false
);

-- water_levels: 2 entri district terkini
insert into water_levels (id, district, river_level_m, updated_by, updated_at)
values (
  '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Telukjambe Timur',
  1.15,
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  now() - interval '2 hours'
);

insert into water_levels (id, district, river_level_m, updated_by, updated_at)
values (
  '21eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Telukjambe Barat',
  0.95,
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  now() - interval '3 hours'
);

-- audit_logs sample
insert into audit_logs (actor_id, action, entity, entity_id, meta)
values
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'verify_report', 'damage_reports', '10eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{"is_verified": true, "note": "Tervalidasi: kondisi aman"}'::jsonb),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'verify_report', 'damage_reports', '11eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{"is_verified": true, "note": "Tervalidasi: kerusakan ringan"}'::jsonb),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'verify_report', 'damage_reports', '12eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{"is_verified": true, "note": "Tervalidasi: kerusakan berat"}'::jsonb),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'verify_report', 'damage_reports', '15eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{"is_verified": true, "note": "Tervalidasi: tanaman sehat"}'::jsonb),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'verify_report', 'damage_reports', '17eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{"is_verified": true, "note": "Tervalidasi: genangan tapi pulih"}'::jsonb),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'update_water_level', 'water_levels', '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{"river_level_m": 1.15}'::jsonb);