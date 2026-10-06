begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'manager-a@example.se', '{"display_name":"Manager A"}'),
  ('a0000000-0000-0000-0000-000000000002', 'guardian-a@example.se', '{"display_name":"Guardian A"}'),
  ('a0000000-0000-0000-0000-000000000003', 'member-b@example.se', '{"display_name":"Member B"}'),
  ('a0000000-0000-0000-0000-000000000004', 'admin@example.se', '{"display_name":"Admin"}');

insert into public.organizations (id, slug, name)
values ('a1000000-0000-0000-0000-000000000001', 'duty-management-test', 'Invitation RLS test');

insert into public.organization_members (organization_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'member'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'member'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'member'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'admin');

insert into public.sections (id, organization_id, slug, name)
values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'fotboll', 'Fotboll');

insert into public.teams (id, organization_id, section_id, slug, name, season) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'team-a', 'Team A', '2026'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'team-b', 'Team B', '2026');

insert into public.team_access_assignments (organization_id, team_id, person_id, access_profile_id)
select
  'a1000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  person.id,
  profile.id
from public.people person
join public.team_access_profiles profile
  on profile.organization_id = person.organization_id
 and profile.key = 'team_admin'
where person.organization_id = 'a1000000-0000-0000-0000-000000000001'
  and person.user_id = 'a0000000-0000-0000-0000-000000000001';

insert into public.people (id, organization_id, user_id, display_name) values
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', null, 'Child A'),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Member B')
-- Organization membership already creates the user's person via a trigger.
on conflict (organization_id, user_id) do update
  set id = excluded.id, display_name = excluded.display_name;

insert into public.person_guardians (organization_id, person_id, guardian_user_id)
values ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');

insert into public.memberships (organization_id, person_id, team_id, role) values
  ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'participant'),
  ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', 'participant');


update public.person_guardians set contact_name='Guardian A', contact_phone='+46701234567'
where guardian_user_id='a0000000-0000-0000-0000-000000000002';
set local role anon;
select lives_ok($q$select id,slug,name,assistant_name,time_zone,discipline_id from public.organizations$q$, 'Anonymous organization query works');
select lives_ok($q$select id,organization_id,slug,name,discipline_id from public.sections$q$, 'Anonymous section query works');
select lives_ok($q$select id,organization_id,section_id,slug,name,season,discipline_id from public.teams$q$, 'Anonymous team query works');
select throws_ok($q$select created_by from public.organizations$q$, '42501', null, 'Internal organization columns stay private');
select throws_ok($q$select public.team_contact_directory('a3000000-0000-0000-0000-000000000001')$q$, '42501', null, 'Anonymous cannot read contacts');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(jsonb_array_length(public.team_contact_directory('a3000000-0000-0000-0000-000000000001')), 1, 'Guardian can read own team');
select is(public.team_contact_directory('a3000000-0000-0000-0000-000000000001')->0->'guardians'->0->>'email', 'guardian-a@example.se', 'Guardian contact included');
select ok(not ((public.team_contact_directory('a3000000-0000-0000-0000-000000000001')->0) ? 'user_id'), 'Account identifiers are not exposed');
select throws_ok($q$select public.team_contact_directory('a3000000-0000-0000-0000-000000000002')$q$, '42501', null, 'Guardian cannot read another team');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is(public.team_contact_directory('a3000000-0000-0000-0000-000000000002')->0->>'email', null, 'Player account email stays private');
select throws_ok($q$select public.team_contact_directory('a3000000-0000-0000-0000-000000000001')$q$, '42501', null, 'Unrelated member cannot read contacts');
reset role;
update public.memberships set starts_on=current_date-2, ends_on=current_date-1 where person_id='a5000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.team_contact_directory('a3000000-0000-0000-0000-000000000001')$q$, '42501', null, 'Former guardian loses directory access');
reset role;
select ok(exists(select 1 from public.audit_log where action='team.directory.read'), 'Directory reads are audited');
select * from finish();
rollback;
