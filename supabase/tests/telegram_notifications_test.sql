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

set local role anon;
select throws_ok($$select public.telegram_settings()$$,'42501',null,'Anonymous cannot read settings');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select is(public.telegram_settings()->>'active','false','Own channel initially inactive');
select throws_ok($$select * from messaging.telegram_connections$$,'42501',null,'Contacts are private');
select throws_ok($$select public.telegram_recipient('b0000000-0000-0000-0000-000000000003')$$,'42501',null,'Cannot discover other contacts');
select throws_ok($$select public.receive_telegram('fake','46700000001',clock_timestamp(),'bind',repeat('a',64))$$,'42501',null,'Client cannot verify a phone');
select throws_ok($$select public.respond_telegram('u:1','46700000001',clock_timestamp(),'b6000000-0000-0000-0000-000000000001','accepted')$$,'42501',null,'Client cannot impersonate webhook');
select lives_ok($$select public.telegram_settings('start',repeat('a',64))$$,'Verified user starts pairing');
select throws_ok($$select public.telegram_settings('start',repeat('b',64))$$,'54000','Pairing rate limited','Pairing is rate limited');
reset role;
select is((select count(*)::integer from messaging.telegram_pairings where token_hash=repeat('a',64)),1,'Only hash stored');
select ok(not public.receive_telegram('bad-code','46700000001',clock_timestamp(),'bind',repeat('b',64)),'Unknown proof does not bind');
update messaging.telegram_pairings set expires_at=clock_timestamp()-interval '1 minute' where token_hash=repeat('a',64);
select ok(not public.receive_telegram('expired-proof','46700000001',clock_timestamp(),'bind',repeat('a',64)),'Expired pairing proof cannot bind');
update messaging.telegram_pairings set expires_at=clock_timestamp()+interval '10 minutes' where token_hash=repeat('a',64);
select ok(public.receive_telegram('pair-one','46700000001',clock_timestamp(),'bind',repeat('a',64)),'Signed sender binds to proof owner');
select ok(not public.receive_telegram('pair-one','46700000001',clock_timestamp(),'bind',repeat('a',64)),'Webhook duplicate is inert');
select ok(not public.receive_telegram('pair-replay','46700000002',clock_timestamp(),'bind',repeat('a',64)),'Consumed proof cannot be replayed');
set local role authenticated;
select is(public.telegram_settings()->>'accountSuffix','0001','Only masked phone returned');
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000003',true);
select is(public.telegram_settings()->>'active','false','Other account sees only its settings');
select lives_ok($$select public.telegram_settings('start',repeat('c',64))$$,'Other user prepares own proof');
reset role;
select ok(not public.receive_telegram('steal','46700000001',clock_timestamp(),'bind',repeat('c',64)),'Existing phone cannot be reassigned');
select ok(public.receive_telegram('pair-other','46700000003',clock_timestamp(),'bind',repeat('c',64)),'Other verified sender binds separately');

insert into public.notification_outbox(id,organization_id,user_id,type,payload,scheduled_at) values
 ('b7000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','activity_invitation','{"activityId":"b6000000-0000-0000-0000-000000000001"}',now());
select is(jsonb_array_length(public.telegram_invitation_messages('b7000000-0000-0000-0000-000000000001')),2,'Two children create two messages');
select is((select count(distinct id)::integer from messaging.telegram_invitations where outbox_id='b7000000-0000-0000-0000-000000000001'),2,'Each child has its own opaque button reference');
create function pg_temp.child_reply() returns uuid language sql as $$
 select w.id from messaging.telegram_invitations w join public.invitations i on i.id=w.invitation_id where w.outbox_id='b7000000-0000-0000-0000-000000000001' and i.person_id='b5000000-0000-0000-0000-000000000001';
$$;
select is(public.respond_telegram('u:2','46700000003',clock_timestamp(),pg_temp.child_reply(),'accepted'),null,'Forwarded button cannot authorize another sender');
select is(public.respond_telegram('u:3','46700000001',clock_timestamp(),pg_temp.child_reply(),'accepted'),'accepted','Guardian answers own first child');
select is((select response from public.invitations where activity_id='b6000000-0000-0000-0000-000000000001' and person_id='b5000000-0000-0000-0000-000000000001'),'accepted','Ordinary invitation data updated');
select is((select response from public.invitations where activity_id='b6000000-0000-0000-0000-000000000001' and person_id='b5000000-0000-0000-0000-000000000002'),'pending','Sibling is unaffected');
select is(public.respond_telegram('u:3','46700000001',clock_timestamp(),pg_temp.child_reply(),'declined'),null,'Duplicate webhook cannot change answer');
update public.invitations set response_comment='Existing comment' where activity_id='b6000000-0000-0000-0000-000000000001' and person_id='b5000000-0000-0000-0000-000000000001';
select is(public.respond_telegram('u:4','46700000001',clock_timestamp(),pg_temp.child_reply(),'declined'),'declined','Guardian can change answer');
select is((select response_comment from public.invitations where activity_id='b6000000-0000-0000-0000-000000000001' and person_id='b5000000-0000-0000-0000-000000000001'),'Existing comment','Quick reply preserves comment');
select is(public.respond_telegram('u:5','46700000001',clock_timestamp()-interval '1 minute',pg_temp.child_reply(),'accepted'),'unavailable','Out-of-order reply cannot overwrite newer answer');
delete from public.person_guardians where person_id='b5000000-0000-0000-0000-000000000001';
select is(public.respond_telegram('u:6','46700000001',clock_timestamp(),pg_temp.child_reply(),'accepted'),'unavailable','Revoked guardian cannot use old button');
insert into public.person_guardians(organization_id,person_id,guardian_user_id) values ('b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001');
update messaging.telegram_invitations set expires_at=clock_timestamp()-interval '1 minute' where id=pg_temp.child_reply();
select is(public.respond_telegram('u:7','46700000001',clock_timestamp(),pg_temp.child_reply(),'accepted'),'unavailable','Expired invitation buttons are rejected');
update messaging.telegram_invitations set expires_at=clock_timestamp()+interval '1 day' where id=pg_temp.child_reply();
update public.activities set title='Changed training' where id='b6000000-0000-0000-0000-000000000001';
select is(public.respond_telegram('u:8','46700000001',clock_timestamp(),pg_temp.child_reply(),'accepted'),'unavailable','Changed activity invalidates old buttons');
update messaging.telegram_invitations set activity_generation=(select discipline_generation from public.activities where id='b6000000-0000-0000-0000-000000000001') where id=pg_temp.child_reply();
update public.activities set status='cancelled',cancelled_at=clock_timestamp(),cancellation_reason='Test' where id='b6000000-0000-0000-0000-000000000001';
select is(public.respond_telegram('u:9','46700000001',clock_timestamp(),pg_temp.child_reply(),'accepted'),'unavailable','Cancelled activity cannot accept a button answer');
select ok(public.receive_telegram('opt-out','46700000001',clock_timestamp(),'stop'),'STOP revokes connection');
select is(public.telegram_recipient('b0000000-0000-0000-0000-000000000001'),null,'Revoked number is no longer eligible for delivery');
select is(public.respond_telegram('u:10','46700000001',clock_timestamp(),pg_temp.child_reply(),'accepted'),null,'Revocation disables old buttons');
-- Own invitations use the same identity check as guardians, without any
-- authority to answer a teammate's invitation.
insert into public.people(id,organization_id,display_name,user_id) values ('b5000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','Own invite','b0000000-0000-0000-0000-000000000003') on conflict(organization_id,user_id) do update set display_name=excluded.display_name;
insert into public.memberships(organization_id,person_id,team_id,role) select organization_id,id,'b3000000-0000-0000-0000-000000000001','participant' from public.people where organization_id='b1000000-0000-0000-0000-000000000001' and user_id='b0000000-0000-0000-0000-000000000003';
insert into public.invitations(organization_id,activity_id,person_id) select organization_id,'b6000000-0000-0000-0000-000000000002',id from public.people where organization_id='b1000000-0000-0000-0000-000000000001' and user_id='b0000000-0000-0000-0000-000000000003';
insert into public.notification_outbox(id,organization_id,user_id,type,payload,scheduled_at) values
 ('b7000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','activity_invitation','{"activityId":"b6000000-0000-0000-0000-000000000002"}',now());
select is(public.respond_telegram('u:11','46700000003',clock_timestamp(),(select id from messaging.telegram_invitations where outbox_id='b7000000-0000-0000-0000-000000000002'),'accepted'),'accepted','Verified account can answer its own invitation');
-- A past deadline is authoritative even if the frozen message has not expired.
-- Fixture administration must use an invitation manager, even as postgres.
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
update public.activities set response_due_at=clock_timestamp()-interval '1 minute' where id='b6000000-0000-0000-0000-000000000002';
update messaging.telegram_invitations set activity_generation=(select discipline_generation from public.activities where id='b6000000-0000-0000-0000-000000000002') where outbox_id='b7000000-0000-0000-0000-000000000002';
select is(public.respond_telegram('u:12','46700000003',clock_timestamp(),(select id from messaging.telegram_invitations where outbox_id='b7000000-0000-0000-0000-000000000002'),'declined'),'unavailable','Current response deadline rejects late answers');
select ok(not public.receive_telegram('old-optout','46700000003',clock_timestamp()-interval '1 day','stop'),'Old webhook cannot revoke new consent');
select ok(has_function_privilege('service_role','public.respond_telegram(text,text,timestamptz,uuid,text)','execute'),'Service can process verified replies');
select ok(not has_function_privilege('authenticated','public.respond_telegram(text,text,timestamptz,uuid,text)','execute'),'Members cannot process arbitrary replies');
select ok(not has_table_privilege('authenticated','messaging.telegram_invitations','select'),'Snapshots never expose sibling identities through Data API');
update messaging.telegram_pairings set created_at=clock_timestamp()-interval '2 minutes' where user_id='b0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.telegram_settings('start',repeat('d',64))$$,'New pending pairing can be created after opt-out');
select lives_ok($$select public.telegram_settings('disable')$$,'User can cancel pending proof');
reset role;
select ok(not public.receive_telegram('cancelled-pairing','46700000001',clock_timestamp(),'bind',repeat('d',64)),'Cancelled proof cannot re-enable notifications');
insert into auth.users(id,email) values('b0000000-0000-0000-0000-000000000004','unverified@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.telegram_settings('start',repeat('e',64))$$,'42501','Verified account required','Unverified account cannot pair a number');
reset role;

-- Group scope is independent of private invitations; a group proof must be
-- consumed by the same linked Telegram user and current team manager.
insert into messaging.telegram_connections(user_id,telegram_id,consent_at) values('b0000000-0000-0000-0000-000000000002','222',clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.telegram_group_settings('start','b3000000-0000-0000-0000-000000000001','team',repeat('f',64))$$,'42501',null,'Guardian cannot bind a team group');
select throws_ok($$select public.bind_telegram_group(repeat('f',64),'222','-1001',clock_timestamp())$$,'42501',null,'Client cannot impersonate a group webhook');
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.telegram_group_settings('start','b3000000-0000-0000-0000-000000000001','team',repeat('f',64))$$,'Manager starts group pairing');
reset role;
select ok(not public.bind_telegram_group(repeat('f',64),'46700000003','-1001',clock_timestamp()),'Group proof is bound to the manager Telegram account');
select ok(public.bind_telegram_group(repeat('f',64),'222','-1001',clock_timestamp()),'Manager binds team group');
select ok(not public.bind_telegram_group(repeat('f',64),'222','-1002',clock_timestamp()),'Consumed group proof cannot be reused');
select is((select count(*)::integer from messaging.telegram_groups),1,'One binding only');
select is(public.telegram_group_link('-1001','46700000003','group:1'),'/o/reply-lifecycle/t/team','Group gets only navigation to the team');
select is(public.telegram_group_link('-1001','46700000003','group:1'),null,'Repeated group command is deduplicated');
select is(public.telegram_group_link('-1001','unknown','group:2'),null,'Unknown Telegram account cannot trigger a group message');
update messaging.telegram_group_pairings set created_at=clock_timestamp()-interval '2 minutes';
set local role authenticated;
select lives_ok($$select public.telegram_group_settings('start','b3000000-0000-0000-0000-000000000001','leaders',repeat('9',64))$$,'Manager creates a separate leader group proof');
reset role;
select ok(public.bind_telegram_group(repeat('9',64),'222','-1002',clock_timestamp()),'Leader group can coexist with team group');
update public.organization_members set role='member' where user_id='b0000000-0000-0000-0000-000000000002';
select is(public.telegram_group_link('-1001','46700000003','group:3'),null,'Revoking manager permission stops the group integration');
update public.organization_members set role='admin' where user_id='b0000000-0000-0000-0000-000000000002';
select public.remove_telegram_chat('-1001',clock_timestamp());
select is((select count(*)::integer from messaging.telegram_groups),1,'Removing bot disconnects only that group');
select public.telegram_delivery_failure('222',30,false);
select is(public.telegram_recipient('b0000000-0000-0000-0000-000000000002'),null,'429 pauses subsequent Telegram deliveries');
update messaging.telegram_transport set retry_at=clock_timestamp()-interval '1 second';
select is(public.telegram_recipient('b0000000-0000-0000-0000-000000000002'),'222','Delivery resumes after retry_after');
select public.telegram_delivery_failure('222',0,true);
select is(public.telegram_recipient('b0000000-0000-0000-0000-000000000002'),null,'403 disconnects blocked bot');
select is((select count(*)::integer from messaging.telegram_groups),0,'Opt-out also revokes group bindings owned by that account');
select ok(not has_table_privilege('authenticated','messaging.telegram_groups','select'),'Group chat identifiers stay private');

select * from finish();
rollback;
