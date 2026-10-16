-- Preserve the decision's person scope before transport snapshots are created.
-- Group by user only after retaining the person IDs, so each recipient's payload
-- contains their own selected people, never unrelated families in the selection.


create or replace function public.queue_activity_invitation(target_activity_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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
  if not public.has_team_permission(target_activity.team_id, 'invitation.manage') then
    raise exception 'Not allowed';
  end if;

  if target_activity.invitation_send_at>now() then
    raise exception 'Use the activity invitation schedule for future invitations' using errcode='22023';
  end if;

  with invited_people as (
    select distinct invitation.person_id
    from public.invitations invitation
    where invitation.activity_id = target_activity_id
  ),
  recipients as (
    select distinct person.user_id, invited.person_id
    from invited_people invited
    join public.people person on person.id = invited.person_id
    where person.user_id is not null
    union
    select distinct guardian.guardian_user_id, invited.person_id
    from invited_people invited
    join public.person_guardians guardian on guardian.person_id = invited.person_id
  ),
  recipient_people as (
    select user_id, jsonb_agg(person_id order by person_id) as person_ids
    from recipients
    group by user_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      target_activity.organization_id,
      recipient.user_id,
      'activity_invitation',
      jsonb_build_object(
        'activityId', target_activity.id,
        'personIds', recipient.person_ids,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at,
        'location', target_activity.location
      ),
      now(),
      'pending'
    from recipient_people recipient
    where not exists (
      select 1
      from public.notification_outbox existing
      where existing.user_id = recipient.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = target_activity.id::text
        and existing.status <> 'cancelled'
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$function$;

create or replace function public.queue_activity_invitation(
  target_activity_id uuid,
  target_person_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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
  if not public.has_team_permission(target_activity.team_id, 'invitation.manage') then
    raise exception 'Not allowed';
  end if;

  if target_activity.invitation_send_at>now() then
    raise exception 'Use the activity invitation schedule for future invitations' using errcode='22023';
  end if;

  with invited_people as (
    select distinct invitation.person_id
    from public.invitations invitation
    where invitation.activity_id = target_activity_id
      and invitation.person_id = any(target_person_ids)
  ),
  recipients as (
    select distinct person.user_id, invited.person_id
    from invited_people invited
    join public.people person on person.id = invited.person_id
    where person.user_id is not null
    union
    select distinct guardian.guardian_user_id, invited.person_id
    from invited_people invited
    join public.person_guardians guardian on guardian.person_id = invited.person_id
  ),
  recipient_people as (
    select user_id, jsonb_agg(person_id order by person_id) as person_ids
    from recipients
    group by user_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      target_activity.organization_id,
      recipient.user_id,
      'activity_invitation',
      jsonb_build_object(
        'activityId', target_activity.id,
        'personIds', recipient.person_ids,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at,
        'location', target_activity.location
      ),
      now(),
      'pending'
    from recipient_people recipient
    where not exists (
      select 1
      from public.notification_outbox existing
      where existing.user_id = recipient.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = target_activity.id::text
        and existing.status <> 'cancelled'
        and not (existing.status = 'failed' and existing.attempts >= 5)
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$function$;

create or replace function public.queue_activity_reminder(target_activity_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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
  if not public.has_team_permission(target_activity.team_id, 'invitation.manage') then
    raise exception 'Not allowed';
  end if;

  with pending_people as (
    select distinct invitation.person_id
    from public.invitations invitation
    where invitation.activity_id = target_activity_id
      and invitation.response = 'pending'
  ),
  recipients as (
    select distinct person.user_id, pending.person_id
    from pending_people pending
    join public.people person on person.id = pending.person_id
    where person.user_id is not null
    union
    select distinct guardian.guardian_user_id, pending.person_id
    from pending_people pending
    join public.person_guardians guardian on guardian.person_id = pending.person_id
  ),
  recipient_people as (
    select user_id, jsonb_agg(person_id order by person_id) as person_ids
    from recipients
    group by user_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      target_activity.organization_id,
      recipient.user_id,
      'invitation_reminder',
      jsonb_build_object(
        'activityId', target_activity.id,
        'personIds', recipient.person_ids,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at
      ),
      now(),
      'pending'
    from recipient_people recipient
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
        select count(*)
        from public.invitations
        where activity_id = target_activity.id
          and response = 'pending'
      )
    ),
    auth.uid()
  );

  return queued_count;
end;
$function$;

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
      and a.invitation_notifications_queued_at is null
      and a.invitation_send_at <= now()
      and a.ends_at > now()
      and a.team_id is not null
      and exists (
        select 1 from public.invitations i
        where i.activity_id = a.id
      )
    order by a.invitation_send_at
    for update of a skip locked
    limit greatest(1, least(batch_size, 500))
  ),
  invited_people as (
    select distinct a.organization_id, a.id as activity_id, a.team_id, a.title, a.starts_at, a.location, i.person_id
    from ready_activities a join public.invitations i on i.activity_id = a.id
  ),
  recipients as (
    select distinct ip.organization_id, ip.activity_id, ip.team_id, ip.title, ip.starts_at, ip.location, p.user_id, ip.person_id
    from invited_people ip
    join public.people p on p.id = ip.person_id
    join public.organization_members om on om.organization_id = ip.organization_id and om.user_id = p.user_id
    where p.user_id is not null
    union
    select distinct ip.organization_id, ip.activity_id, ip.team_id, ip.title, ip.starts_at, ip.location, pg.guardian_user_id, ip.person_id
    from invited_people ip
    join public.person_guardians pg on pg.person_id = ip.person_id
    join public.organization_members om on om.organization_id = ip.organization_id and om.user_id = pg.guardian_user_id
  ),
  recipient_people as (
    select organization_id, activity_id, team_id, title, starts_at, location, user_id, jsonb_agg(person_id order by person_id) as person_ids
    from recipients
    group by organization_id, activity_id, team_id, title, starts_at, location, user_id
  ),
  inserted as (
    insert into public.notification_outbox (organization_id, user_id, type, payload, scheduled_at, status)
    select r.organization_id, r.user_id, 'activity_invitation',
      jsonb_build_object('activityId', r.activity_id, 'personIds', r.person_ids, 'teamId', r.team_id, 'title', r.title, 'startsAt', r.starts_at, 'location', r.location),
      now(), 'pending'
    from recipient_people r
    where not exists (
      select 1 from public.notification_outbox existing
      where existing.user_id = r.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = r.activity_id::text
        and existing.status <> 'cancelled'
    )
    returning id
  )
  , marked as (
    update public.activities a set invitation_notifications_queued_at=now()
    where a.id in (select id from ready_activities) returning id
  )
  select (select count(*) from inserted) + 0*(select count(*) from marked) into queued_count;

  return queued_count;
end;
$$;

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
  join public.activities a on a.id=rs.activity_id
  where rs.materialized_at is null
    and rs.send_at <= now()
    and a.status='published' and a.starts_at>now()
    and (a.response_due_at is null or a.response_due_at>now())
  order by rs.send_at
  for update of rs skip locked
  limit greatest(1, least(batch_size, 500));

  with pending_people as (
    select d.id as schedule_id, d.organization_id, d.activity_id, i.person_id
    from due_reminders d
    join public.invitations i on i.activity_id = d.activity_id
    where i.response = 'pending'
  ),
  recipients as (
    select distinct pp.schedule_id, pp.organization_id, pp.activity_id, p.user_id, pp.person_id
    from pending_people pp
    join public.people p on p.id = pp.person_id
    where p.user_id is not null
    union
    select distinct pp.schedule_id, pp.organization_id, pp.activity_id, pg.guardian_user_id, pp.person_id
    from pending_people pp
    join public.person_guardians pg on pg.person_id = pp.person_id
  ),
  recipient_people as (
    select schedule_id, organization_id, activity_id, user_id, jsonb_agg(person_id order by person_id) as person_ids
    from recipients
    group by schedule_id, organization_id, activity_id, user_id
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
        'personIds', r.person_ids,
        'teamId', a.team_id,
        'title', a.title,
        'startsAt', a.starts_at,
        'location', a.location,
        'reminderScheduleId', r.schedule_id
      ),
      now(),
      'pending'
    from recipient_people r
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

create or replace function messaging.snapshot_telegram_invitations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.type not in ('activity_invitation','invitation_reminder') then return new; end if;
 insert into messaging.telegram_invitations(outbox_id,invitation_id,user_id,message,expires_at,activity_generation)
 select new.id,i.id,new.user_id,jsonb_build_object(
  'person',p.display_name,'team',org.name||' · '||t.name,'activity',a.title,
  'when',to_char(a.starts_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),
  'location',coalesce(nullif(a.location,''),'Se Förena'),
  'gathering',coalesce(to_char(a.gathering_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),'Se Förena'),
  'due',coalesce(to_char(a.response_due_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),'Före aktivitetens slut'),
  'url','/activities/'||a.id::text
 ),least(coalesce(a.response_due_at,a.ends_at),a.ends_at),a.discipline_generation
 from public.invitations i
 join public.activities a on a.id=i.activity_id and a.organization_id=new.organization_id
 join public.people p on p.id=i.person_id and p.organization_id=a.organization_id
 join public.teams t on t.id=a.team_id
 join public.organizations org on org.id=a.organization_id
 where a.id::text=new.payload->>'activityId'
  and coalesce(new.payload->'personIds','[]'::jsonb) @> jsonb_build_array(i.person_id)
  and exists(select 1 from messaging.telegram_connections c where c.user_id=new.user_id)
  and (p.user_id=new.user_id or exists(select 1 from public.person_guardians g where g.person_id=p.id and g.guardian_user_id=new.user_id))
  and (new.type<>'invitation_reminder' or i.response='pending');
 return new;
end $$;

create or replace function messaging.snapshot_whatsapp_invitations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.type not in ('activity_invitation','invitation_reminder') then return new; end if;
 insert into messaging.whatsapp_invitations(outbox_id,invitation_id,user_id,message,expires_at,activity_generation)
 select new.id,i.id,new.user_id,jsonb_build_object(
  'person',p.display_name,'team',org.name||' · '||t.name,'activity',a.title,
  'when',to_char(a.starts_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),
  'location',coalesce(nullif(a.location,''),'Se Förena'),
  'gathering',coalesce(to_char(a.gathering_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),'Se Förena'),
  'due',coalesce(to_char(a.response_due_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),'Före aktivitetens slut'),
  'url','/activities/'||a.id::text
 ),least(coalesce(a.response_due_at,a.ends_at),a.ends_at),a.discipline_generation
 from public.invitations i
 join public.activities a on a.id=i.activity_id and a.organization_id=new.organization_id
 join public.people p on p.id=i.person_id and p.organization_id=a.organization_id
 join public.teams t on t.id=a.team_id
 join public.organizations org on org.id=a.organization_id
 where a.id::text=new.payload->>'activityId'
  and (not (new.payload ? 'personIds') or coalesce(new.payload->'personIds','[]'::jsonb) @> jsonb_build_array(i.person_id))
  and exists(select 1 from messaging.whatsapp_connections c where c.user_id=new.user_id)
  and (p.user_id=new.user_id or exists(select 1 from public.person_guardians g where g.person_id=p.id and g.guardian_user_id=new.user_id))
  and (new.type<>'invitation_reminder' or i.response='pending');
 return new;
end $$;
