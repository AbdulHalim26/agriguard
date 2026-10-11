-- 0007_fix_signup_and_poktan_rls.sql
-- Perbaikan dari QA (blackbox + whitebox):
--
-- BUG 1 (KRITIS): pendaftaran user baru SELALU gagal dengan
--   "Database error saving new user" (HTTP 500). Trigger handle_new_user
--   (0001_init.sql) tidak menetapkan `search_path`, sehingga saat dijalankan
--   oleh koneksi GoTrue/Auth (yang search_path-nya tidak memuat `public`),
--   cast tipe `user_role` / referensi tabel gagal. Selain itu fungsi ini
--   memercayai `raw_user_meta_data->>'role'` yang DIKENDALIKAN KLIEN ->
--   eskalasi hak akses (klien bisa signUp dengan role 'dinas').
--
--   Perbaikan: set search_path + paksa role baru selalu 'petani' (roling
--   ppl/dinas hanya via seed/admin, bukan self-registration).
--
-- BUG 2 (TINGGI): RLS `poktan` aktif tanpa policy SELECT -> semua query
--   `poktan` oleh user terautentikasi mengembalikan 0 baris (default deny).
--   Dampak: (a) onboarding "Kode undangan Poktan" selalu gagal
--   ("Kode undangan tidak valid"), (b) EWS dashboard tidak menemukan
--   district poktan -> tinggi air tidak pernah terbaca.
--   Perbaikan: izinkan user terautentikasi memilih poktan.
--
-- Idempotent: aman dijalankan berulang.

-- ============================ BUG 1 =========================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'full_name',
    -- JANGAN percaya role dari klien: user baru selalu 'petani'.
    'petani'::public.user_role
  );
  return new;
end;
$$;

-- Trigger sudah ada dari 0001, tetapi dibuat ulang agar idempotent.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================ BUG 2 =========================================
-- Catatan: policy ini membuat kolom invite_code terbaca oleh semua user
-- terautentikasi. Untuk MVP (kode undangan memang dibagikan ketua Poktan)
-- ini memadai; bila ingin lebih ketat, ganti dengan RPC security-definer
-- `join_poktan(invite_code)` + `get_my_poktan()` dan cabut policy ini.
drop policy if exists "poktan_select_authenticated" on poktan;
create policy "poktan_select_authenticated" on poktan
  for select using (auth.role() = 'authenticated');

-- ============================ VERIFIKASI =====================================
-- 1) Pendaftaran: signUp user baru (mis. via aplikasi login nomor baru) harus
--    sukses; di DB `select * from public.profiles where phone = '<nomor>'`
--    menghasilkan 1 baris dengan role 'petani'.
-- 2) Onboarding: kode undangan 'DEMO01' harus ditemukan -> user masuk ke poktan.
-- 3) EWS: `select district from public.poktan where id = '<poktan_id>'`
--    sebagai user terautentikasi mengembalikan 1 baris.
-- 4) Eskalasi: signUp dengan options.data.role = 'dinas' tetap menghasilkan
--    profil ber-role 'petani'.
