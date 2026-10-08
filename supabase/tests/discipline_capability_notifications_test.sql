begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temporary table capability_test_config(profiles jsonb);
insert into capability_test_config values ('[{"key":"football","version":"1.0.0","capabilities":[{"id":"targetTeamSize","version":"1.0.0","field":{"key":"targetTeamSize","label":"Önskad matchtrupp","min":1,"max":100},"appliesTo":{"activityTypeSlugs":["match-tavling"],"categories":["competition"]},"notifications":{"type":"team_size_shortage","beforeStartHours":[72,24],"recipients":"teamInvitationManagers"}}]}]');

insert into auth.users(id,email) values
 ('fa000000-0000-4000-8000-000000000001','capability-leader@example.test'),
 ('fa000000-0000-4000-8000-000000000002','capability-member@example.test');
insert into public.organizations(id,slug,name) values
 ('fa100000-0000-4000-8000-000000000001','capability-club','Capability Club'),
 ('fa100000-0000-4000-8000-000000000002','capability-other','Other Club');
insert into public.organization_members(organization_id,user_id,role) values
 ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','owner'),
 ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','member');
insert into public.sections(id,organization_id,slug,name,discipline_id) values
 ('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','football','Fotboll',(select id from public.disciplines where key='football')),
 ('fa200000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','football','Fotboll',(select id from public.disciplines where key='football'));
insert into public.teams(id,organization_id,section_id,slug,name) values
 ('fa300000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','a','A'),
 ('fa300000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000002','b','B');
-- Organization membership creates a linked person through the existing trigger.
insert into public.team_access_assignments(organization_id,team_id,person_id,access_profile_id)
select p.organization_id,'fa300000-0000-4000-8000-000000000001',p.id,ap.id
from public.people p join public.team_access_profiles ap on ap.organization_id=p.organization_id and ap.key='team_editor'
where p.user_id='fa000000-0000-4000-8000-000000000001';
insert into public.people(id,organization_id,display_name) values
 ('fa500000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','Legacy player'),
 ('fa500000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000001','Loan player'),
 ('fa500000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000000001','Leader'),
 ('fa500000-0000-4000-8000-000000000004','fa100000-0000-4000-8000-000000000001','Unanswered player');
insert into public.memberships(organization_id,team_id,person_id,role,starts_on) values
 ('fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001','participant',current_date-1),
 ('fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000003','participant',current_date-1);
-- The leader is also a team player; the explicit activity role must win.
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status) values
 ('fa600000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',(select id from public.activity_types where organization_id is null and slug='match-tavling'),'Match',now()+interval '2 days',now()+interval '2 days 1 hour','published');
update private.football_values set values='{"targetTeamSize":3}' where activity_id='fa600000-0000-4000-8000-000000000001' and scope='activity';
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response,responded_at) values
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',null,'accepted',now()),
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000002','participant','accepted',now()),
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000003','leader','accepted',now()),
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000004','participant','pending',null);

select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),1,'Queue only for the team invitation manager');
select is((select payload->>'acceptedPlayers' from public.notification_outbox where type='team_size_shortage' and payload->>'activityId'='fa600000-0000-4000-8000-000000000001'),'2','Count legacy and loan players, not leaders');
select is((select payload->>'pendingPlayers' from public.notification_outbox where type='team_size_shortage' and payload->>'activityId'='fa600000-0000-4000-8000-000000000001'),'1','Count unanswered activity players');
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'Repeated worker run is idempotent');
select ok(not exists(select 1 from public.notification_outbox where type='team_size_shortage' and user_id='fa000000-0000-4000-8000-000000000002'),'Ordinary member receives no response counts');
select ok(not has_function_privilege('authenticated','public.queue_due_capability_notifications(jsonb,integer)','EXECUTE'),'Members cannot queue automated alerts');
select ok(not has_function_privilege('anon','public.prepare_capability_notification(uuid)','EXECUTE'),'Anonymous users cannot prepare alerts');
select ok(not has_table_privilege('authenticated','private.capability_notification_checks','SELECT'),'Deduplication state is private');

update public.invitations set response='accepted',responded_at=now() where person_id='fa500000-0000-4000-8000-000000000004';
select is(public.prepare_capability_notification((select id from public.notification_outbox where type='team_size_shortage' and payload->>'activityId'='fa600000-0000-4000-8000-000000000001')),null::jsonb,'Filled team cancels queued alert');
select is((select status from public.notification_outbox where type='team_size_shortage' and payload->>'activityId'='fa600000-0000-4000-8000-000000000001'),'cancelled','Stale alert is cancelled before delivery');
-- Pruning the outbox must not reset deduplication.
delete from public.notification_outbox where type='team_size_shortage';
update public.invitations set response='pending',responded_at=null where person_id='fa500000-0000-4000-8000-000000000004';
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'Durable deduplication survives pruning');

-- A second checkpoint reads current counts; late activities do not replay 72h.
update public.activities set starts_at=now()+interval '20 hours',ends_at=now()+interval '21 hours' where id='fa600000-0000-4000-8000-000000000001';
select is(public.queue_due_capability_notifications((select jsonb_set(profiles,'{0,capabilities,0,notifications,beforeStartHours}','[72]') from capability_test_config)),1,'Second checkpoint uses saved rule even after profile defaults change');
select is((select payload->>'beforeStartHours' from public.notification_outbox where type='team_size_shortage'),'24','Uses closest due checkpoint');
update public.team_access_assignments set ends_on=current_date-1,starts_on=current_date-2 where team_id='fa300000-0000-4000-8000-000000000001';
select is(public.prepare_capability_notification((select id from public.notification_outbox where type='team_size_shortage')),null::jsonb,'Removed team assignment cancels alert even for a club owner');
update public.team_access_assignments set ends_on=null where team_id='fa300000-0000-4000-8000-000000000001';

-- Clone fixtures with independent stages. Each exclusion gets its own activity.
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select ('fa600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,organization_id,team_id,activity_type_id,'Excluded '||n,now()+interval '20 hours',now()+interval '21 hours','published'
from public.activities cross join generate_series(2,9) n where id='fa600000-0000-4000-8000-000000000001';
update private.football_values set values='{"targetTeamSize":3}' where team_id='fa300000-0000-4000-8000-000000000001' and scope='activity';
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response)
select organization_id,id,'fa500000-0000-4000-8000-000000000004','participant','pending' from public.activities
where title like 'Excluded %' and title<>'Excluded 7';
update public.activities set status='cancelled' where title='Excluded 2';
update public.activities set source_kind='imported',external_source='capability-test',external_id='imported-match' where title='Excluded 3';
update public.activities set activity_type_id=(select id from public.activity_types where organization_id is null and slug='traning') where title='Excluded 4';
update public.activities set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where title='Excluded 5';
update private.football_values set values='{}' where activity_id=(select id from public.activities where title='Excluded 6');
insert into private.football_values(organization_id,team_id,scope,values) values
 ('fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','team','{"targetTeamSize":100}');
-- Excluded 7 has no invitations; 8 is full; 9 is a late match and should notify.
update public.invitations set response='accepted',responded_at=now() where activity_id=(select id from public.activities where title='Excluded 8');
update private.football_values set values='{"targetTeamSize":1}' where activity_id=(select id from public.activities where title='Excluded 8');
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),1,'Only late active match with invitations and shortage notifies');
select is((select count(*)::integer from private.capability_notification_checks where activity_id=(select id from public.activities where title='Excluded 9')),1,'Late match creates one checkpoint, not a burst');
update public.teams set discipline_id=(select id from public.disciplines where key='swimming') where id='fa300000-0000-4000-8000-000000000001';
select is(public.prepare_capability_notification((select id from public.notification_outbox where type='team_size_shortage' and payload->>'activityId'=(select id::text from public.activities where title='Excluded 9'))),null::jsonb,'Discipline override cancels alert');
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'Swimming override never uses football capability');

insert into public.people(id,organization_id,display_name) values
 ('fa500000-0000-4000-8000-000000000005','fa100000-0000-4000-8000-000000000002','Other club player');
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status) values
 ('fa600000-0000-4000-8000-000000000010','fa100000-0000-4000-8000-000000000002','fa300000-0000-4000-8000-000000000002',(select id from public.activity_types where organization_id is null and slug='match-tavling'),'Other club match',now()+interval '20 hours',now()+interval '21 hours','published');
update private.football_values set values='{"targetTeamSize":3}' where activity_id='fa600000-0000-4000-8000-000000000010';
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response) values
 ('fa100000-0000-4000-8000-000000000002','fa600000-0000-4000-8000-000000000010','fa500000-0000-4000-8000-000000000005','participant','pending');
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'Other club shortage cannot notify first club managers');

select * from finish();
rollback;
