begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
insert into auth.users (id, email, email_confirmed_at) values
  ('e0000000-0000-0000-0000-000000000001', 'integrity-admin@example.test', now()),
  ('e0000000-0000-0000-0000-000000000002', 'integrity-invitee@example.test', now());
insert into public.platform_roles (user_id, role) values ('e0000000-0000-0000-0000-000000000001', 'system_admin');
insert into public.platform_admin_invites (id, email, token_hash, invited_by) values
  ('e1000000-0000-0000-0000-000000000001', 'integrity-invitee@example.test', repeat('1', 64), 'e0000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$update public.platform_admin_invites set sent_at = now() where id = 'e1000000-0000-0000-0000-000000000001'$$, 'Admin can mark a pending invitation sent');
select throws_ok($$update public.platform_admin_invites set email = 'forged@example.test' where id = 'e1000000-0000-0000-0000-000000000001'$$, '42501', null, 'Recipient is immutable to authenticated admins');
select throws_ok($$update public.platform_admin_invites set token_hash = repeat('2', 64) where id = 'e1000000-0000-0000-0000-000000000001'$$, '42501', null, 'Token is immutable to authenticated admins');
select throws_ok($$update public.platform_admin_invites set accepted_by = 'e0000000-0000-0000-0000-000000000002', accepted_at = now(), status = 'accepted' where id = 'e1000000-0000-0000-0000-000000000001'$$, '42501', null, 'Acceptance provenance cannot be forged');
select throws_ok($$update public.platform_admin_invites set status = 'accepted' where id = 'e1000000-0000-0000-0000-000000000001'$$, '42501', null, 'Direct acceptance is not an allowed state transition');
select lives_ok($$update public.platform_admin_invites set status = 'cancelled' where id = 'e1000000-0000-0000-0000-000000000001'$$, 'Cancellation remains allowed');
select results_eq($$update public.platform_admin_invites set status = 'pending' where id = 'e1000000-0000-0000-0000-000000000001' returning id$$, $$select null::uuid where false$$, 'A cancelled invitation cannot be reopened');

reset role;
insert into public.platform_admin_invites (id, email, token_hash, invited_by) values
  ('e1000000-0000-0000-0000-000000000002', 'integrity-invitee@example.test', repeat('3', 64), 'e0000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$select public.claim_platform_admin_invite(repeat('3', 64))$$, array[true], 'Verified recipient still claims through the trusted RPC');
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$update public.platform_admin_invites set status = 'pending' where id = 'e1000000-0000-0000-0000-000000000002' returning id$$, $$select null::uuid where false$$, 'An accepted invitation cannot be reopened');
select results_eq($$update public.platform_admin_invites set sent_at = now() where id = 'e1000000-0000-0000-0000-000000000002' returning id$$, $$select null::uuid where false$$, 'Accepted history is immutable to ordinary admin actions');
reset role;
select lives_ok($$delete from auth.users where id = 'e0000000-0000-0000-0000-000000000002'$$, 'An accepted administrator account can be deleted');
select results_eq($$select status = 'accepted' and accepted_at is not null and accepted_by is null from public.platform_admin_invites where id = 'e1000000-0000-0000-0000-000000000002'$$, array[true], 'Acceptance history survives account deletion without a dangling user id');
select results_eq($$select count(*) from public.platform_roles where user_id = 'e0000000-0000-0000-0000-000000000002'$$, array[0::bigint], 'Account deletion cascades its platform role');
select * from finish();
rollback;
