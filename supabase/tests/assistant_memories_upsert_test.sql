begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('c0000000-0000-0000-0000-000000000001', 'upsert@example.se', now(), '{"display_name":"Minnesupsert"}');

insert into public.organizations (id, slug, name)
values
  ('c1000000-0000-0000-0000-000000000001', 'upsert-one', 'Upsert ett'),
  ('c1000000-0000-0000-0000-000000000002', 'upsert-two', 'Upsert två');

insert into public.organization_members (organization_id, user_id, role)
values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'member'),
  ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'member');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000001","email":"upsert@example.se","role":"authenticated"}', true);

select lives_ok(
  $$select public.upsert_assistant_memory(
    'c1000000-0000-0000-0000-000000000001', null, 'personal',
    'c0000000-0000-0000-0000-000000000001', 'preference', 'svar',
    'response.style', 'Kortfattat')$$,
  'Keyed personal memory can be created'
);

select lives_ok(
  $$select public.upsert_assistant_memory(
    'c1000000-0000-0000-0000-000000000002', null, 'personal',
    'c0000000-0000-0000-0000-000000000001', 'preference', 'svar',
    'response.style', 'Utförligt')$$,
  'Same personal memory key can exist in another organization'
);

insert into public.assistant_memories
  (organization_id, scope, scope_id, kind, subject, content, created_by)
values
  ('c1000000-0000-0000-0000-000000000001', 'personal', 'c0000000-0000-0000-0000-000000000001', 'fact', 'ett', 'Fritt minne ett', 'c0000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'personal', 'c0000000-0000-0000-0000-000000000001', 'fact', 'två', 'Fritt minne två', 'c0000000-0000-0000-0000-000000000001');

select results_eq(
  $$select count(*) from public.assistant_memories where memory_key = 'response.style'$$,
  array[2::bigint],
  'Keyed personal memories are unique per organization'
);

select results_eq(
  $$select count(*) from public.assistant_memories
    where organization_id = 'c1000000-0000-0000-0000-000000000001'
      and memory_key is null$$,
  array[2::bigint],
  'Multiple unkeyed memories can coexist in the same scope'
);

select * from finish();
rollback;
