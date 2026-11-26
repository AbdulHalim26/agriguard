-- Catalog metadata only, no public business rows or managed-schema contents.
SELECT pg_catalog.jsonb_build_object(
  'non_system_schemas', (
    SELECT COALESCE(pg_catalog.jsonb_agg(n.nspname ORDER BY n.nspname), '[]'::jsonb)
    FROM pg_catalog.pg_namespace n
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  ),
  'public_relations', (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', c.relname, 'kind', c.relkind, 'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity) ORDER BY c.relname), '[]'::jsonb)
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S')
  ),
  'managed_relations', (
    SELECT pg_catalog.jsonb_object_agg(required.name, pg_catalog.to_regclass(required.name) IS NOT NULL)
    FROM pg_catalog.unnest(ARRAY['auth.users','storage.objects','storage.buckets']) AS required(name)
  ),
  'required_roles', (
    SELECT pg_catalog.jsonb_object_agg(required.name, r.oid IS NOT NULL)
    FROM pg_catalog.unnest(ARRAY['anon','authenticated','service_role','postgres']) AS required(name)
    LEFT JOIN pg_catalog.pg_roles r ON r.rolname = required.name
  ),
  'migration_ledger_present', pg_catalog.to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'gen_random_uuid_present', pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL,
  'migration_version_column_present', EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = pg_catalog.to_regclass('supabase_migrations.schema_migrations')
      AND a.attname = 'version' AND a.attnum > 0 AND NOT a.attisdropped
  )
) AS q02_inventory;
