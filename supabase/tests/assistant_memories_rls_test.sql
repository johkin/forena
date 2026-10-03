begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('b0000000-0000-0000-0000-000000000001', 'memory@example.se', now(), '{"display_name":"Minnesanvändare"}');

insert into public.organizations (id, slug, name)
values
  ('b1000000-0000-0000-0000-000000000001', 'memory-one', 'Minnesklubb ett'),
  ('b1000000-0000-0000-0000-000000000002', 'memory-two', 'Minnesklubb två');

insert into public.organization_members (organization_id, user_id, role)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'member');

insert into public.assistant_memories
  (organization_id, scope, scope_id, kind, subject, content, created_by)
values
  ('b1000000-0000-0000-0000-000000000001', 'personal', 'b0000000-0000-0000-0000-000000000001', 'preference', 'svar', 'Kortfattade svar', 'b0000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002', 'personal', 'b0000000-0000-0000-0000-000000000001', 'preference', 'svar', 'Detaljerade svar', 'b0000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","email":"memory@example.se","role":"authenticated"}', true);

select results_eq(
  $$select count(*) from public.assistant_memories where scope = 'personal'$$,
  array[1::bigint],
  'Personliga minnen kräver medlemskap i minnets förening'
);

select results_eq(
  $$select organization_id from public.assistant_memories where scope = 'personal'$$,
  array['b1000000-0000-0000-0000-000000000001'::uuid],
  'Personligt minne från annan förening läcker inte via RLS'
);

select results_eq(
  $$select content from public.assistant_memories
    where scope = 'personal'
      and organization_id = 'b1000000-0000-0000-0000-000000000001'$$,
  array['Kortfattade svar'::text],
  'Användaren kan läsa sitt personliga minne i en förening där den är medlem'
);

select * from finish();
rollback;
