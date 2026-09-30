begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'access-owner@example.se', '{"display_name":"Ägare"}'),
  ('c0000000-0000-0000-0000-000000000002', 'leader-only@example.se', '{"display_name":"Ledare utan access"}'),
  ('c0000000-0000-0000-0000-000000000003', 'editor@example.se', '{"display_name":"Lagredaktör"}');

insert into public.organizations (id, slug, name, created_by)
values (
  'c1000000-0000-0000-0000-000000000001',
  'access-test',
  'Access test',
  'c0000000-0000-0000-0000-000000000001'
);

insert into public.organization_members (organization_id, user_id, role) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'leader'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'member');

insert into public.sections (id, organization_id, slug, name)
values (
  'c2000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'fotboll',
  'Fotboll'
);

insert into public.teams (id, organization_id, section_id, slug, name, season) values
  (
    'c3000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000001',
    'team-a',
    'Team A',
    '2026'
  ),
  (
    'c3000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000001',
    'team-b',
    'Team B',
    '2026'
  );

insert into public.memberships (organization_id, person_id, team_id, role)
select
  'c1000000-0000-0000-0000-000000000001',
  person.id,
  'c3000000-0000-0000-0000-000000000001',
  'leader'
from public.people person
where person.organization_id = 'c1000000-0000-0000-0000-000000000001'
  and person.user_id = 'c0000000-0000-0000-0000-000000000002';

insert into public.team_access_assignments (organization_id, team_id, person_id, access_profile_id)
select
  'c1000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000001',
  person.id,
  profile.id
from public.people person
join public.team_access_profiles profile
  on profile.organization_id = person.organization_id
 and profile.key = 'team_editor'
where person.organization_id = 'c1000000-0000-0000-0000-000000000001'
  and person.user_id = 'c0000000-0000-0000-0000-000000000003';

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select isnt(
  public.has_team_permission('c3000000-0000-0000-0000-000000000001', 'team.manage'),
  true,
  'En ledarrelation ger inte team.manage'
);
select isnt(
  public.has_team_permission('c3000000-0000-0000-0000-000000000001', 'activity.manage'),
  true,
  'En ledarrelation ger inte activity.manage'
);

select results_eq(
  $with changed as (
      update public.teams
      set name = 'Otillåten ändring'
      where id = 'c3000000-0000-0000-0000-000000000002'
      returning id
    )
    select count(*) from changed$,
  array[0::bigint],
  'Organisationsrollen leader ger inte skrivåtkomst till andra lag'
);

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok(
  public.has_team_permission('c3000000-0000-0000-0000-000000000001', 'activity.manage'),
  'Lagredaktören får hantera aktiviteter'
);
select isnt(
  public.has_team_permission('c3000000-0000-0000-0000-000000000001', 'team.manage'),
  true,
  'Lagredaktören får inte full lagadministration'
);
select isnt(
  public.has_team_permission('c3000000-0000-0000-0000-000000000001', 'roster.manage'),
  true,
  'Lagredaktören får inte administrera truppen'
);

select isnt(
  public.has_team_permission('c3000000-0000-0000-0000-000000000001', 'attendance.manage'),
  true,
  'Lagredaktören får inte närvarobehörighet implicit'
);

select isnt(
  public.has_team_permission('c3000000-0000-0000-0000-000000000001', 'task.manage'),
  true,
  'Lagredaktören får inte uppgiftsbehörighet implicit'
);
select isnt(
  public.has_team_permission('c3000000-0000-0000-0000-000000000002', 'activity.manage'),
  true,
  'Lagbehörigheten gäller inte ett annat lag'
);

select throws_ok(
  $$insert into public.team_access_assignments (
      organization_id, team_id, person_id, access_profile_id
    )
    select
      'c1000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001',
      person.id,
      profile.id
    from public.people person
    join public.team_access_profiles profile
      on profile.organization_id = person.organization_id
     and profile.key = 'team_admin'
    where person.organization_id = 'c1000000-0000-0000-0000-000000000001'
      and person.user_id = 'c0000000-0000-0000-0000-000000000003'$$,
  '42501',
  'new row violates row-level security policy for table "team_access_assignments"',
  'En användare kan inte ge sig själv högre lagbehörighet'
);

select ok(
  not has_function_privilege('anon', 'public.has_team_permission(uuid,text)', 'EXECUTE'),
  'Anon kan inte anropa permission-funktionen'
);

select * from finish();
rollback;
