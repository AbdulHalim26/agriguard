-- enums
create type user_role as enum ('petani','ppl','dinas');
create type ai_status as enum ('aman','rusak_ringan','rusak_berat');

create table poktan (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  village text,
  district text,
  invite_code text unique not null,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  phone text unique not null,
  full_name text not null,
  role user_role not null default 'petani',
  poktan_id uuid references poktan,
  created_at timestamptz not null default now()
);

create table lahan (
  id uuid primary key default gen_random_uuid(),
  poktan_id uuid not null references poktan,
  owner_id uuid not null references profiles,
  name text not null,
  area_hectares numeric not null,
  polygon jsonb not null,
  created_at timestamptz not null default now()
);

create table water_levels (
  id uuid primary key default gen_random_uuid(),
  district text not null,
  river_level_m numeric not null,
  updated_by uuid references profiles,
  updated_at timestamptz not null default now()
);

create table damage_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  lahan_id uuid not null references lahan,
  photo_paths text[] not null,
  photo_hash text not null,
  ai_status ai_status,
  ai_confidence numeric,
  ai_damage_pct numeric,
  latitude numeric not null,
  longitude numeric not null,
  client_created_at timestamptz not null,
  server_created_at timestamptz not null default now(),
  idempotency_key uuid unique not null,
  is_verified boolean not null default false,
  verified_by uuid references profiles,
  verified_at timestamptz,
  verification_note text
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index idx_reports_user on damage_reports(user_id);
create index idx_reports_lahan on damage_reports(lahan_id);
create index idx_lahan_poktan on lahan(poktan_id);

-- Trigger: insert profiles otomatis saat user auth baru dibuat
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, phone, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'full_name',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'petani'::user_role)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage: bucket photos PRIVATE
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  5242880,
  array['image/jpeg', 'image/png']
) on conflict (id) do nothing;

-- RLS Policies
alter table poktan enable row level security;
alter table profiles enable row level security;
alter table lahan enable row level security;
alter table water_levels enable row level security;
alter table damage_reports enable row level security;
alter table audit_logs enable row level security;

-- profiles: baca/update row sendiri; ppl & dinas baca semua
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
create policy "profiles_select_ppl_dinas" on profiles
  for select using (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
    )
  );
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- lahan: baca jika owner ATAU satu poktan; insert/update hanya owner
create policy "lahan_select_owner_or_poktan" on lahan
  for select using (
    owner_id = auth.uid() or
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.poktan_id = lahan.poktan_id
    )
  );
create policy "lahan_insert_owner" on lahan
  for insert with check (owner_id = auth.uid());
create policy "lahan_update_owner" on lahan
  for update using (owner_id = auth.uid());

-- damage_reports: insert hanya milik sendiri; baca jika (sendiri ATAU satu poktan ATAU ppl/dinas);
-- update kolom verifikasi hanya oleh ppl/dinas
create policy "reports_insert_own" on damage_reports
  for insert with check (user_id = auth.uid());
create policy "reports_select_own_or_poktan_or_ppl_dinas" on damage_reports
  for select using (
    user_id = auth.uid() or
    exists (
      select 1 from profiles p
      join lahan l on l.poktan_id = p.poktan_id
      where p.id = auth.uid() and l.id = damage_reports.lahan_id
    ) or
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
    )
  );
create policy "reports_update_verification_ppl_dinas" on damage_reports
  for update using (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
    )
  )
  with check (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
    )
  );

-- water_levels: baca semua terautentikasi; insert/update hanya ppl/dinas
create policy "water_select_auth" on water_levels
  for select using (auth.role() = 'authenticated');
create policy "water_insert_ppl_dinas" on water_levels
  for insert with check (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
    )
  );
create policy "water_update_ppl_dinas" on water_levels
  for update using (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
    )
  );

-- audit_logs: baca ppl/dinas; insert hanya via service role (server)
create policy "audit_select_ppl_dinas" on audit_logs
  for select using (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
    )
  );

-- Storage policies for photos bucket
create policy "photos_select_own" on storage.objects
  for select using (
    bucket_id = 'photos' and
    (auth.uid() = (storage.foldername(name))[1]::uuid or
     exists (
       select 1 from profiles p where p.id = auth.uid() and p.role in ('ppl','dinas')
     ))
  );
create policy "photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'photos' and
    auth.uid() = (storage.foldername(name))[1]::uuid
  );