-- 0008_fix_handle_new_user.sql
-- BUG KRITIS (terkonfirmasi dari Supabase Postgres logs):
--   "null value in column 'phone' of relation 'profiles' violates not-null
--    constraint" (23502) saat POST /auth/v1/admin/users (Create User via
--   Dashboard, tanpa metadata) — dan juga membuat signup app gagal.
--
-- Akar masalah: handle_new_user() membaca phone HANYA dari
-- raw_user_meta_data. User yang dibuat lewat Dashboard Supabase tidak punya
-- metadata -> phone NULL -> insert profiles gagal -> pembuatan auth user
-- gagal (500) di semua jalur.
--
-- Perbaikan (append-only, idempotent, mempertahankan fix eskalasi 0007):
--   1. search_path = public (aman dijalankan oleh koneksi GoTrue/Auth).
--   2. phone: metadata -> fallback derive dari email alias
--      {phone}@otp.agriguard.id -> '' (agar NOT NULL tidak pernah dilanggar).
--   3. full_name: metadata -> prefix email -> 'Petani'.
--   4. role: DIPAKSA 'petani' (JANGAN baca metadata — tutup eskalasi 0007).
--   5. poktan_id: dari metadata bila valid uuid, jika tidak NULL.
--   6. ON CONFLICT (id) DO NOTHING (anti double-insert).
--   7. EXCEPTION handler: catat RAISE WARNING tapi JANGAN re-throw, agar auth
--      user tetap terbuat walau profil bermasalah.
--
-- TRADE-OFF (step 7, disadari & disengaja):
--   Jika insert profil gagal (mis. phone '' bentrok UNIQUE dengan profil lain,
--   atau constraint lain), auth user tetap dibuat TANPA profil. Artinya ada
--   kondisi "auth user valid tapi belum punya profil". Aplikasi harus tahan
--   terhadap ini (login menemukan profil null -> arahkan ke onboarding),
--   dan profil dapat dibuat/disembuhkan belakangan (mis. backfill manual atau
--   pembuatan profil saat login). Tanpa trade-off ini, satu kegagalan profil
--   akan memblokir SELURUH pembuatan akun.
--
-- Idempotent: aman dijalankan berulang (create or replace + on conflict).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta_phone   text;
  v_email        text;
  v_phone        text;
  v_full_name    text;
  v_poktan_raw   text;
  v_poktan_id    uuid;
begin
  v_email := coalesce(new.email, '');
  v_meta_phone := nullif(new.raw_user_meta_data->>'phone', '');

  -- phone: metadata -> derive dari email alias {phone}@otp.agriguard.id -> ''
  v_phone := coalesce(
    v_meta_phone,
    regexp_replace(v_email, '@otp\.agriguard\.id$', ''),
    ''
  );

  -- full_name: metadata -> prefix email -> 'Petani'
  v_full_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Petani'
  );

  -- poktan_id: hanya bila metadata berisi uuid yang valid
  v_poktan_raw := nullif(new.raw_user_meta_data->>'poktan_id', '');
  if v_poktan_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_poktan_id := v_poktan_raw::uuid;
  else
    v_poktan_id := null;
  end if;

  begin
    insert into public.profiles (id, phone, full_name, role, poktan_id)
    values (
      new.id,
      v_phone,
      v_full_name,
      'petani'::public.user_role,   -- DIPAKSA: jangan baca metadata (anti eskalasi)
      v_poktan_id
    )
    on conflict (id) do nothing;

    return new;
  exception
    when others then
      -- Jangan re-throw: auth user tetap terbuat walau profil gagal.
      raise warning 'handle_new_user: gagal membuat profil untuk user % (phone=%): %',
        new.id, v_phone, sqlerrm;
      return new;
  end;
end;
$$;

-- Trigger sudah ada dari 0001; dibuat ulang agar idempotent.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
