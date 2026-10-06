begin;
create extension if not exists pgtap with schema extensions;
select plan(19);
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



update public.activities
set starts_at=now()-interval '2 days', ends_at=now()-interval '2 days'+interval '1 hour'
where organization_id='a1000000-0000-0000-0000-000000000001';
update public.memberships set starts_on=current_date-30
where organization_id='a1000000-0000-0000-0000-000000000001';
insert into public.invitations(organization_id,activity_id,person_id,response,responded_at)
values('a1000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','accepted',now());
insert into public.activity_attendance_reports(id,organization_id,activity_id,reported_by)
values('a8000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001');
insert into public.activity_attendance_records(organization_id,report_id,person_id)
values('a1000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(public.activity_history_teams('a1000000-0000-0000-0000-000000000001')),1,'Only authorized history teams listed');
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session',true)->'records'->0->>'attendance','present','Guest actually attended');
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session',true)->'records'->0->'otherTeamsAtActivity'->>0,'Team B','Guest home team at the time');
select is(jsonb_array_length(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session',true)->'records'),1,'Home player excluded from guest result');
select ok(not (public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session',false)::text like '%Private family comment%'),'Private response comments excluded');
select throws_ok($q$select public.read_activity_history('a3000000-0000-0000-0000-000000000002',current_date-7,current_date,'session')$q$,'42501',null,'Other team denied');
select throws_ok($q$select public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-400,current_date,'session')$q$,'23514',null,'Unbounded queries denied');
-- Totals must use actual attendance, deduplicate people and survive detail limits.
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->'summary'->>'uniquePeople','1','Only actual attendance counts, not responses');
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->'activities'->0->>'participationCount','1','Activity shows recorded attendance');
reset role;
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,location)
values('a6000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Second training',now()-interval '1 day',now()-interval '1 day'+interval '1 hour','');
insert into public.activity_attendance_reports(id,organization_id,activity_id,reported_by)
values('a8000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001');
insert into public.activity_attendance_records(organization_id,report_id,person_id)
values('a1000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->'summary'->>'uniquePeople','1','Same person at two trainings counts once');
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->'summary'->>'participationCount','2','Attendance at two trainings counts twice');
reset role;
insert into public.people(id,organization_id,display_name)
select md5('history-summary-'||n::text)::uuid,'a1000000-0000-0000-0000-000000000001','Participant '||n::text from generate_series(1,201) n;
insert into public.activity_attendance_records(organization_id,report_id,person_id)
select 'a1000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000003',md5('history-summary-'||n::text)::uuid from generate_series(1,201) n;
set local role authenticated;
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->>'truncated','true','Large person detail list is truncated');
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->'summary'->>'uniquePeople','202','Unique total is complete beyond the detail limit');
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->'summary'->>'participationCount','203','Participation total is complete beyond the detail limit');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')$q$,'42501',null,'Guardian cannot read team history');
set local role anon;
select throws_ok($q$select public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')$q$,'42501',null,'Anonymous cannot read history');
reset role;
select ok(exists(select 1 from public.audit_log where action='activity.history.read'),'History reads audited');
delete from public.activity_attendance_reports where id='a8000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->>'unreportedActivityCount','1','Missing report is explicit');
select is(jsonb_array_length(public.read_activity_history('a3000000-0000-0000-0000-000000000001',current_date-7,current_date,'session')->'activities'),2,'Activities without a report are included');
select * from finish();
rollback;
