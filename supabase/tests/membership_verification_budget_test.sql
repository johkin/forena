begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'office@example.se', '{"display_name":"Kansliet"}'),
  ('a0000000-0000-0000-0000-000000000002', 'guardian@example.se', '{"display_name":"Målsman"}'),
  ('a0000000-0000-0000-0000-000000000003', 'wrong@example.se', '{"display_name":"Fel person"}');
insert into public.organizations (id, slug, name, created_by)
values ('a1000000-0000-0000-0000-000000000001', 'application-test', 'Ansökningstest', 'a0000000-0000-0000-0000-000000000001');
insert into public.sections (id, organization_id, slug, name)
values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'fotboll', 'Fotboll');
insert into public.teams (id, organization_id, section_id, slug, name, season)
values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'f2016', 'F2016', '2026');

insert into public.organizations (id, slug, name, created_by)
values ('a1000000-0000-0000-0000-000000000002', 'application-test-two', 'Andra klubben', 'a0000000-0000-0000-0000-000000000001');
insert into public.sections (id, organization_id, slug, name)
values ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'fotboll', 'Fotboll');
insert into public.teams (id, organization_id, section_id, slug, name, season)
values ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'f2016', 'F2016', '2026');
create temp table budget_fixture(club integer, id uuid, payload jsonb);
insert into budget_fixture(club,payload) select n, jsonb_build_object(
  'organization_id', case when n=1 then 'a1000000-0000-0000-0000-000000000001' else 'a1000000-0000-0000-0000-000000000002' end,
  'section_id', case when n=1 then 'a2000000-0000-0000-0000-000000000001' else 'a2000000-0000-0000-0000-000000000002' end,
  'team_id', case when n=1 then 'a3000000-0000-0000-0000-000000000001' else 'a3000000-0000-0000-0000-000000000002' end,
  'player_first_name','Test','player_last_name','Spelare','player_birth_date','2016-05-01',
  'guardians',jsonb_build_array(jsonb_build_object('first_name','Test','last_name','Målsman','email','victim@example.se'))
) from generate_series(1,2) n;
update budget_fixture set id = (select application_id from public.start_membership_application(payload,repeat('a',64),null)) where club=1;
select throws_ok($$select public.start_membership_application((select payload from budget_fixture where club=2),repeat('b',64),null)$$, 'P0001','Vänta innan du skickar en ny ansökan', 'Changing clubs cannot bypass recipient cooldown');
select is((select count(*) from public.membership_applications where organization_id='a1000000-0000-0000-0000-000000000002'),0::bigint,'Denied new application is rolled back');
update public.membership_application_verifications set created_at=now()-interval '2 minutes';
update budget_fixture set id = (select application_id from public.start_membership_application(payload,repeat('b',64),null)) where club=2;
select is((select count(*) from public.membership_application_verifications),2::bigint,'Recipient can submit to another club after cooldown');
update public.membership_application_verifications set created_at=now()-interval '2 minutes';
select lives_ok($$select public.start_membership_application((select payload from budget_fixture where club=1),repeat('c',64),null)$$,'Third email across clubs is allowed');
update public.membership_application_verifications set created_at=now()-interval '2 minutes';
select throws_ok($$select public.start_membership_application((select payload from budget_fixture where club=2),repeat('d',64),null)$$, 'P0001','Vänta innan du skickar en ny ansökan', 'Fourth email is blocked across clubs');
select is((select public.prepare_membership_application_verification(id,'victim@example.se',repeat('e',64)) from budget_fixture where club=2),false,'Resend shares the recipient cap with new applications');
select is((select count(*) from public.membership_application_verifications),3::bigint,'Rejected sends do not reserve or rotate tokens');

-- Use a different recipient to prove the global cap cannot be evaded by email rotation.
create temp table other_budget_application as select application_id as id from public.start_membership_application(
  jsonb_set((select payload from budget_fixture where club=1),'{guardians,0,email}','"other@example.se"'), repeat('f',64),null
);
update public.membership_application_verifications set created_at=now()-interval '2 minutes';
insert into public.membership_application_verifications(application_id,token_hash)
select (select id from other_budget_application),md5('budget'||n::text)||md5('second'||n::text)
from generate_series(1,96) n;
select is((select public.prepare_membership_application_verification(id,'other@example.se',repeat('1',64)) from other_budget_application),false,'Global cap blocks resend regardless of recipient and club');
select ok((select invalidated_at is null from public.membership_application_verifications where token_hash=repeat('f',64)),'Global denial preserves the existing usable link');
select throws_ok($$select public.start_membership_application(jsonb_set((select payload from budget_fixture where club=2),'{guardians,0,email}','"fresh@example.se"'),repeat('2',64),null)$$, 'P0001','Vänta innan du skickar en ny ansökan','Global cap blocks new applications to another address and club');
select is((select count(*) from public.membership_application_verifications),100::bigint,'Shared rolling budget is never exceeded');
-- Restore the rolling window without changing invalidation/consumption history.
update public.membership_application_verifications set created_at=now()-interval '61 minutes' where token_hash not in (repeat('a',64),repeat('b',64),repeat('c',64),repeat('f',64));
select is((select public.prepare_membership_application_verification(id,'other@example.se',repeat('3',64)) from other_budget_application),true,'Capacity returns as reservations leave the rolling hour');
select ok(not has_function_privilege('authenticated','public.prepare_membership_application_verification(uuid,text,text)','execute'),'Clients cannot directly reserve budget or rotate tokens');
select * from finish();
rollback;
