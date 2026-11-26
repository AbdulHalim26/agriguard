-- OWNER: post-migration permission-metadata assertions. READ ONLY, no fixtures.
-- Does NOT prove native OTP/SMS, RLS row outcomes, Storage bytes, or transactions.
begin transaction read only;
do $$
declare t text; column_ text; signature text; leaked record;
begin
  foreach t in array array['profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'] loop
    if not (select relrowsecurity from pg_class where oid=format('public.%I',t)::regclass) then raise exception 'RLS_DISABLED: %',t; end if;
    if has_table_privilege('authenticated',format('public.%I',t),'TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
      or has_table_privilege('anon',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN') then
      raise exception 'EXCESSIVE_CLIENT_TABLE_GRANT: %',t;
    end if;
    if has_any_column_privilege('authenticated',format('public.%I',t),'REFERENCES')
      or has_any_column_privilege('anon',format('public.%I',t),'REFERENCES') then
      raise exception 'EXCESSIVE_CLIENT_COLUMN_REFERENCES: %',t;
    end if;
    if exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
        where c.oid=format('public.%I',t)::regclass and r.rolname in ('anon','authenticated','supabase_admin')) then
      raise exception 'UNEXPECTED_TABLE_OWNER: %',t;
    end if;
  end loop;
  -- Q04 post-migration check: prospective default privileges for postgres and CURRENT_USER
  -- must grant zero TABLES/SEQUENCES/FUNCTIONS rights to PUBLIC, anon, or authenticated.
  select d.creator_name, d.api_role, d.object_kind into leaked
  from (
    select creator.rolname as creator_name, subject.rolname as api_role, subject.oid as api_role_oid,
      kinds.label as object_kind,
      coalesce(global_defaults.defaclacl, pg_catalog.acldefault(kinds.kind, creator.oid)) as global_acl,
      coalesce(public_defaults.defaclacl, '{}'::pg_catalog.aclitem[]) as public_acl
    from pg_catalog.pg_roles creator cross join pg_catalog.pg_roles subject
    cross join (
      select 'r'::pg_catalog."char" as kind, 'TABLES'::text as label
      union all select 'S'::pg_catalog."char", 'SEQUENCES'::text
      union all select 'f'::pg_catalog."char", 'FUNCTIONS'::text
    ) kinds
    left join pg_catalog.pg_default_acl global_defaults on global_defaults.defaclrole = creator.oid
      and global_defaults.defaclnamespace = 0 and global_defaults.defaclobjtype = kinds.kind
    left join pg_catalog.pg_default_acl public_defaults on public_defaults.defaclrole = creator.oid
      and public_defaults.defaclnamespace = pg_catalog.to_regnamespace('public')
      and public_defaults.defaclobjtype = kinds.kind
    where creator.rolname::text = any(array['postgres', current_user::text])
      and subject.rolname in ('anon','authenticated')
  ) d
  where exists (
    select 1 from pg_catalog.aclexplode(d.global_acl || d.public_acl) a
    where case when a.grantee = 0 then true else pg_catalog.pg_has_role(d.api_role_oid, a.grantee, 'USAGE') end
  )
  limit 1;
  if found then
    raise exception 'DEFAULT_PRIVILEGES_NOT_HARDENED: %/%/%', leaked.creator_name, leaked.api_role, leaked.object_kind;
  end if;
  foreach t in array array['lahan','water_levels','audit_logs'] loop
    if not has_table_privilege('authenticated',format('public.%I',t),'SELECT')
      or not has_table_privilege('service_role',format('public.%I',t),'SELECT') then raise exception 'REQUIRED_SELECT_MISSING: %',t; end if;
  end loop;
  foreach column_ in array array['name','area_hectares','polygon'] loop
    if not has_column_privilege('authenticated','public.lahan',column_,'INSERT')
      or not has_column_privilege('authenticated','public.lahan',column_,'UPDATE') then raise exception 'LAND_WRITE_MISSING: %',column_; end if;
  end loop;
  foreach column_ in array array['owner_id','poktan_id'] loop
    if not has_column_privilege('authenticated','public.lahan',column_,'INSERT')
      or has_column_privilege('authenticated','public.lahan',column_,'UPDATE') then raise exception 'LAND_RELATIONSHIP_GRANT: %',column_; end if;
  end loop;
  foreach column_ in array array['id','created_at'] loop
    if has_column_privilege('authenticated','public.lahan',column_,'INSERT,UPDATE') then raise exception 'LAND_SERVER_FIELD_WRITABLE: %',column_; end if;
  end loop;
  foreach column_ in array array['district','river_level_m','updated_by','updated_at'] loop
    if not has_column_privilege('authenticated','public.water_levels',column_,'INSERT')
      or not has_column_privilege('authenticated','public.water_levels',column_,'UPDATE') then raise exception 'WATER_UPSERT_MISSING: %',column_; end if;
  end loop;
  if not has_table_privilege('service_role','public.audit_logs','INSERT')
    or has_any_column_privilege('authenticated','public.audit_logs','INSERT,UPDATE')
    or has_table_privilege('authenticated','public.audit_logs','DELETE')
    or has_table_privilege('authenticated','public.lahan','DELETE') then raise exception 'AUDIT_OR_DESTRUCTIVE_GRANT_MISMATCH'; end if;
  if not has_table_privilege('authenticated','public.profiles','SELECT')
    or not has_column_privilege('authenticated','public.profiles','full_name','UPDATE')
    or has_column_privilege('authenticated','public.profiles','role','UPDATE')
    or has_any_column_privilege('authenticated','public.damage_reports','INSERT,UPDATE')
    or has_any_column_privilege('service_role','public.ai_analyses','UPDATE') then raise exception '0011_PROTECTED_RIGHTS_MISMATCH'; end if;
  foreach signature in array array['public.has_phone_otp_session()','public.complete_onboarding(text,text)',
    'public.can_review_lahan(uuid)','public.verify_damage_report(uuid,boolean,text)',
    'public.current_user_role()','public.is_ppl_dinas()','public.user_belongs_to_poktan(uuid)','public.user_shares_lahan(uuid)'] loop
    if not has_function_privilege('authenticated',signature,'EXECUTE')
      or has_function_privilege('anon',signature,'EXECUTE') then raise exception 'RPC_EXECUTE_MISMATCH: %',signature; end if;
  end loop;
  if has_function_privilege('anon','public.handle_new_user()','EXECUTE')
    or has_function_privilege('authenticated','public.handle_new_user()','EXECUTE')
    or has_function_privilege('service_role','public.handle_new_user()','EXECUTE') then
    raise exception 'TRIGGER_FUNCTION_EXECUTE_EXPOSED: public.handle_new_user()';
  end if;
  if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created' and not t.tgisinternal) then
    raise exception 'AUTH_SIGNUP_TRIGGER_MISSING: auth.users.on_auth_user_created';
  end if;
  if not has_table_privilege('authenticated','storage.objects','SELECT')
    or not has_table_privilege('service_role','storage.objects','INSERT')
    or not exists(select 1 from storage.buckets where id='photos' and not public and file_size_limit=5242880
      and allowed_mime_types @> array['image/jpeg','image/png']) then raise exception 'PRIVATE_STORAGE_CONFIGURATION_MISMATCH'; end if;
end $$;
select 'PASS_METADATA_ONLY_NATIVE_E2E_NOT_TESTED' as status;
rollback;
