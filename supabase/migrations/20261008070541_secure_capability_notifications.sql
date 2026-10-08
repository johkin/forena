-- Reading the Data API must enforce the same current team eligibility as
-- delivery; ownership of an old notification alone is insufficient.
create function private.can_read_team_size_notification(target_organization_id uuid,target_activity_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.activities a join public.organizations org on org.id=a.organization_id
  where a.id::text=target_activity_id and a.organization_id=target_organization_id
   and private.has_team_permission(a.team_id,'invitation.manage',auth.uid())
   and exists(select 1 from public.team_access_assignments ta
    join public.people p on p.id=ta.person_id and p.organization_id=ta.organization_id
    where ta.team_id=a.team_id and ta.organization_id=a.organization_id and p.user_id=auth.uid()
     and ta.starts_on<=(now() at time zone org.time_zone)::date
     and (ta.ends_on is null or ta.ends_on>=(now() at time zone org.time_zone)::date))
 );
$$;
revoke all on function private.can_read_team_size_notification(uuid,text) from public,anon;
grant execute on function private.can_read_team_size_notification(uuid,text) to authenticated;

drop policy "users can read their notifications" on public.notification_outbox;
create policy "users can read their notifications" on public.notification_outbox for select to authenticated using (
 user_id=(select auth.uid()) and (type<>'team_size_shortage' or private.can_read_team_size_notification(organization_id,payload->>'activityId'))
);

-- Preserve a delivered checkpoint even when its outbox rows are later pruned.
alter table private.capability_notification_checks add column delivered_at timestamptz;
update private.capability_notification_checks c set delivered_at=coalesce(n.sent_at,n.created_at)
from public.notification_outbox n where n.type='team_size_shortage' and n.status='sent'
 and c.activity_id::text=n.payload->>'activityId' and c.capability_id=n.payload->>'capabilityId'
 and c.before_start_hours::text=n.payload->>'beforeStartHours';

create function private.retain_delivered_capability_checkpoint() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.capability_notification_checks c set delivered_at=coalesce(c.delivered_at,new.sent_at,now())
 where c.activity_id::text=new.payload->>'activityId' and c.capability_id=new.payload->>'capabilityId'
  and c.before_start_hours::text=new.payload->>'beforeStartHours';
 return new;
end $$;
revoke all on function private.retain_delivered_capability_checkpoint() from public,anon,authenticated;
create trigger retain_delivered_capability_checkpoint after update of status on public.notification_outbox
for each row when (new.type='team_size_shortage' and new.status='sent' and old.status is distinct from 'sent')
execute function private.retain_delivered_capability_checkpoint();

create or replace function public.prepare_capability_notification(target_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; current_payload jsonb; current_state record; cancellation_reason text:='capability_ineligible';
begin
  select * into n from public.notification_outbox where id=target_outbox_id and type='team_size_shortage' for update;
  if not found or n.status not in ('pending','processing','failed') then return null; end if;
  -- Serialize cancellation/requeue with the queue function's activity lock.
  perform 1 from public.activities a where a.id::text=n.payload->>'activityId' for update;
  select n.payload || jsonb_build_object('title',a.title,'startsAt',a.starts_at,
    'targetTeamSize',(v.values->>'targetTeamSize')::integer,'acceptedPlayers',stats.accepted,
    'pendingPlayers',stats.pending,'responseDeadlinePassed',coalesce(a.response_due_at<=now(),false)) as payload,
    a.starts_at,stats.accepted,(v.values->>'targetTeamSize')::integer as target_size
  into current_state
  from public.activities a
  join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
  join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
  join public.disciplines d on d.id=s.discipline_id
  join public.organizations o on o.id=a.organization_id
  join public.activity_types at on at.id=a.activity_type_id
  join private.discipline_capability_values v on v.activity_id=a.id and v.organization_id=a.organization_id and v.team_id=a.team_id
  join private.activity_capability_rules r on r.activity_id=a.id and r.capability_id=n.payload->>'capabilityId'
  cross join lateral (
    select count(*) filter(where i.response='accepted')::integer as accepted,
      count(*) filter(where i.response='pending')::integer as pending, count(*) as invited
    from public.invitations i
    join public.people p on p.id=i.person_id and p.organization_id=a.organization_id
    where i.activity_id=a.id and i.organization_id=a.organization_id
      and (i.activity_role='participant' or (i.activity_role is null and exists(
        select 1 from public.memberships m where m.team_id=a.team_id and m.organization_id=a.organization_id
          and m.person_id=i.person_id and m.role='participant'
          and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
          and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date)
      )))
  ) stats
  where a.id=(n.payload->>'activityId')::uuid and a.organization_id=n.organization_id
    and d.key=v.discipline_key
    and a.status='published' and a.source_kind<>'imported' and a.starts_at>now()
    and r.definition#>'{appliesTo,activityTypeSlugs}' ? at.slug
    and r.definition#>'{appliesTo,categories}' ? at.system_category
    and jsonb_typeof(v.values->'targetTeamSize')='number'
    and (v.values->>'targetTeamSize')::numeric between 1 and 100
    and stats.invited>0
    and private.has_team_permission(a.team_id,'invitation.manage',n.user_id)
    and exists(select 1 from public.team_access_assignments ta
      join public.people p on p.id=ta.person_id and p.organization_id=ta.organization_id
      where ta.team_id=a.team_id and ta.organization_id=a.organization_id and p.user_id=n.user_id
        and ta.starts_on<=(now() at time zone o.time_zone)::date
        and (ta.ends_on is null or ta.ends_on>=(now() at time zone o.time_zone)::date));
  if found then
    if current_state.accepted>=current_state.target_size then
      cancellation_reason:='capability_no_shortage';
    elsif current_state.starts_at-(n.payload->>'beforeStartHours')::integer*interval '1 hour'>now() then
      cancellation_reason:='capability_not_due';
    else current_payload:=current_state.payload; end if;
  end if;
  if current_payload is null then
    update public.notification_outbox set status='cancelled',last_error=cancellation_reason,
      payload=payload-'acceptedPlayers'-'pendingPlayers'-'targetTeamSize'-'responseDeadlinePassed' where id=n.id;
    -- Only a filled team or a moved match is retryable. Permission/eligibility
    -- cancellations retain their marker and cannot produce a requeue loop.
    if cancellation_reason in ('capability_no_shortage','capability_not_due') then
      delete from private.capability_notification_checks c
      where c.activity_id::text=n.payload->>'activityId' and c.capability_id=n.payload->>'capabilityId'
       and c.before_start_hours::text=n.payload->>'beforeStartHours' and c.delivered_at is null
       and not exists(select 1 from public.notification_outbox other
        where other.type='team_size_shortage' and other.payload->>'activityId'=n.payload->>'activityId'
         and other.payload->>'capabilityId'=n.payload->>'capabilityId'
         and other.payload->>'beforeStartHours'=n.payload->>'beforeStartHours'
         and (other.status<>'cancelled' or other.last_error is null
          or other.last_error not in ('capability_no_shortage','capability_not_due')));
    end if;
    return null;
  end if;
  update public.notification_outbox set payload=current_payload where id=n.id;
  return current_payload;
end;
$$;
revoke all on function public.prepare_capability_notification(uuid) from public,anon,authenticated;
grant execute on function public.prepare_capability_notification(uuid) to service_role;
