-- PHASE 2.0J.1: Rollback SQL for staging-only Send SMS Auth Hook.
-- Execute AFTER disabling hook_send_sms_enabled via Management API / Dashboard.
-- Target ref (must be verified outside SQL): zlluhylmykoymynnjxjs ONLY.
begin;
drop function if exists public.staging_send_sms_hook(jsonb);
commit;
