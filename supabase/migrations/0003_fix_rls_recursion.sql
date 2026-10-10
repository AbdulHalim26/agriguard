-- Fix RLS: ganti subquery "select dari profiles" di dalam policy profiles sendiri
-- yang menyebabkan "infinite recursion detected". Dipindah ke fungsi security definer
-- (owner table => RLS tidak diterapkan di dalam fungsi) agar aman & non-rekursif.

-- Helper: role user saat ini
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Helper: apakah user saat ini ppl/dinas
create or replace function public.is_ppl_dinas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('ppl','dinas')
  )
$$;

-- Helper: apakah user saat ini anggota poktan tertentu
create or replace function public.user_belongs_to_poktan(target_poktan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and poktan_id = target_poktan
  )
$$;

-- Helper: apakah user saat ini satu poktan dengan pemilik lahan tertentu
create or replace function public.user_shares_lahan(target_lahan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.lahan l
    join public.profiles p on p.poktan_id = l.poktan_id
    where l.id = target_lahan and p.id = auth.uid()
  )
$$;

-- profiles
drop policy if exists "profiles_select_ppl_dinas" on profiles;
create policy "profiles_select_ppl_dinas" on profiles
  for select using (public.is_ppl_dinas());

-- lahan
drop policy if exists "lahan_select_owner_or_poktan" on lahan;
create policy "lahan_select_owner_or_poktan" on lahan
  for select using (
    owner_id = auth.uid() or public.user_belongs_to_poktan(lahan.poktan_id)
  );

-- damage_reports
drop policy if exists "reports_select_own_or_poktan_or_ppl_dinas" on damage_reports;
create policy "reports_select_own_or_poktan_or_ppl_dinas" on damage_reports
  for select using (
    user_id = auth.uid() or
    public.is_ppl_dinas() or
    public.user_shares_lahan(damage_reports.lahan_id)
  );
drop policy if exists "reports_update_verification_ppl_dinas" on damage_reports;
create policy "reports_update_verification_ppl_dinas" on damage_reports
  for update using (public.is_ppl_dinas())
  with check (public.is_ppl_dinas());

-- water_levels
drop policy if exists "water_insert_ppl_dinas" on water_levels;
create policy "water_insert_ppl_dinas" on water_levels
  for insert with check (public.is_ppl_dinas());
drop policy if exists "water_update_ppl_dinas" on water_levels;
create policy "water_update_ppl_dinas" on water_levels
  for update using (public.is_ppl_dinas());

-- audit_logs
drop policy if exists "audit_select_ppl_dinas" on audit_logs;
create policy "audit_select_ppl_dinas" on audit_logs
  for select using (public.is_ppl_dinas());

-- storage photos (bagian cek ppl/dinas)
drop policy if exists "photos_select_own" on storage.objects;
create policy "photos_select_own" on storage.objects
  for select using (
    bucket_id = 'photos' and
    (auth.uid() = (storage.foldername(name))[1]::uuid or public.is_ppl_dinas())
  );