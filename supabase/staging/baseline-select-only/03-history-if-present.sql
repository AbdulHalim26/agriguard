-- CONDITIONAL: run ONLY if Q02 says ledger=true AND version_column=true.
-- If ledger is absent, SKIP and record NOT_INITIALIZED, not an observed count=0.
-- Do not select migration statements, which could contain historical private data.
SELECT
  context.unfiltered_context AS unfiltered_history_context,
  CASE WHEN context.unfiltered_context THEN
    (SELECT pg_catalog.count(*) FROM supabase_migrations.schema_migrations)
    ELSE NULL END AS migration_count,
  CASE WHEN context.unfiltered_context THEN
    (SELECT COALESCE(pg_catalog.array_agg(version::text ORDER BY version::text), ARRAY[]::text[])
      FROM supabase_migrations.schema_migrations)
    ELSE NULL END AS applied_versions
FROM (
  SELECT (r.rolsuper OR r.rolbypassrls OR NOT c.relrowsecurity
    OR (c.relowner = r.oid AND NOT c.relforcerowsecurity)) AS unfiltered_context
  FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
  WHERE r.rolname = CURRENT_USER AND c.oid = pg_catalog.to_regclass('supabase_migrations.schema_migrations')
) context;
