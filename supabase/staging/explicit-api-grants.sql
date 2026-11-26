-- I.3 STAGING-ONLY security & compatibility supplement, executed AFTER the nine
-- original migrations and BEFORE Auth/fixture creation. NOT a production migration.
-- Target identity must be verified outside SQL: pinned ref zlluhylmykoymynnjxjs,
-- isolated CLI workdir + explicit --project-ref. No SQL string proves cloud ID.
begin;
do $$
declare t text; occupied boolean;
begin
  if to_regprocedure('public.verify_damage_report(uuid,boolean,text)') is null
    or to_regclass('public.ai_analyses') is null then raise exception 'NINE_MIGRATIONS_REQUIRED_FIRST'; end if;
  if exists(select 1 from auth.users) or exists(select 1 from storage.objects)
    or to_regclass('agriguard_geometry.versions') is not null then raise exception 'FRESH_STAGING_ONLY_NO_AUTH_OR_STORAGE_DATA'; end if;
  foreach t in array array['profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'] loop
    execute format('select exists(select 1 from public.%I)',t) into occupied;
    if occupied then raise exception 'FRESH_STAGING_ONLY: % already contains data',t; end if;
    if not (select relrowsecurity from pg_class where oid=format('public.%I',t)::regclass) then raise exception 'RLS_MUST_REMAIN_ENABLED: %',t; end if;
  end loop;
  if not exists(select 1 from storage.buckets where id='photos' and not public and file_size_limit=5242880
      and allowed_mime_types @> array['image/jpeg','image/png'])
    or not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'PRIVATE_PHOTOS_BUCKET_AND_STORAGE_RLS_REQUIRED';
  end if;
  -- Managed schemas are platform-owned. Assert their required native rights;
  -- do not repair them by broad grants or by disabling Storage/Auth RLS.
  if not has_schema_privilege('authenticated','auth','USAGE')
    or not has_schema_privilege('authenticated','storage','USAGE')
    or not has_function_privilege('authenticated','auth.uid()','EXECUTE')
    or not has_function_privilege('authenticated','auth.jwt()','EXECUTE')
    or not has_function_privilege('authenticated','storage.foldername(text)','EXECUTE')
    or not has_table_privilege('authenticated','storage.objects','SELECT')
    or not has_table_privilege('service_role','storage.objects','SELECT')
    or not has_table_privilege('service_role','storage.objects','INSERT') then
    raise exception 'MANAGED_AUTH_STORAGE_PERMISSIONS_REQUIRE_OWNER_REVIEW';
  end if;
end $$;

-- Q04 hardening: tighten PostgreSQL 17 default privileges (both global and
-- per-schema public) for the actual migration creator role(s) so future tables,
-- sequences, and functions do not inherit TRUNCATE, TRIGGER, REFERENCES,
-- MAINTAIN, or PUBLIC EXECUTE. Managed schemas (auth, storage) are untouched.
do $$
declare creator text;
begin
  if current_user::text <> 'postgres' and not pg_has_role(current_user, 'postgres', 'MEMBER') then
    raise exception 'MIGRATION_CREATOR_MUST_BE_POSTGRES_OR_MEMBER: %', current_user;
  end if;
  foreach creator in array (
    select array_agg(distinct r order by r) from unnest(array['postgres', current_user::text]) as r
  ) loop
    -- Global defaults override PostgreSQL built-ins (notably PUBLIC EXECUTE on functions).
    execute format('alter default privileges for role %I revoke all on tables from public, anon, authenticated', creator);
    execute format('alter default privileges for role %I revoke all on sequences from public, anon, authenticated', creator);
    execute format('alter default privileges for role %I revoke all on functions from public, anon, authenticated', creator);
    -- Schema-level public defaults are additive to global defaults; revoke them explicitly too.
    execute format('alter default privileges for role %I in schema public revoke all on tables from public, anon, authenticated', creator);
    execute format('alter default privileges for role %I in schema public revoke all on sequences from public, anon, authenticated', creator);
    execute format('alter default privileges for role %I in schema public revoke all on functions from public, anon, authenticated', creator);
  end loop;
  -- Platform-managed supabase_admin is only altered if the executing role is a member;
  -- otherwise app migrations must run as postgres and never as supabase_admin.
  if exists(select 1 from pg_roles where rolname = 'supabase_admin')
    and pg_has_role(current_user, 'supabase_admin', 'MEMBER') then
    alter default privileges for role supabase_admin revoke all on tables from public, anon, authenticated;
    alter default privileges for role supabase_admin revoke all on sequences from public, anon, authenticated;
    alter default privileges for role supabase_admin revoke all on functions from public, anon, authenticated;
    alter default privileges for role supabase_admin in schema public revoke all on tables from public, anon, authenticated;
    alter default privileges for role supabase_admin in schema public revoke all on sequences from public, anon, authenticated;
    alter default privileges for role supabase_admin in schema public revoke all on functions from public, anon, authenticated;
  end if;
end $$;

-- Explicit grants replace implicit automatic API grants and revoke PG 17
-- MAINTAIN/TRUNCATE/TRIGGER/REFERENCES across all existing app tables without
-- turning automatic grants back on or changing any RLS policy.
do $$
declare t text; cols text;
begin
  foreach t in array array['profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'] loop
    execute format('revoke truncate, trigger, references, maintain on table public.%I from public, anon, authenticated', t);
  end loop;
  foreach t in array array['lahan','water_levels','audit_logs'] loop
    select string_agg(format('%I',attname),',' order by attnum) into cols
      from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke all privileges (%s) on public.%I from public,anon,authenticated,service_role',cols,t);
    execute format('revoke all privileges on public.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;
grant usage on schema public to authenticated,service_role;
grant usage on type public.user_role,public.ai_status to authenticated,service_role;

grant select on public.lahan,public.water_levels,public.audit_logs to authenticated;
grant insert(name,area_hectares,polygon,owner_id,poktan_id) on public.lahan to authenticated;
grant update(name,area_hectares,polygon) on public.lahan to authenticated;
-- PostgREST upsert updates ALL supplied columns, including the conflict key.
grant insert(district,river_level_m,updated_by,updated_at) on public.water_levels to authenticated;
grant update(district,river_level_m,updated_by,updated_at) on public.water_levels to authenticated;

grant select on public.lahan,public.water_levels,public.audit_logs to service_role;
grant insert on public.audit_logs to service_role;
-- 0011 already explicitly grants protected profile/report/AI access. Never
-- restore browser report INSERT/UPDATE or server AI receipt UPDATE/DELETE.
-- Trigger function on auth.users still fires as security-definer owner without client EXECUTE.
revoke all on function public.handle_new_user() from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
commit;
