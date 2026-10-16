begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('a0000000-0000-4000-8000-000000000001','assistant@example.test',clock_timestamp());
insert into messaging.telegram_connections(user_id,telegram_id,consent_at,verified_at)
 values('a0000000-0000-4000-8000-000000000001','123',clock_timestamp(),clock_timestamp()-interval '1 minute');
select ok(not has_function_privilege('anon','public.claim_telegram_assistant(text,timestamptz,text)','execute'),'Anonymous callers cannot resolve Telegram identities');
select ok(not has_function_privilege('authenticated','public.claim_telegram_assistant(text,timestamptz,text)','execute'),'App callers cannot impersonate Telegram senders');
select ok(not has_function_privilege('authenticated','public.telegram_assistant_identity(text,timestamptz)','execute'),'Identity lookup is service-only');
set local role service_role;
select is(public.claim_telegram_assistant('999',clock_timestamp(),'u:1')->>'status','unlinked','Unknown Telegram user is not authenticated');
select is(public.claim_telegram_assistant('123',clock_timestamp()-interval '2 minutes','u:1')->>'status','unlinked','A message before binding cannot access the account');
select is(public.claim_telegram_assistant('123',clock_timestamp()-interval '11 minutes','u:1')->>'status','ignored','Old update is ignored');
select is(public.claim_telegram_assistant('-123',clock_timestamp(),'u:1')->>'status','ignored','Groups cannot ask questions');
select is(public.claim_telegram_assistant('123',clock_timestamp(),'u:1')->>'userId','a0000000-0000-4000-8000-000000000001','Identity derives from the pairing');
select is(public.claim_telegram_assistant('123',clock_timestamp(),'u:1')->>'status','ignored','Duplicate delivery does not call AI again');
select public.claim_telegram_assistant('123',clock_timestamp(),'u:'||n) from generate_series(2,5) n;
select is(public.claim_telegram_assistant('123',clock_timestamp(),'u:6')->>'status','limited','Sixth question is rate limited');
reset role;
update messaging.telegram_receipts set created_at=clock_timestamp()-interval '2 minutes'
 where message_id like 'ai:a0000000-0000-4000-8000-000000000001:%';
insert into messaging.telegram_receipts(message_id,created_at)
 select 'ai:a0000000-0000-4000-8000-000000000001:u:'||n,clock_timestamp()-interval '2 minutes' from generate_series(100,124) n;
select is(public.claim_telegram_assistant('123',clock_timestamp(),'u:7')->>'status','limited','Hourly budget remains after the minute budget resets');
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='a0000000-0000-4000-8000-000000000001';
select is(public.telegram_assistant_identity('123',clock_timestamp()),null,'Banned accounts cannot use the assistant');
update auth.users set banned_until=null where id='a0000000-0000-4000-8000-000000000001';
delete from messaging.telegram_connections where telegram_id='123';
select is(public.telegram_assistant_identity('123',clock_timestamp()),null,'Disconnect cancels answer delivery');
select * from finish();
rollback;
