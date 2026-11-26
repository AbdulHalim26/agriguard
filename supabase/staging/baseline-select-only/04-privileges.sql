-- Declared defaults + computed prospective rights, not permissions on future tables.
-- Global defaults override built-ins; schema defaults ADD to globals. PUBLIC and
-- immediately inherited role rights are included. No grants/settings are changed.
SELECT pg_catalog.jsonb_build_object(
  'prospective_public_defaults', (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'creator', d.creator_name, 'api_role', d.api_role, 'object_kind', d.object_kind,
      'global_default_overridden', d.global_overridden,
      'public_default_entry_present', d.public_entry_present,
      'global_or_builtin_rights', ARRAY(
        SELECT DISTINCT a.privilege_type FROM pg_catalog.aclexplode(d.global_acl) a
        WHERE CASE WHEN a.grantee = 0 THEN true ELSE pg_catalog.pg_has_role(d.api_role_oid, a.grantee, 'USAGE') END
        ORDER BY a.privilege_type
      ),
      'public_schema_additions', ARRAY(
        SELECT DISTINCT a.privilege_type FROM pg_catalog.aclexplode(d.public_acl) a
        WHERE CASE WHEN a.grantee = 0 THEN true ELSE pg_catalog.pg_has_role(d.api_role_oid, a.grantee, 'USAGE') END
        ORDER BY a.privilege_type
      ),
      'combined_prospective_rights', ARRAY(
        SELECT DISTINCT a.privilege_type FROM pg_catalog.aclexplode(d.global_acl || d.public_acl) a
        WHERE CASE WHEN a.grantee = 0 THEN true ELSE pg_catalog.pg_has_role(d.api_role_oid, a.grantee, 'USAGE') END
        ORDER BY a.privilege_type
      )
    ) ORDER BY d.creator_name, d.api_role, d.object_kind), '[]'::jsonb)
    FROM (
      SELECT creator.rolname AS creator_name, subject.rolname AS api_role, subject.oid AS api_role_oid,
        kinds.label AS object_kind, global_defaults.oid IS NOT NULL AS global_overridden,
        public_defaults.oid IS NOT NULL AS public_entry_present,
        COALESCE(global_defaults.defaclacl, pg_catalog.acldefault(kinds.kind, creator.oid)) AS global_acl,
        COALESCE(public_defaults.defaclacl, '{}'::pg_catalog.aclitem[]) AS public_acl
      FROM pg_catalog.pg_roles creator CROSS JOIN pg_catalog.pg_roles subject
      CROSS JOIN (SELECT 'r'::pg_catalog."char" AS kind, 'TABLES'::text AS label
        UNION ALL SELECT 'f'::pg_catalog."char", 'FUNCTIONS'::text) kinds
      LEFT JOIN pg_catalog.pg_default_acl global_defaults ON global_defaults.defaclrole = creator.oid
        AND global_defaults.defaclnamespace = 0 AND global_defaults.defaclobjtype = kinds.kind
      LEFT JOIN pg_catalog.pg_default_acl public_defaults ON public_defaults.defaclrole = creator.oid
        AND public_defaults.defaclnamespace = pg_catalog.to_regnamespace('public')
        AND public_defaults.defaclobjtype = kinds.kind
      WHERE creator.rolname::text = ANY(ARRAY['postgres','supabase_admin',CURRENT_USER::text])
        AND subject.rolname IN ('anon','authenticated')
    ) d
  ),
  'schema_usage', (
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', r.rolname, 'schema', required.name,
      'present', n.oid IS NOT NULL, 'usage', CASE WHEN n.oid IS NULL THEN NULL
        ELSE pg_catalog.has_schema_privilege(r.oid, n.oid, 'USAGE') END) ORDER BY r.rolname, required.name)
    FROM pg_catalog.pg_roles r
    CROSS JOIN pg_catalog.unnest(ARRAY['public','auth','storage']) AS required(name)
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = required.name
    WHERE r.rolname IN ('anon','authenticated','service_role')
  ),
  'managed_function_execute', (
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', r.rolname, 'signature', required.signature,
      'present', p.oid IS NOT NULL, 'execute', CASE WHEN p.oid IS NULL THEN NULL
        ELSE pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE') END) ORDER BY r.rolname, required.signature)
    FROM pg_catalog.pg_roles r
    CROSS JOIN pg_catalog.unnest(ARRAY['auth.uid()','auth.jwt()','storage.foldername(text)']) AS required(signature)
    LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(required.signature)
    WHERE r.rolname IN ('authenticated','service_role')
  )
) AS q04_privileges;
