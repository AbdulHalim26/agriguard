-- 0006_seed_auth.sql
-- Fix KRITIS: akun seed (ppl/dinas/petani) dari 0002_seed.sql tidak bisa login
-- melalui alur OTP karena auth.users tidak punya baris yang cocok (id + email alias
-- + password) dengan profil ber-UUID tetap.
--
-- Alur login produksi (lib/auth/otp.ts + app/(auth)/login/page.tsx):
--   email    = {phone}@otp.agriguard.id
--   password = 'AgriGuard-' + 6 digit terakhir phone
--   provider = signInWithPassword (bukan OTP magic link)
--
-- Maka akun seed HARUS dibuat dengan:
--   - id sama dengan profil di 0002_seed.sql (FK profiles.id -> auth.users.id)
--   - email alias di atas
--   - encrypted_password = crypt('AgriGuard-{6 digit terakhir}', gen_salt('bf'))
--
-- Idempotent: upsert ke auth.users + profiles. Tidak membuat baris dobel, aman
-- dijalankan ulang.

create extension if not exists pgcrypto;

-- 1) Buat/benahi auth.users untuk 4 akun seed (id = id profil di 0002_seed.sql).
--    Jika baris sudah ada -> update password/email/meta (trigger handle_new_user
--    TIDAK menyala pada UPDATE, jadi tidak ada insert profil dobel).
--    Jika belum ada -> insert; trigger handle_new_user membuat profil baru sesuai
--    raw_user_meta_data, lalu disempurnakan di langkah 2.
with seed_users (id, phone, full_name, role, poktan_id) as (
  values
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567890', 'Budi Santoso', 'petani', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567891', 'Siti Rahayu',   'petani', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567892', 'Pak PPL Sutrisno', 'ppl',  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567893', 'Bu Dinas Lestari', 'dinas', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
)
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  is_sso_user
)
select
  u.id::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  u.phone || '@otp.agriguard.id',
  crypt('AgriGuard-' || right(u.phone, 6), gen_salt('bf')),
  now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  jsonb_build_object('phone', u.phone, 'full_name', u.full_name, 'role', u.role),
  now(),
  now(),
  u.phone,
  now(),
  false
from seed_users u
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
  phone = excluded.phone,
  phone_confirmed_at = now(),
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = jsonb_build_object(
    'phone', excluded.raw_user_meta_data->>'phone',
    'full_name', excluded.raw_user_meta_data->>'full_name',
    'role', excluded.raw_user_meta_data->>'role'
  ),
  updated_at = now();

-- 2) Pastikan profil seed selalu konsisten (role + poktan_id). Jika trigger
--    handle_new_user sudah membuat baris, ini hanya meng-update; tidak dobel.
with seed_users (id, phone, full_name, role, poktan_id) as (
  values
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567890', 'Budi Santoso', 'petani', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567891', 'Siti Rahayu',   'petani', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567892', 'Pak PPL Sutrisno', 'ppl',  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '6281234567893', 'Bu Dinas Lestari', 'dinas', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
)
insert into public.profiles (id, phone, full_name, role, poktan_id)
select
  u.id::uuid,
  u.phone,
  u.full_name,
  u.role::user_role,
  u.poktan_id::uuid
from seed_users u
on conflict (id) do update set
  phone = excluded.phone,
  full_name = excluded.full_name,
  role = excluded.role,
  poktan_id = excluded.poktan_id;

-- ===== LANGKAH VERIFIKASI =====
-- Jalankan isi file ini di Supabase SQL Editor (role: postgres/supabase_admin).
-- Setelah sukses, verifikasi manual:
--   1) Login di aplikasi dengan nomor PPL: 081234567892
--   2) Kirim OTP -> masukkan kode 123456 (Mode Demo).
--   3) Harus LANGSUNG masuk dashboard (TANPA onboarding), lalu buka /verifikasi:
--      menu Verifikasi + tab Tinggi Air tersedia (role ppl/dinas).
--   4) Ulangi untuk nomor dinas 081234567893 -> menu Verifikasi tampil.
--   5) Ulangi untuk petani 081234567890 / 081234567891 -> dashboard petani,
--      menu Verifikasi tidak tampil, data lahan/laporan Budi & Siti muncul.
-- Cek DB (opsional):
--   select u.id, u.email, p.role, p.full_name
--   from auth.users u join public.profiles p on p.id = u.id
--   where u.email like '%@otp.agriguard.id';