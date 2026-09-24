begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000001', 'push-one@example.se'),
  ('b0000000-0000-0000-0000-000000000002', 'push-two@example.se');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values ('b0000000-0000-0000-0000-000000000001', 'https://push.example.test/one', 'p256dh_key', 'auth_key', 'Test browser')$$,
  'Användaren kan skapa en egen push-prenumeration'
);

select results_eq(
  $$select count(*) from public.push_subscriptions where disabled_at is null$$,
  array[1::bigint],
  'Användaren kan läsa sin aktiva prenumeration'
);

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select results_eq(
  $$select count(*) from public.push_subscriptions$$,
  array[0::bigint],
  'En annan användare kan inte läsa prenumerationen'
);

select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('b0000000-0000-0000-0000-000000000001', 'https://push.example.test/two', 'p256dh_key', 'auth_key')$$,
  '42501',
  'new row violates row-level security policy for table "push_subscriptions"',
  'En användare kan inte skapa en prenumeration åt någon annan'
);

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$update public.push_subscriptions set disabled_at = now() where endpoint = 'https://push.example.test/one'$$,
  'Användaren kan inaktivera sin prenumeration'
);

select * from finish();
rollback;
