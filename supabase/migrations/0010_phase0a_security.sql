-- PHASE 0A. Review and test on LOCAL/STAGING before activation.
-- Prerequisite: link legacy users' verified phone identities to their EXISTING
-- auth UUIDs and configure Supabase Phone Auth. No auth credentials/data are
-- changed by this migration. Password-only sessions are intentionally denied.
begin;

create or replace function public.has_phone_otp_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->>'phone', '') <> ''
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.phone = auth.jwt()->>'phone')
    and exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end
      ) as entry where entry->>'method' = 'otp'
    );
$$;

revoke all on function public.has_phone_otp_session() from public, anon;
grant execute on function public.has_phone_otp_session() to authenticated;

-- Restrictive policies compose with existing permissive policies. They also
-- protect direct REST/Storage access using legacy predictable passwords.
do $$
declare t text;
begin
  foreach t in array array['profiles','poktan','lahan','damage_reports','water_levels','audit_logs'] loop
    execute format('create policy phase0a_phone_otp on public.%I as restrictive for all to authenticated using (public.has_phone_otp_session()) with check (public.has_phone_otp_session())', t);
  end loop;
end;
$$;
create policy phase0a_phone_otp_photos on storage.objects as restrictive
  for all to authenticated
  using (bucket_id <> 'photos' or public.has_phone_otp_session())
  with check (bucket_id <> 'photos' or public.has_phone_otp_session());

-- RLS is row-level, not column-level. Privileged profile fields cannot be
-- updated by any browser/API client, including an officer's authenticated JWT.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

create or replace function public.complete_onboarding(p_full_name text, p_invite_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid; current_group uuid;
begin
  if not public.has_phone_otp_session() then raise insufficient_privilege using message = 'Phone OTP required'; end if;
  if length(btrim(p_full_name)) not between 1 and 100 or p_full_name is null then
    raise invalid_parameter_value using message = 'Invalid name';
  end if;
  select id into target from public.poktan where invite_code = upper(btrim(p_invite_code));
  if target is null then raise invalid_parameter_value using message = 'Invalid invitation'; end if;
  select poktan_id into current_group from public.profiles where id = auth.uid() for update;
  if not found then raise insufficient_privilege using message = 'Profile not available'; end if;
  if current_group is not null and current_group <> target then
    raise insufficient_privilege using message = 'Group changes require an administrator';
  end if;
  update public.profiles set full_name = btrim(p_full_name), poktan_id = target where id = auth.uid();
end;
$$;
revoke all on function public.complete_onboarding(text,text) from public, anon;
grant execute on function public.complete_onboarding(text,text) to authenticated;

-- Native Phone Auth users get their trusted Auth phone, never client role/group
-- metadata. Existing accounts/roles are not updated or recreated.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, full_name, role, poktan_id)
  values (
    new.id, coalesce(nullif(new.phone, ''), new.id::text),
    left(coalesce(new.raw_user_meta_data->>'full_name', ''), 100),
    'petani'::public.user_role, null
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.can_review_lahan(target_lahan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.lahan l on l.id = target_lahan
    where p.id = auth.uid() and (
      p.role = 'dinas' or (p.role = 'ppl' and p.poktan_id = l.poktan_id)
    )
  );
$$;
revoke all on function public.can_review_lahan(uuid) from public, anon;
grant execute on function public.can_review_lahan(uuid) to authenticated;

drop policy profiles_select_ppl_dinas on public.profiles;
create policy profiles_select_officer_scope on public.profiles for select to authenticated using (
  public.current_user_role() = 'dinas' or
  (public.current_user_role() = 'ppl' and public.user_belongs_to_poktan(poktan_id))
);
drop policy poktan_select_authenticated on public.poktan;
create policy poktan_select_scope on public.poktan for select to authenticated using (
  public.user_belongs_to_poktan(id) or public.current_user_role() = 'dinas'
);
-- Invite codes are resolved only by the onboarding RPC.
revoke select on public.poktan from anon, authenticated;
grant select (id, name, village, district, created_at) on public.poktan to authenticated;
drop policy lahan_select_owner_or_poktan on public.lahan;
create policy lahan_select_owner_or_poktan on public.lahan for select to authenticated using (
  owner_id = auth.uid() or public.user_belongs_to_poktan(poktan_id) or public.current_user_role() = 'dinas'
);
drop policy reports_select_own_or_poktan_or_ppl_dinas on public.damage_reports;
create policy reports_select_scope on public.damage_reports for select to authenticated using (
  user_id = auth.uid() or public.user_shares_lahan(lahan_id) or public.can_review_lahan(lahan_id)
);

-- The server records validated, photo-bound inference results. Clients can
-- inspect their own receipts, but cannot insert or edit them.
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles,
  photo_hash text not null check (photo_hash ~ '^[a-f0-9]{64}$'),
  status public.ai_status not null,
  confidence numeric not null check (confidence between 0 and 1),
  damage_pct numeric not null check (damage_pct between 0 and 100),
  analyzer text not null default 'fastapi_predict',
  created_at timestamptz not null default now()
);
alter table public.ai_analyses enable row level security;
create policy ai_analyses_select_own on public.ai_analyses for select to authenticated
  using (user_id = auth.uid() and public.has_phone_otp_session());
revoke all on public.ai_analyses from anon, authenticated, service_role;
grant select on public.ai_analyses to authenticated;
grant select, insert on public.ai_analyses to service_role;

-- Existing report values remain intact and are explicitly legacy/unverified.
alter table public.damage_reports
  add column evidence_source text not null default 'legacy_unverified',
  add column manual_status public.ai_status,
  add column ai_analysis_id uuid references public.ai_analyses,
  add column submission_hash text;
alter table public.damage_reports add constraint reports_evidence_source_check
  check (evidence_source in ('legacy_unverified','pending','manual','server_ai'));
alter table public.damage_reports add constraint reports_evidence_shape_check check (
  evidence_source = 'legacy_unverified' or
  (evidence_source = 'pending' and ai_status is null and ai_confidence is null and ai_damage_pct is null and manual_status is null and ai_analysis_id is null) or
  (evidence_source = 'manual' and manual_status is not null and ai_status is not null and ai_status = manual_status and ai_confidence is null and ai_damage_pct is null and ai_analysis_id is null) or
  (evidence_source = 'server_ai' and ai_status is not null and ai_confidence is not null and ai_damage_pct is not null and ai_confidence between 0 and 1 and ai_damage_pct between 0 and 100 and ai_analysis_id is not null and manual_status is null)
);

-- Report creation/evidence updates only occur after server validation. Officer
-- decisions use one narrow transactional RPC, never unrestricted row UPDATE.
drop policy reports_insert_own on public.damage_reports;
drop policy reports_update_verification_ppl_dinas on public.damage_reports;
revoke insert, update, delete on public.damage_reports from anon, authenticated;
drop policy photos_insert_own on storage.objects;
drop policy photos_select_own on storage.objects;
create policy photos_select_scope on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text or exists (
      select 1 from public.damage_reports r
      where name = any(r.photo_paths) and public.can_review_lahan(r.lahan_id)
    )
  )
);

create or replace function public.verify_damage_report(p_report_id uuid, p_is_verified boolean, p_note text default null)
returns table (id uuid, is_verified boolean)
language plpgsql security definer set search_path = '' as $$
declare report public.damage_reports;
begin
  if not public.has_phone_otp_session() then raise insufficient_privilege using message = 'Phone OTP required'; end if;
  if p_is_verified is null or length(coalesce(btrim(p_note), '')) > 500 then
    raise invalid_parameter_value using message = 'Invalid verification input';
  end if;
  select r.* into report from public.damage_reports r where r.id = p_report_id for update;
  if not found or not public.can_review_lahan(report.lahan_id) then
    raise insufficient_privilege using message = 'Report not available for verification';
  end if;
  if report.is_verified or report.verified_at is not null then
    raise check_violation using message = 'Report already finalized';
  end if;
  update public.damage_reports r set
    is_verified = p_is_verified, verified_by = auth.uid(), verified_at = now(),
    verification_note = nullif(btrim(p_note), '')
    where r.id = p_report_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
    values (auth.uid(), case when p_is_verified then 'verify_report' else 'reject_report' end,
      'damage_reports', p_report_id, jsonb_build_object('note', nullif(btrim(p_note), '')));
  return query select p_report_id, p_is_verified;
end;
$$;
revoke all on function public.verify_damage_report(uuid,boolean,text) from public, anon;
grant execute on function public.verify_damage_report(uuid,boolean,text) to authenticated;

drop policy audit_select_ppl_dinas on public.audit_logs;
create policy audit_select_officer_scope on public.audit_logs for select to authenticated using (
  public.current_user_role() = 'dinas' or (
    public.current_user_role() = 'ppl' and (
      actor_id = auth.uid() or (entity = 'damage_reports' and exists (
        select 1 from public.damage_reports r where r.id = entity_id and public.can_review_lahan(r.lahan_id)
      ))
    )
  )
);

commit;
