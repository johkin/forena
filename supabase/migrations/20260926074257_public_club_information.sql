-- Public club pages expose only the organization hierarchy and published
-- activity metadata. People, invitations and attendance remain protected by
-- their existing authenticated policies.
grant select (id, slug, name, assistant_name, time_zone) on public.organizations to anon;
grant select (id, organization_id, slug, name) on public.sections to anon;
grant select (id, organization_id, section_id, slug, name, season) on public.teams to anon;
grant select (id, organization_id, system_category, active) on public.activity_types to anon;
grant select (id, organization_id, team_id, activity_type_id, title, starts_at, ends_at, location, status) on public.activities to anon;

create policy "public can read organizations"
on public.organizations for select
to anon
using (true);

create policy "public can read sections"
on public.sections for select
to anon
using (true);

create policy "public can read teams"
on public.teams for select
to anon
using (true);

create policy "public can read active activity types"
on public.activity_types for select
to anon
using (active);

create policy "public can read published activities"
on public.activities for select
to anon
using (status = 'published');
