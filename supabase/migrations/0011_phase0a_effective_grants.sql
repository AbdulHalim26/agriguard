-- PHASE 0A.1: supplement 0010; do not replace already-versioned migrations.
-- RLS does not govern TRUNCATE. Table-level REVOKE does not remove separate
-- column grants or privileges inherited through PUBLIC. No records/Auth settings
-- are changed here. Test effective permissions in an ISOLATED database first.
begin;

do $$
declare t text; cols text;
begin
  foreach t in array array['profiles','poktan','lahan','damage_reports','water_levels','audit_logs','ai_analyses'] loop
    execute format('revoke truncate, trigger, references on table public.%I from public, anon, authenticated', t);
    select string_agg(format('%I', attname), ', ' order by attnum) into cols
      from pg_catalog.pg_attribute
      where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke references (%s) on table public.%I from public, anon, authenticated', cols, t);
  end loop;
  foreach t in array array['profiles','damage_reports','poktan','ai_analyses'] loop
    select string_agg(format('%I', attname), ', ' order by attnum) into cols
      from pg_catalog.pg_attribute
      where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke all privileges (%s) on table public.%I from public, anon, authenticated', cols, t);
    if t = 'ai_analyses' then
      execute format('revoke all privileges (%s) on table public.%I from service_role', cols, t);
    end if;
  end loop;
end;
$$;

revoke all privileges on table public.profiles, public.damage_reports, public.poktan
  from public, anon, authenticated;
grant select on table public.profiles, public.damage_reports to authenticated;
grant update (full_name) on table public.profiles to authenticated;
grant select (id, name, village, district, created_at) on table public.poktan to authenticated;
-- Explicit trusted-server grants retain lookup/submission/admin recovery when
-- an installation previously relied on PUBLIC rather than direct server grants.
grant select, insert, update on table public.profiles, public.damage_reports to service_role;
grant select on table public.poktan to service_role;

revoke all privileges on table public.ai_analyses from public, anon, authenticated, service_role;
grant select on table public.ai_analyses to authenticated;
grant select, insert on table public.ai_analyses to service_role;

-- These legacy helpers from 0003 inherited PostgreSQL's default PUBLIC EXECUTE.
-- Their bodies already qualify table names; an empty path retains that behavior.
alter function public.current_user_role() set search_path = '';
alter function public.is_ppl_dinas() set search_path = '';
alter function public.user_belongs_to_poktan(uuid) set search_path = '';
alter function public.user_shares_lahan(uuid) set search_path = '';
revoke all on function public.current_user_role(), public.is_ppl_dinas(),
  public.user_belongs_to_poktan(uuid), public.user_shares_lahan(uuid) from public, anon;
grant execute on function public.current_user_role(), public.is_ppl_dinas(),
  public.user_belongs_to_poktan(uuid), public.user_shares_lahan(uuid) to authenticated;

commit;
