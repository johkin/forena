create table if not exists public.activity_reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_id uuid not null,
  send_at timestamptz not null,
  materialized_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (activity_id, organization_id) references public.activities(id, organization_id) on delete cascade,
  unique (activity_id, send_at)
);

create index if not exists activity_reminder_schedules_due_idx on public.activity_reminder_schedules(send_at) where materialized_at is null;
alter table public.activity_reminder_schedules enable row level security;
create policy "team members can read reminder schedules" on public.activity_reminder_schedules for select to authenticated using (public.is_organization_member(organization_id));
create policy "team leaders can manage reminder schedules" on public.activity_reminder_schedules for all to authenticated
using (exists (select 1 from public.activities a where a.id=activity_id and a.team_id is not null and public.can_manage_team(a.team_id)))
with check (exists (select 1 from public.activities a where a.id=activity_id and a.team_id is not null and public.can_manage_team(a.team_id)));
grant select,insert,update,delete on public.activity_reminder_schedules to authenticated;
insert into public.activity_reminder_schedules (organization_id,activity_id,send_at,created_by)
select organization_id,id,reminder_send_at,created_by from public.activities where reminder_send_at is not null on conflict (activity_id,send_at) do nothing;

create or replace function public.queue_due_activity_reminders(batch_size integer default 100) returns integer language plpgsql security definer set search_path=public as $$
declare queued_count integer:=0;
begin
  create temporary table if not exists due_reminders(id uuid primary key,organization_id uuid,activity_id uuid,send_at timestamptz) on commit drop;
  truncate due_reminders;
  insert into due_reminders select id,organization_id,activity_id,send_at from public.activity_reminder_schedules where materialized_at is null and send_at<=now() order by send_at for update skip locked limit greatest(1,least(batch_size,500));
  with pending_people as (
    select d.id schedule_id,d.organization_id,d.activity_id,i.person_id from due_reminders d join public.invitations i on i.activity_id=d.activity_id where i.response='pending'
  ), recipients as (
    select distinct pp.schedule_id,pp.organization_id,pp.activity_id,p.user_id from pending_people pp join public.people p on p.id=pp.person_id where p.user_id is not null
    union select distinct pp.schedule_id,pp.organization_id,pp.activity_id,pg.guardian_user_id from pending_people pp join public.person_guardians pg on pg.person_id=pp.person_id
  ), inserted as (
    insert into public.notification_outbox(organization_id,user_id,type,payload,scheduled_at,status)
    select r.organization_id,r.user_id,'invitation_reminder',jsonb_build_object('activityId',r.activity_id,'teamId',a.team_id,'title',a.title,'startsAt',a.starts_at,'location',a.location,'reminderScheduleId',r.schedule_id),now(),'pending'
    from recipients r join public.activities a on a.id=r.activity_id
    where not exists(select 1 from public.notification_outbox n where n.user_id=r.user_id and n.type='invitation_reminder' and n.payload->>'reminderScheduleId'=r.schedule_id::text and n.status<>'cancelled')
    returning id
  ) select count(*) into queued_count from inserted;
  update public.activity_reminder_schedules rs set materialized_at=now() where rs.id in(select id from due_reminders);
  insert into public.activity_events(organization_id,activity_id,event_type,recipient_count,metadata)
  select d.organization_id,d.activity_id,'reminder_sent',(select count(*) from public.invitations i where i.activity_id=d.activity_id and i.response='pending'),jsonb_build_object('reminderScheduleId',d.id,'scheduledAt',d.send_at) from due_reminders d;
  return queued_count;
end; $$;
revoke all on function public.queue_due_activity_reminders(integer) from public,anon,authenticated;
grant execute on function public.queue_due_activity_reminders(integer) to service_role;