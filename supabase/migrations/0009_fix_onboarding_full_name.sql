-- 0009_fix_onboarding_full_name.sql
-- Perbaikan atas deviasi di 0008:
--   0008 memakai `nullif(new.raw_user_meta_data->>'full_name','')`, sehingga
--   ketika app signup mengirim full_name = '' (string kosong), nilai itu
--   berubah menjadi NULL lalu jatuh ke `split_part(email,'@',1)` = nomor phone.
--   Akibatnya profil baru selalu punya full_name yang "truthy" dan
--   middleware/login MEN-SKIP onboarding (padahal FR-00 mengharapkan
--   user baru -> onboarding).
--
-- Sesuai spesifikasi: full_name = coalesce(metadata->>'full_name',
--   split_part(email,'@',1), 'Petani'). Karena '' BUKAN null, coalesce
--   mengembalikan '' -> profil dianggap belum lengkap -> onboarding jalan.
--   Untuk user tanpa metadata (mis. dibuat via Dashboard), barulah fallback
--   ke prefix email / 'Petani'.
--
-- bagian lain (phone derive dari email, role dipaksa 'petani', poktan_id,
-- on conflict, exception handler) TIDAK berubah dari 0008.
--
-- Idempotent: create or replace + aman dijalankan berulang.

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

  -- full_name: metadata (biarkan '' apa adanya agar onboarding jalan)
  --            -> prefix email -> 'Petani'
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
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
      'petani'::public.user_role,   -- DIPAKSA (anti eskalasi)
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
