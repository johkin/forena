begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users(id,email) values
 ('b0000000-0000-0000-0000-000000000001','reply-guardian@example.test'),
 ('b0000000-0000-0000-0000-000000000002','reply-admin@example.test'),
 ('b0000000-0000-0000-0000-000000000003','reply-other@example.test');
insert into public.organizations(id,slug,name) values ('b1000000-0000-0000-0000-000000000001','reply-lifecycle','Reply lifecycle');
insert into public.organization_members(organization_id,user_id,role) values
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','member'),
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','admin'),
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','member');
insert into public.sections(id,organization_id,slug,name) values ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','section','Section');
insert into public.teams(id,organization_id,section_id,slug,name,season) values ('b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','team','Team','2026');
insert into public.activity_types(id,organization_id,slug,name,system_category) values ('b4000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','training','Training','session');
insert into public.people(id,organization_id,display_name) values ('b5000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Child');
insert into public.person_guardians(organization_id,person_id,guardian_user_id) values ('b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001');
insert into public.memberships(organization_id,person_id,team_id,role) values ('b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','participant');
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at,location) values
 ('b6000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Future',now()+interval '1 day',now()+interval '1 day 1 hour',''),
 ('b6000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Cancelled',now()+interval '1 day',now()+interval '1 day 1 hour',''),
 ('b6000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Ended',now()-interval '2 hours',now()-interval '1 hour',''),
 ('b6000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Ongoing',now()-interval '30 minutes',now()+interval '30 minutes','');
insert into public.invitations(organization_id,activity_id,person_id,response)
 select organization_id,id,'b5000000-0000-0000-0000-000000000001','pending' from public.activities where id::text like 'b6000000-%';
update public.activities set status='cancelled',cancelled_at=now(),cancellation_reason='Test' where id='b6000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select results_eq($$update public.invitations set response='accepted',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000001' returning response$$,array['accepted'::text],'Guardian can reply to a future activity');
select results_eq($$update public.invitations set response='declined',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000004' returning response$$,array['declined'::text],'Activity start does not prematurely lock replies');
select throws_ok($$update public.invitations set response='accepted',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000002' returning response$$,'23514','Activity is read-only','Guardian cannot reply to cancelled activity');
select throws_ok($$update public.invitations set response='accepted',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000003' returning response$$,'23514','Activity is read-only','Guardian cannot reply to ended activity');
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
select throws_ok($$update public.invitations set response='accepted',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000002' returning response$$,'23514','Activity is read-only','Admin cannot bypass cancellation');
select throws_ok($$update public.invitations set response='accepted',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000003' returning response$$,'23514','Activity is read-only','Admin cannot bypass end time');
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000003',true);
select results_eq($$update public.invitations set response='declined',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000001' returning response$$,array[]::text[],'Lifecycle guard grants no additional identity permissions');
reset role;
select is((select response from public.invitations where activity_id='b6000000-0000-0000-0000-000000000003'),'pending','Ended answer remains unchanged');
select throws_ok($$update public.invitations set response='accepted',responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000003'$$,'23514','Activity is read-only','Trigger protects reply even when RLS is bypassed');
select throws_ok($$update public.invitations set response='declined',responded_at=now(),response_comment='Late change' where activity_id='b6000000-0000-0000-0000-000000000002'$$,'23514','Activity is read-only','Trigger protects comment changes on cancellation');
select throws_ok($$update public.invitations set responded_at=now() where activity_id='b6000000-0000-0000-0000-000000000003'$$,'23514','Activity is read-only','Trigger also protects reply timestamps');
select lives_ok($$update public.invitations set response=response where activity_id='b6000000-0000-0000-0000-000000000003'$$,'Unchanged historical values do not fail the trigger');
select ok(not has_function_privilege('authenticated','private.guard_invitation_response_lifecycle()','EXECUTE'),'Authenticated role cannot call private trigger function');
select ok(not has_function_privilege('anon','private.guard_invitation_response_lifecycle()','EXECUTE'),'Anonymous role cannot call private trigger function');
select * from finish();
rollback;
