-- Restrict unauthenticated public-club reads to the explicitly documented
-- columns. Supabase default table privileges can otherwise make column-level
-- grants ineffective because table-level privileges take precedence.

revoke all privileges on table public.organizations from anon;
revoke all privileges on table public.sections from anon;
revoke all privileges on table public.teams from anon;
revoke all privileges on table public.activity_types from anon;
revoke all privileges on table public.activities from anon;

grant select (id, slug, name, assistant_name, time_zone)
  on public.organizations to anon;
grant select (id, organization_id, slug, name)
  on public.sections to anon;
grant select (id, organization_id, section_id, slug, name, season)
  on public.teams to anon;
grant select (id, organization_id, system_category, active)
  on public.activity_types to anon;
grant select (
  id,
  organization_id,
  team_id,
  activity_type_id,
  title,
  starts_at,
  ends_at,
  location,
  status
) on public.activities to anon;

-- These helpers are used by authenticated RLS policies. They accept arbitrary
-- user UUIDs for internal authorization checks and must not be callable through
-- the public Data API as membership/role probes.
revoke execute on function public.is_organization_member(uuid, uuid) from public, anon;
revoke execute on function public.has_organization_role(uuid, text[], uuid) from public, anon;

grant execute on function public.is_organization_member(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.has_organization_role(uuid, text[], uuid)
  to authenticated, service_role;
