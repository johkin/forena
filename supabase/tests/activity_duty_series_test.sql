begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'manager-a@example.se', '{"display_name":"Manager A"}'),
  ('a0000000-0000-0000-0000-000000000002', 'guardian-a@example.se', '{"display_name":"Guardian A"}'),
  ('a0000000-0000-0000-0000-000000000003', 'member-b@example.se', '{"display_name":"Member B"}'),
  ('a0000000-0000-0000-0000-000000000004', 'admin@example.se', '{"display_name":"Admin"}');

insert into public.organizations (id, slug, name)
values ('a1000000-0000-0000-0000-000000000001', 'duty-series-test', 'Invitation RLS test');

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

update public.activities set ends_at=starts_at+interval '10 hours' where id='a6000000-0000-0000-0000-000000000001';
create temporary table series_state(id uuid,revision integer);
create temporary table series_template(definition jsonb);
create temporary table original_instances(id uuid,position integer);
create temporary table series_slots(first_id uuid,last_id uuid);
insert into series_template select jsonb_build_object('timingKind','interval','startsAt',starts_at,'endsAt',ends_at,'dueAt',null,'intervalMinutes',120,'places',3,'instructions','Servera','openingInstructions','Öppna','closingInstructions','Stäng') from public.activities where id='a6000000-0000-0000-0000-000000000001';
grant all on series_state,series_template,original_instances,series_slots to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','create_series','dutyTypeId','a7000000-0000-0000-0000-000000000001','definition',(select definition from series_template)))$q$,'Create five instances of one template');
insert into series_state select (g->>'id')::uuid,(g->>'revision')::integer from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'series') g;
insert into original_instances select (d->>'id')::uuid,(d->>'position')::integer from jsonb_array_elements(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'duties') d;
insert into series_slots select (public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'duties'->0->'slots'->0->>'id')::uuid,null;
select is((select count(*)::integer from series_state),1,'All five passes share a series');
select is((select count(*)::integer from original_instances),5,'Five instance IDs materialized');
select is(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'duties'->0->>'instructions',E'Servera\nÖppna','Opening instruction on first instance');
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','assign','slotId',(select first_id from series_slots),'revision',1,'personId','a5000000-0000-0000-000000000001'))$q$,'Book first pass');
select throws_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','edit_series','seriesId',(select id from series_state),'revision',(select revision from series_state),'definition',(select definition from series_template)))$q$,'40001',null,'Booking invalidates an old series preview');
update series_state set revision=(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'series'->0->>'revision')::integer;
select lives_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-000000000001',jsonb_build_object('op','edit_series','seriesId',(select id from series_state),'revision',(select revision from series_state),'definition',jsonb_set(jsonb_set((select definition from series_template),'{places}','4'),'{instructions}','"Ny instruktion"')))$q$,'Edit shared places and instructions');
reset role;
select is((select count(*)::integer from public.activity_duties where id in(select id from original_instances) and cancelled_at is null),5,'Shared edit keeps all instance IDs');
select is((select person_id::text from public.activity_duty_slots where id=(select first_id from series_slots)),'a5000000-0000-0000-0000-000000000001','Shared edit keeps booked slot and assignee');
select is((select count(*)::integer from public.activity_duty_slots s join public.activity_duties d on d.id=s.duty_id where d.series_id=(select id from series_state) and s.retired_at is null),20,'Four places created on every pass');
set local role authenticated;
update series_state set revision=(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'series'->0->>'revision')::integer;
select lives_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-000000000001',jsonb_build_object('op','edit_series','seriesId',(select id from series_state),'revision',(select revision from series_state),'definition',jsonb_set((select definition from series_template),'{intervalMinutes}','60')))$q$,'Regenerate into ten shorter passes');
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'duties'),10,'Ten active instances');
reset role;
select is((select count(*)::integer from public.activity_duties where id in(select id from original_instances) and cancelled_at is null),5,'Regeneration keeps existing instance IDs by pass number');
set local role authenticated;
update series_slots set last_id=(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'duties'->9->'slots'->0->>'id')::uuid;
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','assign','slotId',(select last_id from series_slots),'revision',2,'personId','a5000000-0000-0000-000000000002'))$q$,'Book a pass that would be removed');
update series_state set revision=(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'series'->0->>'revision')::integer;
select throws_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-0000-000000000001',jsonb_build_object('op','edit_series','seriesId',(select id from series_state),'revision',(select revision from series_state),'definition',(select definition from series_template)))$q$,'23514',null,'Cannot silently drop a booked instance');
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'duties'),10,'Failed shrink preserves entire series');
select lives_ok($q$select public.command_activity_duty('a6000000-0000-0000-000000000001',jsonb_build_object('op','assign','slotId',(select last_id from series_slots),'revision',3,'personId',null))$q$,'Release last booking explicitly');
update series_state set revision=(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'series'->0->>'revision')::integer;
select lives_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-000000000001',jsonb_build_object('op','edit_series','seriesId',(select id from series_state),'revision',(select revision from series_state),'definition',(select definition from series_template)))$q$,'Shrink after releasing bookings');
reset role;
update public.activity_duty_slots set completed_at=now() where id=(select first_id from series_slots);
set local role authenticated;
update series_state set revision=(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'series'->0->>'revision')::integer;
select throws_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-000000000001',jsonb_build_object('op','cancel_series','seriesId',(select id from series_state),'revision',(select revision from series_state)))$q$,'23514',null,'Cannot cancel completed history');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-000000000001',jsonb_build_object('op','edit_series','seriesId',(select id from series_state),'revision',(select revision from series_state),'definition',(select definition from series_template)))$q$,'42501',null,'Family cannot edit templates');
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'series'),0,'Family does not receive management metadata');
select throws_ok($q$select private.get_activity_duty_schedule_base('a6000000-0000-0000-0000-000000000001')$q$,'42501',null,'Private schedule helper is not a permission bypass');
reset role;
select ok(not has_table_privilege('authenticated','public.activity_duty_series','SELECT'),'No direct client table reads');
select ok(not has_function_privilege('anon','public.command_activity_duty_series(uuid,jsonb)','EXECUTE'),'Anonymous cannot write series');
update public.activity_duty_slots set completed_at=null where id=(select first_id from series_slots);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update series_state set revision=(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'series'->0->>'revision')::integer;
select throws_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-0000-000000000002',jsonb_build_object('op','cancel_series','seriesId',(select id from series_state),'revision',(select revision from series_state)))$q$,'42501',null,'Other team cannot be used as target');
select lives_ok($q$select public.command_activity_duty_series('a6000000-0000-0000-000000000001',jsonb_build_object('op','cancel_series','seriesId',(select id from series_state),'revision',(select revision from series_state)))$q$,'Cancel whole series together');
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-000000000001')->'duties'),0,'Cancelled instances disappear from schedule');
reset role;
select is((select count(*)::integer from public.activity_duties where series_id=(select id from series_state)),10,'All materialized history retained');
select is((select count(*)::integer from public.notification_outbox where type='duty_update' and payload->>'reason'='cancelled' and user_id='a0000000-0000-0000-000000000002'),1,'One cancellation event per affected guardian');
select is((select count(*)::integer from public.audit_log where action='activity_duty.cancel_series' and entity_id=(select id::text from series_state)),1,'Series cancellation is audited');
select * from finish();
rollback;
