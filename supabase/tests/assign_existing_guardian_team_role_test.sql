begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-0000-0000-000000000001', 'owner-roles@example.se', '{"display_name":"Ägare"}'),
  ('b0000000-0000-0000-0000-000000000002', 'guardian-roles@example.se', '{"display_name":"Målsman"}'),
  ('b0000000-0000-0000-0000-000000000003', 'outsider-roles@example.se', '{"display_name":"Utomstående"}');
insert into public.organizations (id, slug, name, created_by)
values ('b1000000-0000-0000-0000-000000000001', 'role-test', 'Rolltest', 'b0000000-0000-0000-0000-000000000001');
insert into public.sections (id, organization_id, slug, name)
values ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'fotboll', 'Fotboll');
insert into public.teams (id, organization_id, section_id, slug, name, season)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'f2016', 'F2016', '2026');
insert into public.organization_members (organization_id, user_id, role)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'member');
insert into public.people (id, organization_id, display_name)
values ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Barnet');
insert into public.person_guardians (organization_id, person_id, guardian_user_id)
values ('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.assign_existing_guardian_team_role('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'coach')$$,
  'Klubbägaren kan ge en befintlig målsman tränarroll'
);
select results_eq(
  $$select role from public.team_staff where team_id = 'b3000000-0000-0000-0000-000000000001' and user_id = 'b0000000-0000-0000-0000-000000000002'$$,
  array['coach'::text], 'Lagrollen sparas'
);
select results_eq(
  $$select count(*) from public.memberships m join public.people p on p.id = m.person_id where m.team_id = 'b3000000-0000-0000-0000-000000000001' and m.role = 'leader' and p.user_id = 'b0000000-0000-0000-0000-000000000002'$$,
  array[1::bigint], 'Målsmannen visas även som ledare i truppen'
);
select results_eq(
  $$select count(*) from public.person_guardians where guardian_user_id = 'b0000000-0000-0000-0000-000000000002'$$,
  array[1::bigint], 'Kopplingen till barnet finns kvar'
);
select throws_ok(
  $$select public.assign_existing_guardian_team_role('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'coach')$$,
  '22023', 'The user is not an existing guardian in this organization', 'Utomstående kan inte tilldelas lagroll'
);
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.assign_existing_guardian_team_role('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'team_manager')$$,
  '42501', 'Only organization admins can assign team roles', 'Målsmannen kan inte ge sig själv lagledarroll'
);
select throws_ok(
  $$insert into public.team_member_invitations (organization_id, team_id, email, role, token_hash, invited_by)
    values ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'outsider-roles@example.se', 'leader', repeat('d', 64), 'b0000000-0000-0000-0000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "team_member_invitations"',
  'En tränare kan inte bjuda in en ny ledare utanför klubbadministrationen'
);

select * from finish();
rollback;
