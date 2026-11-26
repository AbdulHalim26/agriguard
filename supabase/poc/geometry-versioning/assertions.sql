-- Effective ACL/role/constraint checks; the runner executes this only AFTER the
-- actual base migrations and candidate. This file has NOT been run without PG.
do $$
declare t text; r text; privilege text; signature text; f record;
begin
  if current_database() !~ '^agriguard_geometry_poc_[a-z0-9]+$' or inet_server_addr() is not null then
    raise exception 'LOCAL_DISPOSABLE_POC_ONLY';
  end if;
  if not exists(select 1 from pg_roles where rolname='agriguard_geometry_writer'
      and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb) then
    raise exception 'FAIL: writer capabilities';
  end if;
  foreach r in array array['anon','authenticated','service_role','authenticator'] loop
    if pg_has_role(r,'agriguard_geometry_writer','MEMBER') then raise exception 'FAIL: writer role reachable by %',r; end if;
    if has_schema_privilege(r,'agriguard_geometry','USAGE') then raise exception 'FAIL: private schema exposed to %',r; end if;
    foreach t in array array['validation_receipts','versions','report_intents'] loop
      foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'] loop
        if has_table_privilege(r,'agriguard_geometry.'||t,privilege) then raise exception 'FAIL: private % % for %',t,privilege,r; end if;
      end loop;
      if has_any_column_privilege(r,'agriguard_geometry.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'FAIL: private column grant for %',r;
      end if;
    end loop;
  end loop;
  foreach t in array array['validation_receipts','versions','report_intents'] loop
    if not (select relrowsecurity and pg_get_userbyid(relowner)<>'agriguard_geometry_writer'
        from pg_class where oid=('agriguard_geometry.'||t)::regclass) then raise exception 'FAIL: RLS/owner %',t; end if;
    if has_table_privilege('agriguard_geometry_writer','agriguard_geometry.'||t,'UPDATE,DELETE,TRUNCATE,TRIGGER') then
      raise exception 'FAIL: writer can mutate history %',t;
    end if;
  end loop;
  foreach t in array array['id','phone','role','poktan_id','created_at'] loop
    if has_column_privilege('agriguard_geometry_writer','public.profiles',t,'UPDATE') then raise exception 'FAIL: privileged profile column %',t; end if;
  end loop;
  if not has_column_privilege('agriguard_geometry_writer','public.profiles','full_name','UPDATE') then
    raise exception 'FAIL: profile row-lock privilege missing';
  end if;
  foreach signature in array array[
    'public.stage_geometry_validation(uuid,uuid,uuid,uuid,jsonb,numeric,numeric,text,jsonb)',
    'public.advance_lahan_geometry(uuid)', 'public.stage_report_geometry_intent(uuid,uuid,uuid,jsonb)',
    'public.commit_report_with_geometry(uuid)', 'public.get_lahan_geometry_version(uuid)'
  ] loop
    select p.prosecdef,r.rolname,p.proconfig into f from pg_proc p join pg_roles r on r.oid=p.proowner
      where p.oid=signature::regprocedure;
    if not f.prosecdef or f.rolname<>'agriguard_geometry_writer'
      or not exists(select 1 from unnest(f.proconfig) setting where setting in ('search_path=','search_path=""'))
      or has_function_privilege('anon',signature,'EXECUTE') then raise exception 'FAIL: unsafe function %',signature; end if;
    if signature like 'public.stage_%' then
      if has_function_privilege('authenticated',signature,'EXECUTE') or not has_function_privilege('service_role',signature,'EXECUTE') then
        raise exception 'FAIL: trusted issuer exposure %',signature;
      end if;
    elsif not has_function_privilege('authenticated',signature,'EXECUTE') or has_function_privilege('service_role',signature,'EXECUTE') then
      raise exception 'FAIL: OTP-only command exposure %',signature;
    end if;
  end loop;
  foreach t in array array['land_head_same_parcel','report_geometry_same_parcel','receipt_expected_same_parcel'] loop
    if not exists(select 1 from pg_constraint where conname=t and contype='f' and convalidated) then raise exception 'FAIL: missing constraint %',t; end if;
  end loop;
  if not (select reloptions @> array['security_invoker=true'] from pg_class
    where oid='public.damage_report_geometry_context'::regclass) then raise exception 'FAIL: owner-bypass view'; end if;
  if has_table_privilege('authenticated','public.damage_report_geometry_context','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') then
    raise exception 'FAIL: writable context view';
  end if;
end $$;
