-- PHASE 2.0J.1: STAGING-ONLY Fail-Closed Send SMS Auth Hook.
-- NOT a production migration (kept outside supabase/migrations/).
-- Purpose: allow hosted Supabase staging to enable Phone Auth with official
-- sms_test_otp fixed test numbers WITHOUT Twilio credentials, while ensuring
-- ANY non-test or post-expiry SMS attempt fails closed (HTTP 403) with zero
-- real SMS delivery and zero OTP logging.
--
-- Target ref (must be verified outside SQL): zlluhylmykoymynnjxjs ONLY.
-- Requires separate explicit owner approval before execution.
begin;

do $$
begin
  if to_regprocedure('public.has_phone_otp_session()') is null
    or to_regprocedure('public.verify_damage_report(uuid,boolean,text)') is null then
    raise exception 'STAGING_0010_0011_REQUIRED_BEFORE_HOOK';
  end if;
  if to_regclass('agriguard_geometry.versions') is not null then
    raise exception 'UNEXPECTED_D2_SCHEMA_ON_STAGING';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    raise exception 'SUPABASE_AUTH_ADMIN_ROLE_REQUIRED';
  end if;
end $$;

create or replace function public.staging_send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Intentionally ignore event->'sms'->>'otp' and event->'user'->>'phone'.
  -- Never log OTPs, never deliver SMS, and never return success for arbitrary
  -- phone numbers. Official sms_test_otp numbers bypass SMS dispatch in GoTrue
  -- before this hook is called (until sms_test_otp_valid_until expires).
  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'SMS delivery is disabled in AgriGuard staging'
    )
  );
end;
$$;

-- Restrict execution strictly to GoTrue's internal supabase_auth_admin role.
-- Does not alter managed auth/storage schemas or any RLS policy/table grant.
grant usage on schema public to supabase_auth_admin;
revoke all on function public.staging_send_sms_hook(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.staging_send_sms_hook(jsonb)
  to supabase_auth_admin;

commit;
