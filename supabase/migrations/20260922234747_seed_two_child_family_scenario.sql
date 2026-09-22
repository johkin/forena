insert into public.teams (organization_id, section_id, name, slug, season)
select team.organization_id, team.section_id, 'F2013', 'f2013', team.season
from public.teams team
where lower(team.slug) = 'f2016'
  and not exists (
    select 1 from public.teams existing
    where existing.organization_id = team.organization_id and existing.slug = 'f2013'
  );

update public.memberships membership
set team_id = target_team.id
from public.people person
join public.teams target_team on target_team.organization_id = person.organization_id and target_team.slug = 'f2013'
where membership.person_id = person.id
  and membership.organization_id = person.organization_id
  and lower(person.display_name) like 'elsa%'
  and membership.role = 'participant'
  and membership.ends_on is null;

insert into public.people (organization_id, display_name)
select distinct person.organization_id, 'Tilda Kindgren'
from public.people person
where lower(person.display_name) like 'elsa%'
  and not exists (
    select 1 from public.people existing
    where existing.organization_id = person.organization_id
      and lower(existing.display_name) like 'tilda%'
  );

insert into public.memberships (organization_id, person_id, team_id, role)
select person.organization_id, person.id, team.id, 'participant'
from public.people person
join public.teams team on team.organization_id = person.organization_id and team.slug = 'f2016'
where lower(person.display_name) like 'tilda%'
  and not exists (
    select 1 from public.memberships membership
    where membership.person_id = person.id and membership.team_id = team.id
      and membership.role = 'participant' and membership.ends_on is null
  );

insert into public.person_guardians (organization_id, person_id, guardian_user_id)
select tilda.organization_id, tilda.id, guardian.guardian_user_id
from public.people tilda
join public.people elsa on elsa.organization_id = tilda.organization_id and lower(elsa.display_name) like 'elsa%'
join public.person_guardians guardian on guardian.person_id = elsa.id
where lower(tilda.display_name) like 'tilda%'
on conflict do nothing;

insert into public.activities (
  organization_id, team_id, activity_type_id, title, gathering_at, starts_at, ends_at, location
)
select team.organization_id, team.id, type.id, 'Träning F2013',
  '2026-09-24 17:45:00 Europe/Stockholm'::timestamptz,
  '2026-09-24 18:00:00 Europe/Stockholm'::timestamptz,
  '2026-09-24 19:30:00 Europe/Stockholm'::timestamptz,
  'Ursviks IP'
from public.teams team
join public.activity_types type on type.organization_id = team.organization_id and type.slug = 'traning'
where team.slug = 'f2013'
  and not exists (select 1 from public.activities activity where activity.team_id = team.id and activity.title = 'Träning F2013');

insert into public.activities (
  organization_id, team_id, activity_type_id, title, gathering_at, starts_at, ends_at, location
)
select team.organization_id, team.id, type.id, 'Match F2016',
  '2026-09-26 09:15:00 Europe/Stockholm'::timestamptz,
  '2026-09-26 10:00:00 Europe/Stockholm'::timestamptz,
  '2026-09-26 11:30:00 Europe/Stockholm'::timestamptz,
  'Ursviks IP'
from public.teams team
join public.activity_types type on type.organization_id = team.organization_id and type.slug = 'match-tavling'
where team.slug = 'f2016'
  and not exists (select 1 from public.activities activity where activity.team_id = team.id and activity.title = 'Match F2016');

insert into public.invitations (organization_id, activity_id, person_id)
select activity.organization_id, activity.id, person.id
from public.activities activity
join public.teams team on team.id = activity.team_id
join public.people person on person.organization_id = activity.organization_id
where (team.slug = 'f2013' and activity.title = 'Träning F2013' and lower(person.display_name) like 'elsa%')
   or (team.slug = 'f2016' and activity.title = 'Match F2016' and lower(person.display_name) like 'tilda%')
on conflict (activity_id, person_id) do nothing;
