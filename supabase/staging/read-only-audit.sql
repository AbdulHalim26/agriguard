-- Configuration/catalog audit only. No business/Auth rows or Storage objects.
-- This is NOT a migration, seed, permission change, or an RLS execution proof.
begin transaction read only;
set local statement_timeout = '10s';
select jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'server_version', current_setting('server_version'),
  'migration_ledger_present', to_regclass('supabase_migrations.schema_migrations') is not null,
  'tables', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
      'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and ((n.nspname='public' and c.relname in
      ('profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'))
      or (n.nspname='storage' and c.relname='objects'))),
  'report_columns', (select jsonb_agg(column_name order by ordinal_position) from information_schema.columns
    where table_schema='public' and table_name='damage_reports'),
  'security_functions', (select jsonb_object_agg(signature,to_regprocedure(signature) is not null)
    from unnest(array['public.has_phone_otp_session()','public.complete_onboarding(text,text)',
      'public.can_review_lahan(uuid)','public.verify_damage_report(uuid,boolean,text)']) signature),
  'policies', (select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,
      'name',policyname,'permissive',permissive,'roles',roles,'command',cmd) order by schemaname,tablename,policyname)
    from pg_policies where (schemaname='public' and tablename in
      ('profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'))
      or (schemaname='storage' and tablename='objects')),
  'effective_table_rights', (select jsonb_agg(jsonb_build_object('role',r.rolname,'table',c.relname,
      'select',has_table_privilege(r.oid,c.oid,'SELECT'),'insert',has_table_privilege(r.oid,c.oid,'INSERT'),
      'update',has_table_privilege(r.oid,c.oid,'UPDATE'),'delete',has_table_privilege(r.oid,c.oid,'DELETE'),
      'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER'),
      'references',has_table_privilege(r.oid,c.oid,'REFERENCES'),'maintain',has_table_privilege(r.oid,c.oid,'MAINTAIN')) order by r.rolname,c.relname)
    from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
    where r.rolname in ('anon','authenticated','service_role') and n.nspname='public' and c.relkind='r'
      and c.relname in ('profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses')),
  'default_acl', (select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(a.defaclrole),
      'schema',coalesce(n.nspname,'GLOBAL'),'object_kind',a.defaclobjtype,'acl',a.defaclacl::text)
      order by a.defaclrole,a.defaclnamespace,a.defaclobjtype),'[]'::jsonb)
    from pg_default_acl a left join pg_namespace n on n.oid=a.defaclnamespace
    where a.defaclrole in (select oid from pg_roles where rolname in ('postgres','supabase_admin',current_user::text))
      and (a.defaclnamespace=0 or n.nspname='public')),
  'authenticated_profile_update_columns', (select jsonb_agg(a.attname order by a.attnum)
    from pg_attribute a where a.attrelid='public.profiles'::regclass and a.attnum>0 and not a.attisdropped
      and has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE')),
  'photos_bucket', (select jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,
      'allowed_mime_types',allowed_mime_types) from storage.buckets where id='photos')
) as configuration_audit;
rollback;
