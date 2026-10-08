-- First adapter for capability-owned values. Extend with other discipline stores
-- as they are implemented; the rule engine itself has no sport-specific rules.
create view private.discipline_capability_values with (security_invoker=true) as
select 'football'::text as discipline_key, v.version, v.organization_id, v.team_id,
  v.activity_id, v.values
from private.football_values v where v.scope='activity';
revoke all on private.discipline_capability_values from public, anon, authenticated;

-- Snapshot declarative rules at the worker's first observation. A later change
-- to profile defaults does not change a captured rule on an existing activity.
create table private.activity_capability_rules (
  activity_id uuid not null references public.activities(id) on delete cascade,
  capability_id text not null,
  definition jsonb not null,
  primary key (activity_id, capability_id)
);
alter table private.activity_capability_rules enable row level security;
revoke all on private.activity_capability_rules from public, anon, authenticated;

-- Durable deduplication survives outbox pruning. One alert per activity/stage,
-- rather than one per worker run, recipient or retry attempt.
create table private.capability_notification_checks (
  activity_id uuid not null references public.activities(id) on delete cascade,
  capability_id text not null,
  before_start_hours integer not null,
  queued_at timestamptz not null default now(),
  primary key (activity_id, capability_id, before_start_hours)
);
alter table private.capability_notification_checks enable row level security;
revoke all on private.capability_notification_checks from public, anon, authenticated;

create function public.queue_due_capability_notifications(profiles jsonb, batch_size integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare
  profile jsonb; capability jsonb; candidate record; stage integer;
  recipients uuid[]; queued integer := 0; inserted integer;
begin
  -- This is an internal service API, never an authenticated user's write command.
  if jsonb_typeof(profiles) is distinct from 'array' or jsonb_array_length(profiles)>32 then
    raise exception 'Invalid capability profiles' using errcode='22023';
  end if;
  for profile in select value from jsonb_array_elements(profiles) loop
    if jsonb_typeof(profile->'capabilities') is distinct from 'array' then
      raise exception 'Invalid capabilities' using errcode='22023';
    end if;
    for capability in select value from jsonb_array_elements(profile->'capabilities') loop
      if capability->>'id' is distinct from 'targetTeamSize'
        or capability->>'version' is distinct from '1.0.0'
        or capability#>>'{field,key}' is distinct from 'targetTeamSize'
        or capability#>>'{notifications,type}' is distinct from 'team_size_shortage'
        or capability#>>'{notifications,recipients}' is distinct from 'teamInvitationManagers'
        or jsonb_typeof(capability#>'{notifications,beforeStartHours}') is distinct from 'array'
        or jsonb_typeof(capability#>'{appliesTo,activityTypeSlugs}') is distinct from 'array'
        or jsonb_typeof(capability#>'{appliesTo,categories}') is distinct from 'array' then
        raise exception 'Unsupported capability' using errcode='22023';
      end if;
      if jsonb_array_length(capability#>'{notifications,beforeStartHours}') not between 1 and 5
        or exists(select 1 from jsonb_array_elements(capability#>'{notifications,beforeStartHours}') h
          where jsonb_typeof(h)<>'number' or h::text !~ '^[0-9]+$' or (h::text)::numeric not between 1 and 720)
        or (select count(*)<>count(distinct h) from jsonb_array_elements(capability#>'{notifications,beforeStartHours}') h) then
        raise exception 'Invalid capability checkpoints' using errcode='22023';
      end if;

      insert into private.activity_capability_rules(activity_id,capability_id,definition)
      select a.id,capability->>'id',capability
      from private.discipline_capability_values v
      join public.activities a on a.id=v.activity_id and a.organization_id=v.organization_id and a.team_id=v.team_id
      join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
      join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
      join public.disciplines d on d.id=s.discipline_id
      join public.activity_types at on at.id=a.activity_type_id
      where v.discipline_key=profile->>'key' and v.version=profile->>'version'
        and d.key=v.discipline_key and (t.discipline_id is null or t.discipline_id=d.id)
        and a.status='published' and a.source_kind<>'imported' and a.starts_at>now()
        and capability#>'{appliesTo,activityTypeSlugs}' ? at.slug
        and capability#>'{appliesTo,categories}' ? at.system_category
        and not exists(select 1 from private.activity_capability_rules r where r.activity_id=a.id and r.capability_id=capability->>'id')
      order by a.starts_at,a.id limit greatest(1,least(batch_size,500))
      on conflict do nothing;

      for candidate in
        select a.*, v.values, r.definition, stats.accepted, stats.pending, checkpoint.hours
        from private.activity_capability_rules r
        join public.activities a on a.id=r.activity_id
        join private.discipline_capability_values v on v.activity_id=a.id and v.team_id=a.team_id and v.organization_id=a.organization_id
        join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
        join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
        join public.disciplines d on d.id=s.discipline_id
        join public.activity_types at on at.id=a.activity_type_id
        join public.organizations o on o.id=a.organization_id
        cross join lateral (
          -- Closest due checkpoint only: do not replay the 72h alert at 20h.
          select min(h::integer) as hours
          from jsonb_array_elements_text(r.definition#>'{notifications,beforeStartHours}') h
          where a.starts_at - h::integer * interval '1 hour' <= now()
        ) checkpoint
        cross join lateral (
          select count(*) filter(where i.response='accepted')::integer as accepted,
            count(*) filter(where i.response='pending')::integer as pending,
            count(*) as invited
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
        where r.capability_id=capability->>'id' and v.discipline_key=profile->>'key' and v.version=profile->>'version'
          and d.key=v.discipline_key and (t.discipline_id is null or t.discipline_id=d.id)
          and a.status='published' and a.source_kind<>'imported' and a.starts_at>now()
          and r.definition#>'{appliesTo,activityTypeSlugs}' ? at.slug
          and r.definition#>'{appliesTo,categories}' ? at.system_category
          and jsonb_typeof(v.values->'targetTeamSize')='number'
          and (v.values->>'targetTeamSize')::numeric between 1 and 100
          and stats.invited>0 and stats.accepted<(v.values->>'targetTeamSize')::integer
          and checkpoint.hours is not null
          and not exists(select 1 from private.capability_notification_checks c where c.activity_id=a.id
            and c.capability_id=r.capability_id and c.before_start_hours=checkpoint.hours)
          and exists(select 1 from public.team_access_assignments ta
            join public.people p on p.id=ta.person_id and p.organization_id=ta.organization_id
            where ta.team_id=a.team_id and ta.organization_id=a.organization_id
              and ta.starts_on<=(now() at time zone o.time_zone)::date
              and (ta.ends_on is null or ta.ends_on>=(now() at time zone o.time_zone)::date)
              and private.has_team_permission(a.team_id,'invitation.manage',p.user_id))
        order by a.starts_at,a.id
        limit greatest(1,least(batch_size,500))
        for update of a skip locked
      loop
        stage := candidate.hours;
        select array_agg(distinct p.user_id) into recipients
        from public.team_access_assignments ta
        join public.people p on p.id=ta.person_id and p.organization_id=ta.organization_id
        join public.organizations o on o.id=ta.organization_id
        where ta.team_id=candidate.team_id and ta.organization_id=candidate.organization_id
          and ta.starts_on<=(now() at time zone o.time_zone)::date
          and (ta.ends_on is null or ta.ends_on>=(now() at time zone o.time_zone)::date)
          and private.has_team_permission(candidate.team_id,'invitation.manage',p.user_id);
        if coalesce(cardinality(recipients),0)=0 then continue; end if;

        insert into private.capability_notification_checks(activity_id,capability_id,before_start_hours)
          values(candidate.id,capability->>'id',stage) on conflict do nothing;
        get diagnostics inserted=row_count;
        if inserted=0 then continue; end if;

        insert into public.notification_outbox(organization_id,user_id,type,payload)
        select candidate.organization_id,u,'team_size_shortage',jsonb_build_object(
          'activityId',candidate.id,'teamId',candidate.team_id,'title',candidate.title,
          'startsAt',candidate.starts_at,'capabilityId',capability->>'id',
          'beforeStartHours',stage,'targetTeamSize',(candidate.values->>'targetTeamSize')::integer,
          'acceptedPlayers',candidate.accepted,'pendingPlayers',candidate.pending,
          'responseDeadlinePassed',coalesce(candidate.response_due_at<=now(),false))
        from unnest(recipients) u;
        get diagnostics inserted=row_count;
        queued := queued+inserted;

        insert into public.audit_log(organization_id,action,entity_type,entity_id,details)
          values(candidate.organization_id,'capability_notification.queued','activity',candidate.id::text,
            jsonb_build_object('capabilityId',capability->>'id','beforeStartHours',stage,'recipientCount',inserted));
      end loop;
    end loop;
  end loop;
  return queued;
end;
$$;
revoke all on function public.queue_due_capability_notifications(jsonb,integer) from public,anon,authenticated;
grant execute on function public.queue_due_capability_notifications(jsonb,integer) to service_role;

-- Recheck at delivery, including retries: do not send an obsolete shortage or
-- disclose the response count to someone whose team permission was removed.
create function public.prepare_capability_notification(target_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; current_payload jsonb;
begin
  select * into n from public.notification_outbox where id=target_outbox_id and type='team_size_shortage' for update;
  if not found then return null; end if;
  select n.payload || jsonb_build_object('title',a.title,'startsAt',a.starts_at,
    'targetTeamSize',(v.values->>'targetTeamSize')::integer,'acceptedPlayers',stats.accepted,
    'pendingPlayers',stats.pending,'responseDeadlinePassed',coalesce(a.response_due_at<=now(),false))
  into current_payload
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
    and d.key=v.discipline_key and (t.discipline_id is null or t.discipline_id=d.id)
    and a.status='published' and a.source_kind<>'imported' and a.starts_at>now()
    and r.definition#>'{appliesTo,activityTypeSlugs}' ? at.slug
    and r.definition#>'{appliesTo,categories}' ? at.system_category
    and jsonb_typeof(v.values->'targetTeamSize')='number'
    and (v.values->>'targetTeamSize')::numeric between 1 and 100
    and stats.invited>0 and stats.accepted<(v.values->>'targetTeamSize')::integer
    and private.has_team_permission(a.team_id,'invitation.manage',n.user_id)
    and exists(select 1 from public.team_access_assignments ta
      join public.people p on p.id=ta.person_id and p.organization_id=ta.organization_id
      where ta.team_id=a.team_id and ta.organization_id=a.organization_id and p.user_id=n.user_id
        and ta.starts_on<=(now() at time zone o.time_zone)::date
        and (ta.ends_on is null or ta.ends_on>=(now() at time zone o.time_zone)::date))
    -- If a match was moved, wait for a new check instead of sending an early alert.
    and a.starts_at-(n.payload->>'beforeStartHours')::integer*interval '1 hour'<=now();
  if current_payload is null then
    update public.notification_outbox set status='cancelled',last_error=null where id=n.id;
    return null;
  end if;
  update public.notification_outbox set payload=current_payload where id=n.id;
  return current_payload;
end;
$$;
revoke all on function public.prepare_capability_notification(uuid) from public,anon,authenticated;
grant execute on function public.prepare_capability_notification(uuid) to service_role;
