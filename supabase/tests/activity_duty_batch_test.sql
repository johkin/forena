begin;
create extension if not exists pgtap with schema extensions;
select plan(24);
insert into auth.users(id,email) values
 ('d0000000-0000-0000-0000-000000000001','duty-admin@example.test'),
 ('d0000000-0000-0000-0000-000000000002','duty-member@example.test');
insert into public.organizations(id,slug,name) values
 ('d1000000-0000-0000-0000-000000000001','duty-batch-a','Batch A'),
 ('d1000000-0000-0000-0000-000000000002','duty-batch-b','Batch B');
insert into public.organization_members(organization_id,user_id,role) values
 ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','admin'),
 ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','member');
insert into public.sections(id,organization_id,slug,name,discipline_id)
 select 'd2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','section','Section',id from public.disciplines where key='football';
insert into public.sections(id,organization_id,slug,name) values
 ('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','section','Section');
insert into public.teams(id,organization_id,section_id,slug,name,season) values
 ('d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','a','Team A','2026'),
 ('d3000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','b','Team B','2026');
insert into public.activity_types(id,organization_id,slug,name,system_category) values
 ('d4000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','match','Match','competition'),
 ('d4000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','training','Training','session'),
 ('d4000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000002','match','Match','competition');
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,source_kind,external_source,external_id) values
 ('d6000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000001','Home',now()+interval '1 day',now()+interval '1 day 1 hour','imported','test-league','home'),
 ('d6000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002','Training',now()+interval '2 days',now()+interval '2 days 1 hour','manual',null,null),
 ('d6000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000001','Unknown',now()+interval '3 days',now()+interval '3 days 1 hour','imported','test-league','unknown'),
 ('d6000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002','d4000000-0000-0000-0000-000000000003','Foreign',now()+interval '4 days',now()+interval '4 days 1 hour','imported','test-league','foreign');
insert into private.discipline_values(discipline_id,organization_id,team_id,scope,activity_id,values)
 select id,'d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','activity','d6000000-0000-0000-0000-000000000001','{"venue":"home"}' from public.disciplines where key='football'
 on conflict(discipline_id,team_id,scope,activity_id,person_id) do update set values=excluded.values;
create temp table batch_test(command jsonb,preview jsonb,result jsonb);
insert into batch_test(command) values ('{"activityIds":["d6000000-0000-0000-0000-000000000001","d6000000-0000-0000-0000-000000000002"],"name":"Sekretariat","places":2,"instructions":"Protokoll"}');
grant all on batch_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.list_activity_duty_targets('d3000000-0000-0000-0000-000000000001')),3,'Only current team targets');
select is(public.list_activity_duty_targets('d3000000-0000-0000-0000-000000000001')->0->>'venue','home','Venue comes from structured discipline data');
select is(public.list_activity_duty_targets('d3000000-0000-0000-0000-000000000001')->2->'venue','null'::jsonb,'Unknown venue is not guessed');
update batch_test set preview=public.preview_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command);
select is((select jsonb_array_length(preview->'activities') from batch_test),2,'Exact review includes training and imported match');
select throws_ok($$select public.confirm_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command,'wrong') from batch_test$$,'40001','Selection changed','Wrong fingerprint rejects entire write');
select throws_ok($$select public.preview_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command||'{"activityIds":["d6000000-0000-0000-0000-000000000001","d6000000-0000-0000-0000-000000000004"]}') from batch_test$$,'40001','Invalid selection','Cross-tenant selection rejected');
update batch_test set result=public.confirm_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command,preview->>'fingerprint');
select is((select result->>'created' from batch_test),'2','Creates both activity categories atomically');
select is(public.get_activity_duty_schedule('d6000000-0000-0000-0000-000000000002')->>'supportsDuties','true','Training supports duty schedule');
select is(jsonb_array_length(public.get_activity_duty_schedule('d6000000-0000-0000-0000-000000000001')->'duties'->0->'slots'),2,'Creates empty capacity');
select is(public.get_activity_duty_schedule('d6000000-0000-0000-0000-000000000001')->'duties'->0->'slots'->0->>'occupied','false','No fabricated assignment');
select is((select public.confirm_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command,preview->>'fingerprint') from batch_test),(select result from batch_test),'Retry returns saved receipt');
update batch_test set preview=public.preview_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command);
select is((select public.confirm_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command,preview->>'fingerprint')->>'created' from batch_test),'0','Repeated request skips existing same-name duties');
select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.list_activity_duty_targets('d3000000-0000-0000-0000-000000000001')$$,'42501','Not allowed','Ordinary member cannot list planning data');
select throws_ok($$select public.confirm_activity_duty_batch('d3000000-0000-0000-0000-000000000001',command,preview->>'fingerprint') from batch_test$$,'42501','Not allowed','Ordinary member cannot confirm even with known snapshot');
reset role;
select is((select count(*)::integer from public.activity_duties where activity_id in('d6000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000002')),2,'No duplicate rows');
select is((select count(distinct batch_id)::integer from public.activity_duty_series where activity_id in('d6000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000002')),1,'Shared batch metadata');
select is((select count(*)::integer from public.invitations where activity_id='d6000000-0000-0000-0000-000000000001'),0,'No invitation or response created');
update public.activities set starts_at=starts_at+interval '2 hours',ends_at=ends_at+interval '3 hours' where id='d6000000-0000-0000-0000-000000000001';
select ok((select d.starts_at=a.starts_at and d.ends_at=a.ends_at from public.activity_duties d join public.activities a on a.id=d.activity_id where a.id='d6000000-0000-0000-0000-000000000001'),'Both duty bounds follow changed match');
select is((select source_kind from public.activities where id='d6000000-0000-0000-0000-000000000001'),'imported','Local duties do not change import ownership');
update public.activity_duties set starts_at=starts_at+interval '10 minutes' where activity_id='d6000000-0000-0000-0000-000000000002';
select ok((select not follows_activity from public.activity_duty_series where activity_id='d6000000-0000-0000-0000-000000000002'),'Explicit individual timing opts out');
update public.activities set status='cancelled', cancelled_at=now(), cancellation_reason='Cancelled by test leader' where id='d6000000-0000-0000-0000-000000000001';
select ok((select cancelled_at is not null from public.activity_duties where activity_id='d6000000-0000-0000-0000-000000000001'),'Cancelled match closes duties');
select is((select count(*)::integer from public.activity_duty_slots where activity_id='d6000000-0000-0000-0000-000000000001' and retired_at is null),0,'Cancelled slots cannot be booked');
select ok(not has_table_privilege('authenticated','private.activity_duty_batches','SELECT'),'Receipts are private');
select ok(not has_function_privilege('anon','public.confirm_activity_duty_batch(uuid,jsonb,text)','EXECUTE'),'Anonymous confirmation is unavailable');
select * from finish();
rollback;
