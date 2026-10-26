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




update public.activities set status='published',invitation_send_at=now() where id='a6000000-0000-0000-0000-000000000001';
update public.invitations set response='pending',responded_at=null,response_comment=null where activity_id='a6000000-0000-0000-0000-000000000001';
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select 'a6000000-0000-0000-0000-000000000003',organization_id,team_id,activity_type_id,'Unsent',starts_at,ends_at,'published' from public.activities where id='a6000000-0000-0000-0000-000000000001';
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select 'a6000000-0000-0000-0000-000000000004',organization_id,team_id,activity_type_id,'Cancel unsent',starts_at,ends_at,'published' from public.activities where id='a6000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.activity_deletion_options('a6000000-0000-0000-0000-000000000001')$q$,'42501',null,'Guardian cannot inspect management actions');
select throws_ok($q$select public.set_activity_disposition('a6000000-0000-0000-0000-000000000001','cancel')$q$,'42501',null,'Guardian cannot cancel');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(public.activity_deletion_options('a6000000-0000-0000-0000-000000000001'),false,'Unanswered sent invitations prevent deletion');
select throws_ok($q$select public.set_activity_disposition('a6000000-0000-0000-0000-000000000001','delete')$q$,'55000',null,'Server rejects explicit deletion after sending');
select is(public.delete_or_cancel_activity('a6000000-0000-0000-0000-000000000001'),'cancelled','Legacy callers also preserve sent invitations');
select is((select count(*)::integer from public.invitations where activity_id='a6000000-0000-0000-0000-000000000001'),1,'Pending invitation survives cancellation');
select is(public.activity_deletion_options('a6000000-0000-0000-0000-000000000003'),true,'Unsent published activity can be deleted');
select is(public.set_activity_disposition('a6000000-0000-0000-0000-000000000003','delete'),'deleted','Unsent activity deleted');
select is((select count(*)::integer from public.activities where id='a6000000-0000-0000-0000-000000000003'),0,'Deleted activity is absent');
select is(public.set_activity_disposition('a6000000-0000-0000-0000-000000000004','cancel'),'cancelled','Unsent activity may be cancelled instead');
select is((select status from public.activities where id='a6000000-0000-0000-0000-000000000004'),'cancelled','Cancelled activity remains');
select is((select leaders_only from public.calendar_activity_audiences(array['a6000000-0000-0000-0000-000000000001'::uuid])),false,'A player invitation is not a leaders-only activity');
select is(has_function_privilege('anon','public.calendar_activity_audiences(uuid[])','EXECUTE'),false,'Anonymous callers cannot inspect audience metadata');
select * from finish();
rollback;
