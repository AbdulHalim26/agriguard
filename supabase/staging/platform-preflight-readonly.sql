-- PRE-MIGRATION catalog inspection. Fixed READ ONLY transaction, no custom SQL,
-- DDL/DML, login-role mint, or business/Auth identity values. Staging target only.
begin transaction read only;
set local statement_timeout = '10s';
select jsonb_build_object(
  'transaction_read_only',current_setting('transaction_read_only'),
  'server_version',current_setting('server_version'),
  'app_tables',(select coalesce(jsonb_agg(c.relname order by c.relname),'[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
      and c.relkind in ('r','p') and c.relname in ('profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses')),
  'auth_user_count',(select count(*) from auth.users),
  'storage_object_count',(select count(*) from storage.objects),
  'photos_bucket_present',exists(select 1 from storage.buckets where id='photos'),
  'migration_ledger_present',to_regclass('supabase_migrations.schema_migrations') is not null,
  'default_acl',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(a.defaclrole),
      'schema',coalesce(n.nspname,'GLOBAL'),'object_kind',a.defaclobjtype,'acl',a.defaclacl::text)
      order by a.defaclrole,a.defaclnamespace,a.defaclobjtype),'[]'::jsonb)
    from pg_default_acl a left join pg_namespace n on n.oid=a.defaclnamespace
    where a.defaclrole in (select oid from pg_roles where rolname in ('postgres','supabase_admin'))
      and (a.defaclnamespace=0 or n.nspname='public')),
  'rls_event_triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',e.evtname,'enabled',e.evtenabled,
      'event',e.evtevent,'function_schema',n.nspname,'function_name',p.proname,
      'definition',pg_get_functiondef(p.oid)) order by e.evtname),'[]'::jsonb)
    from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid join pg_namespace n on n.oid=p.pronamespace
    where e.evtname ilike '%rls%' or p.proname ilike '%rls%'),
  'schema_usage',(select jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,
      'usage',has_schema_privilege(r.oid,n.oid,'USAGE')) order by r.rolname,n.nspname)
    from pg_roles r cross join pg_namespace n where r.rolname in ('anon','authenticated','service_role')
      and n.nspname in ('public','auth','storage')),
  'managed_function_execute',(select jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,
      'function',p.oid::regprocedure::text,'execute',has_function_privilege(r.oid,p.oid,'EXECUTE'))
      order by r.rolname,p.oid::regprocedure::text)
    from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where r.rolname in ('authenticated','service_role') and
      ((n.nspname='auth' and p.proname in ('uid','jwt','role')) or (n.nspname='storage' and p.proname='foldername'))),
  'storage_objects_rights',(select jsonb_agg(jsonb_build_object('role',r.rolname,
      'select',has_table_privilege(r.oid,'storage.objects','SELECT'),
      'insert',has_table_privilege(r.oid,'storage.objects','INSERT'),
      'update',has_table_privilege(r.oid,'storage.objects','UPDATE'),
      'delete',has_table_privilege(r.oid,'storage.objects','DELETE')) order by r.rolname)
    from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
  'postgres_role',(select jsonb_build_object('bypass_rls',rolbypassrls,'superuser',rolsuper) from pg_roles where rolname='postgres')
) as preflight;
rollback;
