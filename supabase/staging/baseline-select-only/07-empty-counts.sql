-- Run ONLY after Q02 confirms both managed relations exist; existing owner role.
-- Aggregate counts only: no emails, phones, UUIDs, paths, hashes or user metadata.
SELECT
  context.auth_unfiltered AS unfiltered_auth_context,
  context.objects_unfiltered AS unfiltered_objects_context,
  CASE WHEN context.auth_unfiltered THEN (SELECT pg_catalog.count(*) FROM auth.users) ELSE NULL END AS auth_user_count,
  CASE WHEN context.objects_unfiltered THEN (SELECT pg_catalog.count(*) FROM storage.objects) ELSE NULL END AS storage_object_count
FROM (
  SELECT
    (r.rolsuper OR r.rolbypassrls OR NOT users_.relrowsecurity
      OR (users_.relowner = r.oid AND NOT users_.relforcerowsecurity)) AS auth_unfiltered,
    (r.rolsuper OR r.rolbypassrls OR NOT objects_.relrowsecurity
      OR (objects_.relowner = r.oid AND NOT objects_.relforcerowsecurity)) AS objects_unfiltered
  FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class users_ CROSS JOIN pg_catalog.pg_class objects_
  WHERE r.rolname = CURRENT_USER AND users_.oid = pg_catalog.to_regclass('auth.users')
    AND objects_.oid = pg_catalog.to_regclass('storage.objects')
) context;
