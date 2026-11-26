-- OWNER ONLY, on the separately created staging project BEFORE schema install.
-- Read-only emptiness check; does not identify the cloud project by itself.
begin transaction read only;
do $$ begin
  if to_regclass('public.profiles') is not null or to_regclass('public.lahan') is not null
    or to_regclass('public.damage_reports') is not null then
    raise exception 'STOP: expected a NEW staging project with no AgriGuard schema';
  end if;
  if exists(select 1 from auth.users) or exists(select 1 from storage.objects) then
    raise exception 'STOP: expected empty Auth/Storage; do not copy or reset production';
  end if;
end $$;
rollback;
