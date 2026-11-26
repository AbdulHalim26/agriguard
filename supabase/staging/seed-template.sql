-- GENERATED SYNTHETIC STAGING ONLY. NOT an auto-discovered migration.
-- Owner must independently confirm the project ref in Dashboard before execution.
-- No auth.users INSERT, passwords, AI receipts, fake human decisions or data reset.
begin;
do $seed$
declare
  target_ref text := __PROJECT_REF__;
  actors jsonb := __ACTORS__::jsonb;
  fixture jsonb := __FIXTURE__::jsonb;
  actor jsonb; item jsonb; expected_count integer;
begin
  if target_ref='gvrwzfwybvyqlvbqxebe' or target_ref !~ '^[a-z0-9]{20}$' then raise exception 'PRODUCTION_TARGET_FORBIDDEN'; end if;
  if target_ref<>'zlluhylmykoymynnjxjs' then raise exception 'UNVERIFIED_STAGING_TARGET_FORBIDDEN'; end if;
  -- A ref string is not DB identity proof. These independent fresh-project/actor
  -- checks also prevent seeding the existing populated production by accident.
  if to_regclass('public.ai_analyses') is null or to_regprocedure('public.has_phone_otp_session()') is null
    or to_regprocedure('public.verify_damage_report(uuid,boolean,text)') is null then raise exception 'SECURITY_0010_0011_REQUIRED'; end if;
  if has_column_privilege('authenticated','public.profiles','role','UPDATE')
    or has_any_column_privilege('authenticated','public.damage_reports','INSERT,UPDATE')
    or has_table_privilege('authenticated','public.damage_reports','DELETE,TRUNCATE')
    or has_table_privilege('anon','public.profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege('service_role','public.ai_analyses','UPDATE') then
    raise exception 'EFFECTIVE_GRANTS_0011_REQUIRED';
  end if;
  if to_regclass('agriguard_geometry.versions') is not null then raise exception 'D2_POC_NOT_PART_OF_STAGING_MVP'; end if;
  if exists(select 1 from public.poktan) or exists(select 1 from public.lahan)
    or exists(select 1 from public.damage_reports) or exists(select 1 from public.ai_analyses)
    or exists(select 1 from public.water_levels) or exists(select 1 from public.audit_logs) then
    raise exception 'FRESH_EMPTY_BUSINESS_TABLES_REQUIRED: no overwrite or automatic cleanup';
  end if;
  if (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4 then
    raise exception 'EXACTLY_FOUR_NEW_NATIVE_TEST_USERS_REQUIRED';
  end if;
  for actor in select value from jsonb_array_elements(actors) loop
    if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
      where u.id=(actor->>'id')::uuid and u.phone=actor->>'phone' and p.phone=u.phone
        and u.phone_confirmed_at is not null and p.role='petani' and p.poktan_id is null
        and u.raw_user_meta_data->>'agriguard_staging_seed'='phase2i-v1'
        and u.raw_user_meta_data->>'staging_project_ref'=target_ref) then
      raise exception 'NATIVE_AUTH_UUID_PHONE_OR_SEED_MARKER_MISMATCH';
    end if;
  end loop;
  if not exists(select 1 from storage.buckets where id='photos' and not public
      and file_size_limit=5242880 and allowed_mime_types @> array['image/png','image/jpeg']) then
    raise exception 'PRIVATE_PHOTOS_BUCKET_CONFIGURATION_REQUIRED';
  end if;
  expected_count := jsonb_array_length(fixture->'reports');
  if (select count(*) from storage.objects)<>expected_count then raise exception 'EXACT_SYNTHETIC_UPLOAD_SET_REQUIRED'; end if;
  for item in select value from jsonb_array_elements(fixture->'reports') loop
    if not exists(select 1 from storage.objects where bucket_id='photos'
      and name=item->>'photo_path' and metadata->>'mimetype'='image/png'
      and (metadata->>'size')::bigint=(item->>'photo_bytes')::bigint) then
      raise exception 'UPLOAD_EXACT_SYNTHETIC_PHOTOS_FIRST';
    end if;
  end loop;

  insert into public.poktan(id,name,village,district,invite_code)
    select (value->>'id')::uuid,value->>'name',value->>'village',value->>'district',value->>'invite_code'
    from jsonb_array_elements(fixture->'groups');
  for actor in select value from jsonb_array_elements(actors) loop
    -- Administrative fixture assignment only; browser grants remain unchanged.
    update public.profiles set full_name=actor->>'full_name',role=(actor->>'role')::public.user_role,
      poktan_id=(actor->>'poktan_id')::uuid where id=(actor->>'id')::uuid;
  end loop;
  insert into public.lahan(id,owner_id,poktan_id,name,area_hectares,polygon)
    select (value->>'id')::uuid,(value->>'owner_id')::uuid,(value->>'poktan_id')::uuid,
      value->>'name',(value->>'area_hectares')::numeric,value->'polygon' from jsonb_array_elements(fixture->'parcels');
  for item in select value from jsonb_array_elements(fixture->'reports') loop
    insert into public.damage_reports(id,user_id,lahan_id,photo_paths,photo_hash,latitude,longitude,
      client_created_at,server_created_at,idempotency_key,submission_hash,evidence_source,manual_status,
      ai_status,ai_confidence,ai_damage_pct,ai_analysis_id,is_verified,verified_by,verified_at,verification_note)
    values((item->>'id')::uuid,(item->>'user_id')::uuid,(item->>'lahan_id')::uuid,array[item->>'photo_path'],
      item->>'photo_hash',(item->>'latitude')::numeric,(item->>'longitude')::numeric,clock_timestamp(),clock_timestamp(),
      (item->>'idempotency_key')::uuid,item->>'submission_hash','manual',(item->>'manual_status')::public.ai_status,
      (item->>'manual_status')::public.ai_status,null,null,null,false,null,null,null);
  end loop;
  insert into public.audit_logs(action,entity,meta) values('staging_fixture_seed','staging_test_only',
    jsonb_build_object('synthetic',true,'seed_version','phase2i-v1','expected_project_ref',target_ref,
      'report_count',expected_count,'note','Fixture insertion, NOT an AI inference or human verification event'));
end $seed$;
commit;
