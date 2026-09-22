begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('90000000-0000-0000-0000-000000000001', 'manager@example.se', '{"display_name":"Lagledaren"}'),
  ('90000000-0000-0000-0000-000000000002', 'guardian@example.se', '{"display_name":"Målsman"}'),
  ('90000000-0000-0000-0000-000000000003', 'outsider@example.se', '{"display_name":"Utomstående"}');

insert into public.organizations (id, slug, name, created_by)
values ('91000000-0000-0000-0000-000000000001', 'rls-test', 'RLS test', '90000000-0000-0000-0000-000000000001');
insert into public.sections (id, organization_id, slug, name)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'fotboll', 'Fotboll');
insert into public.teams (id, organization_id, section_id, slug, name, season)
values ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'f2016', 'F2016', '2026');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","email":"manager@example.se","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.team_member_invitations
    (organization_id, team_id, email, role, person_display_name, token_hash, invited_by)
    values
    ('91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'guardian@example.se', 'guardian', 'Spelaren', repeat('a', 64), '90000000-0000-0000-0000-000000000001')$$,
  'Lagledaren kan skapa en inbjudan'
);

select results_eq(
  $$select count(*) from public.team_member_invitations$$,
  array[1::bigint],
  'Lagledaren kan läsa lagets inbjudningar'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000003","email":"outsider@example.se","role":"authenticated"}', true);

select results_eq(
  $$select count(*) from public.team_member_invitations$$,
  array[0::bigint],
  'En utomstående kan inte läsa inbjudningar'
);

select throws_ok(
  $$insert into public.team_member_invitations
    (organization_id, team_id, email, role, token_hash, invited_by)
    values
    ('91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'outsider@example.se', 'leader', repeat('b', 64), '90000000-0000-0000-0000-000000000003')$$,
  '42501',
  'new row violates row-level security policy for table "team_member_invitations"',
  'En utomstående kan inte bjuda in sig själv'
);

select throws_ok(
  $$select public.accept_team_member_invitation(repeat('a', 64))$$,
  'P0001',
  'Inbjudan tillhör en annan e-postadress',
  'Inbjudan kan inte accepteras med fel e-postadress'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","email":"guardian@example.se","role":"authenticated"}', true);

select lives_ok(
  $$select public.accept_team_member_invitation(repeat('a', 64))$$,
  'Rätt mottagare kan acceptera inbjudan'
);

select results_eq(
  $$select count(*) from public.memberships
    where team_id = '93000000-0000-0000-0000-000000000001'
      and role = 'participant'$$,
  array[1::bigint],
  'Acceptansen skapar spelaren i laget'
);

select * from finish();
rollback;
