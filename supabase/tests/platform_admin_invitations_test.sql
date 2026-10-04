begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.se', now(), '{"display_name":"Systemadmin"}'),
  ('a0000000-0000-0000-0000-000000000002', 'invitee@example.se', now(), '{"display_name":"Inbjuden"}'),
  ('a0000000-0000-0000-0000-000000000003', 'outsider@example.se', now(), '{"display_name":"Utomstående"}'),
  ('a0000000-0000-0000-0000-000000000004', 'unverified@example.se', null, '{"display_name":"Overifierad"}'),
  ('a0000000-0000-0000-0000-000000000005', 'bootstrap@example.se', now(), '{"display_name":"Bootstrap"}');

insert into public.platform_admin_invites (email, token_hash, source)
values ('bootstrap@example.se', repeat('e', 64), 'bootstrap');

insert into public.platform_roles (user_id, role)
values ('a0000000-0000-0000-0000-000000000001', 'system_admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000005","email":"bootstrap@example.se","role":"authenticated"}', true);

select results_eq(
  $$select public.claim_platform_admin_invite(repeat('e', 64))$$,
  array[false],
  'Bootstrapinbjudan kan inte skapa ytterligare systemadmin när en redan finns'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","email":"admin@example.se","role":"authenticated"}', true);

select ok(
  public.has_platform_role(array['system_admin']),
  'Systemadmin känner igen sin plattformsroll'
);

select lives_ok(
  $$insert into public.platform_admin_invites
    (email, token_hash, source, invited_by)
    values ('invitee@example.se', repeat('a', 64), 'system_admin', 'a0000000-0000-0000-0000-000000000001')$$,
  'Systemadmin kan skapa en administratörsinbjudan'
);

select lives_ok(
  $$insert into public.platform_admin_invites
    (email, token_hash, source, invited_by)
    values ('unverified@example.se', repeat('b', 64), 'system_admin', 'a0000000-0000-0000-0000-000000000001')$$,
  'Systemadmin kan bjuda in ytterligare en användare'
);

select results_eq(
  $$select count(*) from public.platform_admin_invites where status = 'pending'$$,
  array[3::bigint],
  'Systemadmin kan läsa väntande inbjudningar'
);

select results_eq(
  $$select count(*) from public.list_platform_admins()$$,
  array[1::bigint],
  'Systemadmin kan lista plattformsadministratörer'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"outsider@example.se","role":"authenticated"}', true);

select results_eq(
  $$select count(*) from public.platform_admin_invites$$,
  array[0::bigint],
  'Vanlig användare kan inte läsa administratörsinbjudningar'
);

select throws_ok(
  $$insert into public.platform_admin_invites
    (email, token_hash, source, invited_by)
    values ('outsider@example.se', repeat('c', 64), 'system_admin', 'a0000000-0000-0000-0000-000000000003')$$,
  '42501',
  'new row violates row-level security policy for table "platform_admin_invites"',
  'Vanlig användare kan inte bjuda in sig själv'
);

select results_eq(
  $$select public.claim_platform_admin_invite(repeat('c', 64))$$,
  array[false],
  'Användare utan matchande inbjudan kan inte bli systemadmin'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","email":"invitee@example.se","role":"authenticated"}', true);

select results_eq(
  $$select public.claim_platform_admin_invite(repeat('d', 64))$$,
  array[false],
  'Fel inbjudningstoken kan inte användas även med rätt e-postadress'
);

select results_eq(
  $$select public.claim_platform_admin_invite(repeat('a', 64))$$,
  array[true],
  'Verifierad mottagare med rätt token kan acceptera sin inbjudan'
);

select ok(
  public.has_platform_role(array['system_admin']),
  'Accepterad mottagare har systemadminrollen'
);

select results_eq(
  $$select status from public.platform_admin_invites where email = 'invitee@example.se'$$,
  array['accepted'::text],
  'Inbjudan markeras accepterad'
);

select results_eq(
  $$select public.claim_platform_admin_invite(repeat('a', 64))$$,
  array[false],
  'Samma inbjudan kan inte accepteras två gånger'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","email":"unverified@example.se","role":"authenticated"}', true);

select results_eq(
  $$select public.claim_platform_admin_invite(repeat('b', 64))$$,
  array[false],
  'Overifierad e-postadress kan inte acceptera systemadmininbjudan'
);

select * from finish();
rollback;
