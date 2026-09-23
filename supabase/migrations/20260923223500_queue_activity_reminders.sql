create or replace function public.queue_activity_reminder(target_activity_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_activity public.activities%rowtype;
  queued_count integer := 0;
begin
  select * into target_activity
  from public.activities
  where id = target_activity_id;

  if target_activity.id is null or target_activity.team_id is null then
    raise exception 'Activity not found';
  end if;

  if not public.can_manage_team(target_activity.team_id) then
    raise exception 'Not allowed';
  end if;

  with pending_people as (
    select distinct i.person_id
    from public.invitations i
    where i.activity_id = target_activity_id
      and i.response = 'pending'
  ),
  recipients as (
    select distinct p.user_id as user_id
    from pending_people pp
    join public.people p on p.id = pp.person_id
    where p.user_id is not null
    union
    select distinct pg.guardian_user_id
    from pending_people pp
    join public.person_guardians pg on pg.person_id = pp.person_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id,
      user_id,
      type,
      payload,
      scheduled_at,
      status
    )
    select
      target_activity.organization_id,
      recipients.user_id,
      'invitation_reminder',
      jsonb_build_object(
        'activityId', target_activity.id,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at
      ),
      now(),
      'pending'
    from recipients
    returning id
  )
  select count(*) into queued_count from inserted;

  insert into public.activity_events (
    organization_id,
    activity_id,
    event_type,
    recipient_count,
    metadata,
    created_by
  )
  values (
    target_activity.organization_id,
    target_activity.id,
    'reminder_scheduled',
    queued_count,
    jsonb_build_object(
      'queuedAt', now(),
      'pendingInvitations', (
        select count(*) from public.invitations
        where activity_id = target_activity.id and response = 'pending'
      )
    ),
    auth.uid()
  );

  return queued_count;
end;
$$;

grant execute on function public.queue_activity_reminder(uuid) to authenticated;
