-- LOCAL/STAGING ONLY, after migrations through 0011. All fixtures are rolled back.
-- Requires an explicit session opt-in; never run against production.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_setting('agriguard.local_security_tests', true) is distinct from 'enabled' then
    raise exception 'Set agriguard.local_security_tests=enabled on an isolated test database only';
  end if;
end $$;

-- Inspect EFFECTIVE rights (PUBLIC, role inheritance and column ACLs included),
-- not just named policies. Fail closed if platform/custom grants defeat intent.
do $$
declare t text; privilege text; signature text; f record; profile_table record;
begin
  foreach t in array array['profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'] loop
    if not (select relrowsecurity from pg_catalog.pg_class where oid = format('public.%I', t)::regclass) then
      raise exception 'FAIL: RLS disabled on %', t;
    end if;
    foreach privilege in array array['TRUNCATE','TRIGGER','REFERENCES'] loop
      if has_table_privilege('authenticated', format('public.%I', t), privilege)
        or has_table_privilege('anon', format('public.%I', t), privilege) then
        raise exception 'FAIL: excessive effective % privilege on %', privilege, t;
      end if;
    end loop;
    if has_any_column_privilege('authenticated',format('public.%I',t),'REFERENCES')
      or has_any_column_privilege('anon',format('public.%I',t),'REFERENCES') then
      raise exception 'FAIL: excessive effective column REFERENCES privilege on %', t;
    end if;
  end loop;
  if not has_column_privilege('authenticated','public.profiles','full_name','UPDATE') then
    raise exception 'FAIL: legitimate profile-name update blocked';
  end if;
  foreach t in array array['id','phone','role','poktan_id','created_at'] loop
    if has_column_privilege('authenticated','public.profiles',t,'UPDATE') then
      raise exception 'FAIL: privileged profile column writable: %', t;
    end if;
  end loop;
  foreach t in array array['profiles','damage_reports','ai_analyses'] loop
    if has_any_column_privilege('anon',format('public.%I',t),'SELECT') then
      raise exception 'FAIL: anonymous private-table read privilege on %', t;
    end if;
    if has_any_column_privilege('authenticated',format('public.%I',t),'INSERT') then
      raise exception 'FAIL: direct client insert privilege on %', t;
    end if;
  end loop;
  if has_any_column_privilege('authenticated','public.damage_reports','UPDATE')
    or has_table_privilege('authenticated','public.damage_reports','DELETE')
    or has_any_column_privilege('authenticated','public.ai_analyses','UPDATE')
    or has_table_privilege('authenticated','public.ai_analyses','DELETE')
    or has_any_column_privilege('service_role','public.ai_analyses','UPDATE')
    or has_table_privilege('service_role','public.ai_analyses','DELETE')
    or has_column_privilege('authenticated','public.poktan','invite_code','SELECT') then
    raise exception 'FAIL: report/receipt mutation or invitation exposure remains';
  end if;
  if not has_table_privilege('service_role','public.damage_reports','INSERT')
    or not has_table_privilege('service_role','public.damage_reports','UPDATE')
    or not has_table_privilege('service_role','public.ai_analyses','INSERT') then
    raise exception 'FAIL: trusted-server submission workflow lacks privileges';
  end if;
  select relowner, relforcerowsecurity into profile_table from pg_catalog.pg_class where oid='public.profiles'::regclass;
  foreach signature in array array[
    'public.current_user_role()', 'public.is_ppl_dinas()',
    'public.user_belongs_to_poktan(uuid)', 'public.user_shares_lahan(uuid)',
    'public.has_phone_otp_session()', 'public.complete_onboarding(text,text)',
    'public.can_review_lahan(uuid)', 'public.verify_damage_report(uuid,boolean,text)',
    'public.handle_new_user()'
  ] loop
    select p.prosecdef, p.proowner, p.proconfig, r.rolname, r.rolsuper, r.rolbypassrls into f
      from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
      where p.oid=signature::regprocedure;
    if not f.prosecdef or f.rolname in ('anon','authenticated','authenticator')
      or not (f.rolsuper or f.rolbypassrls or (f.proowner=profile_table.relowner and not profile_table.relforcerowsecurity))
      or not exists (select 1 from unnest(f.proconfig) as setting where setting in ('search_path=','search_path=""')) then
      raise exception 'FAIL: untrusted definer owner or unsafe search_path: %', signature;
    end if;
    -- Trigger functions cannot be invoked as normal RPCs. Other helpers need
    -- authenticated execution only, including the previously PUBLIC helpers.
    if signature <> 'public.handle_new_user()' and (
      has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE')
    ) then
      raise exception 'FAIL: unintended RPC execution rights: %', signature;
    end if;
  end loop;
end $$;

insert into public.poktan (id,name,invite_code) values
 ('30000000-0000-4000-8000-000000000001','Security Test A','SEC-TEST-A'),
 ('30000000-0000-4000-8000-000000000002','Security Test B','SEC-TEST-B');
insert into auth.users (id,phone,phone_confirmed_at,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','6280000000001',now(),'{}'),
 ('10000000-0000-4000-8000-000000000002','6280000000002',now(),'{}'),
 ('10000000-0000-4000-8000-000000000003','6280000000003',now(),'{}'),
 ('10000000-0000-4000-8000-000000000004','6280000000004',now(),'{}');
update public.profiles set poktan_id = '30000000-0000-4000-8000-000000000001'
 where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
update public.profiles set poktan_id = '30000000-0000-4000-8000-000000000002'
 where id = '10000000-0000-4000-8000-000000000003';
update public.profiles set role = 'ppl' where id = '10000000-0000-4000-8000-000000000002';
update public.profiles set role = 'dinas' where id = '10000000-0000-4000-8000-000000000004';
insert into public.ai_analyses (id,user_id,photo_hash,status,confidence,damage_pct) values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',repeat('a',64),'aman',1,0),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',repeat('b',64),'rusak_berat',0.9,91);
insert into public.lahan (id,poktan_id,owner_id,name,area_hectares,polygon) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test A',1,'[[0,0],[2,0],[2,2],[0,2]]'),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Test B',1,'[[0,0],[2,0],[2,2],[0,2]]');
insert into public.damage_reports (id,user_id,lahan_id,photo_paths,photo_hash,latitude,longitude,client_created_at,idempotency_key) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','{}',repeat('a',64),1,1,now(),'50000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','{}',repeat('b',64),1,1,now(),'50000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","phone":"6280000000001","amr":[{"method":"otp"}]}',true);
do $$ begin
  begin
    update public.profiles set role='dinas' where id=auth.uid();
    raise exception 'FAIL: role escalation accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set poktan_id='30000000-0000-4000-8000-000000000002' where id=auth.uid();
    raise exception 'FAIL: arbitrary group change accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.damage_reports set is_verified=true;
    raise exception 'FAIL: direct verification accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.damage_reports (user_id,is_verified) values (auth.uid(),true);
    raise exception 'FAIL: spoofed report insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.verify_damage_report('40000000-0000-4000-8000-000000000001',true,null);
    raise exception 'FAIL: farmer verification accepted';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.damage_reports where id='40000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: cross-group report visible';
  end if;
  if not exists (select 1 from public.ai_analyses where id='60000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.ai_analyses where id='60000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: AI receipt ownership boundary';
  end if;
  begin
    update public.ai_analyses set confidence=0;
    raise exception 'FAIL: client receipt modification accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform invite_code from public.poktan;
    raise exception 'FAIL: invitation column exposed';
  exception when insufficient_privilege then null; end;
  update public.profiles set full_name='Security Test Farmer' where id=auth.uid();
  perform public.complete_onboarding('Security Test Farmer','SEC-TEST-A');
end $$;

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","phone":"6280000000002","amr":[{"method":"otp"}]}',true);
select * from public.verify_damage_report('40000000-0000-4000-8000-000000000001',true,'local test');
do $$ begin
  begin
    perform public.verify_damage_report('40000000-0000-4000-8000-000000000001',false,null);
    raise exception 'FAIL: finalized report changed';
  exception when check_violation then null; end;
  begin
    perform public.verify_damage_report('40000000-0000-4000-8000-000000000002',true,null);
    raise exception 'FAIL: PPL cross-group verification accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","phone":"6280000000004","amr":[{"method":"otp"}]}',true);
select * from public.verify_damage_report('40000000-0000-4000-8000-000000000002',false,'local test');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","phone":"6280000000001","amr":[{"method":"password"}]}',true);
do $$ begin
  if exists (select 1 from public.profiles) or exists (select 1 from public.damage_reports) then
    raise exception 'FAIL: password-only session has data access';
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","phone":"6280000000999","amr":[{"method":"otp"}]}',true);
do $$ begin
  if exists (select 1 from public.profiles) or exists (select 1 from public.damage_reports) then
    raise exception 'FAIL: rebound phone identity has data access';
  end if;
end $$;
reset role;
do $$ begin
  if (select verified_by from public.damage_reports where id='40000000-0000-4000-8000-000000000001') is distinct from '10000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'FAIL: reviewer identity not derived server-side';
  end if;
  if (select count(*) from public.audit_logs where entity_id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')) <> 2 then
    raise exception 'FAIL: missing transactional verification audits';
  end if;
end $$;
rollback;
