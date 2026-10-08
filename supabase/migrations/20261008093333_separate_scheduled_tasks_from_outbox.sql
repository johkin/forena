-- Durable scheduling belongs to application work, not to outgoing messages.
create table private.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  task_key text not null unique,
  kind text not null check (kind in ('activity_invitations','activity_reminders','discipline_notifications')),
  run_at timestamptz not null,
  repeat_seconds integer check (repeat_seconds between 60 and 86400),
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  attempts integer not null default 0,
  last_error text,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.scheduled_tasks enable row level security;
revoke all on private.scheduled_tasks from public,anon,authenticated;
create index scheduled_tasks_due_idx on private.scheduled_tasks(run_at,id) where status='pending';

-- Internal API: no SQL, URLs, recipient lists or executable code supplied by callers.
create function public.schedule_task(task_key text, task_kind text, scheduled_for timestamptz,
  recurrence_seconds integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare task_id uuid;
begin
  if task_key is null or length(btrim(task_key)) not between 1 and 120 or scheduled_for is null
    or task_kind is null or task_kind not in ('activity_invitations','activity_reminders','discipline_notifications')
    or (recurrence_seconds is not null and recurrence_seconds not between 60 and 86400) then
    raise exception 'Invalid scheduled task' using errcode='22023';
  end if;
  insert into private.scheduled_tasks(task_key,kind,run_at,repeat_seconds)
  values(task_key,task_kind,scheduled_for,recurrence_seconds)
  on conflict on constraint scheduled_tasks_task_key_key do nothing returning id into task_id;
  if task_id is null then
    select t.id into task_id from private.scheduled_tasks t where t.task_key=schedule_task.task_key;
  end if;
  return task_id;
end $$;
revoke all on function public.schedule_task(text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.schedule_task(text,text,timestamptz,integer) to service_role;

create function public.run_due_scheduled_tasks(profiles jsonb, batch_size integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task record; queued integer; completed integer:=0; failed integer:=0; messages integer:=0;
begin
  -- Row locks are held until evaluation AND enqueue commit. A crashed RPC rolls
  -- both back; concurrent workers skip the locked tasks. Each handler is isolated
  -- in a subtransaction so one failure cannot prevent the other kinds from running.
  for task in select * from private.scheduled_tasks t
    where t.status='pending' and t.run_at<=now()
    order by t.run_at,t.id for update skip locked limit greatest(1,least(batch_size,100))
  loop
    begin
      case task.kind
        when 'activity_invitations' then queued:=public.queue_due_activity_invitations(100);
        when 'activity_reminders' then queued:=public.queue_due_activity_reminders(100);
        when 'discipline_notifications' then queued:=public.queue_due_capability_notifications(profiles,100);
        else raise exception 'Unsupported scheduled task';
      end case;
      update private.scheduled_tasks set status=case when task.repeat_seconds is null then 'completed' else 'pending' end,
        run_at=case when task.repeat_seconds is null then run_at else task.run_at+(floor(extract(epoch from (now()-task.run_at))/task.repeat_seconds)+1)
          *make_interval(secs=>task.repeat_seconds) end,
        last_run_at=now(),attempts=0,last_error=null where id=task.id;
      completed:=completed+1; messages:=messages+queued;
    exception when others then
      -- Save only SQLSTATE, never potentially sensitive exception messages.
      update private.scheduled_tasks set attempts=attempts+1,last_error=sqlstate,last_run_at=now(),
        status=case when attempts+1>=5 then 'failed' else 'pending' end,
        run_at=now()+make_interval(secs=>least(3600,60*(2^task.attempts)::integer)) where id=task.id;
      failed:=failed+1;
    end;
  end loop;
  return jsonb_build_object('completed',completed,'failed',failed,'queuedNotifications',messages);
end $$;
revoke all on function public.run_due_scheduled_tasks(jsonb,integer) from public,anon,authenticated;
grant execute on function public.run_due_scheduled_tasks(jsonb,integer) to service_role;

select public.schedule_task('evaluate-activity-invitations','activity_invitations',now(),60);
select public.schedule_task('evaluate-activity-reminders','activity_reminders',now(),60);
select public.schedule_task('evaluate-discipline-notifications','discipline_notifications',now(),60);

select cron.schedule('forena-scheduled-task-worker','* * * * *',$cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='forena_project_url' limit 1)
      || '/functions/v1/scheduled-task-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-forena-cron-token',
      (select decrypted_secret from vault.decrypted_secrets where name='forena_notification_worker_token' limit 1)),
    body := jsonb_build_object('scheduledAt',now())
  );
$cron$);

-- A checkpoint records the decision to enqueue, regardless of delivery outcome.
-- No rule or authorization re-evaluation during delivery or transport retries.
-- Temporary compatibility for the preceding worker during rolling deployment.
-- This reads the frozen row only; it cannot evaluate or cancel domain work.
create or replace function public.prepare_capability_notification(target_outbox_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select payload from public.notification_outbox where id=target_outbox_id
    and status in ('pending','processing','failed');
$$;
revoke all on function public.prepare_capability_notification(uuid) from public,anon,authenticated;
grant execute on function public.prepare_capability_notification(uuid) to service_role;
drop trigger retain_delivered_capability_checkpoint on public.notification_outbox;
drop function private.retain_delivered_capability_checkpoint();
alter table private.capability_notification_checks drop column delivered_at;

-- Duty messages are already decided by the originating transaction. Keep them
-- as event snapshots rather than withdrawing them based on later domain changes.
create or replace function private.notify_duty_request() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.status=old.status then return new; end if;
  perform private.queue_duty_update(new.activity_id,array[new.person_id,new.target_person_id],new.id::text||':'||new.status,new.status);
  return new;
end $$;

-- Evaluate reminder eligibility before enqueue.
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
    select distinct person.user_id
    from invited_people invited
    join public.people person on person.id = invited.person_id
    where person.user_id is not null
    union
    select distinct guardian.guardian_user_id
    from invited_people invited
    join public.person_guardians guardian on guardian.person_id = invited.person_id
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
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at,
        'location', target_activity.location
      ),
      now(),
      'pending'
    from recipients recipient
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


-- Upgrade old delayed invitation rows into domain schedules before removing them.
update public.activities a set invitation_materialized_at=coalesce(a.invitation_materialized_at,now())
where exists(select 1 from public.notification_outbox n where n.type='activity_invitation'
  and n.status='pending' and n.scheduled_at>now() and n.payload->>'activityId'=a.id::text);
delete from public.notification_outbox where type='activity_invitation' and status='pending' and scheduled_at>now();

-- Render at enqueue time. The transport consumes a generic message and knows
-- neither activity types nor discipline templates.
alter table public.notification_outbox add column message jsonb;
create function private.render_outgoing_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare title text:=coalesce(nullif(new.payload->>'title',''),'Aktivitet'); subject text; body text;
  when_text text:=''; location_text text:=''; zone text; accepted integer; target integer; pending integer;
begin
  if tg_op='INSERT' and new.scheduled_at>now() then
    raise exception 'Schedule application work instead of future outgoing messages' using errcode='22023';
  end if;
  if new.message is not null then
    if jsonb_typeof(new.message)<>'object' or nullif(new.message->>'subject','') is null
      or nullif(new.message->>'text','') is null or new.message->>'url' is null then
      raise exception 'Invalid outgoing message' using errcode='22023';
    end if;
    return new;
  end if;
  if new.type='team_size_shortage' then
    accepted:=coalesce((new.payload->>'acceptedPlayers')::integer,0);
    target:=coalesce((new.payload->>'targetTeamSize')::integer,0);
    pending:=coalesce((new.payload->>'pendingPlayers')::integer,0);
    subject:='Matchtruppen behöver fler spelare: '||title;
    body:=format('%s av önskade %s spelare har tackat ja. Det saknas %s spelare. ',accepted,target,greatest(0,target-accepted));
    if pending>0 and not coalesce((new.payload->>'responseDeadlinePassed')::boolean,false) then
      body:=body||format('%s spelare har inte svarat. Öppna matchen i Förena för att påminna dem eller kalla fler spelare.',pending);
    else body:=body||'Öppna matchen i Förena för att kalla fler spelare.'; end if;
  elsif new.type='duty_update' then
    subject:='Bemanning: '||title;
    body:=case new.payload->>'reason'
      when 'pending' then 'Det finns ett nytt ändringsförslag i bemanningsschemat. Öppna aktiviteten i Förena för att se förslaget och eventuellt godkänna det.'
      when 'applied' then 'Ett ändringsförslag har genomförts i bemanningsschemat. Kontrollera din aktuella tilldelning i Förena.'
      when 'rejected' then 'Ett ändringsförslag har avböjts. Den tidigare tilldelningen gäller fortfarande.'
      when 'withdrawn' then 'Ett ändringsförslag har återtagits. Den tidigare tilldelningen gäller fortfarande.'
      when 'expired' then 'Ett ändringsförslag har blivit inaktuellt eller gått ut. Kontrollera den aktuella tilldelningen i Förena.'
      when 'assigned' then 'Tilldelningen av arbetsuppgifter har ändrats. Öppna aktiviteten i Förena för att se ditt aktuella pass och instruktioner.'
      when 'edited' then 'Tider, instruktioner eller antal platser i bemanningsschemat har ändrats. Kontrollera din uppgift i Förena.'
      when 'cancelled' then 'En arbetsuppgift har tagits bort ur schemat och dess tilldelningar har frigjorts. Kontrollera dina återstående uppgifter i Förena.'
      else 'Bemanningsschemat har uppdaterats. Öppna aktiviteten i Förena för aktuella uppgifter.' end;
  else
    select time_zone into zone from public.organizations where id=new.organization_id;
    if nullif(new.payload->>'startsAt','') is not null then
      when_text:=' '||to_char((new.payload->>'startsAt')::timestamptz at time zone coalesce(zone,'Europe/Stockholm'),'YYYY-MM-DD HH24:MI');
    end if;
    if nullif(new.payload->>'location','') is not null then location_text:=' på '||(new.payload->>'location'); end if;
    if new.type='invitation_reminder' then
      subject:='Påminnelse: svara på kallelsen till '||title;
      body:='Du har en obesvarad kallelse till '||title||when_text||location_text||'. Logga in i Förena för att svara.';
    else
      subject:='Kallelse: '||title;
      body:='Du är kallad till '||title||when_text||location_text||'. Logga in i Förena för att svara.';
    end if;
  end if;
  new.message:=jsonb_build_object('subject',subject,'text',body,
    'url',case when new.payload->>'activityId' is null then '/' else '/activities/'||(new.payload->>'activityId') end,
    'tag',case when new.type='duty_update' then new.id::text else new.type||':'||coalesce(new.payload->>'activityId','general') end);
  return new;
end $$;
revoke all on function private.render_outgoing_notification() from public,anon,authenticated;
create trigger render_outgoing_notification before insert or update of message on public.notification_outbox
for each row execute function private.render_outgoing_notification();
update public.notification_outbox set message=null where message is null;
alter table public.notification_outbox alter column message set not null;

-- Durable invitation evaluation checkpoint prevents old batches starving newer schedules.
alter table public.activities add column invitation_notifications_queued_at timestamptz;
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
  , marked as (
    update public.activities a set invitation_notifications_queued_at=now()
    where a.id in (select id from ready_activities) returning id
  )
  select (select count(*) from inserted) + 0*(select count(*) from marked) into queued_count;

  return queued_count;
end;
$$;
