begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
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
update public.sections set discipline_id=(select id from public.disciplines where key='football') where id::text like 'e2000000-%';
insert into public.teams(id,organization_id,section_id,slug,name) values
 ('e3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','a','A'),
 ('e3000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','b','B');
insert into public.team_access_assignments(organization_id,team_id,person_id,access_profile_id)
select 'e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',p.id,ap.id
from public.people p join public.team_access_profiles ap on ap.organization_id=p.organization_id and ap.key='team_admin'
where p.organization_id='e1000000-0000-0000-0000-000000000001' and p.user_id='e0000000-0000-0000-0000-000000000002';
insert into public.activity_types(id,name,slug,system_category,discipline_id) values
 ('e4000000-0000-0000-0000-000000000001','Football match','match-tavling-test','competition',(select id from public.disciplines where key='football'));
insert into public.activity_types(id,organization_id,name,slug,system_category) values
 ('e4000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000002','Private','defaults-private','other');

set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',0,(select id from public.disciplines where key='football'),'1.0.0','{"duration":"PT60M"}')$$,'Section admin creates defaults');
select lives_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',1,(select id from public.disciplines where key='football'),'1.0.0','{"duration":null,"reminderRules":[]}')$$,'Admin restores inheritance and disables reminders');
select is((select revision from public.section_discipline_defaults where activity_type_id='e4000000-0000-0000-0000-000000000001'),2,'Revision increments');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',2,(select id from public.disciplines where key='football'),'1.0.0','{"invitationRule":"start-0000000d"}')$$,'22023','Invalid defaults','Seven-digit start offset is rejected');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',2,(select id from public.disciplines where key='football'),'1.0.0','{"reminderRules":["deadline-0000001h"]}')$$,'22023','Invalid defaults','Seven-digit deadline offset is rejected');
select lives_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',2,(select id from public.disciplines where key='football'),'1.0.0','{"invitationRule":"start-000001d-000002h/d","reminderRules":["deadline-000001h"]}')$$,'Six-digit offsets remain valid');
select lives_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',3,(select id from public.disciplines where key='football'),'1.0.0','{"duration":null,"reminderRules":[]}')$$,'Restore original defaults for remaining cases');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',1,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'40001','Defaults changed; reload','Stale revision rejected');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',4,(select id from public.disciplines where key='football'),'1.0.0','{"invitationRule":"start-367d"}')$$,'22023','Invalid defaults','Bounded rules validated in database');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000002',0,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'42501','Forbidden','Target must belong to declared organization');
select lives_ok($$select public.set_activity_discipline('section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',(select id from public.disciplines where key='football'))$$,'Section admin selects discipline');
select lives_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Test','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z')$$,'Team inherits section discipline');

select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',0,(select id from public.disciplines where key='football'),'1.0.0','{"gatheringRule":"start-15m"}')$$,'Leader saves own team defaults');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002',0,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'42501','Forbidden','Other team is denied');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',2,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'42501','Forbidden','Leader cannot edit section defaults');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','section','e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',0,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'42501','Forbidden','Leader cannot edit section defaults');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000002','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',0,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'22023','Invalid defaults','Other organization private type denied');
select throws_ok($$insert into public.activity_types(name,slug,system_category) values('Denied','defaults-denied','session')$$,'42501',null,'Leader cannot create common types');
select lives_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at,invitation_send_at,response_due_at,reminder_send_ats) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Reminders','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z','2030-10-14T16:00:00Z','2030-10-20T10:00:00Z',array['2030-10-19T10:00:00Z','2030-10-20T08:00:00Z']::timestamptz[])$$,'All reminders are persisted in one write');
select is((select count(*)::integer from public.activity_reminder_schedules r join public.activities a on a.id=r.activity_id where a.title='Reminders'),2,'Both reminder rows exist');
select lives_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,(select id from public.disciplines where key='football'),'1.0.0','{"invitationRule":"start-2d","responseDueRule":"start-1h","reminderRules":[]}')$$,'Change defaults for future activities');
select ok((select starts_at='2030-10-20T16:00:00Z' and ends_at='2030-10-20T17:00:00Z' and invitation_send_at='2030-10-14T16:00:00Z' and response_due_at='2030-10-20T10:00:00Z' and reminder_send_ats=array['2030-10-19T10:00:00Z','2030-10-20T08:00:00Z']::timestamptz[] from public.activities where title='Reminders') and (select count(*)=2 from public.activity_reminder_schedules r join public.activities a on a.id=r.activity_id where a.title='Reminders'),'Changing defaults leaves existing activity and reminder times unchanged');
select throws_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at,invitation_send_at,response_due_at,reminder_send_ats) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Invalid','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z','2030-10-14T16:00:00Z','2030-10-20T10:00:00Z',array['2030-10-14T16:00:00Z']::timestamptz[])$$,'23514','Invalid reminder schedule','Invalid reminder rolls back activity write');
select is((select count(*)::integer from public.activities where title='Invalid'),0,'Failed schedule leaves no activity');
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','organization','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001',0,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'42501','Forbidden','Ordinary member cannot write defaults');
select is((select count(*)::integer from public.team_discipline_defaults),0,'Ordinary member cannot read team configuration');

reset role;
update public.sections set discipline_id=(select id from public.disciplines where key='floorball') where id='e2000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select throws_ok($$insert into public.activities(organization_id,team_id,activity_type_id,title,starts_at,ends_at) values('e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Wrong sport','2030-10-20T16:00:00Z','2030-10-20T17:00:00Z')$$,'23514','Activity type does not match discipline','Direct writes reject wrong discipline');
select lives_ok($$update public.activities set title='Historical' where title='Test'$$,'Historical activity remains editable after discipline changes');
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000001',true);
select lives_ok($$update public.activity_types set active=false where id='e4000000-0000-0000-0000-000000000001'$$,'System admin can archive common type');
select throws_ok($$update public.activity_types set organization_id='e1000000-0000-0000-0000-000000000001' where id='e4000000-0000-0000-0000-000000000001'$$,'23514','Activity type owner is immutable','Catalogue ownership cannot be changed');
set local role anon;
select throws_ok($$select * from public.team_discipline_defaults$$,'42501',null,'Anonymous callers cannot read defaults');
reset role;
select hasnt_column('public','activities','timing_rules','Activities do not store timing expressions');
select hasnt_column('public','activities','timing_rule_version','Activities do not store a timing rule version');
select hasnt_table('public','activity_defaults','Old storage is gone');
select ok(not has_function_privilege('authenticated','public.validate_discipline_defaults_patch(jsonb,text,text,text)','EXECUTE'),'Validator is internal');
select throws_ok($$insert into public.team_discipline_defaults(organization_id,team_id,discipline_id,activity_type_id) values('e1000000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000001',(select id from public.disciplines where key='floorball'),'e4000000-0000-0000-0000-000000000001')$$,'23503',null,'Composite team FK rejects cross-tenant target');
select throws_ok($$insert into public.section_discipline_defaults(organization_id,section_id,discipline_id,activity_type_id) values('e1000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001',(select id from public.disciplines where key='floorball'),'e4000000-0000-0000-0000-000000000001')$$,'23503',null,'Composite section FK rejects cross-tenant target');
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',2,(select id from public.disciplines where key='football'),'1.0.0','{}')$$,'40001','Discipline changed; reload','Stale discipline identity is rejected');
select throws_ok($$select public.save_discipline_defaults('e4000000-0000-0000-0000-000000000001','team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',0,(select id from public.disciplines where key='floorball'),'1.0.0','{}')$$,'22023','Invalid defaults','Wrong-discipline activity type is rejected');
select throws_ok($$select public.set_activity_discipline('team','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',(select id from public.disciplines where key='football'))$$,'42501','Forbidden','Team cannot override its section discipline');
reset role;
select ok(public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"notificationsEnabled":true,"notificationHours":[168,24]}}}','football','match-tavling','competition'),'Valid capability patch accepted');
select ok(public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"notificationsEnabled":null,"notificationHours":[]}}}','football','match-tavling','competition'),'Null activation and empty controls are explicit');
select ok(not public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"notificationsEnabled":true}}}','swimming','match-tavling','competition'),'Swimming cannot configure match capability');
select ok(not public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{}}}','football','traning','session'),'Training cannot configure match capability');
select ok(not public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"notificationHours":[24,24]}}}','football','match-tavling','competition'),'Duplicate checkpoints rejected');
select ok(not public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"notificationHours":["24"]}}}','football','match-tavling','competition'),'Checkpoint strings rejected');
select ok(not public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"notificationHours":[721]}}}','football','match-tavling','competition'),'Checkpoint maximum bounded');
select ok(not public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"notificationsEnabled":"true"}}}','football','match-tavling','competition'),'Activation strings rejected');
select ok(not public.validate_discipline_defaults_patch('{"capabilities":{"targetTeamSize":{"unknown":true}}}','football','match-tavling','competition'),'Unknown capability setting rejected');
select * from finish();
rollback;
