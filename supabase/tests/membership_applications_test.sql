begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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

set local role anon;
select results_eq(
  $$select count(*) from public.get_join_options('application-test')$$,
  array[1::bigint],
  'Publika besökare kan läsa valbara sektioner och lag'
);
select results_eq(
  $$select count(*) from public.membership_applications$$,
  array[0::bigint],
  'Publika besökare kan inte läsa ansökningar'
);
select lives_ok(
  $$select public.submit_membership_application(jsonb_build_object(
    'organization_id', 'a1000000-0000-0000-0000-000000000001',
    'section_id', 'a2000000-0000-0000-0000-000000000001',
    'team_id', 'a3000000-0000-0000-0000-000000000001',
    'player_first_name', 'Test', 'player_last_name', 'Spelare', 'player_birth_date', '2016-05-01',
    'guardians', jsonb_build_array(jsonb_build_object('first_name','Test','last_name','Målsman','email','guardian@example.se','mobile','0701234567'))
  ))$$,
  'Publika besökare kan lämna en validerad ansökan'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"wrong@example.se","role":"authenticated"}', true);
select results_eq(
  $$select count(*) from public.membership_applications$$,
  array[0::bigint],
  'En utomstående kan inte läsa ansökningar'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","email":"office@example.se","role":"authenticated"}', true);
select results_eq(
  $$select count(*) from public.membership_applications$$,
  array[1::bigint],
  'Kansliet kan läsa föreningens ansökningar'
);

reset role;
update public.membership_applications set review_status = 'approved', reviewed_by = 'a0000000-0000-0000-0000-000000000001', reviewed_at = now();
insert into public.membership_application_tokens (application_id, guardian_id, organization_id, token_hash)
select application.id, guardian.id, application.organization_id, repeat('c', 64)
from public.membership_applications application
join public.membership_application_guardians guardian on guardian.application_id = application.id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"wrong@example.se","role":"authenticated"}', true);
select throws_ok(
  $$select public.accept_membership_application_invitation(repeat('c', 64))$$,
  'P0001', 'Inbjudan tillhör en annan e-postadress',
  'Fel e-postadress kan inte aktivera medlemskapet'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","email":"guardian@example.se","role":"authenticated"}', true);
select lives_ok(
  $$select public.accept_membership_application_invitation(repeat('c', 64))$$,
  'Rätt målsman kan aktivera det godkända medlemskapet'
);

select * from finish();
rollback;
