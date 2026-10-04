begin;
create extension if not exists pgtap with schema extensions;
select plan(25);
insert into auth.users(id,email,email_confirmed_at) values
 ('e0000000-0000-0000-0000-000000000001','defaults-admin@example.test',now()),
 ('e0000000-0000-0000-0000-000000000002','defaults-leader@example.test',now()),
 ('e0000000-0000-0000-0000-000000000003','defaults-member@example.test',now());
insert into public.platform_roles(user_id,role) values('e0000000-0000-0000-0000-000000000001','system_admin');
insert into public.organizations(id,slug,name,created_by) values
 ('e1000000-0000-0000-0000-000000000001','defaults-club','Club','e0000000-0000-0000-0000-000000000001'),
 ('e1000000-0000-0000-0000-000000000002','defaults-other','Other',null);
insert into public.organization_members(organization_id,user_id,role) values
 ('e1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','member'),
 ('e1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003','member');
insert into public.sections(id,organization_id,slug,name) values
 ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','football','Football'),
 ('e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000002','other','Other');
insert into public.teams(id,organization_id,section_id,slug,name) values
 ('e3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','a','A'),
 ('e3000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','b','B');
insert into public.team_access_assignments(organization_id,team_id,person_id,access_profile_id)
select 'e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',p.id,ap.id
from public.people p join public.team_access_profiles ap on ap.organization_id=p.organization_id and ap.key='team_admin'
where p.organization_id='e1000000-0000-0000-0000-000000000001' and p.user_id='e0000000-0000-0000-0000-000000000002';
insert into public.activity_types(id,name,slug,system_category,discipline_id) values
 ('e4000000-0000-0000-0000-000000000001','Football match','defaults-football-match','competition',(select id from public.disciplines where key='football'));
insert into public.activity_types(id,organization_id,name,slug,system_category) values
 ('e4000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000002','Private','defaults-private','other');

set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','system',null,null,0,'{"duration":"PT60M"}')$$,'System admin creates defaults');
select lives_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','system',null,null,1,'{"duration":null,"reminderRules":[]}')$$,'Admin restores inheritance and disables reminders');
select is((select revision from public.activity_defaults where activity_type_id='e4000000-0000-0000-0000-000000000001' and scope='system'),2,'Revision increments');
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','system',null,null,1,'{}')$$,'40001','Defaults changed; reload','Stale revision rejected');
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','system',null,null,2,'{"invitationRule":"start-367d"}')$$,'22023','Invalid defaults','Bounded rules validated in database');
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000002',0,'{}')$$,'42501','Forbidden','Target must belong to declared organization');
select lives_ok($$select public.set_activity_discipline('organization','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001',(select id from public.disciplines where key='football'))$$,'Club admin selects discipline');
select lives_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Test','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z')$$,'Team inherits organization discipline');

select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',0,'{"gatheringRule":"start-15m"}')$$,'Leader saves own team defaults');
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002',0,'{}')$$,'42501','Forbidden','Other team is denied');
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','system',null,null,2,'{}')$$,'42501','Forbidden','Leader cannot edit system defaults');
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',0,'{}')$$,'42501','Forbidden','Leader cannot edit section defaults');
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000002','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',0,'{}')$$,'22023','Invalid defaults','Other organization private type denied');
select throws_ok($$insert into public.activity_types(name,slug,system_category) values('Denied','defaults-denied','session')$$,'42501',null,'Leader cannot create common types');
select lives_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at,invitation_send_at,response_due_at,reminder_send_ats) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Reminders','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z','2030-10-14T16:00:00Z','2030-10-20T10:00:00Z',array['2030-10-19T10:00:00Z','2030-10-20T08:00:00Z']::timestamptz[])$$,'All reminders are persisted in one write');
select is((select count(*)::integer from public.activity_reminder_schedules r join public.activities a on a.id=r.activity_id where a.title='Reminders'),2,'Both reminder rows exist');
select throws_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at,invitation_send_at,response_due_at,reminder_send_ats) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Invalid','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z','2030-10-14T16:00:00Z','2030-10-20T10:00:00Z',array['2030-10-14T16:00:00Z']::timestamptz[])$$,'23514','Invalid reminder schedule','Invalid reminder rolls back activity write');
select is((select count(*)::integer from public.activities where title='Invalid'),0,'Failed schedule leaves no activity');
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.save_activity_defaults('e4000000-0000-0000-0000-000000000001','organization','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001',0,'{}')$$,'42501','Forbidden','Ordinary member cannot write defaults');
select is((select count(*)::integer from public.activity_defaults where scope='team'),0,'Ordinary member cannot read team configuration');

reset role;
update public.teams set discipline_id=(select id from public.disciplines where key='floorball') where id='e3000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select throws_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Wrong sport','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z')$$,'23514','Activity type does not match discipline','Direct writes reject wrong discipline');
select lives_ok($$update public.activities set title='Historical' where title='Test'$$,'Historical activity remains editable after discipline changes');
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000001',true);
select lives_ok($$update public.activity_types set active=false where id='e4000000-0000-0000-0000-000000000001'$$,'System admin can archive common type');
select throws_ok($$update public.activity_types set organization_id='e1000000-0000-0000-0000-000000000001' where id='e4000000-0000-0000-0000-000000000001'$$,'23514','Activity type owner is immutable','Catalogue ownership cannot be changed');
set local role anon;
select throws_ok($$select * from public.activity_defaults$$,'42501',null,'Anonymous callers cannot read defaults');
select * from finish();
rollback;
