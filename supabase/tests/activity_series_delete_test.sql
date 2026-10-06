begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
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



insert into public.activity_series(id,organization_id,team_id,activity_type_id,title,recurrence_rule,starts_on)
values('a9000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Series','{}',current_date);
update public.activities set series_id='a9000000-0000-0000-0000-000000000001' where id='a6000000-0000-0000-0000-000000000001';
insert into public.activities(id,organization_id,team_id,activity_type_id,series_id,title,starts_at,ends_at,location,series_exception)
select 'a6000000-0000-0000-0000-000000000003',organization_id,team_id,activity_type_id,series_id,title,starts_at+interval '7 days',ends_at+interval '7 days',location,true from public.activities where id='a6000000-0000-0000-0000-000000000001';

update public.activities set status='published' where id='a6000000-0000-0000-0000-000000000001';
insert into public.activities(id,organization_id,team_id,activity_type_id,series_id,title,starts_at,ends_at,location)
select 'a6000000-0000-0000-0000-000000000004',organization_id,team_id,activity_type_id,series_id,title,starts_at+interval '14 days',ends_at+interval '14 days',location from public.activities where id='a6000000-0000-0000-0000-000000000001';
insert into public.activities(id,organization_id,team_id,activity_type_id,series_id,title,starts_at,ends_at,location)
select 'a6000000-0000-0000-0000-000000000005',organization_id,team_id,activity_type_id,series_id,title,starts_at-interval '7 days',ends_at-interval '7 days',location from public.activities where id='a6000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.delete_activity_series_from('a6000000-0000-0000-0000-000000000001')$q$,'42501',null,'Guardian cannot remove series');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($q$select public.delete_activity_series_from('a6000000-0000-0000-0000-000000000005')$q$,'23514',null,'Past anchor rejected');
select set_config('test.preview',public.delete_activity_series_from('a6000000-0000-0000-0000-000000000001')::text,true);
select is(current_setting('test.preview')::jsonb->>'count','2','Selects anchor and following occurrence');
select is(current_setting('test.preview')::jsonb->>'skipped','1','Skips explicit exception');
select is((select status from public.activities where id='a6000000-0000-0000-0000-000000000001'),'published','Preview does not write');
select throws_ok($q$select public.delete_activity_series_from('a6000000-0000-0000-0000-000000000001',false,'stale')$q$,'40001',null,'Stale preview rejected atomically');
select public.delete_activity_series_from('a6000000-0000-0000-0000-000000000001',false,current_setting('test.preview')::jsonb->>'token');
select is((select status from public.activities where id='a6000000-0000-0000-0000-000000000001'),'cancelled','Answered activity cancelled');
select is((select count(*)::integer from public.activities where id='a6000000-0000-0000-0000-000000000004'),0,'Unanswered following activity deleted');
select is((select count(*)::integer from public.activities where id in ('a6000000-0000-0000-0000-000000000003','a6000000-0000-0000-0000-000000000005')),2,'Exception and past activity survive');
select is((select response from public.invitations where activity_id='a6000000-0000-0000-0000-000000000001'),'declined','Answer survives cancellation');
select is((select count(*)::integer from public.activities where id='a6000000-0000-0000-0000-000000000002'),1,'Other team untouched');
select * from finish();
rollback;
