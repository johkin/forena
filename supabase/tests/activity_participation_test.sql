begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'manager-a@example.se', '{"display_name":"Manager A"}'),
  ('a0000000-0000-0000-0000-000000000002', 'guardian-a@example.se', '{"display_name":"Guardian A"}'),
  ('a0000000-0000-0000-0000-000000000003', 'member-b@example.se', '{"display_name":"Member B"}'),
  ('a0000000-0000-0000-0000-000000000004', 'admin@example.se', '{"display_name":"Admin"}');

insert into public.organizations (id, slug, name)
values ('a1000000-0000-0000-0000-000000000001', 'participation-test', 'Invitation RLS test');

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

insert into public.activity_types (id, organization_id, name, slug, system_category)
values ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Träning', 'traning', 'session');

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

insert into public.activities (id, organization_id, team_id, activity_type_id, title, starts_at, ends_at, location) values
  ('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Activity A', now() + interval '1 day', now() + interval '1 day 1 hour', ''),
  ('a6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'Activity B', now() + interval '1 day', now() + interval '1 day 1 hour', '');

insert into public.invitations (organization_id, activity_id, person_id, response, responded_at, response_comment) values
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'declined', now(), 'Private family comment A'),
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002', 'accepted', now(), 'Private comment B');


update public.activity_types set system_category = 'work' where id = 'a4000000-0000-0000-0000-000000000001';
update public.activities set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'
where id = 'a6000000-0000-0000-0000-000000000001';
insert into public.activity_duty_types(id, organization_id, team_id, name) values
('a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Städning'),
('a7000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'Grill');
insert into public.organizations(id, slug, name) values ('a1000000-0000-0000-0000-000000000002', 'other-participation', 'Other');
insert into public.people(id, organization_id, display_name) values
('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Other club');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($q$select public.add_activity_participants('a6000000-0000-0000-0000-000000000001',
 '[{"personId":"a5000000-0000-0000-0000-000000000002","role":"participant"}]', true)$q$, 'Invite a player from another team as accepted');
select is((select response from public.invitations where activity_id='a6000000-0000-0000-0000-000000000001' and person_id='a5000000-0000-0000-0000-000000000002'), 'accepted', 'Leader registration persists response');
select is((select registered_by from public.invitations where activity_id='a6000000-0000-0000-0000-000000000001' and person_id='a5000000-0000-0000-0000-000000000002'), 'a0000000-0000-0000-0000-000000000001'::uuid, 'Records registering leader');
select is((select count(*) from public.memberships where team_id='a3000000-0000-0000-0000-000000000001' and person_id='a5000000-0000-0000-0000-000000000002'), 0::bigint, 'Does not add team membership');
select throws_ok($q$select public.add_activity_participants('a6000000-0000-0000-0000-000000000001',
 '[{"personId":"a5000000-0000-0000-0000-000000000002","role":"leader"}]', false)$q$, '23514', null, 'Cannot overwrite an existing answer');
select throws_ok($q$select public.add_activity_participants('a6000000-0000-0000-0000-000000000001',
 '[{"personId":"a5000000-0000-0000-0000-000000000003","role":"participant"}]', false)$q$, '23514', null, 'Cannot invite another club person');
select lives_ok($q$update public.invitations set duty_type_id='a7000000-0000-0000-0000-000000000001', duty_completed_at=now()
 where activity_id='a6000000-0000-0000-0000-000000000001' and person_id='a5000000-0000-0000-0000-000000000002'$q$, 'Manager can record completed work');
select results_eq($q$select duty_name from public.activity_duty_history('a3000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002')$q$, array[]::text[], 'Legacy invitation metadata is not new schedule history');
select throws_ok($q$update public.invitations set duty_type_id='a7000000-0000-0000-0000-000000000002'
 where activity_id='a6000000-0000-0000-0000-000000000001' and person_id='a5000000-0000-0000-0000-000000000002'$q$, '23514', null, 'Reject duty from another team');
select throws_ok($q$select public.activity_duty_history('a3000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002')$q$, '42501', null, 'Manager cannot read another team history');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($q$update public.invitations set activity_role='leader' where person_id='a5000000-0000-0000-0000-000000000001'$q$, '42501', null, 'Guardian cannot change activity role');
select lives_ok($q$update public.invitations set response='accepted', responded_at=now() where person_id='a5000000-0000-0000-0000-000000000001'$q$, 'Guardian can still answer');
select throws_ok($q$update public.invitations set duty_type_id='a7000000-0000-0000-0000-000000000001' where person_id='a5000000-0000-0000-0000-000000000001'$q$, '42501', null, 'Guardian cannot assign duties');
select throws_ok($q$select public.add_activity_participants('a6000000-0000-0000-0000-000000000001',
 '[{"personId":"a5000000-0000-0000-0000-000000000002","role":"participant"}]', false)$q$, '42501', null, 'Guardian cannot call people');
set local role anon;
select throws_ok($q$select * from public.activity_duty_types$q$, '42501', null, 'Anonymous cannot read duties');
select throws_ok($q$select public.activity_duty_history('a3000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002')$q$, '42501', null, 'Anonymous cannot call history');
select * from finish();
rollback;
