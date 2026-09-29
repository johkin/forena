-- Prevent old scheduled invitations from being recreated after cleanup.
create or replace function public.materialize_due_activity_invitations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  create temporary table if not exists due_invitation_activities (
    id uuid primary key,
    organization_id uuid not null,
    team_id uuid not null,
    invitation_audience_kind text not null,
    invitation_group_id uuid
  ) on commit drop;
  truncate due_invitation_activities;

  insert into due_invitation_activities
  select a.id, a.organization_id, a.team_id, a.invitation_audience_kind, a.invitation_group_id
  from public.activities a
  where a.status = 'published'
    and a.invitation_send_at is not null
    and a.invitation_send_at <= now()
    and a.ends_at > now()
    and a.invitation_audience_kind is not null
    and a.invitation_materialized_at is null
    and a.team_id is not null
  order by a.invitation_send_at
  for update skip locked
  limit greatest(1, least(batch_size, 500));

  with audience_people as (
    select distinct da.id as activity_id, da.organization_id, m.person_id
    from due_invitation_activities da
    join public.memberships m on m.team_id = da.team_id and m.organization_id = da.organization_id
    where da.invitation_audience_kind = 'players'
      and m.role = 'participant'
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    union
    select distinct da.id, da.organization_id, m.person_id
    from due_invitation_activities da
    join public.memberships m on m.team_id = da.team_id and m.organization_id = da.organization_id
    where da.invitation_audience_kind = 'leaders'
      and m.role = 'leader'
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    union
    select distinct da.id, da.organization_id, gm.person_id
    from due_invitation_activities da
    join public.team_group_members gm on gm.group_id = da.invitation_group_id and gm.organization_id = da.organization_id
    join public.memberships m on m.team_id = da.team_id
      and m.organization_id = da.organization_id
      and m.person_id = gm.person_id
      and m.role in ('participant', 'leader')
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    where da.invitation_audience_kind = 'group'
  ),
  inserted as (
    insert into public.invitations (organization_id, activity_id, person_id)
    select ap.organization_id, ap.activity_id, ap.person_id
    from audience_people ap
    on conflict (activity_id, person_id) do nothing
    returning id
  )
  select count(*) into inserted_count from inserted;

  update public.activities a
  set invitation_materialized_at = now()
  from due_invitation_activities da
  where a.id = da.id;

  return inserted_count;
end;
$$;

create index notification_outbox_terminal_created_idx
  on public.notification_outbox(created_at, id)
  where status in ('sent', 'failed', 'cancelled');

-- Retain delivery details for 90 days after both the attempt and activity end.
-- Pending, processing and retryable failures are never deleted.
create or replace function public.prune_notification_outbox(batch_size integer default 1000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  with eligible as (
    select o.id
    from public.notification_outbox o
    left join public.activities a on a.id::text = o.payload->>'activityId'
    where (o.status in ('sent', 'cancelled') or (o.status = 'failed' and o.attempts >= 5))
      and o.created_at < now() - interval '90 days'
      and (a.id is null or a.ends_at < now() - interval '90 days')
    order by o.created_at, o.id
    for update of o skip locked
    limit greatest(1, least(batch_size, 5000))
  )
  delete from public.notification_outbox o
  using eligible e
  where o.id = e.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_notification_outbox(integer) from public, anon, authenticated;
grant execute on function public.prune_notification_outbox(integer) to service_role;

select cron.schedule(
  'forena-notification-outbox-prune',
  '* * * * *',
  $$select public.prune_notification_outbox(1000)$$
);

create or replace function public.queue_due_activity_invitations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
begin
  perform public.materialize_due_activity_invitations(batch_size);

  with ready_activities as (
    select a.*
    from public.activities a
    where a.status = 'published'
      and a.invitation_materialized_at is not null
      and a.invitation_send_at <= now()
      and a.ends_at > now()
      and a.team_id is not null
      and exists (
        select 1 from public.invitations i
        where i.activity_id = a.id
      )
    order by a.invitation_send_at
    limit greatest(1, least(batch_size, 500))
  ),
  invited_people as (
    select distinct a.organization_id, a.id as activity_id, a.team_id, a.title, a.starts_at, a.location, i.person_id
    from ready_activities a join public.invitations i on i.activity_id = a.id
  ),
  recipients as (
    select distinct ip.organization_id, ip.activity_id, ip.team_id, ip.title, ip.starts_at, ip.location, p.user_id
    from invited_people ip
    join public.people p on p.id = ip.person_id
    join public.organization_members om on om.organization_id = ip.organization_id and om.user_id = p.user_id
    where p.user_id is not null
    union
    select distinct ip.organization_id, ip.activity_id, ip.team_id, ip.title, ip.starts_at, ip.location, pg.guardian_user_id
    from invited_people ip
    join public.person_guardians pg on pg.person_id = ip.person_id
    join public.organization_members om on om.organization_id = ip.organization_id and om.user_id = pg.guardian_user_id
  ),
  inserted as (
    insert into public.notification_outbox (organization_id, user_id, type, payload, scheduled_at, status)
    select r.organization_id, r.user_id, 'activity_invitation',
      jsonb_build_object('activityId', r.activity_id, 'teamId', r.team_id, 'title', r.title, 'startsAt', r.starts_at, 'location', r.location),
      now(), 'pending'
    from recipients r
    where not exists (
      select 1 from public.notification_outbox existing
      where existing.user_id = r.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = r.activity_id::text
        and existing.status <> 'cancelled'
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;
