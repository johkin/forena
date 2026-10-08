-- Preserve IDs, revisions and values while making the storage discipline-neutral.
alter table private.football_values rename to discipline_values;
alter table private.discipline_values add column discipline_id uuid references public.disciplines(id);
update private.discipline_values set discipline_id=(select id from public.disciplines where key='football');
alter table private.discipline_values alter column discipline_id set not null;
alter table private.discipline_values drop constraint football_values_version_check;
alter table private.discipline_values add constraint discipline_values_version_check check (length(btrim(version)) between 1 and 40);
alter table private.discipline_values drop constraint football_values_team_id_scope_activity_id_person_id_key;
alter table private.discipline_values add constraint discipline_values_target_key
  unique nulls not distinct(discipline_id,team_id,scope,activity_id,person_id);
alter index private.football_values_activity_idx rename to discipline_values_activity_idx;
alter index private.football_values_person_idx rename to discipline_values_person_idx;
-- Scope-specific metadata belongs to the discipline's structured activity values.
update private.discipline_values set values=values||jsonb_build_object('captainSource',captain_source) where scope='activity';
alter table private.discipline_values drop column captain_source;
alter table private.discipline_values add constraint discipline_values_team_tenant_fk
  foreign key(team_id,organization_id) references public.teams(id,organization_id) on delete cascade;
alter table private.discipline_values add constraint discipline_values_person_tenant_fk
  foreign key(person_id,organization_id) references public.people(id,organization_id) on delete cascade;
-- Activities already have a tenant key; also enforce their owning team.
create unique index activities_id_team_tenant_idx on public.activities(id,team_id,organization_id);
alter table private.discipline_values add constraint discipline_values_activity_tenant_fk
  foreign key(activity_id,team_id,organization_id) references public.activities(id,team_id,organization_id) on delete cascade;
revoke all on private.discipline_values from public,anon,authenticated;

create or replace view private.discipline_capability_values with (security_invoker=true) as
select d.key as discipline_key,v.version,v.organization_id,v.team_id,v.activity_id,v.values
from private.discipline_values v join public.disciplines d on d.id=v.discipline_id where v.scope='activity';
revoke all on private.discipline_capability_values from public,anon,authenticated;

create or replace function private.validate_football_values(s text, v jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; x jsonb; allowed text[]; n numeric;
begin
  if jsonb_typeof(v) is distinct from 'object' or octet_length(v::text)>4096 then raise exception 'Invalid football values' using errcode='22023'; end if;
  allowed := case s
    when 'team' then array['gameFormat','targetTeamSize','requiredGoalkeepers','periods','periodMinutes']
    when 'activity' then array['gameFormat','targetTeamSize','requiredGoalkeepers','periods','periodMinutes','venue','captainPersonId','captainSource']
    when 'teamMembership' then array['shirtNumber','positions']
    when 'activityParticipation' then array['shirtNumber','position'] else array[]::text[] end;
  for k,x in select * from jsonb_each(v) loop
    if not k=any(allowed) then raise exception 'Unknown football field' using errcode='22023'; end if;
    if k=any(array['targetTeamSize','requiredGoalkeepers','periods','periodMinutes','shirtNumber']) then
      if jsonb_typeof(x)<>'number' then raise exception 'Expected integer' using errcode='22023'; end if;
      n := (x::text)::numeric;
      if n<>trunc(n) or n < (case when k in ('requiredGoalkeepers','shirtNumber') then 0 else 1 end)
        or n > (case k when 'targetTeamSize' then 100 when 'requiredGoalkeepers' then 10 when 'periods' then 10 when 'periodMinutes' then 120 else 999 end) then
        raise exception 'Invalid number' using errcode='22023'; end if;
    elsif k='gameFormat' then
      if jsonb_typeof(x)<>'string' or not (v->>k)=any(array['3v3','5v5','7v7','9v9','11v11']) then raise exception 'Invalid format' using errcode='22023'; end if;
    elsif k='venue' then
      if jsonb_typeof(x)<>'string' or not (v->>k)=any(array['home','away','neutral']) then raise exception 'Invalid venue' using errcode='22023'; end if;
    elsif k='position' then
      if jsonb_typeof(x)<>'string' or not (v->>k)=any(array['goalkeeper','defender','midfielder','forward']) then raise exception 'Invalid position' using errcode='22023'; end if;
    elsif k='positions' then
      if jsonb_typeof(x)<>'array' then raise exception 'Invalid positions' using errcode='22023'; end if;
      if jsonb_array_length(x)>4 or exists (select 1 from jsonb_array_elements(x) e where jsonb_typeof(e)<>'string' or not (e#>>'{}')=any(array['goalkeeper','defender','midfielder','forward']))
        or (select count(*)<>count(distinct e) from jsonb_array_elements(x) e) then raise exception 'Invalid positions' using errcode='22023'; end if;
    elsif k='captainSource' then
      if jsonb_typeof(x)<>'string' or not (v->>k)=any(array['teamPlayers','acceptedActivityPlayers']) then raise exception 'Invalid player source' using errcode='22023'; end if;
    elsif k='captainPersonId' then
      if jsonb_typeof(x)<>'string' or (v->>k)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid player reference' using errcode='22023'; end if;
    end if;
  end loop;
  if v ? 'targetTeamSize' then
    if v ? 'gameFormat' and (v->>'targetTeamSize')::integer < split_part(v->>'gameFormat','v',1)::integer then raise exception 'Squad too small' using errcode='22023'; end if;
    if v ? 'requiredGoalkeepers' and (v->>'requiredGoalkeepers')::integer > (v->>'targetTeamSize')::integer then raise exception 'Too many goalkeepers' using errcode='22023'; end if;
  end if;
end;
$$;
revoke all on function private.validate_football_values(text,jsonb) from public, anon, authenticated;

create or replace function public.football_fields(
  target_team_id uuid, target_scope text, target_activity_id uuid default null,
  target_person_id uuid default null, new_values jsonb default null,
  expected_revision integer default null, selected_source text default 'acceptedActivityPlayers'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teams%rowtype; a public.activities%rowtype; r private.discipline_values%rowtype;
  permitted boolean; can_manage_invitations boolean; enabled boolean; editable boolean := true; day date; org_zone text;
  team_players jsonb := '[]'; accepted_players jsonb := '[]'; participants jsonb := '[]';
  football_id uuid := (select id from public.disciplines where key='football');
  candidate jsonb; captain uuid; captain_role text; activity_slug text; activity_category text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if target_scope is null or target_scope not in ('team','teamMembership','activity','activityParticipation') then raise exception 'Invalid scope' using errcode='22023'; end if;
  -- All saves serialize on the owning team, including first insert at revision 0.
  select * into t from public.teams where id=target_team_id for update;
  if not found then raise exception 'Team not found' using errcode='P0002'; end if;
  permitted := case when target_scope='team' then public.can_manage_discipline_defaults('team',t.organization_id,t.id)
    when target_scope='teamMembership' then public.has_team_permission(t.id,'roster.manage')
    else public.has_team_permission(t.id,'activity.manage') end;
  if not coalesce(permitted,false) then raise exception 'Permission denied' using errcode='42501'; end if;
  can_manage_invitations := coalesce(public.has_team_permission(t.id,'invitation.manage'),false);
  -- Reject before looking up any invitation/person: errors must not reveal eligibility.
  if not can_manage_invitations and (target_scope='activityParticipation'
    or (target_scope='activity' and (new_values ? 'captainPersonId' or new_values ? 'captainSource'))) then
    raise exception 'Invitation permission required' using errcode='42501';
  end if;
  if (target_scope in ('team','teamMembership') and target_activity_id is not null)
    or (target_scope in ('team','activity') and target_person_id is not null)
    or (target_scope in ('activity','activityParticipation') and target_activity_id is null)
    or (target_scope in ('teamMembership','activityParticipation') and target_person_id is null) then
    raise exception 'Invalid target' using errcode='22023'; end if;
  select time_zone into org_zone from public.organizations where id=t.organization_id;
  day := (now() at time zone org_zone)::date;
  select exists(select 1 from public.sections s join public.disciplines d on d.id=s.discipline_id
    where s.id=t.section_id and s.organization_id=t.organization_id and d.key='football'
     ) into enabled;
  if target_activity_id is not null then
    select * into a from public.activities where id=target_activity_id and team_id=t.id and organization_id=t.organization_id for update;
    if not found then raise exception 'Activity not found' using errcode='P0002'; end if;
    select slug,system_category into activity_slug,activity_category from public.activity_types where id=a.activity_type_id;
    enabled := enabled and activity_slug='match-tavling' and activity_category='competition';
    editable := a.status<>'cancelled' and a.source_kind<>'imported' and a.ends_at>now();
    day := (a.starts_at at time zone org_zone)::date;
  end if;
  if target_person_id is not null and not exists(select 1 from public.people where id=target_person_id and organization_id=t.organization_id) then raise exception 'Person not found' using errcode='P0002'; end if;
  if target_scope='teamMembership' and not exists(select 1 from public.memberships where team_id=t.id and organization_id=t.organization_id and person_id=target_person_id and role='participant' and starts_on<=day and (ends_on is null or ends_on>=day)) then raise exception 'Player not in team' using errcode='22023'; end if;
  if target_scope='activityParticipation' and not exists(select 1 from public.invitations i where i.activity_id=a.id and i.organization_id=t.organization_id and i.person_id=target_person_id
    and (i.activity_role='participant' or (i.activity_role is null and exists(select 1 from public.memberships m where m.team_id=t.id and m.person_id=i.person_id and m.role='participant' and m.starts_on<=day and (m.ends_on is null or m.ends_on>=day))))) then raise exception 'Player not in activity' using errcode='22023'; end if;
  if not coalesce(enabled,false) then
    if new_values is not null then raise exception 'Football match fields unavailable' using errcode='22023'; end if;
    return jsonb_build_object('enabled',false);
  end if;
  if target_scope in ('activity','activityParticipation') then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name,p.id),'[]') into team_players
      from public.people p where p.organization_id=t.organization_id and exists(select 1 from public.memberships m where m.person_id=p.id and m.team_id=t.id and m.organization_id=t.organization_id and m.role='participant' and m.starts_on<=day and (m.ends_on is null or m.ends_on>=day));
    if can_manage_invitations then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name,p.id),'[]') into participants
      from public.people p join public.invitations i on i.person_id=p.id where i.activity_id=a.id and i.organization_id=t.organization_id and p.organization_id=t.organization_id
      and (i.activity_role='participant' or (i.activity_role is null and exists(select 1 from jsonb_array_elements(team_players) x where x->>'id'=p.id::text)));
    select coalesce(jsonb_agg(x),'[]') into accepted_players from jsonb_array_elements(participants) x
      where exists(select 1 from public.invitations i where i.activity_id=a.id and i.person_id=(x->>'id')::uuid and i.response='accepted');
    end if;
    if jsonb_array_length(team_players)>500 or jsonb_array_length(participants)>500 then raise exception 'Too many players' using errcode='54000'; end if;
  end if;
  select * into r from private.discipline_values where discipline_id=football_id and team_id=t.id and scope=target_scope and activity_id is not distinct from target_activity_id and person_id is not distinct from target_person_id;
  if r.id is not null and r.version<>'1.0.0' then raise exception 'Unsupported football version' using errcode='22023'; end if;
  if new_values is not null then
    if not editable then raise exception 'Activity is read only' using errcode='55000'; end if;
    if expected_revision is null or expected_revision<>coalesce(r.revision,0) then raise exception 'Values changed; reload' using errcode='40001'; end if;
    selected_source := coalesce(new_values->>'captainSource',selected_source);
    if selected_source is null or selected_source not in ('teamPlayers','acceptedActivityPlayers') then raise exception 'Invalid player source' using errcode='22023'; end if;
    if target_scope='activity' and can_manage_invitations then
      new_values := new_values || jsonb_build_object('captainSource',selected_source);
    end if;
    perform private.validate_football_values(target_scope,new_values);
    if new_values ? 'captainPersonId' then
      captain := (new_values->>'captainPersonId')::uuid;
      candidate := case selected_source when 'teamPlayers' then team_players else accepted_players end;
      if not exists(select 1 from jsonb_array_elements(candidate) x where x->>'id'=captain::text) then raise exception 'Captain not selectable' using errcode='22023'; end if;
      -- Lock eligibility rows until commit; a stale client list is never trusted.
      if selected_source='acceptedActivityPlayers' then
        select activity_role into captain_role from public.invitations where activity_id=a.id and organization_id=t.organization_id and person_id=captain and response='accepted' for update;
        if not found or (captain_role is not null and captain_role<>'participant') then raise exception 'Captain eligibility changed' using errcode='40001'; end if;
        if captain_role is null then
          perform 1 from public.memberships where team_id=t.id and organization_id=t.organization_id and person_id=captain and role='participant' and starts_on<=day and (ends_on is null or ends_on>=day) for update;
          if not found then raise exception 'Captain eligibility changed' using errcode='40001'; end if;
        end if;
      else
        perform 1 from public.memberships where team_id=t.id and person_id=captain and role='participant' and starts_on<=day and (ends_on is null or ends_on>=day) for update;
        if not found then raise exception 'Captain eligibility changed' using errcode='40001'; end if;
      end if;
    end if;
    -- A restricted editor replaces only visible fields. Keep the hidden captain
    -- without revalidating its invitation state (which would be an oracle).
    if target_scope='activity' and not can_manage_invitations then
      if r.values ? 'captainPersonId' then
        new_values := new_values || jsonb_build_object('captainPersonId',r.values->'captainPersonId');
      end if;
      new_values := new_values || jsonb_build_object('captainSource',coalesce(r.values->>'captainSource','acceptedActivityPlayers'));
    end if;
    insert into private.discipline_values(discipline_id,organization_id,team_id,scope,activity_id,person_id,values)
      values(football_id,t.organization_id,t.id,target_scope,target_activity_id,target_person_id,new_values)
      on conflict (discipline_id,team_id,scope,activity_id,person_id) do update set values=excluded.values,revision=private.discipline_values.revision+1,updated_at=now()
      returning * into r;
    if target_activity_id is not null then update public.activities set series_exception=true where id=target_activity_id; end if;
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
      values(t.organization_id,auth.uid(),'discipline_values.saved','discipline_values',r.id::text,jsonb_build_object('disciplineKey','football','scope',target_scope,'revision',r.revision));
  end if;
  return jsonb_build_object('enabled',true,'editable',editable,'version','1.0.0','canManageInvitations',can_manage_invitations,
    'values',case when target_scope='activity' and not can_manage_invitations then coalesce(r.values,'{}')-'captainPersonId'-'captainSource' else coalesce(r.values,'{}') end,'revision',coalesce(r.revision,0),
    'captainSource',case when can_manage_invitations then coalesce(r.values->>'captainSource','acceptedActivityPlayers') else 'teamPlayers' end,'teamPlayers',team_players,'acceptedPlayers',accepted_players,'participants',participants);
end;
$$;

create or replace function private.snapshot_football_defaults() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb; football_id uuid := (select id from public.disciplines where key='football');
begin
  if exists(select 1 from public.activity_types where id=new.activity_type_id and slug='match-tavling' and system_category='competition')
    and exists(select 1 from public.teams t join public.sections s on s.id=t.section_id join public.disciplines d on d.id=s.discipline_id
      where t.id=new.team_id and t.organization_id=new.organization_id and s.organization_id=new.organization_id and d.key='football') then
    select values into v from private.discipline_values where discipline_id=football_id and version='1.0.0' and team_id=new.team_id and scope='team';
    insert into private.discipline_values(discipline_id,organization_id,team_id,scope,activity_id,values)
      values(football_id,new.organization_id,new.team_id,'activity',new.id,coalesce(v,'{}')||jsonb_build_object('captainSource','acceptedActivityPlayers'));
  end if;
  return new;
end;
$$;

-- Infrastructure supplies facts; capability implementations decide what they mean.
-- Keyset pagination also visits non-notifying activities so they cannot starve later ones.
create function public.load_capability_contexts(after_activity_id uuid default null,
  after_capability_id text default '',batch_size integer default 100) returns jsonb
language sql security definer set search_path='' as $$
select coalesce(jsonb_agg(context order by activity_id,capability_id),'[]') from (
 select a.id as activity_id,r.capability_id,jsonb_build_object(
  'activityId',a.id,'teamId',a.team_id,'organizationId',a.organization_id,
  'disciplineKey',v.discipline_key,'disciplineVersion',v.version,'currentDisciplineKey',d.key,
  'definition',r.definition,'values',v.values,'evaluatedAt',now(),
  'title',a.title,'startsAt',a.starts_at,'responseDueAt',a.response_due_at,
  'status',a.status,'sourceKind',a.source_kind,'activityTypeSlug',at.slug,'category',at.system_category,
  'acceptedPlayers',stats.accepted,'pendingPlayers',stats.pending,'invitedPlayers',stats.invited,
  'completedCheckpoints',coalesce((select jsonb_agg(c.before_start_hours) from private.capability_notification_checks c
    where c.activity_id=a.id and c.capability_id=r.capability_id),'[]')) as context
 from private.activity_capability_rules r
 join public.activities a on a.id=r.activity_id
 join private.discipline_capability_values v on v.activity_id=a.id and v.team_id=a.team_id and v.organization_id=a.organization_id
 join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
 join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
 join public.disciplines d on d.id=s.discipline_id
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
  and exists(select 1 from jsonb_array_elements_text(r.definition#>'{notifications,beforeStartHours}') h
   where a.starts_at-h::integer*interval '1 hour'<=now()
    and not exists(select 1 from private.capability_notification_checks c where c.activity_id=a.id
      and c.capability_id=r.capability_id and c.before_start_hours=h::integer))
 order by a.id,r.capability_id limit greatest(1,least(batch_size,500))
) candidates;
$$;
revoke all on function public.load_capability_contexts(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.load_capability_contexts(uuid,text,integer) to service_role;

-- Trusted capability proposals carry ready messages. Authorization and durable
-- deduplication belong to this enqueue transaction, never to delivery.
create function private.queue_evaluated_capability_notifications(evaluation jsonb) returns integer
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
  insert into public.audit_log(organization_id,action,entity_type,entity_id,details)
   values(a.organization_id,'capability_notification.queued','activity',a.id::text,
    jsonb_build_object('capabilityId',proposal->>'capabilityId','beforeStartHours',stage,'recipientCount',inserted));
 end loop;
 return queued;
end $$;
revoke all on function private.queue_evaluated_capability_notifications(jsonb) from public,anon,authenticated;

-- Old workers can continue other handlers during rolling deployment; they cannot
-- evaluate discipline notifications or consume their schedules with old profiles.
create or replace function public.queue_due_capability_notifications(profiles jsonb,batch_size integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Capability evaluation belongs to scheduled-task-worker' using errcode='22023';
end $$;

create or replace function public.run_due_scheduled_tasks(profiles jsonb, batch_size integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task record; queued integer; completed integer:=0; failed integer:=0; messages integer:=0;
begin
  -- Row locks are held until enqueue/checkpoint commit. A crashed RPC rolls
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
        when 'discipline_notifications' then
          if jsonb_typeof(profiles)='array' then continue; end if;
          queued:=private.queue_evaluated_capability_notifications(profiles);
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


create or replace function private.render_outgoing_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare title text:=coalesce(nullif(new.payload->>'title',''),'Aktivitet'); subject text; body text;
  when_text text:=''; location_text text:=''; zone text;
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
    raise exception 'Capability notifications require a ready message' using errcode='22023';
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
