begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'manager-a@example.se', '{"display_name":"Manager A"}'),
  ('a0000000-0000-0000-0000-000000000002', 'guardian-a@example.se', '{"display_name":"Guardian A"}'),
  ('a0000000-0000-0000-0000-000000000003', 'member-b@example.se', '{"display_name":"Member B"}'),
  ('a0000000-0000-0000-0000-000000000004', 'admin@example.se', '{"display_name":"Admin"}');

insert into public.organizations (id, slug, name)
values ('a1000000-0000-0000-0000-000000000001', 'duty-slots-test', 'Invitation RLS test');

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


update public.activity_types set system_category='work' where id='a4000000-0000-0000-0000-000000000001';
insert into public.invitations(organization_id,activity_id,person_id) values
('a1000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002');
insert into public.activity_duty_types(id,organization_id,team_id,name) values
('a7000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Café');
create temporary table duty_test_slots(label text,id uuid);
create temporary table duty_test_requests(id uuid);
grant all on duty_test_slots,duty_test_requests to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',
'{"op":"create","dutyTypeId":"a7000000-0000-0000-0000-000000000001","duties":[{"timingKind":"none","places":2}]}')$q$,'Manager creates empty slots');
insert into duty_test_slots select 'slot'||row_number() over(), (value->>'id')::uuid from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->'slots');
select throws_ok($q$update public.activity_duty_slots set person_id=null$q$,'42501',null,'Direct mutations are forbidden even for managers');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','claim','personId','a5000000-0000-0000-0000-000000000001','targetSlotId',(select id from duty_test_slots where label='slot1')))$q$,'Guardian claims for own child');
select throws_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','claim','personId','a5000000-0000-0000-0000-000000000002','targetSlotId',(select id from duty_test_slots where label='slot2')))$q$,'42501',null,'Cannot claim for another family');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','claim','personId','a5000000-0000-0000-0000-000000000002','targetSlotId',(select id from duty_test_slots where label='slot1')))$q$,'40001',null,'An occupied slot cannot be claimed twice');
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','claim','personId','a5000000-0000-0000-0000-000000000002','targetSlotId',(select id from duty_test_slots where label='slot2')))$q$,'Other player claims own slot');
select is((select value->>'personId' from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->'slots') where value->>'id'=(select id::text from duty_test_slots where label='slot1')),null::text,'Other family identity is hidden');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','propose','personId','a5000000-0000-0000-0000-000000000001','sourceSlotId',(select id from duty_test_slots where label='slot1'),'targetSlotId',(select id from duty_test_slots where label='slot2')))$q$,'Guardian proposes swap');
insert into duty_test_requests select (value->>'id')::uuid from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'requests') where value->>'status'='pending';
select is((select value->>'personId' from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->'slots') where value->>'id'=(select id::text from duty_test_slots where label='slot1')),'a5000000-0000-0000-0000-000000000001','Original assignment remains pending');
select throws_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','approve','requestId',(select id from duty_test_requests)))$q$,'42501',null,'Requester cannot approve for the counterpart');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','approve','requestId',(select id from duty_test_requests)))$q$,'Counterpart accepts swap');
select is((select value->>'personId' from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->'slots') where value->>'id'=(select id::text from duty_test_slots where label='slot1')),'a5000000-0000-0000-0000-000000000002','Swap applies both assignments');
select throws_ok($q$select public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000099')$q$,'42501',null,'Unrelated activity denied');
set local role anon;
select throws_ok($q$select public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')$q$,'42501',null,'Anonymous cannot read schedule');
select * from finish();
rollback;
