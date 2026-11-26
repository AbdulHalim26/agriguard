-- Only the runner's BRAND-NEW, socket-only PostgreSQL cluster may load this file.
-- These tiny auth/storage stand-ins are NOT Supabase GoTrue, JWT verification,
-- Storage, PostgREST or a production-platform integration test.
do $$ begin
  if current_database() !~ '^agriguard_geometry_poc_[a-z0-9]+$'
    or inet_server_addr() is not null
    or current_setting('agriguard.geometry_poc_install',true) is distinct from 'LOCAL_DISPOSABLE_ONLY'
  then raise exception 'LOCAL_DISPOSABLE_POC_ONLY'; end if;
end $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator nologin noinherit;
grant anon,authenticated to authenticator;
create schema auth;
create schema storage;
grant usage on schema auth,storage,public to anon,authenticated,service_role;
create table auth.users (
  id uuid primary key, phone text, email text, phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt()->>'sub')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt()->>'role'
$$;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets,
  name text not null
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name,'/'))[1:greatest(array_length(string_to_array(name,'/'),1)-1,0)]
$$;
grant all on storage.objects to anon,authenticated,service_role;
-- Deliberately broad platform-like starting grants: actual 0010/0011 must narrow
-- EFFECTIVE rights. No demo seeds, password hashes or real Auth records are used.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
