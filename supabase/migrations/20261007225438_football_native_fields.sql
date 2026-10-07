-- Code-owned football v1 values. No direct Data API grants: all access goes
-- through the authenticated RPC, including team/target/revision validation.
create table private.football_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  scope text not null check (scope in ('team','teamMembership','activity','activityParticipation')),
  activity_id uuid references public.activities(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  version text not null default '1.0.0' check (version = '1.0.0'),
  values jsonb not null default '{}' check (jsonb_typeof(values) = 'object'),
  captain_source text not null default 'acceptedActivityPlayers' check (captain_source in ('teamPlayers','acceptedActivityPlayers')),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check ((scope='team' and activity_id is null and person_id is null)
    or (scope='teamMembership' and activity_id is null and person_id is not null)
    or (scope='activity' and activity_id is not null and person_id is null)
    or (scope='activityParticipation' and activity_id is not null and person_id is not null)),
  unique nulls not distinct (team_id, scope, activity_id, person_id)
);
create index football_values_activity_idx on private.football_values(activity_id) where activity_id is not null;
create index football_values_person_idx on private.football_values(person_id) where person_id is not null;
alter table private.football_values enable row level security;
revoke all on private.football_values from public, anon, authenticated;

create function private.validate_football_values(s text, v jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; x jsonb; allowed text[]; n numeric;
begin
  if jsonb_typeof(v) is distinct from 'object' or octet_length(v::text)>4096 then raise exception 'Invalid football values' using errcode='22023'; end if;
  allowed := case s
    when 'team' then array['gameFormat','targetTeamSize','requiredGoalkeepers','periods','periodMinutes']
    when 'activity' then array['gameFormat','targetTeamSize','requiredGoalkeepers','periods','periodMinutes','venue','captainPersonId']
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

create function public.football_fields(
  target_team_id uuid, target_scope text, target_activity_id uuid default null,
  target_person_id uuid default null, new_values jsonb default null,
  expected_revision integer default null, selected_source text default 'acceptedActivityPlayers'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teams%rowtype; a public.activities%rowtype; r private.football_values%rowtype;
  permitted boolean; enabled boolean; editable boolean := true; day date; org_zone text;
  team_players jsonb := '[]'; accepted_players jsonb := '[]'; participants jsonb := '[]';
  candidate jsonb; captain uuid; captain_role text; activity_slug text; activity_category text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if target_scope is null or target_scope not in ('team','teamMembership','activity','activityParticipation') then raise exception 'Invalid scope' using errcode='22023'; end if;
  -- All saves serialize on the owning team, including first insert at revision 0.
  select * into t from public.teams where id=target_team_id for update;
  if not found then raise exception 'Team not found' using errcode='P0002'; end if;
  permitted := case when target_scope='team' then public.can_manage_activity_defaults('team',t.organization_id,t.id)
    when target_scope='teamMembership' then public.has_team_permission(t.id,'roster.manage')
    else public.has_team_permission(t.id,'activity.manage') end;
  if not coalesce(permitted,false) then raise exception 'Permission denied' using errcode='42501'; end if;
  if (target_scope in ('team','teamMembership') and target_activity_id is not null)
    or (target_scope in ('team','activity') and target_person_id is not null)
    or (target_scope in ('activity','activityParticipation') and target_activity_id is null)
    or (target_scope in ('teamMembership','activityParticipation') and target_person_id is null) then
    raise exception 'Invalid target' using errcode='22023'; end if;
  select time_zone into org_zone from public.organizations where id=t.organization_id;
  day := (now() at time zone org_zone)::date;
  select exists(select 1 from public.sections s join public.disciplines d on d.id=s.discipline_id
    where s.id=t.section_id and s.organization_id=t.organization_id and d.key='football'
      and (t.discipline_id is null or t.discipline_id=d.id)) into enabled;
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
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name,p.id),'[]') into participants
      from public.people p join public.invitations i on i.person_id=p.id where i.activity_id=a.id and i.organization_id=t.organization_id and p.organization_id=t.organization_id
      and (i.activity_role='participant' or (i.activity_role is null and exists(select 1 from jsonb_array_elements(team_players) x where x->>'id'=p.id::text)));
    select coalesce(jsonb_agg(x),'[]') into accepted_players from jsonb_array_elements(participants) x
      where exists(select 1 from public.invitations i where i.activity_id=a.id and i.person_id=(x->>'id')::uuid and i.response='accepted');
    if jsonb_array_length(team_players)>500 or jsonb_array_length(participants)>500 then raise exception 'Too many players' using errcode='54000'; end if;
  end if;
  select * into r from private.football_values where team_id=t.id and scope=target_scope and activity_id is not distinct from target_activity_id and person_id is not distinct from target_person_id;
  if new_values is not null then
    if not editable then raise exception 'Activity is read only' using errcode='55000'; end if;
    if expected_revision is null or expected_revision<>coalesce(r.revision,0) then raise exception 'Values changed; reload' using errcode='40001'; end if;
    if selected_source is null or selected_source not in ('teamPlayers','acceptedActivityPlayers') then raise exception 'Invalid player source' using errcode='22023'; end if;
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
    insert into private.football_values(organization_id,team_id,scope,activity_id,person_id,values,captain_source)
      values(t.organization_id,t.id,target_scope,target_activity_id,target_person_id,new_values,selected_source)
      on conflict (team_id,scope,activity_id,person_id) do update set values=excluded.values,captain_source=excluded.captain_source,revision=private.football_values.revision+1,updated_at=now()
      returning * into r;
    if target_activity_id is not null then update public.activities set series_exception=true where id=target_activity_id; end if;
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
      values(t.organization_id,auth.uid(),'football_values.saved','football_values',r.id::text,jsonb_build_object('scope',target_scope,'revision',r.revision));
  end if;
  return jsonb_build_object('enabled',true,'editable',editable,'version','1.0.0','values',coalesce(r.values,'{}'),'revision',coalesce(r.revision,0),
    'captainSource',coalesce(r.captain_source,'acceptedActivityPlayers'),'teamPlayers',team_players,'acceptedPlayers',accepted_players,'participants',participants);
end;
$$;
revoke all on function public.football_fields(uuid,text,uuid,uuid,jsonb,integer,text) from public,anon;
grant execute on function public.football_fields(uuid,text,uuid,uuid,jsonb,integer,text) to authenticated;

-- Capture defaults once for every new match, including generated series.
create function private.snapshot_football_defaults() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
  if exists(select 1 from public.activity_types where id=new.activity_type_id and slug='match-tavling' and system_category='competition')
    and exists(select 1 from public.teams t join public.sections s on s.id=t.section_id join public.disciplines d on d.id=s.discipline_id
      where t.id=new.team_id and t.organization_id=new.organization_id and s.organization_id=new.organization_id and d.key='football' and (t.discipline_id is null or t.discipline_id=d.id)) then
    select values into v from private.football_values where team_id=new.team_id and scope='team';
    insert into private.football_values(organization_id,team_id,scope,activity_id,values)
      values(new.organization_id,new.team_id,'activity',new.id,coalesce(v,'{}'));
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_football_defaults() from public,anon,authenticated;
create trigger snapshot_football_defaults after insert on public.activities for each row execute function private.snapshot_football_defaults();
