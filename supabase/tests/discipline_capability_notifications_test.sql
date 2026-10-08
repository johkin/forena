begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temporary table capability_test_config(profiles jsonb);
insert into capability_test_config values ('[{"key":"football","version":"1.0.0","capabilities":[{"id":"targetTeamSize","version":"1.0.0","defaults":{"notificationsEnabled":false},"field":{"key":"targetTeamSize","label":"Önskad matchtrupp","min":1,"max":100},"appliesTo":{"activityTypeSlugs":["match-tavling"],"categories":["competition"]},"notifications":{"type":"team_size_shortage","beforeStartHours":[72,24],"recipients":"teamInvitationManagers"}}]}]');

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
insert into public.section_discipline_defaults(organization_id,section_id,discipline_id,activity_type_id,values)
select s.organization_id,s.id,s.discipline_id,at.id,'{"capabilities":{"targetTeamSize":{"notificationsEnabled":true}}}'::jsonb
from public.sections s cross join public.activity_types at where s.id::text like 'fa200000-%' and at.organization_id is null and at.slug='match-tavling';
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
select ok(not has_function_privilege('anon','public.prepare_capability_notification(uuid)','EXECUTE'),'Compatibility snapshot RPC remains service-only');
select ok(not has_table_privilege('authenticated','private.capability_notification_checks','SELECT'),'Deduplication state is private');

update public.invitations set response='accepted',responded_at=now() where person_id='fa500000-0000-4000-8000-000000000004';
select is((select payload->>'acceptedPlayers' from public.notification_outbox where type='team_size_shortage'),'2','Later responses do not rewrite the queued snapshot');
select is((select status from public.notification_outbox where type='team_size_shortage'),'pending','Later responses do not cancel outgoing messages');
select is((select message->>'subject' from public.notification_outbox where type='team_size_shortage'),'Matchtruppen behöver fler spelare: Match','Rendered content is ready before delivery');
select is((select status from public.claim_notification_outbox(100) where type='team_size_shortage'),'processing','Transport claims a snapshot even after the team fills');
select is((select payload->>'acceptedPlayers' from public.notification_outbox where type='team_size_shortage'),'2','Claim never refreshes domain values');
select throws_ok($$insert into public.notification_outbox(organization_id,user_id,type,payload,scheduled_at)
 values('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','activity_invitation','{}',now()+interval '1 day')$$,
 '22023','Schedule application work instead of future outgoing messages','Future application work cannot be placed in transport queue');
delete from public.notification_outbox where type='team_size_shortage';
update public.invitations set response='pending',responded_at=null where person_id='fa500000-0000-4000-8000-000000000004';
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'Enqueued checkpoint survives pruning without requiring delivery');

-- A second checkpoint reads current counts; late activities do not replay 72h.
update public.activities set starts_at=now()+interval '20 hours',ends_at=now()+interval '21 hours' where id='fa600000-0000-4000-8000-000000000001';
select is(public.queue_due_capability_notifications((select jsonb_set(profiles,'{0,capabilities,0,notifications,beforeStartHours}','[72]') from capability_test_config)),1,'Second checkpoint uses saved rule even after profile defaults change');
select is((select payload->>'beforeStartHours' from public.notification_outbox where type='team_size_shortage'),'24','Uses closest due checkpoint');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.notification_outbox where type='team_size_shortage'),1,'Current invitation manager may read their shortage payload');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.team_access_assignments set ends_on=current_date-1,starts_on=current_date-2 where team_id='fa300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.notification_outbox where type='team_size_shortage'),0,'Revoked manager cannot read queued counts through authenticated RLS, before delivery');
reset role;
select is((select status from public.notification_outbox where type='team_size_shortage'),'pending','Revocation does not invoke outgoing-queue business logic');
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'No new decision without eligible recipients');
select set_config('request.jwt.claim.sub','',true);
update public.team_access_assignments set ends_on=null where team_id='fa300000-0000-4000-8000-000000000001';

-- Clone fixtures with independent stages. Each exclusion gets its own activity.
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select ('fa600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,organization_id,team_id,activity_type_id,'Excluded '||n,now()+interval '20 hours',now()+interval '21 hours','published'
from public.activities cross join generate_series(2,9) n where id='fa600000-0000-4000-8000-000000000001';
update private.football_values set values='{"targetTeamSize":3}' where team_id='fa300000-0000-4000-8000-000000000001' and scope='activity';
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response)
select organization_id,id,'fa500000-0000-4000-8000-000000000004','participant','pending' from public.activities
where title like 'Excluded %' and title<>'Excluded 7';
update public.activities set status='cancelled',cancelled_at=now() where title='Excluded 2';
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
-- Team fields inherit separately: off overrides section on, timing remains section-owned.
insert into public.team_discipline_defaults(organization_id,team_id,discipline_id,activity_type_id,values)
select 'fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',s.discipline_id,at.id,'{"capabilities":{"targetTeamSize":{"notificationsEnabled":false,"notificationHours":[48]}}}'::jsonb
from public.sections s cross join public.activity_types at where s.id='fa200000-0000-4000-8000-000000000001' and at.organization_id is null and at.slug='match-tavling';
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select 'fa600000-0000-4000-8000-000000000011',organization_id,team_id,activity_type_id,'Disabled snapshot',starts_at,ends_at,'published' from public.activities where title='Excluded 9';
select ok(not exists(select 1 from private.activity_capability_rules where activity_id='fa600000-0000-4000-8000-000000000011'),'Explicit team off wins over section on');
update public.team_discipline_defaults set values='{"capabilities":{"targetTeamSize":{"notificationsEnabled":null,"notificationHours":[48]}}}' where team_id='fa300000-0000-4000-8000-000000000001';
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select 'fa600000-0000-4000-8000-000000000012',organization_id,team_id,activity_type_id,'Inherited snapshot',starts_at,ends_at,'published' from public.activities where title='Excluded 9';
select is((select definition#>'{notifications,beforeStartHours}' from private.activity_capability_rules where activity_id='fa600000-0000-4000-8000-000000000012'),'[48]'::jsonb,'Null inherits activation while team replaces control times');
update public.section_discipline_defaults set values='{}' where section_id='fa200000-0000-4000-8000-000000000001';
update public.team_discipline_defaults set values='{}' where team_id='fa300000-0000-4000-8000-000000000001';
select is((select definition#>'{notifications,beforeStartHours}' from private.activity_capability_rules where activity_id='fa600000-0000-4000-8000-000000000012'),'[48]'::jsonb,'Defaults changes preserve existing checkpoint snapshot');
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'Worker never activates a previously disabled match');
select ok(not exists(select 1 from private.activity_capability_rules where activity_id='fa600000-0000-4000-8000-000000000011'),'Disabled match remains without a rule after worker run');
update public.sections set discipline_id=(select id from public.disciplines where key='swimming') where id='fa200000-0000-4000-8000-000000000001';
select ok(exists(select 1 from public.notification_outbox where type='team_size_shortage' and message is not null),'Discipline changes preserve already rendered messages');
select is(public.queue_due_capability_notifications((select profiles from capability_test_config)),0,'Swimming section never uses football capability');

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
