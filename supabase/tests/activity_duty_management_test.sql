begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
create temporary table management_duty(id uuid,revision integer);
create temporary table management_slots(label text,id uuid,revision integer);
grant all on management_duty,management_slots to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001','{"op":"create","dutyTypeId":"a7000000-0000-0000-0000-000000000001","duties":[{"timingKind":"none","places":3}]}')$q$,'Create editable duty');
insert into management_duty select (d->>'id')::uuid,(d->>'revision')::integer from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties') d;
insert into management_slots select 'slot'||row_number() over(),(s->>'id')::uuid,(s->>'revision')::integer from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->'slots') s;
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','assign','slotId',(select id from management_slots where label='slot1'),'revision',1,'personId','a5000000-0000-0000-0000-000000000001'))$q$,'Manager assigns child');
reset role;
select ok(exists(select 1 from public.notification_outbox where type='duty_update' and user_id='a0000000-0000-0000-0000-000000000002'),'Affected guardian notified');
select ok(exists(select 1 from public.notification_outbox where type='duty_update' and user_id='a0000000-0000-0000-0000-000000000001'),'Manager notified');
select ok(not exists(select 1 from public.notification_outbox where type='duty_update' and user_id='a0000000-0000-0000-0000-000000000003'),'Unrelated family not notified');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','edit_duty','dutyId',(select id from management_duty),'revision',2,'definition',jsonb_build_object('timingKind','none','places',2)))$q$,'42501',null,'Guardian cannot edit needs');
select throws_ok($q$select public.activity_duty_fairness('a6000000-0000-0000-0000-000000000001',current_date-365)$q$,'42501',null,'Guardian cannot read other families fairness data');
select throws_ok($q$select private.command_activity_duty_base('a6000000-0000-0000-0000-000000000001','{}')$q$,'42501',null,'Original command is not a bypass');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','edit_duty','dutyId',(select id from management_duty),'revision',2,'definition',jsonb_build_object('timingKind','none','places',2,'instructions','Opening')))$q$,'Edit instructions and remove empty place');
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->'slots'),2,'Only requested number of slots remains');
select throws_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','cancel_duty','dutyId',(select id from management_duty),'revision',1))$q$,'40001',null,'Stale duty edit rejected');
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001','{"op":"edit_type","dutyTypeId":"a7000000-0000-0000-0000-000000000001","revision":1,"name":"Servering","active":false}')$q$,'Rename and deactivate catalogue type');
select is(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->>'name','Café','Existing duty name is preserved');
select throws_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001','{"op":"create","dutyTypeId":"a7000000-0000-0000-0000-000000000001","duties":[{"timingKind":"none","places":1}]}')$q$,'23514',null,'Inactive type cannot create needs');
truncate management_slots;
insert into management_slots select case when s->>'personId' is null then 'free' else 'assigned' end,(s->>'id')::uuid,(s->>'revision')::integer from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'->0->'slots') s;
select throws_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','assign_batch','assignments',jsonb_build_array(jsonb_build_object('slotId',(select id from management_slots where label='free'),'revision',(select revision from management_slots where label='free'),'personId','a5000000-0000-0000-0000-000000000002'),jsonb_build_object('slotId',(select id from management_slots where label='assigned'),'revision',999,'personId','a5000000-0000-0000-0000-000000000001'))))$q$,'40001',null,'Stale batch is rejected atomically');
reset role;
select ok((select person_id is null from public.activity_duty_slots where id=(select id from management_slots where label='free')),'Earlier item in failed batch rolled back');
set local role authenticated;
select is((select (p->>'completed')::integer from jsonb_array_elements(public.activity_duty_fairness('a6000000-0000-0000-0000-000000000001',current_date-365)) p where p->>'personId'='a5000000-0000-0000-0000-000000000001'),0,'Assigned work does not count as completed');
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','cancel_duty','dutyId',(select id from management_duty),'revision',3))$q$,'Cancel a published duty');
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'),0,'Cancelled duty hidden from schedule');
reset role;
select is((select count(*)::integer from public.activity_duty_slots where duty_id=(select id from management_duty)),3,'Cancelled duty retains all historical slot records');
select * from finish();
rollback;
