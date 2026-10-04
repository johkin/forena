begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, email_confirmed_at) values
  ('d0000000-0000-0000-0000-000000000001', 'memory-owner@example.test', now()),
  ('d0000000-0000-0000-0000-000000000002', 'memory-leader@example.test', now()),
  ('d0000000-0000-0000-0000-000000000003', 'memory-guardian@example.test', now()),
  ('d0000000-0000-0000-0000-000000000004', 'memory-player@example.test', now()),
  ('d0000000-0000-0000-0000-000000000005', 'memory-outsider@example.test', now()),
  ('d0000000-0000-0000-0000-000000000006', 'memory-editor@example.test', now());
insert into public.organizations (id, slug, name, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'memory-section-test', 'Memory sections', 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'memory-other-test', 'Other organization', 'd0000000-0000-0000-0000-000000000001');
insert into public.organization_members (organization_id, user_id, role)
select 'd1000000-0000-0000-0000-000000000001', id, 'member' from auth.users
where id in ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000006')
on conflict do nothing;
insert into public.sections (id, organization_id, slug, name) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a', 'Section A'),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'b', 'Section B');
insert into public.teams (id, organization_id, section_id, slug, name) values
  ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'a', 'Team A'),
  ('d3000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'b', 'Team B');
-- organization_member_ensure_person already created the account-linked people.
-- Reuse their IDs below; only the child without an account needs an insert.
insert into public.people (id, organization_id, user_id, display_name) values
  ('d4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', null, 'Child A');
insert into public.memberships (organization_id, team_id, person_id, role, starts_on, ends_on) values
  ('d1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000002', 'participant', current_date - 10, current_date + 2),
  ('d1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-000000000002',
    (select id from public.people
     where organization_id = 'd1000000-0000-0000-0000-000000000001'
       and user_id = 'd0000000-0000-0000-0000-000000000004'),
    'participant', current_date - 10, null);
insert into public.person_guardians (organization_id, person_id, guardian_user_id) values
  ('d1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003');
insert into public.section_staff (organization_id, section_id, user_id, role) values
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'editor');
insert into public.team_access_profiles (id, organization_id, key, name) values
  ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'memory_test', 'Memory test');
insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key) values
  ('d1000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'team.view');
insert into public.team_access_assignments (organization_id, team_id, person_id, access_profile_id, starts_on, ends_on) values
  ('d1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-000000000001',
    (select id from public.people
     where organization_id = 'd1000000-0000-0000-0000-000000000001'
       and user_id = 'd0000000-0000-0000-0000-000000000002'),
    'd5000000-0000-0000-0000-000000000001', current_date - 10, current_date + 2);
insert into public.assistant_memories (organization_id, scope, scope_id, content) values
  ('d1000000-0000-0000-0000-000000000001', 'section', 'd2000000-0000-0000-0000-000000000001', 'A'),
  ('d1000000-0000-0000-0000-000000000001', 'section', 'd2000000-0000-0000-0000-000000000002', 'B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$select content from public.assistant_memories where scope = 'section'$$, array['A'::text], 'Team leader inherits only the authorized section');
select results_eq($$select public.can_read_assistant_memory('section', 'd1000000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001')$$, array[false], 'A mismatched organization and section is denied');
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq($$select content from public.assistant_memories where scope = 'section'$$, array['A'::text], 'Active guardian inherits only the child section');
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq($$select content from public.assistant_memories where scope = 'section'$$, array['B'::text], 'Participant in another section cannot read section A');
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq($$select count(*) from public.assistant_memories where scope = 'section'$$, array[0::bigint], 'Organization membership alone does not grant section memory access');
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq($$select content from public.assistant_memories where scope = 'section'$$, array['A'::text], 'Section staff can read their own section');
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$select content from public.assistant_memories where scope = 'section' order by content$$, array['A'::text, 'B'::text], 'Organization owner retains both sections');

reset role;
update public.team_access_assignments set ends_on = current_date - 1 where access_profile_id = 'd5000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$select count(*) from public.assistant_memories where scope = 'section'$$, array[0::bigint], 'Expired team permission revokes inherited section access');
reset role;
update public.team_access_assignments set starts_on = current_date + 1, ends_on = null where access_profile_id = 'd5000000-0000-0000-0000-000000000001';
set local role authenticated;
select results_eq($$select count(*) from public.assistant_memories where scope = 'section'$$, array[0::bigint], 'Future team permission does not grant access yet');
reset role;
update public.memberships set ends_on = current_date - 1 where person_id = 'd4000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq($$select count(*) from public.assistant_memories where scope = 'section'$$, array[0::bigint], 'Expired child membership revokes guardian section access');
select * from finish();
rollback;
