create or replace function public.queue_due_activity_reminders(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
begin
  create temporary table if not exists due_reminders (
    id uuid primary key,
    organization_id uuid,
    activity_id uuid,
    send_at timestamptz
  ) on commit drop;

  truncate due_reminders;

  insert into due_reminders (id, organization_id, activity_id, send_at)
  select rs.id, rs.organization_id, rs.activity_id, rs.send_at
  from public.activity_reminder_schedules rs
  where rs.materialized_at is null
    and rs.send_at <= now()
  order by rs.send_at
  for update skip locked
  limit greatest(1, least(batch_size, 500));

  with pending_people as (
    select d.id as schedule_id, d.organization_id, d.activity_id, i.person_id
    from due_reminders d
    join public.invitations i on i.activity_id = d.activity_id
    where i.response = 'pending'
  ),
  recipients as (
    select distinct pp.schedule_id, pp.organization_id, pp.activity_id, p.user_id
    from pending_people pp
    join public.people p on p.id = pp.person_id
    where p.user_id is not null
    union
    select distinct pp.schedule_id, pp.organization_id, pp.activity_id, pg.guardian_user_id
    from pending_people pp
    join public.person_guardians pg on pg.person_id = pp.person_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      r.organization_id,
      r.user_id,
      'invitation_reminder',
      jsonb_build_object(
        'activityId', r.activity_id,
        'teamId', a.team_id,
        'title', a.title,
        'startsAt', a.starts_at,
        'location', a.location,
        'reminderScheduleId', r.schedule_id
      ),
      now(),
      'pending'
    from recipients r
    join public.activities a on a.id = r.activity_id
    where not exists (
      select 1
      from public.notification_outbox n
      where n.user_id = r.user_id
        and n.type = 'invitation_reminder'
        and n.payload ->> 'reminderScheduleId' = r.schedule_id::text
        and n.status <> 'cancelled'
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  update public.activity_reminder_schedules rs
  set materialized_at = now()
  where rs.id in (select id from due_reminders);

  insert into public.activity_events (
    organization_id, activity_id, event_type, recipient_count, metadata
  )
  select
    d.organization_id,
    d.activity_id,
    'reminder_sent',
    (
      select count(*)
      from public.invitations i
      where i.activity_id = d.activity_id
        and i.response = 'pending'
    ),
    jsonb_build_object(
      'reminderScheduleId', d.id,
      'scheduledAt', d.send_at
    )
  from due_reminders d;

  return queued_count;
end;
$$;

revoke all on function public.queue_due_activity_reminders(integer) from public, anon, authenticated;
grant execute on function public.queue_due_activity_reminders(integer) to service_role;
