begin;
-- Proofs use wall-clock creation time. Cross a second boundary deliberately so
-- transaction-start timestamps cannot accidentally pass as fresh webhook events.
do $$ begin perform pg_sleep(1.1); end $$;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('d9000000-0000-0000-0000-000000000001','whatsapp-connected@example.test',now()),
 ('d9000000-0000-0000-0000-000000000002','whatsapp-pairing@example.test',now());
insert into messaging.whatsapp_connections(user_id,wa_id,consent_at)
 values('d9000000-0000-0000-0000-000000000001','46709990001',now());
insert into messaging.whatsapp_pairings(token_hash,user_id) values
 (repeat('a',64),'d9000000-0000-0000-0000-000000000002');
insert into messaging.whatsapp_pairings(token_hash,user_id,expires_at) values
 (repeat('b',64),'d9000000-0000-0000-0000-000000000002',now()-interval '1 minute');

create temporary table ingress_baseline as select
 (select count(*)::integer from messaging.whatsapp_receipts) as receipts,
 (select count(*)::integer from pg_locks where pid=pg_backend_pid() and locktype='advisory') as locks;

select is((select count(*)::integer from generate_series(1,100) n
 where not public.receive_whatsapp('unknown-stop-'||n,'46709999999',clock_timestamp(),'stop')),100,
 'Distinct opt-outs from an unconnected sender are all ignored');
select ok(not public.receive_whatsapp('unknown-proof','46709999999',clock_timestamp(),'bind',repeat('c',64)),
 'Unknown pairing proof is ignored');
select ok(not public.receive_whatsapp('expired-proof','46709999999',clock_timestamp(),'bind',repeat('b',64)),
 'Expired pairing proof is ignored');
select ok(not public.receive_whatsapp('connected-proof','46709990001',clock_timestamp(),'bind',repeat('a',64)),
 'Already connected sender cannot bind another account');
select is(public.respond_whatsapp('unconnected-reply','46709999999',clock_timestamp(),'d9000000-0000-0000-0000-000000000003','accepted'),null,
 'Unconnected sender cannot trigger a reply confirmation');
select is(public.respond_whatsapp('unknown-reference','46709990001',clock_timestamp(),'d9000000-0000-0000-0000-000000000003','accepted'),null,
 'Unknown invitation references are ignored without confirmation');
select is((select count(*)::integer from messaging.whatsapp_receipts),(select receipts from ingress_baseline),
 'Rejected ingress creates no receipt rows');
select is((select count(*)::integer from pg_locks where pid=pg_backend_pid() and locktype='advisory'),(select locks from ingress_baseline),
 'Rejected ingress acquires no advisory locks');

select ok(public.receive_whatsapp('valid-bind','46709990002',clock_timestamp(),'bind',repeat('a',64)),
 'A live proof still binds its verified account');
select ok(not public.receive_whatsapp('valid-bind','46709990002',clock_timestamp(),'bind',repeat('a',64)),
 'Accepted pairing remains idempotent');
select ok(public.receive_whatsapp('valid-stop','46709990002',clock_timestamp(),'stop'),
 'Connected sender can still opt out');
select ok(not public.receive_whatsapp('repeated-stop','46709990002',clock_timestamp(),'stop'),
 'Further opt-outs after revocation are ignored');
select is((select count(*)::integer from messaging.whatsapp_receipts),(select receipts+2 from ingress_baseline),
 'Only the accepted bind and opt-out create receipts');

select set_config('request.jwt.claim.sub','d9000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.whatsapp_settings('disable')$$,'Authenticated account can still disable its connection');
select ok(not exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and classid=0 and objid=690069 and objsubid=1),
 'Pairing, opt-out and settings no longer acquire the global WhatsApp lock');

select * from finish();
rollback;
