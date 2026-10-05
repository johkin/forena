begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
-- History is capped after visibility filtering, without hiding pending requests.
reset role;
insert into public.activity_duty_change_requests(activity_id,source_slot_id,person_id,requested_by,status,resolved_at,created_at)
select 'a6000000-0000-0000-0000-000000000001',s.id,
 'a5000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
 'withdrawn',now(),now()-n*interval '1 minute'
from duty_test_slots s cross join generate_series(1,25) n where s.label='slot2';
insert into public.activity_duty_change_requests(activity_id,source_slot_id,person_id,requested_by,status,resolved_at)
select 'a6000000-0000-0000-0000-000000000001',s.id,
 'a5000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','withdrawn',now()
from duty_test_slots s cross join generate_series(1,25) n where s.label='slot1';
truncate duty_test_requests;
with added as (
 insert into public.activity_duty_change_requests(activity_id,source_slot_id,source_revision,person_id,requested_by,counterpart_approved)
 select s.activity_id,s.id,s.revision,s.person_id,'a0000000-0000-0000-0000-000000000002',true
 from public.activity_duty_slots s join duty_test_slots t on t.id=s.id where t.label='slot2'
 returning id
) insert into duty_test_requests select id from added;
update public.activity_duty_change_requests set created_at=now()+interval '1 second' where id=(select id from duty_test_requests);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'requests'),21,'Family gets all pending plus twenty visible resolved requests');
select is((select count(*)::integer from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'requests') r where r->>'status'='pending'),1,'Pending request remains visible');
select throws_ok('select private.maintain_due_activity_duty_requests()','42501',null,'Clients cannot invoke global maintenance');
reset role;
update public.activities set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour'
where id='a6000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select r->>'status' from jsonb_array_elements(public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','approve','requestId',(select id from duty_test_requests)))->'requests') r where r->>'id'=(select id::text from duty_test_requests)),'expired','Approval expires a proposal after start even before cron runs');
reset role;
select is((select person_id::text from public.activity_duty_slots where id=(select id from duty_test_slots where label='slot2')),'a5000000-0000-0000-0000-000000000001','Late approval leaves assignment untouched');
update public.activity_duty_change_requests set status='pending',resolved_at=null where id=(select id from duty_test_requests);
select private.maintain_due_activity_duty_requests();
select is((select status from public.activity_duty_change_requests where id=(select id from duty_test_requests)),'expired','Scheduled maintenance expires started activity requests');
update public.activity_duty_change_requests set status='pending',resolved_at=null where id=(select id from duty_test_requests);
set local role authenticated;
select public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001');
reset role;
select is((select status from public.activity_duty_change_requests where id=(select id from duty_test_requests)),'expired','Schedule read expires requests between maintenance runs');
update public.activities set starts_at=now()-interval '31 days',ends_at=now()-interval '30 days'+interval '1 second'
where id='a6000000-0000-0000-0000-000000000001';
select private.maintain_due_activity_duty_requests();
select ok(exists(select 1 from public.activity_duty_change_requests where id=(select id from duty_test_requests)),'History retained until thirty days after end');
update public.activities set ends_at=now()-interval '30 days'
where id='a6000000-0000-0000-0000-000000000001';
update public.activity_duty_slots set completed_at=now()-interval '30 days' where id=(select id from duty_test_slots where label='slot2');
select private.maintain_due_activity_duty_requests();
select is((select count(*)::integer from public.activity_duty_change_requests where activity_id='a6000000-0000-0000-0000-000000000001'),0,'Resolved requests pruned at retention boundary');
select is((select count(*)::integer from public.activity_duty_slots where activity_id='a6000000-0000-0000-0000-000000000001' and person_id is not null),2,'Assigned slots survive cleanup');
select ok((select completed_at is not null from public.activity_duty_slots where id=(select id from duty_test_slots where label='slot2')),'Completion history survives cleanup');
select private.maintain_due_activity_duty_requests();
select is((select count(*)::integer from public.activity_duty_slots where activity_id='a6000000-0000-0000-0000-000000000001'),2,'Maintenance is idempotent');

select * from finish();
rollback;
