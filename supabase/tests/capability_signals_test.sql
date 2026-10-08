begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
 ('fc000000-0000-4000-8000-000000000001','signal-leader@example.test'),
 ('fc000000-0000-4000-8000-000000000002','signal-family@example.test');
insert into public.organizations(id,slug,name) values('fc100000-0000-4000-8000-000000000001','signal-club','Signal Club');
insert into public.organization_members(organization_id,user_id,role) values
 ('fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','owner'),
 ('fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002','member');
insert into public.sections(id,organization_id,slug,name,discipline_id) values
 ('fc200000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','football','Fotboll',(select id from public.disciplines where key='football'));
insert into public.teams(id,organization_id,section_id,slug,name) values
 ('fc300000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001','a','A');
insert into public.people(id,organization_id,display_name) values
 ('fc500000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','Player'),
 ('fc500000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000001','Loan Player');
insert into public.person_guardians(organization_id,person_id,guardian_user_id) values
 ('fc100000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002');
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,response_due_at,status) values
 ('fc600000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000001',
 (select id from public.activity_types where organization_id is null and slug='match-tavling'),'Match',now()+interval '2 days',now()+interval '2 days 1 hour',now()+interval '1 day','published');
update private.discipline_values set values='{"targetTeamSize":9}' where activity_id='fc600000-0000-4000-8000-000000000001' and scope='activity';
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response) values
 ('fc100000-0000-4000-8000-000000000001','fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001','participant','pending');
-- Isolate signal evaluation from the separately tested lifecycle handler.
update private.discipline_activity_events set status='processed',processed_at=now() where activity_id='fc600000-0000-4000-8000-000000000001';
create temporary table signal_claim as select public.claim_signal_contexts() as value;
select ok(exists(select 1 from jsonb_array_elements((select value from signal_claim)) e where e->>'activityId'='fc600000-0000-4000-8000-000000000001'),'Signals claim activities without notification rules');
select is((private.signal_contexts_for_activity('fc600000-0000-4000-8000-000000000001')->0->>'pendingPlayers')::integer,1,'Adapter counts explicit participants, including loan players');
select is(jsonb_array_length(public.claim_signal_contexts()),0,'Claim has a durable cooldown');
create temporary table signal_proposal(value jsonb);
insert into signal_proposal values ('{"disciplineKey":"football","disciplineVersion":"1.0.0","capabilityId":"targetTeamSize","type":"team_size_shortage","severity":"warning","title":"Få spelare","text":"0 av önskade 9 spelare","facts":{"acceptedPlayers":0,"targetTeamSize":9},"actions":[{"id":"remind-unanswered","label":"Påminn obesvarade"},{"id":"invite-more-players","label":"Kalla fler spelare"}]}');
create function pg_temp.apply_signals(proposals jsonb) returns integer language sql as $$
 select public.apply_signal_evaluations(jsonb_build_array(jsonb_build_object('activityId','fc600000-0000-4000-8000-000000000001',
  'revision',(select revision from private.signal_evaluation_queue where activity_id='fc600000-0000-4000-8000-000000000001'),'signals',proposals)))
$$;
select is(pg_temp.apply_signals(jsonb_build_array((select value from signal_proposal))),1,'Persists a signal');
select is(pg_temp.apply_signals(jsonb_build_array((select value from signal_proposal))),1,'Repeated evaluation updates the signal');
select is((select count(*)::integer from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'),1,'No duplicates');
select is((select revision from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'),1,'Unchanged facts do not invalidate the UI revision');
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select is(public.queue_activity_reminder('fc600000-0000-4000-8000-000000000001'),1,'Existing reminder command queues a reachable recipient');
select is((select count(*)::integer from public.signal_actions where action_id='remind-unanswered' and organization_id='fc100000-0000-4000-8000-000000000001'),1,'Reminder records its action in the same transaction');
select is((select status from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'),'active','Reminder does not resolve the signal');
select ok((private.signal_contexts_for_activity('fc600000-0000-4000-8000-000000000001')->0->>'lastReminderAt') is not null,'Next evaluation sees reminder cooldown');
select public.dismiss_capability_signal(id,revision) from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001';
select is(pg_temp.apply_signals(jsonb_build_array((select value from signal_proposal))),1,'Dismissed signals can still be evaluated');
select is((select status from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'),'dismissed','Dismissal survives repeated evaluation');
select is(jsonb_array_length(public.read_team_signals('fc300000-0000-4000-8000-000000000001')),0,'Dismissed signal is hidden from current tasks');
select is(pg_temp.apply_signals('[]'),1,'Empty decision resolves previous signals');
select is(pg_temp.apply_signals(jsonb_build_array((select value from signal_proposal))),1,'Recurring shortage reopens');
select is((select episode from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'),2,'Recurrence starts a new episode');
select is(jsonb_array_length(public.read_team_signals('fc300000-0000-4000-8000-000000000001')),1,'Reopened signal is visible');
-- Participant inserts record one action per statement; current facts stay authoritative.
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response) values
 ('fc100000-0000-4000-8000-000000000001','fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000002','participant','pending');
select is((select count(*)::integer from public.signal_actions where action_id='invite-more-players' and organization_id='fc100000-0000-4000-8000-000000000001'),1,'More invitations record an action');
select is(public.apply_signal_evaluations(jsonb_build_array(jsonb_build_object('activityId','fc600000-0000-4000-8000-000000000001',
 'revision',1,'signals','[]'::jsonb))),0,'Obsolete decision cannot resolve the current problem');
select throws_ok($$select public.dismiss_capability_signal(id,1) from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'$$,
 '40001','Signal changed; reload','Stale dismissal is rejected');
-- Actual RLS and grants, including same-club family access.
set local role authenticated;
select is((select count(*)::integer from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'),1,'Manager reads signals through RLS');
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.capability_signals where activity_id='fc600000-0000-4000-8000-000000000001'),0,'Family cannot read team signal facts');
select is((select count(*)::integer from public.signal_actions where organization_id='fc100000-0000-4000-8000-000000000001'),0,'Family cannot read action history');
select throws_ok($$select public.read_team_signals('fc300000-0000-4000-8000-000000000001')$$,'42501','Permission denied','RPC cannot expose team signals to family');
select ok(not has_table_privilege('authenticated','public.capability_signals','UPDATE'),'Client cannot forge signal status');
select ok(not has_table_privilege('authenticated','public.signal_actions','INSERT'),'Client cannot forge action history');
select ok(not has_function_privilege('authenticated','public.claim_signal_contexts(integer)','EXECUTE'),'Clients cannot claim work');
select ok(not has_function_privilege('authenticated','public.apply_signal_evaluations(jsonb)','EXECUTE'),'Clients cannot forge evaluations');
reset role;
-- Successful evaluation waits for a real boundary; idle slots retain revisions.
select is(public.apply_signal_evaluations(jsonb_build_array(jsonb_build_object(
 'activityId','fc600000-0000-4000-8000-000000000001',
 'revision',(select revision from private.signal_evaluation_queue where activity_id='fc600000-0000-4000-8000-000000000001'),
 'nextEvaluationAt',now()+interval '6 hours','signals',jsonb_build_array((select value from signal_proposal))))),1,'Schedules next boundary');
select is((select next_evaluation_at from private.signal_evaluation_queue where activity_id='fc600000-0000-4000-8000-000000000001'),
 now()+interval '6 hours','No one-minute requeue after success');
select is(jsonb_array_length(public.claim_signal_contexts()),0,'Future boundary is not claimed each minute');
select is(pg_temp.apply_signals('[]'),1,'No signal and no boundary leaves an idle revision slot');
select ok((select next_evaluation_at is null from private.signal_evaluation_queue where activity_id='fc600000-0000-4000-8000-000000000001'),'Idle work is not polled');
select is(jsonb_array_length(public.claim_signal_contexts()),0,'Idle activity is not claimed');
-- Response publication is durable, excludes unchanged answers, and rolls back with writes.
create temporary table event_count as select count(*) n from private.activity_domain_events;
savepoint response_write;
update public.invitations set response='accepted',responded_at=now() where activity_id='fc600000-0000-4000-8000-000000000001'
 and person_id='fc500000-0000-4000-8000-000000000001';
rollback to response_write;
select is((select count(*) from private.activity_domain_events),(select n from event_count),'Rollback also removes event');
update public.invitations set response='accepted',responded_at=now() where activity_id='fc600000-0000-4000-8000-000000000001'
 and person_id='fc500000-0000-4000-8000-000000000001';
select is((select count(*) from private.activity_domain_events),(select n+1 from event_count),'Answer publishes one event');
select ok(exists(select 1 from private.activity_domain_events where activity_id='fc600000-0000-4000-8000-000000000001'
 and event_type='activity.invitation_response_changed' and payload->>'previousResponse'='pending' and payload->>'response'='accepted'),
 'Response event carries identity and old/new answer');
update public.invitations set response='accepted',responded_at=now() where activity_id='fc600000-0000-4000-8000-000000000001'
 and person_id='fc500000-0000-4000-8000-000000000001';
select is((select count(*) from private.activity_domain_events),(select n+1 from event_count),'Unchanged answer does not publish');
select is(public.consume_signal_domain_events(),1,'Signal subscriber consumes answer event');
select is(public.consume_signal_domain_events(),0,'Consumption is idempotent');
select ok((select next_evaluation_at<=now() from private.signal_evaluation_queue where activity_id='fc600000-0000-4000-8000-000000000001'),'Answer wakes idle evaluation');
select ok(not has_function_privilege('authenticated','public.consume_signal_domain_events(integer)','EXECUTE'),'Families cannot consume domain events');
select ok(not has_table_privilege('authenticated','private.activity_domain_events','SELECT'),'Domain events are not exposed to clients');
-- Role reset preserves JWT claims; restore the manager for the activity mutation.
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
update public.activities set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour',response_due_at=now()-interval '3 hours'
 where id='fc600000-0000-4000-8000-000000000001';
update private.discipline_activity_events set status='processed',processed_at=now() where activity_id='fc600000-0000-4000-8000-000000000001';
select is(pg_temp.apply_signals('[]'),1,'Activity start resolves signals');
select ok((select next_evaluation_at is null from private.signal_evaluation_queue where activity_id='fc600000-0000-4000-8000-000000000001'),'Past activities stop scheduled evaluation');
select * from finish();
rollback;
