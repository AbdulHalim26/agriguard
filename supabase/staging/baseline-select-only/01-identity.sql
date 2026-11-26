-- OWNER ONLY: manually confirm Dashboard project zlluhylmykoymynnjxjs first.
-- A generic database name or an editable setting is NOT cloud identity proof.
SELECT
  pg_catalog.statement_timestamp() AS observed_at,
  pg_catalog.current_database() AS database_name,
  CURRENT_USER AS execution_role,
  SESSION_USER AS session_role,
  pg_catalog.current_setting('server_version') AS postgres_version,
  pg_catalog.current_setting('server_version_num')::integer / 10000 AS postgres_major,
  NOT pg_catalog.pg_is_in_recovery() AS primary_connection,
  pg_catalog.substring(pg_catalog.current_setting('app.settings.supabase_url', true),
    '^https://([a-z]{20})[.]supabase[.]co/?$') AS optional_configured_project_ref;
