-- Existing reserved names are evidence to STOP/review, never auto-drop/replace.
-- Read signatures/metadata only, not function bodies or policy expressions.
SELECT conflicts.kind, conflicts.schema_name, conflicts.object_name, conflicts.reason
FROM (
  SELECT 'TYPE'::text AS kind, n.nspname::text AS schema_name, t.typname::text AS object_name,
    'Reserved type already exists; fresh schema expected'::text AS reason
  FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname IN ('user_role','ai_status')
  UNION ALL
  SELECT 'RELATION', n.nspname, c.relname, 'Reserved table/index name already exists'
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses',
    'idx_reports_user','idx_reports_lahan','idx_lahan_poktan','water_levels_district_key')
  UNION ALL
  SELECT 'FUNCTION', n.nspname, p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
    'Planned function name/overload already exists; do not silently replace'
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('handle_new_user','current_user_role','is_ppl_dinas',
    'user_belongs_to_poktan','user_shares_lahan','has_phone_otp_session','complete_onboarding','can_review_lahan','verify_damage_report')
  UNION ALL
  SELECT 'AUTH_TRIGGER', n.nspname, t.tgname, 'Base migration would replace an existing Auth trigger'
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'STORAGE_POLICY', schemaname, tablename || '.' || policyname, 'Reserved photos policy already exists'
  FROM pg_catalog.pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN ('photos_select_own','photos_insert_own','photos_select_scope','phase0a_phone_otp_photos')
  UNION ALL
  SELECT 'D2_SCHEMA', n.nspname, n.nspname, 'Geometry PoC is outside the immutable MVP migration package'
  FROM pg_catalog.pg_namespace n WHERE n.nspname = 'agriguard_geometry'
) conflicts
ORDER BY conflicts.kind, conflicts.schema_name, conflicts.object_name;
