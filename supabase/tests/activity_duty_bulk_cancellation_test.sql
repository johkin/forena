begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'manager-a@example.se', '{"display_name":"Manager A"}'),
  ('a0000000-0000-0000-0000-000000000002', 'guardian-a@example.se', '{"display_name":"Guardian A"}'),
  ('a0000000-0000-0000-0000-000000000003', 'member-b@example.se', '{"display_name":"Member B"}'),
  ('a0000000-0000-0000-0000-000000000004', 'admin@example.se', '{"display_name":"Admin"}');

insert into public.organizations (id, slug, name)
values ('a1000000-0000-0000-0000-000000000001', 'duty-bulk-test', 'Invitation RLS test');

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

-- Synthetic selection: two removable duties and one completed duty.
insert into public.activity_duties(id,organization_id,activity_id,duty_type_id,timing_kind)
select ('a8000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 'a1000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001',
 'a7000000-0000-0000-0000-000000000001','none' from generate_series(1,3) i;
insert into public.activity_duty_slots(id,organization_id,activity_id,duty_id,person_id,completed_at)
select ('a9000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 'a1000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001',
 ('a8000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 'a5000000-0000-0000-0000-000000000001',case when i=3 then now() else null end
 from generate_series(1,3) i;
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,location)
select 'a6000000-0000-0000-0000-000000000003',organization_id,team_id,activity_type_id,'Other work activity',starts_at,ends_at,''
from public.activities where id='a6000000-0000-0000-0000-000000000001';
insert into public.activity_duties(id,organization_id,activity_id,duty_type_id,timing_kind)
values ('a8000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001',
'a6000000-0000-0000-0000-000000000003','a7000000-0000-0000-0000-000000000001','none');
insert into public.activity_duty_change_requests(activity_id,source_slot_id,target_slot_id,source_revision,target_revision,person_id,requested_by)
values ('a6000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001',
'a9000000-0000-0000-0000-000000000002',1,1,'a5000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002');
create temporary table bulk_selection(items jsonb);
insert into bulk_selection values ('[{"dutyId":"a8000000-0000-0000-0000-000000000001","revision":1},{"dutyId":"a8000000-0000-0000-0000-000000000002","revision":1}]');
grant select on bulk_selection to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',(select items from bulk_selection))$q$,'42501',null,'Guardian cannot bulk cancel duties');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000002',(select items from bulk_selection))$q$,'42501',null,'Manager cannot cross team boundary');
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',jsonb_set((select items from bulk_selection),'{1,dutyId}','"a8000000-0000-0000-0000-000000000004"'))$q$,'40001',null,'Duty from another activity rejects selection');
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',(select jsonb_agg(jsonb_build_object('dutyId','a8000000-0000-0000-0000-000000000001','revision',1)) from generate_series(1,101)))$q$,'23514',null,'Oversized selection is rejected');
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001','[]')$q$,'23514',null,'Empty selection is rejected');
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',jsonb_build_array((select items->0 from bulk_selection),(select items->0 from bulk_selection)))$q$,'23514',null,'Duplicate selection is rejected');
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',jsonb_set((select items from bulk_selection),'{1,revision}','999'))$q$,'40001',null,'Stale second duty rejects whole selection');
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',jsonb_set((select items from bulk_selection),'{1,dutyId}','"a8000000-0000-0000-0000-000000000003"'))$q$,'23514',null,'Completed second duty rejects whole selection');
reset role;
select is((select count(*)::integer from public.activity_duties where cancelled_at is not null and activity_id='a6000000-0000-0000-0000-000000000001'),0,'Failed batches leave every duty active');
select is((select count(*)::integer from public.activity_duty_slots where retired_at is not null and activity_id='a6000000-0000-0000-0000-000000000001'),0,'Failed batches preserve bookings');
select ok(not has_function_privilege('anon','public.cancel_activity_duties(uuid,jsonb)','EXECUTE'),'Anonymous cannot execute bulk cancellation');
set local role authenticated;
select lives_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',(select items from bulk_selection))$q$,'Two duties cancelled together');
select is(jsonb_array_length(public.get_activity_duty_schedule('a6000000-0000-0000-0000-000000000001')->'duties'),1,'Only completed duty remains visible');
reset role;
select is((select count(*)::integer from public.activity_duty_slots where retired_at is not null and person_id is null and activity_id='a6000000-0000-0000-0000-000000000001'),2,'Selected bookings released, slot history retained');
select is((select count(*)::integer from public.audit_log where action='activity_duty.cancel_duties' and entity_id='a6000000-0000-0000-0000-000000000001'),1,'One audit event for the batch');
select is((select count(*)::integer from public.notification_outbox where type='duty_update' and payload->>'reason'='cancelled' and user_id='a0000000-0000-0000-0000-000000000002'),1,'One cancellation notification for affected guardian');
select is((select jsonb_array_length(details->'previousSlots') from public.audit_log where action='activity_duty.cancel_duties' and entity_id='a6000000-0000-0000-0000-000000000001'),2,'Audit preserves previous assignments for both duties');
select is((select status from public.activity_duty_change_requests where activity_id='a6000000-0000-0000-0000-000000000001'),'expired','Affected pending request expires');
select ok((select completed_at is not null and person_id is not null and retired_at is null from public.activity_duty_slots where id='a9000000-0000-0000-0000-000000000003'),'Completed history and assignment remain intact');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($q$select public.cancel_activity_duties('a6000000-0000-0000-0000-000000000001',(select items from bulk_selection))$q$,'42501',null,'No authenticated user rejects selection');
reset role;
select * from finish();
rollback;
