-- No policy predicates, function bodies, role passwords or Auth identity values.
-- A trigger name/keyword/fingerprint alone does not prove its behavior/scope.
SELECT pg_catalog.jsonb_build_object(
  'table_rls', (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('schema', n.nspname,
      'table', c.relname, 'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity)
      ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND (n.nspname = 'public' OR (n.nspname = 'storage' AND c.relname = 'objects'))
  ),
  'policy_metadata', (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('schema', schemaname,
      'table', tablename, 'policy', policyname, 'permissive', permissive, 'roles', roles, 'command', cmd)
      ORDER BY schemaname, tablename, policyname), '[]'::jsonb)
    FROM pg_catalog.pg_policies WHERE schemaname = 'public' OR (schemaname = 'storage' AND tablename = 'objects')
  ),
  'event_trigger_metadata', (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('trigger', e.evtname,
      'event', e.evtevent, 'enabled', e.evtenabled, 'tags', e.evttags,
      'function_schema', n.nspname, 'function_name', p.proname, 'security_definer', p.prosecdef,
      'definition_fingerprint', pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
      'mentions_enable_rls', pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)), 'enable row level security') > 0,
      'mentions_force_rls', pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)), 'force row level security') > 0)
      ORDER BY e.evtname), '[]'::jsonb)
    FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid = e.evtfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  ),
  'role_posture', (
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', rolname,
      'superuser', rolsuper, 'bypass_rls', rolbypassrls) ORDER BY rolname)
    FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres')
  )
) AS q05_rls;
