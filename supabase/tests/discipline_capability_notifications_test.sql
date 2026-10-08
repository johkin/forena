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
update private.discipline_values set values='{"targetTeamSize":3}' where activity_id='fa600000-0000-4000-8000-000000000001' and scope='activity';
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response,responded_at) values
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',null,'accepted',now()),
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000002','participant','accepted',now()),
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000003','leader','accepted',now()),
 ('fa100000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000004','participant','pending',null);

-- Read infrastructure facts without evaluating shortage, applicability or text.
create temporary table loaded_contexts as select public.load_capability_contexts() as contexts;
select is((select jsonb_array_length(contexts) from loaded_contexts),1,'Loads due creation-time rules');
select is((select contexts->0->>'acceptedPlayers' from loaded_contexts),'2','Counts legacy and loan players, not explicit leaders');
select is((select contexts->0->>'pendingPlayers' from loaded_contexts),'1','Counts unanswered activity players');
select is((select contexts->0->>'invitedPlayers' from loaded_contexts),'3','Provides total invited players');
select is((select contexts->0->'completedCheckpoints' from loaded_contexts),'[]'::jsonb,'Provides durable checkpoints');
select is(jsonb_array_length(public.load_capability_contexts('fa600000-0000-4000-8000-000000000001','targetTeamSize',100)),0,'Cursor advances past evaluated context');
select ok(not has_function_privilege('authenticated','public.load_capability_contexts(uuid,text,integer)','EXECUTE'),'Members cannot read service facts');
select ok(not has_function_privilege('anon','private.queue_evaluated_capability_notifications(jsonb)','EXECUTE'),'Anonymous callers cannot enqueue proposals');
select ok(not has_function_privilege('authenticated','private.queue_evaluated_capability_notifications(jsonb)','EXECUTE'),'Members cannot enqueue proposals');
select throws_ok($$select public.queue_due_capability_notifications('[]')$$,'22023','Capability evaluation belongs to scheduled-task-worker','Old SQL evaluator is retired');

-- Proposal fixture represents a decision made by the registered implementation.
create temporary table capability_proposals(evaluation jsonb);
insert into capability_proposals values ('{"proposals":[{"activityId":"fa600000-0000-4000-8000-000000000001","capabilityId":"targetTeamSize","beforeStartHours":72,"type":"team_size_shortage","payload":{"acceptedPlayers":2,"pendingPlayers":1,"targetTeamSize":3},"message":{"subject":"Matchtruppen behöver fler spelare: Match","text":"Capability-owned content","url":"/activities/fa600000-0000-4000-8000-000000000001","tag":"shortage"}}]}');
select is(private.queue_evaluated_capability_notifications((select evaluation from capability_proposals)),1,'Only current invitation manager receives the proposal');
select is(private.queue_evaluated_capability_notifications((select evaluation from capability_proposals)),0,'Repeated proposal is idempotent');
select is((select message->>'text' from public.notification_outbox where type='team_size_shortage'),'Capability-owned content','Infrastructure preserves capability text');
select ok(not exists(select 1 from public.notification_outbox where type='team_size_shortage' and user_id='fa000000-0000-4000-8000-000000000002'),'Ordinary member receives no counts');
update public.invitations set response='accepted',responded_at=now() where person_id='fa500000-0000-4000-8000-000000000004';
select is((select payload->>'acceptedPlayers' from public.notification_outbox where type='team_size_shortage'),'2','Later responses preserve the decided payload');
select is((select status from public.claim_notification_outbox(100) where type='team_size_shortage'),'processing','Transport claims frozen snapshot after team fills');
delete from public.notification_outbox where type='team_size_shortage';
select is(private.queue_evaluated_capability_notifications((select evaluation from capability_proposals)),0,'Checkpoint survives pruning and failed delivery');

-- The next proposal may use another saved checkpoint; recipient authority is fresh.
update public.activities set starts_at=now()+interval '20 hours',ends_at=now()+interval '21 hours' where id='fa600000-0000-4000-8000-000000000001';
update capability_proposals set evaluation=jsonb_set(evaluation,'{proposals,0,beforeStartHours}','24');
update public.team_access_assignments set ends_on=current_date-1,starts_on=current_date-2 where team_id='fa300000-0000-4000-8000-000000000001';
select is(private.queue_evaluated_capability_notifications((select evaluation from capability_proposals)),0,'Removed manager is rejected before enqueue');
select ok(not exists(select 1 from private.capability_notification_checks where before_start_hours=24),'No checkpoint consumed without recipients');
update public.team_access_assignments set ends_on=null where team_id='fa300000-0000-4000-8000-000000000001';
select is(private.queue_evaluated_capability_notifications((select evaluation from capability_proposals)),1,'New decision resolves restored authority');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.notification_outbox where type='team_size_shortage'),1,'Current manager can read own payload');
reset role;
update public.team_access_assignments set ends_on=current_date-1 where team_id='fa300000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.notification_outbox where type='team_size_shortage'),0,'Revocation applies to API reads immediately');
reset role;
select is((select status from public.claim_notification_outbox(100) where type='team_size_shortage'),'processing','Delivery does not recheck revoked authority');
select set_config('request.jwt.claim.sub','',true);
update public.team_access_assignments set ends_on=null where team_id='fa300000-0000-4000-8000-000000000001';
select throws_ok($$select private.queue_evaluated_capability_notifications('{"proposals":[{"activityId":"fa600000-0000-4000-8000-000000000001","capabilityId":"targetTeamSize","beforeStartHours":12,"type":"team_size_shortage"}]}')$$,'22023','Invalid capability proposal','Unsaved checkpoint rejected');
select throws_ok($$insert into public.notification_outbox(organization_id,user_id,type,payload) values
 ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','team_size_shortage','{}')$$,'22023','Capability notifications require a ready message','SQL transport trigger has no capability renderer');
select throws_ok($$insert into public.notification_outbox(organization_id,user_id,type,payload,scheduled_at) values
 ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','activity_invitation','{}',now()+interval '1 day')$$,'22023','Schedule application work instead of future outgoing messages','Future work stays outside transport');

-- Team fields inherit separately: off overrides section on, timing remains section-owned.
insert into public.team_discipline_defaults(organization_id,team_id,discipline_id,activity_type_id,values)
select 'fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',s.discipline_id,at.id,'{"capabilities":{"targetTeamSize":{"notificationsEnabled":false,"notificationHours":[48]}}}'::jsonb
from public.sections s cross join public.activity_types at where s.id='fa200000-0000-4000-8000-000000000001' and at.organization_id is null and at.slug='match-tavling';
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select 'fa600000-0000-4000-8000-000000000011',organization_id,team_id,activity_type_id,'Disabled snapshot',starts_at,ends_at,'published' from public.activities where id='fa600000-0000-4000-8000-000000000001';
select ok(not exists(select 1 from private.activity_capability_rules where activity_id='fa600000-0000-4000-8000-000000000011'),'Explicit team off wins over section on');
update public.team_discipline_defaults set values='{"capabilities":{"targetTeamSize":{"notificationsEnabled":null,"notificationHours":[48]}}}' where team_id='fa300000-0000-4000-8000-000000000001';
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,status)
select 'fa600000-0000-4000-8000-000000000012',organization_id,team_id,activity_type_id,'Inherited snapshot',starts_at,ends_at,'published' from public.activities where id='fa600000-0000-4000-8000-000000000001';
select is((select definition#>'{notifications,beforeStartHours}' from private.activity_capability_rules where activity_id='fa600000-0000-4000-8000-000000000012'),'[48]'::jsonb,'Null inherits activation while team replaces control times');
update public.section_discipline_defaults set values='{}' where section_id='fa200000-0000-4000-8000-000000000001';
update public.team_discipline_defaults set values='{}' where team_id='fa300000-0000-4000-8000-000000000001';
select is((select definition#>'{notifications,beforeStartHours}' from private.activity_capability_rules where activity_id='fa600000-0000-4000-8000-000000000012'),'[48]'::jsonb,'Defaults changes preserve existing checkpoint snapshot');

select throws_ok($$select private.queue_evaluated_capability_notifications('{"proposals":[{"activityId":"fa600000-0000-4000-8000-000000000012","capabilityId":"targetTeamSize","beforeStartHours":48,"type":"team_size_shortage","message":{"subject":"broken"}}]}')$$,'22023','Invalid outgoing message','Enqueue failure rolls back the decision');
select ok(not exists(select 1 from private.capability_notification_checks where activity_id='fa600000-0000-4000-8000-000000000012'),'Failed message does not consume checkpoint');

-- The app uses the selected-recipient overload. Future decisions belong to the
-- activity schedule, regardless of which public queue API a client calls.
insert into public.invitations(organization_id,activity_id,person_id,activity_role)
select organization_id,'fa600000-0000-4000-8000-000000000001',id,'leader'
from public.people where user_id='fa000000-0000-4000-8000-000000000001'
  and organization_id='fa100000-0000-4000-8000-000000000001';
update public.activities set invitation_send_at=now()+interval '1 hour'
where id='fa600000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.queue_activity_invitation('fa600000-0000-4000-8000-000000000001',
 array[(select id from public.people where user_id='fa000000-0000-4000-8000-000000000001'
  and organization_id='fa100000-0000-4000-8000-000000000001')])$$,
 '22023','Use the activity invitation schedule for future invitations','Selected-recipient API cannot send a future invitation immediately');
select throws_ok($$select public.queue_activity_invitation('fa600000-0000-4000-8000-000000000001')$$,
 '22023','Use the activity invitation schedule for future invitations','All-recipient API has the same guard');
reset role;
select is((select count(*)::integer from public.notification_outbox where type='activity_invitation'
 and payload->>'activityId'='fa600000-0000-4000-8000-000000000001'),0,'Rejected future requests enqueue nothing');
update public.activities set invitation_send_at=now()-interval '1 minute'
where id='fa600000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select is(public.queue_activity_invitation('fa600000-0000-4000-8000-000000000001',
 array[(select id from public.people where user_id='fa000000-0000-4000-8000-000000000001'
  and organization_id='fa100000-0000-4000-8000-000000000001')]),1,'Due selected invitation is still queued immediately');
select is(public.queue_activity_invitation('fa600000-0000-4000-8000-000000000001',
 array[(select id from public.people where user_id='fa000000-0000-4000-8000-000000000001'
  and organization_id='fa100000-0000-4000-8000-000000000001')]),0,'Selected-recipient API retains deduplication');
reset role;

select * from finish();
rollback;
