begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('90000000-0000-0000-0000-000000000001', 'manager@example.se', '{"display_name":"Lagledaren"}'),
  ('90000000-0000-0000-0000-000000000002', 'guardian@example.se', '{"display_name":"Målsman"}'),
  ('90000000-0000-0000-0000-000000000003', 'outsider@example.se', '{"display_name":"Utomstående"}'),
  ('90000000-0000-0000-0000-000000000004', 'leader@example.se', '{"display_name":"Ny ledare"}');

insert into public.organizations (id, slug, name, created_by)
values ('91000000-0000-0000-0000-000000000001', 'rls-test', 'RLS test', '90000000-0000-0000-0000-000000000001');
insert into public.sections (id, organization_id, slug, name)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'fotboll', 'Fotboll');
insert into public.teams (id, organization_id, section_id, slug, name, season)
values ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'f2016', 'F2016', '2026');

insert into public.responsibility_types (organization_id, name, slug)
values ('91000000-0000-0000-0000-000000000001', 'Tränare', 'tranare');


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


select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","email":"manager@example.se","role":"authenticated"}', true);

select lives_ok(
  $q$insert into public.team_member_invitations
    (organization_id, team_id, email, role, token_hash, invited_by)
    values
    ('91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'leader@example.se', 'leader', repeat('c', 64), '90000000-0000-0000-0000-000000000001')$q$,
  'Klubbägaren kan bjuda in en ledare'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000004","email":"leader@example.se","role":"authenticated"}', true);

select lives_ok(
  $q$select public.accept_team_member_invitation(repeat('c', 64))$q$,
  'Den nya ledaren kan acceptera inbjudan'
);

select results_eq(
  $q$select count(*)
    from public.memberships membership
    join public.people person on person.id = membership.person_id
    where membership.team_id = '93000000-0000-0000-0000-000000000001'
      and membership.role = 'leader'
      and person.user_id = '90000000-0000-0000-0000-000000000004'$q$,
  array[1::bigint],
  'Ledarinbjudan skapar en ledarrelation'
);

select results_eq(
  $q$select responsibility.slug
    from public.team_responsibilities assignment
    join public.responsibility_types responsibility
      on responsibility.id = assignment.responsibility_type_id
    join public.people person on person.id = assignment.person_id
    where assignment.team_id = '93000000-0000-0000-0000-000000000001'
      and person.user_id = '90000000-0000-0000-0000-000000000004'
      and assignment.ends_on is null$q$,
  array['tranare'::text],
  'Ledarinbjudan tilldelar tränaransvar separat'
);

select results_eq(
  $q$select count(*)
    from public.team_access_assignments assignment
    join public.people person on person.id = assignment.person_id
    where assignment.team_id = '93000000-0000-0000-0000-000000000001'
      and person.user_id = '90000000-0000-0000-0000-000000000004'
      and assignment.ends_on is null$q$,
  array[0::bigint],
  'Ledarinbjudan ger ingen systembehörighet automatiskt'
);

select * from finish();
rollback;
