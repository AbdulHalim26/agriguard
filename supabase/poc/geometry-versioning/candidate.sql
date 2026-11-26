-- LOCAL DISPOSABLE POC ONLY. NOT an auto-discovered Supabase migration.
-- Requires base schema/security through 0011. Never load shared/production env.
begin;
do $$ begin
  if current_database() !~ '^agriguard_geometry_poc_[a-z0-9]+$'
     or current_setting('agriguard.geometry_poc_install', true) is distinct from 'LOCAL_DISPOSABLE_ONLY'
     or inet_server_addr() is not null then
    raise exception 'LOCAL_DISPOSABLE_POC_ONLY';
  end if;
  if current_setting('server_version_num')::integer < 150000 then raise exception 'POSTGRESQL_15_REQUIRED'; end if;
  if to_regprocedure('public.has_phone_otp_session()') is null
    or to_regclass('public.ai_analyses') is null then raise exception 'BASE_SECURITY_0011_REQUIRED'; end if;
end $$;

create role agriguard_geometry_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema agriguard_geometry;
revoke all on schema agriguard_geometry from public, anon, authenticated, service_role;
grant usage, create on schema agriguard_geometry to agriguard_geometry_writer;
grant usage, create on schema public to agriguard_geometry_writer;
grant usage on schema auth to agriguard_geometry_writer;
grant execute on function auth.uid(), auth.jwt(), public.has_phone_otp_session(), public.current_user_role() to agriguard_geometry_writer;

-- Geometry is stored once in an immutable validation artifact, then referenced
-- by immutable version metadata. Backend issues artifacts after D1 validation.
create table agriguard_geometry.validation_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles,
  command_id uuid not null,
  parcel_id uuid not null references public.lahan,
  expected_version_id uuid,
  original_polygon jsonb not null,
  computed_area_m2 numeric not null check (computed_area_m2 > 0.01 and computed_area_m2 < 1e14),
  declared_area_hectares numeric not null check (declared_area_hectares > 0 and declared_area_hectares <= 1000),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  validation_metadata jsonb not null check (jsonb_typeof(validation_metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  unique(actor_id, command_id), unique(parcel_id, id)
);
create table agriguard_geometry.versions (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.lahan,
  version_number integer not null check (version_number > 0),
  previous_version_id uuid,
  validation_receipt_id uuid not null unique,
  actor_id uuid not null references public.profiles,
  created_at timestamptz not null default clock_timestamp(),
  provenance text not null check (provenance in ('BASELINE_CAPTURED_NOT_HISTORICAL','EXPLICIT_BOUNDARY_CHANGE')),
  unique(parcel_id, id), unique(parcel_id, version_number), unique(parcel_id, previous_version_id),
  foreign key(parcel_id, previous_version_id) references agriguard_geometry.versions(parcel_id, id),
  foreign key(parcel_id, validation_receipt_id) references agriguard_geometry.validation_receipts(parcel_id, id),
  check ((version_number = 1 and previous_version_id is null and provenance = 'BASELINE_CAPTURED_NOT_HISTORICAL')
    or (version_number > 1 and previous_version_id is not null and provenance = 'EXPLICIT_BOUNDARY_CHANGE'))
);
alter table agriguard_geometry.validation_receipts add constraint receipt_expected_same_parcel
  foreign key(parcel_id, expected_version_id) references agriguard_geometry.versions(parcel_id, id);
alter table public.lahan add column current_geometry_version_id uuid;
alter table public.lahan add constraint land_head_same_parcel
  foreign key(id, current_geometry_version_id) references agriguard_geometry.versions(parcel_id, id);
alter table public.damage_reports add column geometry_version_id uuid;
alter table public.damage_reports add constraint report_geometry_same_parcel
  foreign key(lahan_id, geometry_version_id) references agriguard_geometry.versions(parcel_id, id);
-- NO UPDATE/backfill of historical reports. Null remains truthful unknown.

create table agriguard_geometry.report_intents (
  id uuid primary key,
  actor_id uuid not null references public.profiles,
  parcel_id uuid not null references public.lahan,
  captured_version_id uuid,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  foreign key(parcel_id, captured_version_id) references agriguard_geometry.versions(parcel_id, id)
);

-- A bounded DB shape/range check. Full topology + WGS84 math remain the TRUSTED
-- backend D1 validator's responsibility; no client may issue validation artifacts.
create function agriguard_geometry.ring_sane(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare n integer; stop_at integer; i integer; q jsonb; lon numeric; lat numeric;
  minx numeric := 180; maxx numeric := -180; miny numeric := 90; maxy numeric := -90;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  n := jsonb_array_length(p);
  if n < 3 or n > 501 then return false; end if;
  stop_at := case when p->0 = p->(n-1) then n-1 else n end;
  if stop_at < 3 or stop_at > 500 then return false; end if;
  for i in 0..stop_at-1 loop
    q := p->i;
    if jsonb_typeof(q) <> 'array' or jsonb_array_length(q) <> 2 then return false; end if;
    if jsonb_typeof(q->0) <> 'number' or jsonb_typeof(q->1) <> 'number' then return false; end if;
    lon := (q->>0)::numeric; lat := (q->>1)::numeric;
    if not (lon between -180 and 180 and lat > -85 and lat < 85) then return false; end if;
    minx := least(minx,lon); maxx := greatest(maxx,lon); miny := least(miny,lat); maxy := greatest(maxy,lat);
  end loop;
  if maxx-minx > 5 or maxy-miny > 5 then return false; end if;
  if (select count(distinct value) from jsonb_array_elements(p) with ordinality e(value,ordinal)
      where ordinal <= stop_at) <> stop_at then return false; end if;
  return true;
exception when others then return false;
end $$;

create function agriguard_geometry.point_covered(p jsonb, x double precision, y double precision) returns boolean
language plpgsql immutable set search_path = '' as $$
declare n integer; i integer; j integer; ax double precision; ay double precision; bx double precision; by_ double precision;
  cross_ double precision; tolerance_ double precision; inside_ boolean := false; eps constant double precision := 1e-10;
begin
  if not agriguard_geometry.ring_sane(p) or x is null or y is null
     or not (x between -180 and 180 and y between -90 and 90) then return false; end if;
  n := jsonb_array_length(p); if p->0 = p->(n-1) then n := n-1; end if;
  for i in 0..n-1 loop
    j := (i+1)%n;
    ax := (p->i->>0)::double precision; ay := (p->i->>1)::double precision;
    bx := (p->j->>0)::double precision; by_ := (p->j->>1)::double precision;
    cross_ := (bx-ax)*(y-ay)-(by_-ay)*(x-ax);
    tolerance_ := eps * sqrt((bx-ax)^2+(by_-ay)^2)
      + 16 * 2.220446049250313e-16 * (abs((bx-ax)*(y-ay))+abs((by_-ay)*(x-ax)));
    if abs(cross_) <= tolerance_ and x between least(ax,bx)-eps and greatest(ax,bx)+eps
       and y between least(ay,by_)-eps and greatest(ay,by_)+eps then return true; end if;
    if (ay > y) <> (by_ > y) then
      if x < (bx-ax)*(y-ay)/(by_-ay)+ax then inside_ := not inside_; end if;
    end if;
  end loop;
  return inside_;
end $$;

create function agriguard_geometry.append_only() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'IMMUTABLE_GEOMETRY_HISTORY'; end $$;
create trigger receipts_immutable before update or delete or truncate on agriguard_geometry.validation_receipts
  for each statement execute function agriguard_geometry.append_only();
create trigger versions_immutable before update or delete or truncate on agriguard_geometry.versions
  for each statement execute function agriguard_geometry.append_only();
create trigger intents_immutable before update or delete or truncate on agriguard_geometry.report_intents
  for each statement execute function agriguard_geometry.append_only();

create function agriguard_geometry.guard_head() returns trigger language plpgsql set search_path = '' as $$
declare v record; r record; old_number integer;
begin
  if tg_op = 'INSERT' then
    if new.current_geometry_version_id is not null then raise exception 'VERSION_RPC_REQUIRED'; end if;
    return new;
  end if;
  if old.current_geometry_version_id is not null and (new.owner_id is distinct from old.owner_id or new.poktan_id is distinct from old.poktan_id) then
    raise exception 'PARCEL_RELATIONSHIP_REVIEW_REQUIRED';
  end if;
  if new.current_geometry_version_id is not distinct from old.current_geometry_version_id
     and new.polygon is not distinct from old.polygon and new.area_hectares is not distinct from old.area_hectares then return new; end if;
  if old.current_geometry_version_id is null and new.current_geometry_version_id is null then return new; end if;
  if current_user <> 'agriguard_geometry_writer' then raise exception 'VERSION_RPC_REQUIRED'; end if;
  if new.current_geometry_version_id is null or new.current_geometry_version_id is not distinct from old.current_geometry_version_id then raise exception 'VERSION_CONFLICT'; end if;
  select * into v from agriguard_geometry.versions where id = new.current_geometry_version_id and parcel_id = new.id;
  if not found or v.previous_version_id is distinct from old.current_geometry_version_id then raise exception 'VERSION_CONFLICT'; end if;
  old_number := 0;
  if old.current_geometry_version_id is not null then select version_number into old_number from agriguard_geometry.versions where id = old.current_geometry_version_id; end if;
  if v.version_number <> old_number+1 then raise exception 'VERSION_SEQUENCE_ERROR'; end if;
  select * into r from agriguard_geometry.validation_receipts where id = v.validation_receipt_id;
  if new.polygon is distinct from r.original_polygon or new.area_hectares is distinct from r.declared_area_hectares then raise exception 'HEAD_SNAPSHOT_MISMATCH'; end if;
  return new;
end $$;
create trigger geometry_head_guard before insert or update on public.lahan
  for each row execute function agriguard_geometry.guard_head();

create function agriguard_geometry.guard_version_insert() returns trigger language plpgsql set search_path='' as $$
declare l record; r record; previous_number integer := 0;
begin
  if current_user<>'agriguard_geometry_writer' or not public.has_phone_otp_session() then raise exception 'VERSION_RPC_REQUIRED'; end if;
  select * into l from public.lahan where id=new.parcel_id for update;
  if not found or l.owner_id is distinct from auth.uid() or not exists(
    select 1 from public.profiles where id=auth.uid() and poktan_id=l.poktan_id
  ) then raise exception 'PARCEL_ACCESS_DENIED'; end if;
  select * into r from agriguard_geometry.validation_receipts where id=new.validation_receipt_id and parcel_id=new.parcel_id;
  if not found or r.actor_id<>auth.uid() or new.actor_id<>auth.uid()
    or r.expected_version_id is distinct from l.current_geometry_version_id
     or new.previous_version_id is distinct from l.current_geometry_version_id then raise exception 'VERSION_CONFLICT'; end if;
  if r.expires_at<=clock_timestamp() then raise exception 'VALIDATION_RECEIPT_EXPIRED'; end if;
  if l.current_geometry_version_id is not null then
    select version_number into previous_number from agriguard_geometry.versions where id=l.current_geometry_version_id and parcel_id=l.id;
    if not found then raise exception 'HEAD_INTEGRITY_ERROR'; end if;
  elsif l.polygon is distinct from r.original_polygon or l.area_hectares is distinct from r.declared_area_hectares then
    raise exception 'BASELINE_SNAPSHOT_CONFLICT';
  end if;
  if new.version_number<>previous_number+1 then raise exception 'VERSION_SEQUENCE_ERROR'; end if;
  new.created_at := clock_timestamp();
  return new;
end $$;
create trigger version_chain_guard before insert on agriguard_geometry.versions
  for each row execute function agriguard_geometry.guard_version_insert();

create function agriguard_geometry.guard_report() returns trigger language plpgsql set search_path = '' as $$
declare head uuid; p jsonb;
begin
  if tg_op = 'TRUNCATE' then raise exception 'REPORT_BINDING_PRESERVATION_REQUIRED'; end if;
  if tg_op = 'DELETE' then
    if old.geometry_version_id is not null then raise exception 'REPORT_BINDING_IMMUTABLE'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.geometry_version_id is distinct from old.geometry_version_id or new.lahan_id is distinct from old.lahan_id
      or new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude
      or new.user_id is distinct from old.user_id or new.idempotency_key is distinct from old.idempotency_key
      or new.photo_hash is distinct from old.photo_hash or new.photo_paths is distinct from old.photo_paths
      or new.submission_hash is distinct from old.submission_hash or new.client_created_at is distinct from old.client_created_at
      or new.server_created_at is distinct from old.server_created_at then raise exception 'REPORT_BINDING_IMMUTABLE'; end if;
    return new;
  end if;
  select current_geometry_version_id into head from public.lahan where id = new.lahan_id for update;
  if new.geometry_version_id is null then
    if head is not null then raise exception 'GEOMETRY_REFERENCE_REQUIRED'; end if;
    return new; -- Unadopted parcel, truthful legacy/unknown protocol only.
  end if;
  if current_user <> 'agriguard_geometry_writer' then raise exception 'VERSIONED_REPORT_RPC_REQUIRED'; end if;
  if head is distinct from new.geometry_version_id then raise exception 'GEOMETRY_VERSION_STALE'; end if;
  select r.original_polygon into p from agriguard_geometry.versions v
    join agriguard_geometry.validation_receipts r on r.id=v.validation_receipt_id
    where v.id=new.geometry_version_id and v.parcel_id=new.lahan_id;
  if not found or not agriguard_geometry.point_covered(p,new.longitude::double precision,new.latitude::double precision) then raise exception 'REPORT_OUTSIDE_VERSION'; end if;
  return new;
end $$;
create trigger report_geometry_guard before insert or update or delete on public.damage_reports
  for each row execute function agriguard_geometry.guard_report();
create trigger report_geometry_truncate_guard before truncate on public.damage_reports
  for each statement execute function agriguard_geometry.guard_report();

create function agriguard_geometry.guard_audit() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='TRUNCATE' then raise exception 'GEOMETRY_AUDIT_PRESERVATION_REQUIRED'; end if;
  if tg_op <> 'INSERT' and old.action in ('advance_lahan_geometry','submit_versioned_report') then raise exception 'IMMUTABLE_GEOMETRY_AUDIT'; end if;
  if tg_op <> 'DELETE' and new.action in ('advance_lahan_geometry','submit_versioned_report') and current_user <> 'agriguard_geometry_writer' then raise exception 'GEOMETRY_AUDIT_RPC_REQUIRED'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger geometry_audit_guard before insert or update or delete on public.audit_logs
  for each row execute function agriguard_geometry.guard_audit();
create trigger geometry_audit_truncate_guard before truncate on public.audit_logs
  for each statement execute function agriguard_geometry.guard_audit();

-- RLS remains enabled. NOLOGIN writer has only targeted grants/policies and no
-- membership granted to client/service roles. BYPASSRLS is NOT granted.
alter table agriguard_geometry.validation_receipts enable row level security;
alter table agriguard_geometry.versions enable row level security;
alter table agriguard_geometry.report_intents enable row level security;
revoke all on all tables in schema agriguard_geometry from public, anon, authenticated, service_role;
grant select, insert on all tables in schema agriguard_geometry to agriguard_geometry_writer;
create policy writer_receipts on agriguard_geometry.validation_receipts for all to agriguard_geometry_writer using(true) with check(true);
create policy writer_versions on agriguard_geometry.versions for all to agriguard_geometry_writer using(true) with check(true);
create policy writer_intents on agriguard_geometry.report_intents for all to agriguard_geometry_writer using(true) with check(true);
grant select on public.profiles, public.lahan, public.damage_reports, public.ai_analyses to agriguard_geometry_writer;
-- PG row locks require UPDATE on at least one column. This non-sensitive column
-- is already client-editable; no profile UPDATE is performed by these RPCs.
grant update(full_name) on public.profiles to agriguard_geometry_writer;
grant update(current_geometry_version_id,polygon,area_hectares) on public.lahan to agriguard_geometry_writer;
grant insert on public.damage_reports, public.audit_logs to agriguard_geometry_writer;
create policy geometry_writer_profiles on public.profiles for select to agriguard_geometry_writer using(true);
create policy geometry_writer_land on public.lahan for select to agriguard_geometry_writer using(true);
create policy geometry_writer_land_update on public.lahan for update to agriguard_geometry_writer using(true) with check(true);
create policy geometry_writer_report_read on public.damage_reports for select to agriguard_geometry_writer using(true);
create policy geometry_writer_report_insert on public.damage_reports for insert to agriguard_geometry_writer with check(user_id=auth.uid() and public.has_phone_otp_session());
create policy geometry_writer_ai on public.ai_analyses for select to agriguard_geometry_writer using(true);
create policy geometry_writer_audit on public.audit_logs for insert to agriguard_geometry_writer with check(actor_id=auth.uid() and action in ('advance_lahan_geometry','submit_versioned_report'));

-- This issuance RPC is SERVICE-ONLY. D1 server validation + upload/receipt
-- validation are trusted backend duties, not assertions accepted from a browser.
create function public.stage_geometry_validation(p_actor_id uuid,p_command_id uuid,p_parcel_id uuid,p_expected_version_id uuid,
  p_polygon jsonb,p_area_m2 numeric,p_declared_area numeric,p_reason text,p_validation_metadata jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing agriguard_geometry.validation_receipts; result uuid;
begin
  if p_actor_id is null or p_command_id is null then raise exception 'INVALID_COMMAND'; end if;
  if not agriguard_geometry.ring_sane(p_polygon) or p_validation_metadata->'policy'->>'version' is distinct from 'land-geometry-v1'
    or p_validation_metadata->>'method' is distinct from 'GEOGRAPHICLIB_2.2.0_KARNEY_WGS84_GEODESIC' then raise exception 'SERVER_VALIDATION_REQUIRED'; end if;
  if not exists(select 1 from public.lahan l join public.profiles a on a.id=p_actor_id
     where l.id=p_parcel_id and l.owner_id=a.id and l.poktan_id=a.poktan_id) then raise exception 'PARCEL_ACCESS_DENIED'; end if;
  if p_expected_version_id is not null and not exists(select 1 from agriguard_geometry.versions
    where id=p_expected_version_id and parcel_id=p_parcel_id) then raise exception 'VERSION_PARCEL_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended('geometry-receipt:'||p_actor_id::text||':'||p_command_id::text,0));
  select * into existing from agriguard_geometry.validation_receipts where actor_id=p_actor_id and command_id=p_command_id;
  if found then
    if existing.parcel_id is distinct from p_parcel_id or existing.expected_version_id is distinct from p_expected_version_id
      or existing.original_polygon is distinct from p_polygon or existing.computed_area_m2 is distinct from p_area_m2
      or existing.declared_area_hectares is distinct from p_declared_area or existing.reason is distinct from btrim(p_reason)
      or existing.validation_metadata is distinct from p_validation_metadata then raise exception 'COMMAND_REPLAY_CONFLICT'; end if;
    return existing.id;
  end if;
  insert into agriguard_geometry.validation_receipts(actor_id,command_id,parcel_id,expected_version_id,original_polygon,computed_area_m2,declared_area_hectares,reason,validation_metadata)
    values(p_actor_id,p_command_id,p_parcel_id,p_expected_version_id,p_polygon,p_area_m2,p_declared_area,btrim(p_reason),p_validation_metadata) returning id into result;
  return result;
end $$;

create function public.advance_lahan_geometry(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r agriguard_geometry.validation_receipts; l public.lahan; v agriguard_geometry.versions;
  head_number integer := 0; profile_group uuid;
begin
  if not public.has_phone_otp_session() then raise exception 'AUTH_REQUIRED'; end if;
  select poktan_id into profile_group from public.profiles where id=auth.uid() for share;
  if not found or not public.has_phone_otp_session() then raise exception 'AUTH_REQUIRED'; end if;
  select * into r from agriguard_geometry.validation_receipts where id=p_receipt_id and actor_id=auth.uid();
  if not found then raise exception 'VALIDATION_RECEIPT_REQUIRED'; end if;
  select * into l from public.lahan where id=r.parcel_id for update;
  if not found or l.owner_id<>auth.uid() or l.poktan_id is distinct from profile_group then raise exception 'PARCEL_ACCESS_DENIED'; end if;
  select * into v from agriguard_geometry.versions where validation_receipt_id=r.id;
  if found then return jsonb_build_object('version_id',v.id,'version_number',v.version_number,'replayed',true); end if;
  if r.expires_at<=clock_timestamp() then raise exception 'VALIDATION_RECEIPT_EXPIRED'; end if;
  if l.current_geometry_version_id is distinct from r.expected_version_id then raise exception 'VERSION_CONFLICT'; end if;
  if l.current_geometry_version_id is null then
    if l.polygon is distinct from r.original_polygon or l.area_hectares is distinct from r.declared_area_hectares then raise exception 'BASELINE_SNAPSHOT_CONFLICT'; end if;
  else
    select version_number into head_number from agriguard_geometry.versions where id=l.current_geometry_version_id and parcel_id=l.id;
    if not found then raise exception 'HEAD_INTEGRITY_ERROR'; end if;
  end if;
  insert into agriguard_geometry.versions(parcel_id,version_number,previous_version_id,validation_receipt_id,actor_id,provenance)
    values(l.id,head_number+1,l.current_geometry_version_id,r.id,auth.uid(),
      case when head_number=0 then 'BASELINE_CAPTURED_NOT_HISTORICAL' else 'EXPLICIT_BOUNDARY_CHANGE' end) returning * into v;
  update public.lahan set current_geometry_version_id=v.id,polygon=r.original_polygon,area_hectares=r.declared_area_hectares where id=l.id;
  insert into public.audit_logs(actor_id,action,entity,entity_id,meta) values(auth.uid(),'advance_lahan_geometry','lahan',l.id,
    jsonb_build_object('version_id',v.id,'previous_version_id',v.previous_version_id,'reason',r.reason,'validation_receipt_id',r.id));
  return jsonb_build_object('version_id',v.id,'version_number',v.version_number,'replayed',false);
end $$;

create function public.stage_report_geometry_intent(p_actor_id uuid,p_command_id uuid,p_captured_version_id uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing agriguard_geometry.report_intents; parcel uuid; key_ uuid; path text; i integer := 0; source_ text;
begin
  if p_actor_id is null or p_command_id is null then raise exception 'INVALID_COMMAND'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or not(p_payload ?& array['id','user_id','lahan_id','idempotency_key','latitude','longitude','client_created_at','photo_paths','photo_hash','submission_hash','evidence_source'])
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('id','user_id','lahan_id','idempotency_key','latitude','longitude','client_created_at','photo_paths','photo_hash','submission_hash','evidence_source','manual_status','ai_analysis_id'))
    or (p_payload->>'user_id')::uuid is distinct from p_actor_id
    or not coalesce(p_payload->>'submission_hash' ~ '^[a-f0-9]{64}$',false)
    or not coalesce(p_payload->>'photo_hash' ~ '^[a-f0-9]{64}$',false)
    or jsonb_typeof(p_payload->'photo_paths') is distinct from 'array' then raise exception 'SERVER_REPORT_VALIDATION_REQUIRED'; end if;
  parcel := (p_payload->>'lahan_id')::uuid;
  key_ := (p_payload->>'idempotency_key')::uuid;
  if (p_payload->>'id')::uuid is null or parcel is null or key_ is null
    or not coalesce(isfinite((p_payload->>'client_created_at')::timestamptz),false) then raise exception 'SERVER_REPORT_VALIDATION_REQUIRED'; end if;
  if jsonb_typeof(p_payload->'latitude') is distinct from 'number' or jsonb_typeof(p_payload->'longitude') is distinct from 'number'
    or not((p_payload->>'latitude')::numeric between -90 and 90 and (p_payload->>'longitude')::numeric between -180 and 180) then raise exception 'INVALID_REPORT_COORDINATES'; end if;
  if not exists(select 1 from public.lahan l join public.profiles a on a.id=p_actor_id
     where l.id=parcel and (l.owner_id=a.id or l.poktan_id=a.poktan_id)) then raise exception 'PARCEL_ACCESS_DENIED'; end if;
  if p_captured_version_id is not null and not exists(select 1 from agriguard_geometry.versions
    where id=p_captured_version_id and parcel_id=parcel) then raise exception 'VERSION_PARCEL_MISMATCH'; end if;
  source_ := p_payload->>'evidence_source';
  if source_='manual' then
    if not coalesce(p_payload->>'manual_status' in ('aman','rusak_ringan','rusak_berat'),false)
      or p_payload->>'ai_analysis_id' is not null then raise exception 'INVALID_EVIDENCE_SOURCE'; end if;
  elsif source_='server_ai' then
    if (p_payload->>'ai_analysis_id')::uuid is null or p_payload->>'manual_status' is not null then raise exception 'INVALID_EVIDENCE_SOURCE'; end if;
  elsif source_ is distinct from 'pending' or p_payload->>'manual_status' is not null
    or p_payload->>'ai_analysis_id' is not null then raise exception 'INVALID_EVIDENCE_SOURCE'; end if;
  if jsonb_array_length(p_payload->'photo_paths') not between 1 and 3 then raise exception 'PHOTO_EVIDENCE_MISMATCH'; end if;
  for path in select jsonb_array_elements_text(p_payload->'photo_paths') loop
    if path is null or path !~ ('^'||p_actor_id::text||'/reports/'||key_::text||'/'||i::text||'_[a-f0-9]{64}\.(png|jpg)$') then raise exception 'PHOTO_EVIDENCE_MISMATCH'; end if;
    if i=0 and path !~ ('/'||i::text||'_'||(p_payload->>'photo_hash')||'\.(png|jpg)$') then raise exception 'PHOTO_EVIDENCE_MISMATCH'; end if;
    i := i+1;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('report-intent:'||p_command_id::text,0));
  select * into existing from agriguard_geometry.report_intents where id=p_command_id;
  if found then
    if existing.actor_id is distinct from p_actor_id or existing.parcel_id is distinct from parcel
      or existing.captured_version_id is distinct from p_captured_version_id or existing.payload is distinct from p_payload then raise exception 'COMMAND_REPLAY_CONFLICT'; end if;
    return existing.id;
  end if;
  insert into agriguard_geometry.report_intents(id,actor_id,parcel_id,captured_version_id,payload)
    values(p_command_id,p_actor_id,parcel,p_captured_version_id,p_payload);
  return p_command_id;
end $$;

create function public.commit_report_with_geometry(p_intent_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intent agriguard_geometry.report_intents; payload jsonb; l public.lahan; old public.damage_reports;
  created public.damage_reports; polygon jsonb; group_id uuid; key uuid; analysis public.ai_analyses;
  source_ text; status_ public.ai_status; manual_ public.ai_status; confidence_ numeric; damage_ numeric; analysis_id_ uuid;
begin
  if not public.has_phone_otp_session() then raise exception 'AUTH_REQUIRED'; end if;
  select * into intent from agriguard_geometry.report_intents where id=p_intent_id and actor_id=auth.uid();
  if not found then raise exception 'REPORT_INTENT_REQUIRED'; end if;
  payload := intent.payload; key := (payload->>'idempotency_key')::uuid;
  -- Global report-key lock first, then actor/profile, then parcel. Hash collisions
  -- only add serialization; the existing UNIQUE idempotency constraint remains.
  perform pg_advisory_xact_lock(hashtextextended(key::text,0));
  select * into old from public.damage_reports where idempotency_key=key;
  if found then
    if old.user_id<>auth.uid() or (old.submission_hash is not null and old.submission_hash is distinct from payload->>'submission_hash')
      or old.lahan_id<>intent.parcel_id or old.photo_hash is distinct from payload->>'photo_hash'
      or old.latitude is distinct from (payload->>'latitude')::numeric or old.longitude is distinct from (payload->>'longitude')::numeric
      or cardinality(old.photo_paths)<>jsonb_array_length(payload->'photo_paths') then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if intent.captured_version_id is not null and old.geometry_version_id is distinct from intent.captured_version_id then raise exception 'IDEMPOTENCY_GEOMETRY_CONFLICT'; end if;
    return jsonb_build_object('id',old.id,'user_id',old.user_id,'idempotency_key',old.idempotency_key,
      'geometry_version_id',old.geometry_version_id,'boundary_status',case when old.geometry_version_id is null then 'LEGACY_BOUNDARY_UNKNOWN' else 'VERSION_BOUND' end,'replayed',true);
  end if;
  if intent.expires_at<=clock_timestamp() then raise exception 'REPORT_INTENT_EXPIRED'; end if;
  select poktan_id into group_id from public.profiles where id=auth.uid() for share;
  if not found or not public.has_phone_otp_session() then raise exception 'AUTH_REQUIRED'; end if;
  select * into l from public.lahan where id=intent.parcel_id for update;
  if not found or not coalesce(l.owner_id=auth.uid() or l.poktan_id=group_id,false) then raise exception 'PARCEL_ACCESS_DENIED'; end if;
  if intent.captured_version_id is null then raise exception 'GEOMETRY_REFERENCE_REQUIRED'; end if;
  if l.current_geometry_version_id is distinct from intent.captured_version_id then raise exception 'GEOMETRY_VERSION_STALE'; end if;
  select r.original_polygon into polygon from agriguard_geometry.versions v join agriguard_geometry.validation_receipts r on r.id=v.validation_receipt_id
    where v.id=intent.captured_version_id and v.parcel_id=l.id;
  if not found then raise exception 'VERSION_PARCEL_MISMATCH'; end if;
  if not agriguard_geometry.point_covered(polygon,(payload->>'longitude')::double precision,(payload->>'latitude')::double precision) then raise exception 'REPORT_OUTSIDE_VERSION'; end if;
  source_ := payload->>'evidence_source';
  if source_='server_ai' then
    select * into analysis from public.ai_analyses where id=(payload->>'ai_analysis_id')::uuid and user_id=auth.uid() and photo_hash=payload->>'photo_hash';
    if not found then raise exception 'AI_RECEIPT_MISMATCH'; end if;
    status_:=analysis.status; confidence_:=analysis.confidence; damage_:=analysis.damage_pct; analysis_id_:=analysis.id;
  elsif source_='manual' then manual_:=(payload->>'manual_status')::public.ai_status; if manual_ is null then raise exception 'INVALID_MANUAL_STATUS'; end if; status_:=manual_;
  elsif source_<>'pending' or source_ is null then raise exception 'INVALID_EVIDENCE_SOURCE'; end if;
  insert into public.damage_reports(id,user_id,lahan_id,photo_paths,photo_hash,latitude,longitude,client_created_at,server_created_at,idempotency_key,submission_hash,
    evidence_source,manual_status,ai_status,ai_confidence,ai_damage_pct,ai_analysis_id,geometry_version_id,is_verified,verified_by,verified_at,verification_note)
  values((payload->>'id')::uuid,auth.uid(),l.id,array(select jsonb_array_elements_text(payload->'photo_paths')),payload->>'photo_hash',
    (payload->>'latitude')::numeric,(payload->>'longitude')::numeric,(payload->>'client_created_at')::timestamptz,clock_timestamp(),key,payload->>'submission_hash',
    source_,manual_,status_,confidence_,damage_,analysis_id_,intent.captured_version_id,false,null,null,null) returning * into created;
  insert into public.audit_logs(actor_id,action,entity,entity_id,meta) values(auth.uid(),'submit_versioned_report','damage_reports',created.id,
    jsonb_build_object('parcel_id',l.id,'geometry_version_id',created.geometry_version_id,'intent_id',intent.id));
  return jsonb_build_object('id',created.id,'user_id',created.user_id,'idempotency_key',created.idempotency_key,
    'geometry_version_id',created.geometry_version_id,'boundary_status','VERSION_BOUND','replayed',false);
end $$;

create function public.get_lahan_geometry_version(p_version_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v agriguard_geometry.versions; r agriguard_geometry.validation_receipts;
begin
  if not public.has_phone_otp_session() then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from agriguard_geometry.versions where id=p_version_id;
  if not found or not (exists(select 1 from public.lahan l join public.profiles p on p.id=auth.uid()
       where l.id=v.parcel_id and (l.owner_id=p.id or l.poktan_id=p.poktan_id or p.role='dinas'))
    or exists(select 1 from public.damage_reports where geometry_version_id=v.id and user_id=auth.uid())) then raise exception 'PARCEL_ACCESS_DENIED'; end if;
  select * into r from agriguard_geometry.validation_receipts where id=v.validation_receipt_id;
  return jsonb_build_object('version_id',v.id,'parcel_id',v.parcel_id,'version_number',v.version_number,'previous_version_id',v.previous_version_id,
    'polygon',r.original_polygon,'computed_area_m2',r.computed_area_m2,'computed_area_hectares',r.computed_area_m2/10000,
    'declared_area_hectares',r.declared_area_hectares,'actor_id',v.actor_id,'created_at',v.created_at,'reason',r.reason,
    'validation_metadata',r.validation_metadata,'provenance',v.provenance,'review_status','UNVERIFIED','ownership_verified',false);
end $$;

create view public.damage_report_geometry_context with(security_invoker=true) as
  select id as report_id,lahan_id as parcel_id,geometry_version_id,
    case when geometry_version_id is null then 'LEGACY_BOUNDARY_UNKNOWN' else 'VERSION_BOUND' end as boundary_status from public.damage_reports;
revoke all on public.damage_report_geometry_context from public,anon,authenticated,service_role;
grant select on public.damage_report_geometry_context to authenticated;

-- Function ownership is the unforgeable write capability, NOT a user-settable
-- custom GUC. DB administrators can still disable triggers/change ownership.
alter function public.stage_geometry_validation(uuid,uuid,uuid,uuid,jsonb,numeric,numeric,text,jsonb) owner to agriguard_geometry_writer;
alter function public.advance_lahan_geometry(uuid) owner to agriguard_geometry_writer;
alter function public.stage_report_geometry_intent(uuid,uuid,uuid,jsonb) owner to agriguard_geometry_writer;
alter function public.commit_report_with_geometry(uuid) owner to agriguard_geometry_writer;
alter function public.get_lahan_geometry_version(uuid) owner to agriguard_geometry_writer;
revoke all on all functions in schema agriguard_geometry from public,anon,authenticated,service_role;
grant execute on all functions in schema agriguard_geometry to agriguard_geometry_writer;
revoke all on function public.stage_geometry_validation(uuid,uuid,uuid,uuid,jsonb,numeric,numeric,text,jsonb),
  public.advance_lahan_geometry(uuid),public.stage_report_geometry_intent(uuid,uuid,uuid,jsonb),
  public.commit_report_with_geometry(uuid),public.get_lahan_geometry_version(uuid) from public,anon,authenticated,service_role;
grant execute on function public.stage_geometry_validation(uuid,uuid,uuid,uuid,jsonb,numeric,numeric,text,jsonb),
  public.stage_report_geometry_intent(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.advance_lahan_geometry(uuid),public.commit_report_with_geometry(uuid),public.get_lahan_geometry_version(uuid) to authenticated;
revoke create on schema public,agriguard_geometry from agriguard_geometry_writer;
commit;
