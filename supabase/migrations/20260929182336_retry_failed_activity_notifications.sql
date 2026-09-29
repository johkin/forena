alter table public.activity_events drop constraint activity_events_event_type_check;
alter table public.activity_events add constraint activity_events_event_type_check check (event_type in (
  'invitation_scheduled', 'invitation_queued', 'invitation_sent', 'invitation_delivery_failed',
  'reminder_scheduled', 'reminder_sent', 'invitation_response_changed',
  'activity_updated', 'activity_cancelled'
));

-- Explicit sends only queue recipients of the selected people. A previous exhausted
-- delivery remains in the outbox as history, but no longer blocks a new attempt.
create function public.queue_activity_invitation(target_activity_id uuid, target_person_ids uuid[])
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
      and i.person_id = any(target_person_ids)
  ),
  recipients as (
    select distinct p.user_id
    from invited_people ip join public.people p on p.id = ip.person_id
    where p.user_id is not null
    union
    select distinct pg.guardian_user_id
    from invited_people ip join public.person_guardians pg on pg.person_id = ip.person_id
  ),
  inserted as (
    insert into public.notification_outbox (organization_id, user_id, type, payload, scheduled_at, status)
    select target_activity.organization_id, r.user_id, 'activity_invitation',
      jsonb_build_object('activityId', target_activity.id, 'teamId', target_activity.team_id,
        'title', target_activity.title, 'startsAt', target_activity.starts_at,
        'location', target_activity.location),
      now(), 'pending'
    from recipients r
    where not exists (
      select 1 from public.notification_outbox existing
      where existing.user_id = r.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = target_activity.id::text
        and existing.status not in ('cancelled')
        and not (existing.status = 'failed' and existing.attempts >= 5)
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;

revoke all on function public.queue_activity_invitation(uuid, uuid[]) from public, anon;
grant execute on function public.queue_activity_invitation(uuid, uuid[]) to authenticated;

insert into public.activity_events (organization_id, activity_id, event_type, recipient_count, metadata)
select o.organization_id, a.id, 'invitation_delivery_failed', 1,
  jsonb_build_object('outboxId', o.id, 'type', o.type, 'attempts', o.attempts, 'reason', o.last_error)
from public.notification_outbox o
join public.activities a on a.id::text = o.payload->>'activityId'
where o.status = 'failed' and o.attempts >= 5
  and o.type in ('activity_invitation', 'invitation_reminder');
