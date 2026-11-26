-- Run after Q02 confirms storage.buckets/objects exist. Bucket metadata only;
-- NEVER select object names, paths, signed URLs, owner IDs or file contents.
SELECT pg_catalog.jsonb_build_object(
  'unfiltered_bucket_context', context.unfiltered_context,
  'bucket_count', CASE WHEN context.unfiltered_context THEN (SELECT pg_catalog.count(*) FROM storage.buckets) ELSE NULL END,
  'buckets', CASE WHEN context.unfiltered_context THEN (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', b.id, 'name', b.name,
      'public', b.public, 'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types)
      ORDER BY b.id), '[]'::jsonb)
    FROM storage.buckets b
  ) ELSE NULL END,
  'managed_object_rights', (
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', r.rolname,
      'select', pg_catalog.has_table_privilege(r.oid, 'storage.objects', 'SELECT'),
      'insert', pg_catalog.has_table_privilege(r.oid, 'storage.objects', 'INSERT')) ORDER BY r.rolname)
    FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
  )
) AS q06_storage
FROM (
  SELECT (r.rolsuper OR r.rolbypassrls OR NOT c.relrowsecurity
    OR (c.relowner = r.oid AND NOT c.relforcerowsecurity)) AS unfiltered_context
  FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
  WHERE r.rolname = CURRENT_USER AND c.oid = pg_catalog.to_regclass('storage.buckets')
) context;
