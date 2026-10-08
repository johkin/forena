-- Activity generations bind decisions to the state that was evaluated.
alter table public.activities add column discipline_generation bigint not null default 0;
create function private.advance_discipline_generation() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.discipline_generation:=0;
 elsif (to_jsonb(new)-array['discipline_generation','updated_at','invitation_materialized_at','invitation_notifications_queued_at'])
  is distinct from (to_jsonb(old)-array['discipline_generation','updated_at','invitation_materialized_at','invitation_notifications_queued_at']) then
  new.discipline_generation:=old.discipline_generation+1;
 else new.discipline_generation:=old.discipline_generation; end if;
 return new;
end $$;
revoke all on function private.advance_discipline_generation() from public,anon,authenticated;
create trigger advance_discipline_generation before insert or update on public.activities for each row execute function private.advance_discipline_generation();

-- Index the captured team; no scope or permissions derive from client metadata.
alter table private.discipline_activity_events add column team_id uuid generated always as ((current_state->>'teamId')::uuid) stored;
create index discipline_events_team_recent_idx on private.discipline_activity_events(team_id,created_at);
create index discipline_events_team_backlog_idx on private.discipline_activity_events(team_id) where status<>'processed';
create index discipline_events_retention_idx on private.discipline_activity_events(processed_at,id) where status='processed';
create index discipline_audit_retention_idx on public.audit_log(created_at,id) where action='discipline_activity.handled';
create function private.limit_discipline_events() returns trigger language plpgsql security definer set search_path='' as $$
declare target_team uuid:=(new.current_state->>'teamId')::uuid;
begin
 if target_team is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('discipline-events:'||target_team::text,0));
 if (select count(*) from private.discipline_activity_events where team_id=target_team and status<>'processed')>=2000
  or (select count(*) from private.discipline_activity_events where team_id=target_team and created_at>now()-interval '1 minute')>=500 then
  raise exception 'Discipline event queue limit reached; retry later' using errcode='53000';
 end if;
 return new;
end $$;
revoke all on function private.limit_discipline_events() from public,anon,authenticated;
create trigger limit_discipline_events before insert on private.discipline_activity_events for each row execute function private.limit_discipline_events();

-- Keep failures and waiting work; retain only minimal handler audit for 30 days.
create function private.prune_discipline_history(batch_size integer default 1000) returns jsonb
language plpgsql security definer set search_path='' as $$
declare removed_events integer; removed_audit integer;
begin
 delete from private.discipline_activity_events where id in (
  select id from private.discipline_activity_events where status='processed' and processed_at<now()-interval '7 days'
  order by processed_at,id limit greatest(1,least(batch_size,10000)) for update skip locked);
 get diagnostics removed_events=row_count;
 delete from public.audit_log where id in (
  select id from public.audit_log where action='discipline_activity.handled' and created_at<now()-interval '30 days'
  order by created_at,id limit greatest(1,least(batch_size,10000)) for update skip locked);
 get diagnostics removed_audit=row_count;
 return jsonb_build_object('events',removed_events,'audit',removed_audit);
end $$;
revoke all on function private.prune_discipline_history(integer) from public,anon,authenticated;
select cron.schedule('prune-discipline-history','17 2 * * *',$cron$select private.prune_discipline_history(10000);$cron$);

create or replace function public.claim_discipline_activity_events(batch_size integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.prune_discipline_history();
 -- Recover expired leases. Five unsuccessful claims require operator recovery.
 update private.discipline_activity_events set status=case when attempts>=5 then 'failed' else 'pending' end,
  lease_token=null,lease_until=null,last_error='lease_expired'
 where status='processing' and lease_until<=now();
 with due as (
  select e.id from private.discipline_activity_events e where e.status='pending' and e.run_at<=now()
   and not exists(select 1 from private.discipline_activity_events earlier where earlier.activity_id=e.activity_id and earlier.id<e.id and earlier.status<>'processed')
  order by e.run_at,e.id for update skip locked limit greatest(1,least(batch_size,100))
 ),claimed as (
  update private.discipline_activity_events e set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  where e.id in (select id from due) returning e.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'leaseToken',e.lease_token,'kind',e.kind,'disciplineId',e.discipline_id,
  'disciplineKey',e.discipline_key,'disciplineVersion',e.discipline_version,'previous',e.previous_state,'current',e.current_state,
  'teamValues',e.team_values,'sectionSettings',e.section_settings,'teamSettings',e.team_settings,
  'savedRules',coalesce((select jsonb_agg(r.definition) from private.activity_capability_rules r where r.activity_id=e.activity_id),'[]')) order by e.id),'[]')
 into result from claimed e;
 return result;
end $$;
revoke all on function public.claim_discipline_activity_events(integer) from public,anon,authenticated;
grant execute on function public.claim_discipline_activity_events(integer) to service_role;


create or replace function public.load_capability_contexts(after_activity_id uuid default null,
  after_capability_id text default '',batch_size integer default 100) returns jsonb
language sql security definer set search_path='' as $$
select coalesce(jsonb_agg(context order by activity_id,capability_id),'[]') from (
 select a.id as activity_id,r.capability_id,jsonb_build_object(
  'activityGeneration',a.discipline_generation,'activityId',a.id,'teamId',a.team_id,'organizationId',a.organization_id,
  'disciplineKey',v.discipline_key,'disciplineVersion',v.version,'currentDisciplineKey',d.key,
  'definition',r.definition,'values',v.values,'evaluatedAt',now(),
  'title',a.title,'startsAt',a.starts_at,'responseDueAt',a.response_due_at,
  'status',a.status,'sourceKind',a.source_kind,'activityTypeSlug',at.slug,'category',at.system_category,
  'acceptedPlayers',stats.accepted,'pendingPlayers',stats.pending,'invitedPlayers',stats.invited,
  'completedCheckpoints',coalesce((select jsonb_agg(c.before_start_hours) from private.capability_notification_checks c
    where c.activity_id=a.id and c.capability_id=r.capability_id),'[]')) as context
 from private.activity_capability_rules r
 join public.activities a on a.id=r.activity_id
 join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
 join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
 join public.disciplines d on d.id=s.discipline_id
 join private.discipline_capability_values v on v.activity_id=a.id and v.team_id=a.team_id and v.organization_id=a.organization_id and v.discipline_key=d.key
 join public.activity_types at on at.id=a.activity_type_id
 join public.organizations o on o.id=a.organization_id
 cross join lateral (
  select count(*) filter(where i.response='accepted')::integer as accepted,
   count(*) filter(where i.response='pending')::integer as pending,count(*)::integer as invited
  from public.invitations i join public.people p on p.id=i.person_id and p.organization_id=a.organization_id
  where i.activity_id=a.id and i.organization_id=a.organization_id
   and (i.activity_role='participant' or (i.activity_role is null and exists(
    select 1 from public.memberships m where m.team_id=a.team_id and m.organization_id=a.organization_id
     and m.person_id=i.person_id and m.role='participant'
     and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
     and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date))))
 ) stats
 where (after_activity_id is null or (a.id,r.capability_id)>(after_activity_id,after_capability_id))
  and a.starts_at>now()
  and exists(select 1 from private.discipline_operations op where op.activity_id=a.id and op.capability_id=r.capability_id and op.status='pending' and op.run_at<=now())
  and not exists(select 1 from private.discipline_activity_events e where e.activity_id=a.id and e.status<>'processed')
 order by a.id,r.capability_id limit greatest(1,least(batch_size,500))
) candidates;
$$;
revoke all on function public.load_capability_contexts(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.load_capability_contexts(uuid,text,integer) to service_role;

-- A persistent cooldown provides continuation/fairness without resetting a cursor
-- to the same first non-notifying page every minute. Claims are at most 100 facts.
alter table private.activity_capability_rules add column next_evaluation_at timestamptz not null default now();
create index capability_rules_evaluation_idx on private.activity_capability_rules(next_evaluation_at,activity_id,capability_id);
create function public.claim_capability_contexts(batch_size integer default 100) returns jsonb
language sql security definer set search_path='' as $$
with due as (
 select r.activity_id,r.capability_id from private.activity_capability_rules r
 join public.activities a on a.id=r.activity_id
 join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
 join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
 join public.disciplines d on d.id=s.discipline_id
 where r.next_evaluation_at<=now() and a.starts_at>now()
  and exists(select 1 from private.discipline_capability_values v where v.activity_id=a.id and v.team_id=a.team_id and v.organization_id=a.organization_id and v.discipline_key=d.key)
  and exists(select 1 from private.discipline_operations op where op.activity_id=a.id and op.capability_id=r.capability_id and op.status='pending' and op.run_at<=now())
  and not exists(select 1 from private.discipline_activity_events e where e.activity_id=a.id and e.status<>'processed')
 order by r.next_evaluation_at,r.activity_id,r.capability_id limit greatest(1,least(batch_size,100)) for update of r skip locked
),marked as (
 update private.activity_capability_rules r set next_evaluation_at=now()+interval '1 minute'
 from due where r.activity_id=due.activity_id and r.capability_id=due.capability_id returning r.*
)
select coalesce(jsonb_agg(context order by activity_id,capability_id),'[]') from (
 select a.id as activity_id,r.capability_id,jsonb_build_object(
  'activityGeneration',a.discipline_generation,'activityId',a.id,'teamId',a.team_id,'organizationId',a.organization_id,
  'disciplineKey',v.discipline_key,'disciplineVersion',v.version,'currentDisciplineKey',d.key,
  'definition',r.definition,'values',v.values,'evaluatedAt',now(),
  'title',a.title,'startsAt',a.starts_at,'responseDueAt',a.response_due_at,
  'status',a.status,'sourceKind',a.source_kind,'activityTypeSlug',at.slug,'category',at.system_category,
  'acceptedPlayers',stats.accepted,'pendingPlayers',stats.pending,'invitedPlayers',stats.invited,
  'completedCheckpoints',coalesce((select jsonb_agg(c.before_start_hours) from private.capability_notification_checks c
    where c.activity_id=a.id and c.capability_id=r.capability_id),'[]')) as context
 from marked r
 join public.activities a on a.id=r.activity_id
 join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
 join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
 join public.disciplines d on d.id=s.discipline_id
 join private.discipline_capability_values v on v.activity_id=a.id and v.team_id=a.team_id and v.organization_id=a.organization_id and v.discipline_key=d.key
 join public.activity_types at on at.id=a.activity_type_id
 join public.organizations o on o.id=a.organization_id
 cross join lateral (
  select count(*) filter(where i.response='accepted')::integer as accepted,
   count(*) filter(where i.response='pending')::integer as pending,count(*)::integer as invited
  from public.invitations i join public.people p on p.id=i.person_id and p.organization_id=a.organization_id
  where i.activity_id=a.id and i.organization_id=a.organization_id
   and (i.activity_role='participant' or (i.activity_role is null and exists(
    select 1 from public.memberships m where m.team_id=a.team_id and m.organization_id=a.organization_id
     and m.person_id=i.person_id and m.role='participant'
     and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
     and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date))))
 ) stats
 where true
  and a.starts_at>now()
  and exists(select 1 from private.discipline_operations op where op.activity_id=a.id and op.capability_id=r.capability_id and op.status='pending' and op.run_at<=now())
  and not exists(select 1 from private.discipline_activity_events e where e.activity_id=a.id and e.status<>'processed')
 order by a.id,r.capability_id limit greatest(1,least(batch_size,100))
) candidates;
$$;
revoke all on function public.claim_capability_contexts(integer) from public,anon,authenticated;
grant execute on function public.claim_capability_contexts(integer) to service_role;

create or replace function private.queue_evaluated_capability_notifications(evaluation jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare proposal jsonb; a public.activities%rowtype; rule jsonb; recipients uuid[];
 stage integer; inserted integer; queued integer:=0;
begin
 if evaluation->>'error' is not null then raise exception 'Capability evaluation failed' using errcode='58000'; end if;
 if jsonb_typeof(evaluation->'proposals') is distinct from 'array'
  or jsonb_array_length(evaluation->'proposals')>500 or octet_length(evaluation::text)>2097152 then
  raise exception 'Invalid capability evaluation' using errcode='22023'; end if;
 for proposal in select value from jsonb_array_elements(evaluation->'proposals') loop
  if jsonb_typeof(proposal) is distinct from 'object' or octet_length(proposal::text)>16384
   or (proposal ? 'payload' and jsonb_typeof(proposal->'payload') is distinct from 'object') then
   raise exception 'Invalid capability proposal' using errcode='22023'; end if;
  select * into a from public.activities where id=(proposal->>'activityId')::uuid for update;
  if not found then continue; end if;
  select definition into rule from private.activity_capability_rules where activity_id=a.id and capability_id=proposal->>'capabilityId';
  if not found then continue; end if;
  stage:=(proposal->>'beforeStartHours')::integer;
  if stage is null or not (rule#>'{notifications,beforeStartHours}') @> to_jsonb(array[stage])
   or rule#>>'{notifications,recipients}' is distinct from 'teamInvitationManagers'
   or proposal->>'type' is distinct from rule#>>'{notifications,type}' then
   raise exception 'Invalid capability proposal' using errcode='22023'; end if;
  -- Generic generation/ownership checks reject obsolete proposals under the
  -- activity lock; no shortage/status business evaluation is duplicated here.
  if (proposal->>'activityGeneration')::bigint is distinct from a.discipline_generation
   or not exists(select 1 from public.teams t join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
    join public.disciplines d on d.id=s.discipline_id
    where t.id=a.team_id and t.organization_id=a.organization_id and d.key=proposal->>'disciplineKey'
     and exists(select 1 from private.discipline_values v where v.activity_id=a.id and v.scope='activity' and v.discipline_id=d.id and v.version=proposal->>'disciplineVersion'))
   or exists(select 1 from private.discipline_activity_events e where e.activity_id=a.id and e.status<>'processed')
   or not exists(select 1 from private.discipline_operations op where op.activity_id=a.id and op.capability_id=proposal->>'capabilityId' and op.before_start_hours=stage and op.status='pending')
  then continue; end if;
  -- A concurrent reschedule invalidates this proposal without failing the batch.
  if a.starts_at-stage*interval '1 hour'>now() then continue; end if;
  -- Resolve active team recipients at the decision boundary, using trusted permission data.
  select array_agg(distinct p.user_id) into recipients from public.team_access_assignments ta
  join public.people p on p.id=ta.person_id and p.organization_id=ta.organization_id
  join public.organizations o on o.id=ta.organization_id
  where ta.team_id=a.team_id and ta.organization_id=a.organization_id
   and ta.starts_on<=(now() at time zone o.time_zone)::date
   and (ta.ends_on is null or ta.ends_on>=(now() at time zone o.time_zone)::date)
   and p.user_id is not null and private.has_team_permission(a.team_id,'invitation.manage',p.user_id);
  if coalesce(cardinality(recipients),0)=0 then continue; end if;
  insert into private.capability_notification_checks(activity_id,capability_id,before_start_hours)
   values(a.id,proposal->>'capabilityId',stage) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then continue; end if;
  insert into public.notification_outbox(organization_id,user_id,type,payload,message)
   select a.organization_id,u,proposal->>'type',coalesce(proposal->'payload','{}')||jsonb_build_object(
    'activityId',a.id,'teamId',a.team_id,'capabilityId',proposal->>'capabilityId','beforeStartHours',stage),
    proposal->'message' from unnest(recipients) u;
  get diagnostics inserted=row_count;
  queued:=queued+inserted;
  update private.discipline_operations set status='completed'
   where activity_id=a.id and capability_id=proposal->>'capabilityId' and status='pending' and run_at<=now();
  insert into public.audit_log(organization_id,action,entity_type,entity_id,details)
   values(a.organization_id,'capability_notification.queued','activity',a.id::text,
    jsonb_build_object('capabilityId',proposal->>'capabilityId','beforeStartHours',stage,'recipientCount',inserted));
 end loop;
 return queued;
end $$;
revoke all on function private.queue_evaluated_capability_notifications(jsonb) from public,anon,authenticated;
