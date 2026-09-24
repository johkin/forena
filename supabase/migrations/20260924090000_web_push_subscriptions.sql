-- A Web Push subscription belongs to a browser/device and a user, not to one
-- organization. Notifications remain organization scoped in the outbox and
-- delivery tables.
drop policy if exists "users manage their push subscriptions" on public.push_subscriptions;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_organization_id_user_id_fkey,
  drop column if exists organization_id;

alter table public.push_subscriptions
  rename column p256dh_key to p256dh;

alter table public.push_subscriptions
  rename column auth_key to auth;

alter table public.push_subscriptions
  rename column device_name to user_agent;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_not_empty check (length(endpoint) > 0),
  add constraint push_subscriptions_p256dh_not_empty check (length(p256dh) > 0),
  add constraint push_subscriptions_auth_not_empty check (length(auth) > 0);

create index push_subscriptions_active_user_idx
on public.push_subscriptions(user_id)
where disabled_at is null;

create policy "users can read their push subscriptions"
on public.push_subscriptions for select to authenticated
using (user_id = auth.uid());

create policy "users can create their push subscriptions"
on public.push_subscriptions for insert to authenticated
with check (user_id = auth.uid());

create policy "users can update their push subscriptions"
on public.push_subscriptions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can delete their push subscriptions"
on public.push_subscriptions for delete to authenticated
using (user_id = auth.uid());
