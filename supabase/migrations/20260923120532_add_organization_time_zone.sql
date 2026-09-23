alter table public.organizations
add column time_zone text not null default 'Europe/Stockholm';

create or replace function public.validate_organization_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names
    where name = new.time_zone
  ) then
    raise exception 'Ogiltig IANA-tidszon: %', new.time_zone;
  end if;
  return new;
end;
$$;

create trigger organizations_validate_time_zone
before insert or update of time_zone on public.organizations
for each row execute function public.validate_organization_time_zone();
