insert into public.organizations (id, slug, name, assistant_name)
values ('10000000-0000-0000-0000-000000000001', 'ursvik-ik', 'Ursvik IK', 'Urre');

insert into public.teams (id, organization_id, name, season)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'F2016',
  '2026/2027'
);

insert into public.people (id, organization_id, display_name)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Elsa'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Tilda'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Amal'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Nora'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Pavit');

insert into public.memberships (organization_id, person_id, team_id, role)
select
  '10000000-0000-0000-0000-000000000001',
  id,
  '20000000-0000-0000-0000-000000000001',
  'participant'
from public.people
where organization_id = '10000000-0000-0000-0000-000000000001';

insert into public.activities (id, organization_id, team_id, title, starts_at, ends_at, location)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Utomhusträning',
  '2026-09-24 18:30:00+02',
  '2026-09-24 20:00:00+02',
  'Ursviks IP · Plan 2'
);

insert into public.invitations (organization_id, activity_id, person_id, response, responded_at)
select
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  id,
  case display_name
    when 'Elsa' then 'accepted'
    when 'Tilda' then 'accepted'
    when 'Amal' then 'declined'
    else 'pending'
  end,
  case when display_name in ('Elsa', 'Tilda', 'Amal') then now() else null end
from public.people
where organization_id = '10000000-0000-0000-0000-000000000001';
