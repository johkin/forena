-- Pre-launch replacement: deliberately discard old system/club/scope values.
drop function public.save_activity_defaults(uuid,text,uuid,uuid,integer,jsonb);
drop table public.activity_defaults;
drop function public.validate_activity_defaults_patch(jsonb);
alter function public.can_manage_activity_defaults(text,uuid,uuid) rename to can_manage_discipline_defaults;

create or replace function public.can_manage_discipline_defaults(target_scope text,target_organization_id uuid,target_scope_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and case target_scope
 when 'section' then exists(select 1 from public.sections s where s.id=target_scope_id and s.organization_id=target_organization_id)
 and (public.has_organization_role(target_organization_id,array['owner','admin']) or public.has_section_role(target_scope_id,array['section_admin']))
 when 'team' then exists(select 1 from public.teams t where t.id=target_scope_id and t.organization_id=target_organization_id)
 and public.has_team_permission(target_scope_id,'activity.manage') else false end;
$$;

-- A section is the single source of discipline identity. Legacy nullable columns
-- stay temporarily for unrelated clients, but no defaults resolver reads them.
create or replace function public.resolve_team_discipline(target_team_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select s.discipline_id from public.teams t join public.sections s
 on s.id=t.section_id and s.organization_id=t.organization_id where t.id=target_team_id;
$$;

create or replace function public.set_activity_discipline(target_scope text,target_organization_id uuid,target_scope_id uuid,target_discipline_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if target_scope<>'section' or not coalesce(public.can_manage_discipline_defaults(target_scope,target_organization_id,target_scope_id),false) then
 raise exception 'Forbidden' using errcode='42501'; end if;
 update public.sections set discipline_id=target_discipline_id where id=target_scope_id and organization_id=target_organization_id;
end $$;

-- Allow explicit multi-day events up to seven elapsed days.
create or replace function public.validate_discipline_timing_patch(patch jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; r text; n numeric; option_key text; choices jsonb; choice jsonb; begin
 if jsonb_typeof(patch)<>'object' then return false; end if;
 for k,v in select * from jsonb_each(patch) loop
  if k='options' then
   if v='null'::jsonb then continue; end if;
   if jsonb_typeof(v)<>'object' then return false; end if;
   for option_key,choices in select * from jsonb_each(v) loop
    if option_key not in ('duration','gatheringRule','invitationRule','responseDueRule','reminderRules') then return false; end if;
    if choices='null'::jsonb then continue; end if;
    if jsonb_typeof(choices)<>'array' then return false; end if;
    if jsonb_array_length(choices)<1 or jsonb_array_length(choices)>32 then return false; end if;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(choices)) then return false; end if;
    for choice in select value from jsonb_array_elements(choices) loop
     if jsonb_typeof(choice)<>'string' then return false; end if;
     -- These zero-offset choices can never satisfy strict schedule ordering.
     if option_key in ('invitationRule','reminderRules') and (choice #>> '{}') !~ '/d$'
       and not exists(select 1 from regexp_matches(choice #>> '{}','-([0-9]+)([dhm])','g') m where m[1]::numeric>0)
       then return false; end if;
     if not public.validate_discipline_timing_patch(jsonb_build_object(option_key,
       case when option_key='reminderRules' then jsonb_build_array(choice) else choice end)) then return false; end if;
    end loop;
   end loop;
   continue;
  end if;
  if k not in ('duration','gatheringRule','invitationRule','responseDueRule','reminderRules') then return false; end if;
  if v='null'::jsonb then continue; end if;
  if k='reminderRules' then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>5 then return false; end if;
   if (select count(*)<>count(distinct value) from jsonb_array_elements(v)) then return false; end if;
   if exists(select 1 from jsonb_array_elements(v) item where jsonb_typeof(item)<>'string') then return false; end if;
   for r in select value #>> '{}' from jsonb_array_elements(v) loop
    if not public.valid_activity_time_rule(r,'deadline') then return false; end if;
   end loop;
  else
   if jsonb_typeof(v)<>'string' then return false; end if;
   r:=v #>> '{}';
   if k='duration' then
    if r !~ '^PT([0-9]{1,4}H)?([0-9]{1,5}M)?$' or r='PT' then return false; end if;
    n:=coalesce((substring(r from '([0-9]+)H'))::numeric,0)*60+coalesce((substring(r from '([0-9]+)M'))::numeric,0);
    if n<1 or n>10080 then return false; end if;
   elsif not public.valid_activity_time_rule(r,'start') then return false; end if;
  end if;
 end loop;
 return true;
end $$;

revoke all on function public.validate_discipline_timing_patch(jsonb) from public, anon, authenticated;

create function public.validate_discipline_defaults_patch(patch jsonb,discipline_key text,type_slug text,category text)
returns boolean language plpgsql immutable set search_path='' as $$
declare caps jsonb; settings jsonb; k text; v jsonb;
begin
 if patch is null or jsonb_typeof(patch) is distinct from 'object' or not public.validate_discipline_timing_patch(patch-'capabilities') then return false; end if;
 caps:=patch->'capabilities';
 if caps is null or caps='null'::jsonb then return true; end if;
 if jsonb_typeof(caps)<>'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(caps) c where c<>'targetTeamSize') then return false; end if;
 if not (caps ? 'targetTeamSize') then return true; end if;
 if discipline_key is distinct from 'football' or type_slug is distinct from 'match-tavling' or category is distinct from 'competition' then return false; end if;
 settings:=caps->'targetTeamSize';
 if settings='null'::jsonb then return true; end if;
 if jsonb_typeof(settings)<>'object' then return false; end if;
 for k,v in select * from jsonb_each(settings) loop
  if k not in ('notificationsEnabled','notificationHours') then return false; end if;
  if v='null'::jsonb then continue; end if;
  if k='notificationsEnabled' then
   if jsonb_typeof(v)<>'boolean' then return false; end if;
  else
   if jsonb_typeof(v)<>'array' then return false; end if;
   if jsonb_array_length(v)>5 or (select count(*)<>count(distinct value) from jsonb_array_elements(v)) then return false; end if;
   if exists(select 1 from jsonb_array_elements(v) h where jsonb_typeof(h)<>'number' or h::text !~ '^[0-9]+$' or (h::text)::numeric not between 1 and 720) then return false; end if;
  end if;
 end loop;
 return true;
end $$;
revoke all on function public.validate_discipline_defaults_patch(jsonb,text,text,text) from public,anon,authenticated;

create table public.section_discipline_defaults (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 section_id uuid not null,
 discipline_id uuid not null references public.disciplines(id),
 activity_type_id uuid not null references public.activity_types(id) on delete cascade,
 version text not null default '1.0.0' check(version='1.0.0'),
 revision integer not null default 1 check(revision>0),
 values jsonb not null default '{}',
 updated_at timestamptz not null default now(),
 foreign key (section_id,organization_id) references public.sections(id,organization_id) on delete cascade,
 unique(section_id,discipline_id,activity_type_id),
 check(jsonb_typeof(values)='object')
);
alter table public.section_discipline_defaults enable row level security;
revoke all on public.section_discipline_defaults from public,anon,authenticated;
grant select on public.section_discipline_defaults to authenticated;
create index section_discipline_defaults_org_idx on public.section_discipline_defaults(organization_id);

create table public.team_discipline_defaults (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 team_id uuid not null,
 discipline_id uuid not null references public.disciplines(id),
 activity_type_id uuid not null references public.activity_types(id) on delete cascade,
 version text not null default '1.0.0' check(version='1.0.0'),
 revision integer not null default 1 check(revision>0),
 values jsonb not null default '{}',
 updated_at timestamptz not null default now(),
 foreign key (team_id,organization_id) references public.teams(id,organization_id) on delete cascade,
 unique(team_id,discipline_id,activity_type_id),
 check(jsonb_typeof(values)='object')
);
alter table public.team_discipline_defaults enable row level security;
revoke all on public.team_discipline_defaults from public,anon,authenticated;
grant select on public.team_discipline_defaults to authenticated;
create index team_discipline_defaults_org_idx on public.team_discipline_defaults(organization_id);

create policy "read section discipline defaults" on public.section_discipline_defaults for select to authenticated using (
 public.has_organization_role(organization_id,array['owner','admin']) or public.has_section_role(section_id,array['section_admin'])
 or exists(select 1 from public.teams t where t.section_id=section_discipline_defaults.section_id and t.organization_id=section_discipline_defaults.organization_id and public.has_team_permission(t.id,'activity.manage')));
create policy "read team discipline defaults" on public.team_discipline_defaults for select to authenticated using (public.has_team_permission(team_id,'activity.manage'));

-- Lock the section and team while resolving identity, so a discipline switch or
-- team move cannot race a stale form. Updates are optimistic per defaults row.
create function public.save_discipline_defaults(target_type_id uuid,target_scope text,target_organization_id uuid,target_scope_id uuid,expected_revision integer,expected_discipline_id uuid,expected_version text,patch jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; section_id uuid; actual_discipline uuid; discipline_key text; t public.activity_types; table_name text; scope_column text;
begin
 if not coalesce(public.can_manage_discipline_defaults(target_scope,target_organization_id,target_scope_id),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 if target_scope='team' then
  select team.section_id into section_id from public.teams team where team.id=target_scope_id and team.organization_id=target_organization_id for share;
 else section_id:=target_scope_id; end if;
 select s.discipline_id into actual_discipline from public.sections s where s.id=section_id and s.organization_id=target_organization_id for share;
 if actual_discipline is null or actual_discipline is distinct from expected_discipline_id or expected_version is distinct from '1.0.0' then raise exception 'Discipline changed; reload' using errcode='40001'; end if;
 select key into discipline_key from public.disciplines where id=actual_discipline;
 select * into t from public.activity_types where id=target_type_id for share;
 if t.id is null or not t.active or (t.organization_id is not null and t.organization_id is distinct from target_organization_id)
 or (t.discipline_id is not null and t.discipline_id is distinct from actual_discipline)
 or expected_revision is null or expected_revision<0 or not public.validate_discipline_defaults_patch(patch,discipline_key,t.slug,t.system_category)
 then raise exception 'Invalid defaults' using errcode='22023'; end if;
 -- Identifiers derive exclusively from the two authorized scopes, never input.
 table_name:=target_scope||'_discipline_defaults'; scope_column:=target_scope||'_id';
 if expected_revision=0 then
  execute format('insert into public.%I(organization_id,%I,discipline_id,activity_type_id,version,values) values($1,$2,$3,$4,$5,$6) on conflict do nothing returning id',table_name,scope_column)
  into result using target_organization_id,target_scope_id,actual_discipline,target_type_id,expected_version,patch;
 else
  execute format('update public.%I set values=$1,revision=revision+1,updated_at=now() where organization_id=$2 and %I=$3 and discipline_id=$4 and activity_type_id=$5 and version=$6 and revision=$7 returning id',table_name,scope_column)
  into result using patch,target_organization_id,target_scope_id,actual_discipline,target_type_id,expected_version,expected_revision;
 end if;
 if result is null then raise exception 'Defaults changed; reload' using errcode='40001'; end if;
 return result;
end $$;
revoke all on function public.save_discipline_defaults(uuid,text,uuid,uuid,integer,uuid,text,jsonb) from public,anon;
grant execute on function public.save_discipline_defaults(uuid,text,uuid,uuid,integer,uuid,text,jsonb) to authenticated;

create or replace function public.football_fields(
  target_team_id uuid, target_scope text, target_activity_id uuid default null,
  target_person_id uuid default null, new_values jsonb default null,
  expected_revision integer default null, selected_source text default 'acceptedActivityPlayers'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teams%rowtype; a public.activities%rowtype; r private.football_values%rowtype;
  permitted boolean; can_manage_invitations boolean; enabled boolean; editable boolean := true; day date; org_zone text;
  team_players jsonb := '[]'; accepted_players jsonb := '[]'; participants jsonb := '[]';
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
    or (target_scope='activity' and new_values ? 'captainPersonId')) then
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
    -- A restricted editor replaces only visible fields. Keep the hidden captain
    -- without revalidating its invitation state (which would be an oracle).
    if target_scope='activity' and not can_manage_invitations then
      if r.values ? 'captainPersonId' then
        new_values := new_values || jsonb_build_object('captainPersonId',r.values->'captainPersonId');
      end if;
      selected_source := coalesce(r.captain_source,'acceptedActivityPlayers');
    end if;
    insert into private.football_values(organization_id,team_id,scope,activity_id,person_id,values,captain_source)
      values(t.organization_id,t.id,target_scope,target_activity_id,target_person_id,new_values,selected_source)
      on conflict (team_id,scope,activity_id,person_id) do update set values=excluded.values,captain_source=excluded.captain_source,revision=private.football_values.revision+1,updated_at=now()
      returning * into r;
    if target_activity_id is not null then update public.activities set series_exception=true where id=target_activity_id; end if;
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
      values(t.organization_id,auth.uid(),'football_values.saved','football_values',r.id::text,jsonb_build_object('scope',target_scope,'revision',r.revision));
  end if;
  return jsonb_build_object('enabled',true,'editable',editable,'version','1.0.0','canManageInvitations',can_manage_invitations,
    'values',case when target_scope='activity' and not can_manage_invitations then coalesce(r.values,'{}')-'captainPersonId' else coalesce(r.values,'{}') end,'revision',coalesce(r.revision,0),
    'captainSource',case when can_manage_invitations then coalesce(r.captain_source,'acceptedActivityPlayers') else 'teamPlayers' end,'teamPlayers',team_players,'acceptedPlayers',accepted_players,'participants',participants);
end;
$$;

-- Code-owned definition mirrored from _shared/discipline-capabilities.ts; a
-- parity test guards this creation-time snapshot. Discipline defaults are off.
create function private.snapshot_discipline_capabilities() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_section_id uuid; v_discipline_id uuid; key text; section_settings jsonb; team_settings jsonb;
 enabled boolean; hours jsonb; definition jsonb := '{"id":"targetTeamSize","version":"1.0.0","defaults":{"notificationsEnabled":false},"field":{"key":"targetTeamSize","label":"Önskad matchtrupp","min":1,"max":100},"appliesTo":{"activityTypeSlugs":["match-tavling"],"categories":["competition"]},"notifications":{"type":"team_size_shortage","beforeStartHours":[72,24],"recipients":"teamInvitationManagers"}}'::jsonb;
begin
 select t.section_id,s.discipline_id,d.key into v_section_id,v_discipline_id,key
 from public.teams t join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
 join public.disciplines d on d.id=s.discipline_id where t.id=new.team_id and t.organization_id=new.organization_id;
 if key is distinct from 'football' or not exists(select 1 from public.activity_types at where at.id=new.activity_type_id and at.slug='match-tavling' and at.system_category='competition') then return new; end if;
 select dd.values#>'{capabilities,targetTeamSize}' into section_settings from public.section_discipline_defaults dd
 where dd.section_id=v_section_id and dd.discipline_id=v_discipline_id and dd.activity_type_id=new.activity_type_id and dd.version='1.0.0';
 select dd.values#>'{capabilities,targetTeamSize}' into team_settings from public.team_discipline_defaults dd
 where dd.team_id=new.team_id and dd.discipline_id=v_discipline_id and dd.activity_type_id=new.activity_type_id and dd.version='1.0.0';
 enabled:=coalesce((team_settings->>'notificationsEnabled')::boolean,(section_settings->>'notificationsEnabled')::boolean,(definition#>>'{defaults,notificationsEnabled}')::boolean);
 hours:=coalesce(nullif(team_settings->'notificationHours','null'::jsonb),nullif(section_settings->'notificationHours','null'::jsonb),definition#>'{notifications,beforeStartHours}');
 if enabled and jsonb_array_length(hours)>0 then
  definition:=jsonb_set(definition,'{notifications,beforeStartHours}',hours);
  insert into private.activity_capability_rules(activity_id,capability_id,definition) values(new.id,'targetTeamSize',definition);
 end if;
 return new;
end $$;
revoke all on function private.snapshot_discipline_capabilities() from public,anon,authenticated;
create trigger snapshot_discipline_capabilities after insert on public.activities for each row execute function private.snapshot_discipline_capabilities();

-- No backfill: a worker may only process snapshots made at activity creation.
create or replace function public.queue_due_capability_notifications(profiles jsonb, batch_size integer default 100)
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
          and d.key=v.discipline_key
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
create or replace function public.prepare_capability_notification(target_outbox_id uuid)
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
    and d.key=v.discipline_key
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

create or replace function private.snapshot_football_defaults() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
  if exists(select 1 from public.activity_types where id=new.activity_type_id and slug='match-tavling' and system_category='competition')
    and exists(select 1 from public.teams t join public.sections s on s.id=t.section_id join public.disciplines d on d.id=s.discipline_id
      where t.id=new.team_id and t.organization_id=new.organization_id and s.organization_id=new.organization_id and d.key='football') then
    select values into v from private.football_values where team_id=new.team_id and scope='team';
    insert into private.football_values(organization_id,team_id,scope,activity_id,values)
      values(new.organization_id,new.team_id,'activity',new.id,coalesce(v,'{}'));
  end if;
  return new;
end;
$$;
