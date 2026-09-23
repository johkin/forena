create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider text,
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (outbox_id, channel)
);

create index notification_deliveries_outbox_idx on public.notification_deliveries(outbox_id);
create index notification_deliveries_status_idx on public.notification_deliveries(status, attempted_at);

alter table public.notification_deliveries enable row level security;

create policy "users can read their delivery status"
on public.notification_deliveries for select
using (user_id = auth.uid());

create or replace function public.queue_activity_invitation(target_activity_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_activity public.activities%rowtype;
  queued_count integer := 0;
begin
  select * into target_activity from public.activities where id = target_activity_id;
  if target_activity.id is null or target_activity.team_id is null then raise exception 'Activity not found'; end if;
  if not public.can_manage_team(target_activity.team_id) then raise exception 'Not allowed'; end if;

  with invited_people as (
    select distinct i.person_id
    from public.invitations i
    where i.activity_id = target_activity_id
  ),
  recipients as (
    select distinct p.user_id as user_id
    from invited_people ip join public.people p on p.id = ip.person_id
    where p.user_id is not null
    union
    select distinct pg.guardian_user_id
    from invited_people ip join public.person_guardians pg on pg.person_id = ip.person_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      target_activity.organization_id,
      recipients.user_id,
      'activity_invitation',
      jsonb_build_object(
        'activityId', target_activity.id,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at,
        'location', target_activity.location
      ),
      coalesce(target_activity.invitation_send_at, now()),
      'pending'
    from recipients
    where not exists (
      select 1 from public.notification_outbox existing
      where existing.user_id = recipients.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = target_activity.id::text
        and existing.status <> 'cancelled'
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;

revoke all on function public.queue_activity_invitation(uuid) from public;
grant execute on function public.queue_activity_invitation(uuid) to authenticated;

create or replace function public.claim_notification_outbox(batch_size integer default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select id
    from public.notification_outbox
    where status in ('pending', 'failed')
      and scheduled_at <= now()
      and attempts < 5
    order by scheduled_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.notification_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      last_error = null
  from claimed
  where outbox.id = claimed.id
  returning outbox.*;
end;
$$;

revoke all on function public.claim_notification_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;

create or replace function public.get_activity_delivery_status(target_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_team_id uuid;
begin
  select team_id into target_team_id from public.activities where id = target_activity_id;
  if target_team_id is null or not public.can_manage_team(target_team_id) then raise exception 'Not allowed'; end if;

  return (
    select jsonb_build_object(
      'queued', count(*) filter (where o.status in ('pending','processing')),
      'sent', count(*) filter (where o.status = 'sent'),
      'failed', count(*) filter (where o.status = 'failed'),
      'deliveries', coalesce(jsonb_agg(
        jsonb_build_object(
          'outboxId', o.id,
          'type', o.type,
          'status', o.status,
          'scheduledAt', o.scheduled_at,
          'sentAt', o.sent_at,
          'attempts', o.attempts,
          'lastError', o.last_error,
          'channels', coalesce((
            select jsonb_agg(jsonb_build_object(
              'channel', d.channel,
              'status', d.status,
              'provider', d.provider,
              'attempts', d.attempts,
              'sentAt', d.sent_at,
              'lastError', d.last_error
            ) order by d.channel)
            from public.notification_deliveries d
            where d.outbox_id = o.id
          ), '[]'::jsonb)
        )
        order by o.created_at desc
      ), '[]'::jsonb)
    )
    from public.notification_outbox o
    where o.payload ->> 'activityId' = target_activity_id::text
  );
end;
$$;

revoke all on function public.get_activity_delivery_status(uuid) from public;
grant execute on function public.get_activity_delivery_status(uuid) to authenticated;


with invited_people as (
  select distinct
    a.organization_id,
    a.id as activity_id,
    a.team_id,
    a.title,
    a.starts_at,
    a.location,
    a.invitation_send_at,
    i.person_id
  from public.activities a
  join public.invitations i on i.activity_id = a.id
  where a.ends_at >= now()
    and a.status <> 'cancelled'
),
recipients as (
  select distinct
    ip.organization_id,
    ip.activity_id,
    ip.team_id,
    ip.title,
    ip.starts_at,
    ip.location,
    ip.invitation_send_at,
    p.user_id
  from invited_people ip
  join public.people p on p.id = ip.person_id
  join public.organization_members om
    on om.organization_id = ip.organization_id and om.user_id = p.user_id
  where p.user_id is not null
  union
  select distinct
    ip.organization_id,
    ip.activity_id,
    ip.team_id,
    ip.title,
    ip.starts_at,
    ip.location,
    ip.invitation_send_at,
    pg.guardian_user_id
  from invited_people ip
  join public.person_guardians pg on pg.person_id = ip.person_id
  join public.organization_members om
    on om.organization_id = ip.organization_id and om.user_id = pg.guardian_user_id
)
insert into public.notification_outbox (
  organization_id, user_id, type, payload, scheduled_at, status
)
select
  recipients.organization_id,
  recipients.user_id,
  'activity_invitation',
  jsonb_build_object(
    'activityId', recipients.activity_id,
    'teamId', recipients.team_id,
    'title', recipients.title,
    'startsAt', recipients.starts_at,
    'location', recipients.location
  ),
  coalesce(recipients.invitation_send_at, now()),
  'pending'
from recipients
where not exists (
  select 1
  from public.notification_outbox existing
  where existing.user_id = recipients.user_id
    and existing.type = 'activity_invitation'
    and existing.payload ->> 'activityId' = recipients.activity_id::text
    and existing.status <> 'cancelled'
);
