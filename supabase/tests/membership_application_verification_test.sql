begin;
create extension if not exists pgtap with schema extensions;
select plan(30);
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

update auth.users set email_confirmed_at = now();
create temp table verification_fixture (id uuid, payload jsonb);
grant select on verification_fixture to authenticated;
insert into verification_fixture(payload) values (jsonb_build_object(
  'organization_id', 'a1000000-0000-0000-0000-000000000001',
  'section_id', 'a2000000-0000-0000-0000-000000000001',
  'team_id', 'a3000000-0000-0000-0000-000000000001',
  'player_first_name', 'Test', 'player_last_name', 'Spelare', 'player_birth_date', '2016-05-01',
  'submission_source', 'verified_member', 'email_verified_at', now(),
  'guardians', jsonb_build_array(jsonb_build_object('first_name','Test','last_name','Målsman','email','guardian@example.se'))
));
select ok(not has_function_privilege('anon', 'public.submit_membership_application(jsonb)', 'execute'), 'Anonymous callers cannot bypass the server');
select ok(not has_function_privilege('authenticated', 'public.start_membership_application(jsonb,text,uuid)', 'execute'), 'Signed-in callers cannot forge a submitting user');
select ok(not has_function_privilege('anon', 'public.verify_membership_application_email(text)', 'execute'), 'Only the server can redeem verification links');
set local role anon;
select throws_ok($$select * from public.membership_application_verifications$$, '42501', 'permission denied for table membership_application_verifications', 'Tokens are private');
reset role;
update verification_fixture set id = (select application_id from public.start_membership_application(payload, repeat('a',64), null));
select is((select review_status from public.membership_applications), 'draft', 'New anonymous application awaits verification');
select is((select submission_source from public.membership_applications), 'public_form', 'Client cannot forge source');
select ok((select email_verified_at is null from public.membership_applications), 'Client cannot forge verification');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.membership_applications), 0::bigint, 'Office cannot see drafts');
select is((select count(*) from public.membership_application_guardians), 0::bigint, 'Office cannot see draft guardians');
select throws_ok($$update public.membership_applications set email_verified_at = now()$$, '42501', 'permission denied for table membership_applications', 'Office cannot forge verification evidence');
select lives_ok($$update public.membership_applications set review_status = 'submitted' where id = (select id from verification_fixture)$$, 'Updating an invisible application changes no rows');
reset role;
select is((select review_status from public.membership_applications), 'draft', 'Office cannot promote hidden drafts');
select throws_ok($$select public.verify_membership_application_email(repeat('b',64))$$, 'P0001', 'Länken är ogiltig eller har ersatts', 'Unknown token rejected');
update public.membership_application_verifications set expires_at = now() - interval '1 second';
select throws_ok($$select public.verify_membership_application_email(repeat('a',64))$$, 'P0001', 'Länken har gått ut', 'Expired token rejected');
select is((select public.prepare_membership_application_verification(id, 'wrong@example.se', repeat('b',64)) from verification_fixture), false, 'Wrong address cannot resend');
select is((select public.prepare_membership_application_verification(id, 'guardian@example.se', repeat('b',64)) from verification_fixture), false, 'One-minute cooldown enforced');
update public.membership_application_verifications set created_at = now() - interval '2 minutes';
select is((select public.prepare_membership_application_verification(id, 'guardian@example.se', repeat('b',64)) from verification_fixture), true, 'New link can be prepared after cooldown');
select throws_ok($$select public.verify_membership_application_email(repeat('a',64))$$, 'P0001', 'Länken är ogiltig eller har ersatts', 'Resend invalidates old token');
select lives_ok($$select public.verify_membership_application_email(repeat('b',64))$$, 'Valid token promotes the saved application');
select lives_ok($$select public.verify_membership_application_email(repeat('b',64))$$, 'Repeated confirmation is idempotent');
select is((select review_status from public.membership_applications), 'submitted', 'Application reaches office after verification');
select is((select verified_email from public.membership_applications), 'guardian@example.se', 'Evidence belongs to first guardian');
select is((select count(*) from public.people where organization_id = 'a1000000-0000-0000-0000-000000000001'), 0::bigint, 'Verification creates no player or membership');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.membership_applications), 1::bigint, 'Office sees verified application');
reset role;
insert into public.organization_members(organization_id,user_id,role) values('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','member');
select is((select email_verified from public.start_membership_application((select payload from verification_fixture), repeat('c',64), 'a0000000-0000-0000-0000-000000000002')), true, 'Verified member with matching address skips verification');
select is((select submission_source from public.membership_applications where id <> (select id from verification_fixture)), 'verified_member', 'Member source comes from database identity');
select is((select email_verified from public.start_membership_application(jsonb_set((select payload from verification_fixture),'{guardians,0,email}','"other@example.se"'), repeat('d',64), 'a0000000-0000-0000-0000-000000000002')), false, 'Member cannot skip verification for another address');
select is((select email_verified from public.start_membership_application(jsonb_set((select payload from verification_fixture),'{guardians,0,email}','"wrong@example.se"'), repeat('e',64), 'a0000000-0000-0000-0000-000000000003')), false, 'Verified non-member must verify this application');
update public.membership_application_verifications set created_at = now() - interval '2 minutes';
update auth.users set email_confirmed_at = null where id = 'a0000000-0000-0000-0000-000000000002';
select is((select email_verified from public.start_membership_application((select payload from verification_fixture), repeat('f',64), 'a0000000-0000-0000-0000-000000000002')), false, 'Member without confirmed email must verify');
update public.membership_application_verifications set created_at = now() - interval '2 minutes';
select is((select public.prepare_membership_application_verification(v.application_id, 'guardian@example.se', repeat('1',64)) from public.membership_application_verifications v where v.token_hash = repeat('f',64)), false, 'Three sends per hour limit enforced across applications');
select * from finish();
rollback;
