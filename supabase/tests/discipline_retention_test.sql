begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into public.organizations(id,slug,name) values('fb900000-0000-4000-8000-000000000001','retention-test','Retention');
insert into public.sections(id,organization_id,slug,name) values('fb900000-0000-4000-8000-000000000002','fb900000-0000-4000-8000-000000000001','test','Test');
insert into public.teams(id,organization_id,section_id,slug,name) values('fb900000-0000-4000-8000-000000000003','fb900000-0000-4000-8000-000000000001','fb900000-0000-4000-8000-000000000002','test','Test');
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at) values('fb900000-0000-4000-8000-000000000004','fb900000-0000-4000-8000-000000000001','fb900000-0000-4000-8000-000000000003',(select id from public.activity_types where slug='ovrigt' and organization_id is null),'Retention',now()+interval '1 day',now()+interval '2 days');
-- Retention handles processed rows only, in bounded batches.
update private.discipline_activity_events set status='processed',processed_at=now()-interval '8 days' where activity_id='fb900000-0000-4000-8000-000000000004';
update public.activities set title='Updated' where id='fb900000-0000-4000-8000-000000000004';
select is((select discipline_generation::integer from public.activities where id='fb900000-0000-4000-8000-000000000004'),1,'Activity change increments generation');
update public.activities set updated_at=now(),discipline_generation=999 where id='fb900000-0000-4000-8000-000000000004';
select is((select discipline_generation::integer from public.activities where id='fb900000-0000-4000-8000-000000000004'),1,'Client cannot choose a generation; metadata update leaves it unchanged');
insert into public.audit_log(organization_id,action,entity_type,entity_id,created_at) values
 ('fb900000-0000-4000-8000-000000000001','discipline_activity.handled','activity','old',now()-interval '31 days'),
 ('fb900000-0000-4000-8000-000000000001','discipline_values.saved','activity','old',now()-interval '31 days');
select is(private.prune_discipline_history(1)->>'events','1','Processed snapshots older than seven days are removed');
select is((select count(*)::integer from private.discipline_activity_events where activity_id='fb900000-0000-4000-8000-000000000004'),1,'Pending snapshot is retained');
select ok(exists(select 1 from public.audit_log where organization_id='fb900000-0000-4000-8000-000000000001' and action='discipline_values.saved'),'Other audit history is retained');
-- Exhaust the team queue rate budget without processing or coalescing lifecycle calls.
insert into private.discipline_activity_events(activity_id,kind,current_state,team_values,section_settings,team_settings)
select 'fb900000-0000-4000-8000-000000000004','activity.updated',jsonb_build_object('teamId','fb900000-0000-4000-8000-000000000003'),'{}','{}','{}' from generate_series(1,499);
select throws_ok($$update public.activities set title='Over quota' where id='fb900000-0000-4000-8000-000000000004'$$,'53000','Discipline event queue limit reached; retry later','Team event quota rejects excess writes atomically');
select is((select title from public.activities where id='fb900000-0000-4000-8000-000000000004'),'Updated','Rejected edit does not partly change the activity');
select ok(not has_function_privilege('authenticated','private.prune_discipline_history(integer)','EXECUTE'),'Clients cannot purge snapshots');
select ok(not has_function_privilege('authenticated','public.claim_capability_contexts(integer)','EXECUTE'),'Clients cannot claim evaluation work');
select * from finish();
rollback;
