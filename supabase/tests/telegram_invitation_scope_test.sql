begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('b0000000-0000-0000-0000-000000000001','reply-guardian@example.test',clock_timestamp()),
 ('b0000000-0000-0000-0000-000000000002','reply-admin@example.test',clock_timestamp()),
 ('b0000000-0000-0000-0000-000000000003','reply-other@example.test',clock_timestamp());
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
 ('b6000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Future',clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day 1 hour',''),
 ('b6000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Cancelled',clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day 1 hour',''),
 ('b6000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Ended',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',''),
 ('b6000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Ongoing',clock_timestamp()-interval '30 minutes',clock_timestamp()+interval '30 minutes','');
insert into public.invitations(organization_id,activity_id,person_id,response)
 select organization_id,id,'b5000000-0000-0000-0000-000000000001','pending' from public.activities where id::text like 'b6000000-%';

insert into public.people(id,organization_id,display_name) values ('b5000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','Second child');
insert into public.person_guardians(organization_id,person_id,guardian_user_id) values ('b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001');
insert into public.memberships(organization_id,person_id,team_id,role) values ('b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000002','b3000000-0000-0000-0000-000000000001','participant');
insert into public.invitations(organization_id,activity_id,person_id) values ('b1000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000002');


-- A second guardian owns only child two; their payload must not expose child one.
insert into public.person_guardians(organization_id,person_id,guardian_user_id) values
 ('b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000003');
insert into messaging.telegram_connections(user_id,telegram_id,consent_at) values
 ('b0000000-0000-0000-0000-000000000001','111',now()),
 ('b0000000-0000-0000-0000-000000000003','333',now());
insert into messaging.whatsapp_connections(user_id,wa_id,consent_at) values
 ('b0000000-0000-0000-0000-000000000001','46700000001',now());
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);

select is(public.queue_activity_invitation('b6000000-0000-0000-0000-000000000001',array['b5000000-0000-0000-0000-000000000001']::uuid[]),1,'Selected child queues only their guardian');
select is((select payload->'personIds' from public.notification_outbox where organization_id='b1000000-0000-0000-0000-000000000001'),'["b5000000-0000-0000-0000-000000000001"]'::jsonb,'Selected-person scope survives enqueue');
select is((select count(*)::integer from messaging.telegram_invitations),1,'Shared guardian gets one Telegram invitation, not both siblings');
select is((select count(*)::integer from messaging.whatsapp_invitations),1,'WhatsApp reserve channel uses the same person scope');
select is(public.queue_activity_invitation('b6000000-0000-0000-0000-000000000001',array['b5000000-0000-0000-0000-000000000001']::uuid[]),0,'Repeated selection preserves enqueue deduplication');

-- An exhausted earlier batch may be requeued for a different selected sibling.
update public.notification_outbox set status='failed',attempts=5 where organization_id='b1000000-0000-0000-0000-000000000001';
select is(public.queue_activity_invitation('b6000000-0000-0000-0000-000000000001',array['b5000000-0000-0000-0000-000000000002']::uuid[]),2,'Only the second child is selected for the retry batch');
select ok(not exists(select 1 from messaging.telegram_invitations m join public.notification_outbox n on n.id=m.outbox_id join public.invitations i on i.id=m.invitation_id where n.status='pending' and i.person_id<>'b5000000-0000-0000-0000-000000000002'),'New Telegram batch never repeats the previously invited sibling');
select ok(not exists(select 1 from messaging.whatsapp_invitations m join public.notification_outbox n on n.id=m.outbox_id join public.invitations i on i.id=m.invitation_id where n.status='pending' and i.person_id<>'b5000000-0000-0000-0000-000000000002'),'Fallback never repeats the previously invited sibling');

-- The all-person overload keeps each recipient's own people, not the whole list.
delete from public.notification_outbox where organization_id='b1000000-0000-0000-0000-000000000001';
select is(public.queue_activity_invitation('b6000000-0000-0000-0000-000000000001'),2,'All-person enqueue still sends once per recipient');
select is((select payload->'personIds' from public.notification_outbox where organization_id='b1000000-0000-0000-0000-000000000001' and user_id='b0000000-0000-0000-0000-000000000001'),'["b5000000-0000-0000-0000-000000000001","b5000000-0000-0000-0000-000000000002"]'::jsonb,'Guardian of two children retains both eligible IDs');
select is((select payload->'personIds' from public.notification_outbox where organization_id='b1000000-0000-0000-0000-000000000001' and user_id='b0000000-0000-0000-0000-000000000003'),'["b5000000-0000-0000-0000-000000000002"]'::jsonb,'Other guardian sees only their own child in the outbox');
select is((select count(*)::integer from messaging.telegram_invitations),3,'Two children plus the second guardian produce three distinct messages');

-- Scheduled invitations must preserve exactly the same recipient/person pairs.
insert into public.invitations(organization_id,activity_id,person_id) values ('b1000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000002','b5000000-0000-0000-0000-000000000002');
update public.activities set status='published',invitation_send_at=now()-interval '5 minutes',invitation_materialized_at=now()-interval '4 minutes',invitation_notifications_queued_at=null where id='b6000000-0000-0000-0000-000000000002';
select public.queue_due_activity_invitations();
select is((select payload->'personIds' from public.notification_outbox where payload->>'activityId'='b6000000-0000-0000-0000-000000000002' and user_id='b0000000-0000-0000-0000-000000000001'),'["b5000000-0000-0000-0000-000000000001","b5000000-0000-0000-0000-000000000002"]'::jsonb,'Scheduled invitation preserves both children for their guardian');
select is((select payload->'personIds' from public.notification_outbox where payload->>'activityId'='b6000000-0000-0000-0000-000000000002' and user_id='b0000000-0000-0000-0000-000000000003'),'["b5000000-0000-0000-0000-000000000002"]'::jsonb,'Scheduled invitation does not expose another family member');

-- Manual and scheduled reminders exclude the already-answered sibling.
delete from public.notification_outbox where organization_id='b1000000-0000-0000-0000-000000000001';
update public.invitations set response='accepted',responded_at=clock_timestamp() where activity_id='b6000000-0000-0000-0000-000000000001' and person_id='b5000000-0000-0000-0000-000000000001';
select is(public.queue_activity_reminder('b6000000-0000-0000-0000-000000000001'),2,'Manual reminder retains both guardians of the pending child');
select ok(not exists(select 1 from public.notification_outbox where organization_id='b1000000-0000-0000-0000-000000000001' and payload->'personIds' is distinct from '["b5000000-0000-0000-0000-000000000002"]'::jsonb),'Manual reminder payload contains only the pending person');
select is((select count(*)::integer from messaging.telegram_invitations),2,'Manual reminder creates one pending-child message per guardian');
insert into public.activity_reminder_schedules(id,organization_id,activity_id,send_at) values ('b8000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001',now()-interval '1 minute');
select public.queue_due_activity_reminders();
select is((select count(*)::integer from public.notification_outbox where payload->>'reminderScheduleId'='b8000000-0000-0000-0000-000000000001'),2,'Scheduled reminder produces two scoped recipients');
select ok(not exists(select 1 from public.notification_outbox where payload->>'reminderScheduleId'='b8000000-0000-0000-0000-000000000001' and payload->'personIds' is distinct from '["b5000000-0000-0000-0000-000000000002"]'::jsonb),'Scheduled reminder retains only pending-child IDs');

-- Recipient and activity checks still apply even to an explicit person ID.
insert into public.notification_outbox(id,organization_id,user_id,type,payload,scheduled_at) values
 ('b7000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','activity_invitation','{"activityId":"b6000000-0000-0000-0000-000000000001","personIds":["b5000000-0000-0000-0000-000000000001"]}',now()),
 ('b7000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','activity_invitation','{"activityId":"b6000000-0000-0000-0000-000000000001"}',now()),
 ('b7000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','activity_invitation','{"activityId":"b6000000-0000-0000-0000-000000000001","personIds":[]}',now()),
 ('b7000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','activity_invitation','{"activityId":"b6000000-0000-0000-0000-000000000001","personIds":["b5000000-0000-0000-0000-000000000099"]}',now());
select is((select count(*)::integer from messaging.telegram_invitations where outbox_id in ('b7000000-0000-0000-0000-000000000010','b7000000-0000-0000-0000-000000000011','b7000000-0000-0000-0000-000000000012','b7000000-0000-0000-0000-000000000013')),0,'Foreign, missing, empty and unknown person scopes never create private Telegram snapshots');
select is((select count(*)::integer from messaging.whatsapp_invitations where outbox_id in ('b7000000-0000-0000-0000-000000000010','b7000000-0000-0000-0000-000000000012','b7000000-0000-0000-0000-000000000013')),0,'WhatsApp also rejects explicit invalid or unrelated person scopes');
select * from finish();
rollback;
