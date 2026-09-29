begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'manager-a@example.se', '{"display_name":"Manager A"}'),
  ('a0000000-0000-0000-0000-000000000002', 'guardian-a@example.se', '{"display_name":"Guardian A"}'),
  ('a0000000-0000-0000-0000-000000000003', 'member-b@example.se', '{"display_name":"Member B"}'),
  ('a0000000-0000-0000-0000-000000000004', 'admin@example.se', '{"display_name":"Admin"}');

insert into public.organizations (id, slug, name)
values ('a1000000-0000-0000-0000-000000000001', 'invitation-rls-test', 'Invitation RLS test');

insert into public.organization_members (organization_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'member'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'member'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'member'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'admin');

insert into public.sections (id, organization_id, slug, name)
values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'fotboll', 'Fotboll');

insert into public.teams (id, organization_id, section_id, slug, name, season) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'team-a', 'Team A', '2026'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'team-b', 'Team B', '2026');

insert into public.team_staff (organization_id, team_id, user_id, role)
values ('a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'team_manager');

insert into public.activity_types (id, organization_id, name, slug, system_category)
values ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Träning', 'traning', 'session');

insert into public.people (id, organization_id, user_id, display_name) values
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', null, 'Child A'),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Member B');

insert into public.person_guardians (organization_id, person_id, guardian_user_id)
values ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');

insert into public.memberships (organization_id, person_id, team_id, role) values
  ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'participant'),
  ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', 'participant');

insert into public.activities (id, organization_id, team_id, activity_type_id, title, starts_at, ends_at, location) values
  ('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Activity A', now() + interval '1 day', now() + interval '1 day 1 hour', ''),
  ('a6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'Activity B', now() + interval '1 day', now() + interval '1 day 1 hour', '');

insert into public.invitations (organization_id, activity_id, person_id, response, responded_at, response_comment) values
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'declined', now(), 'Private family comment A'),
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002', 'accepted', now(), 'Private comment B');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$select count(*) from public.invitations where person_id = 'a5000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'A member in Team B cannot read Team A invitation data'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select response_comment from public.invitations order by response_comment$$,
  array['Private family comment A'::text],
  'A guardian can read only their own child invitation'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select response_comment from public.invitations order by response_comment$$,
  array['Private family comment A'::text],
  'A team manager can read invitations for the managed team only'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq(
  $$select count(*) from public.invitations$$,
  array[2::bigint],
  'An organization admin can read invitation data across the organization'
);

select * from finish();
rollback;
