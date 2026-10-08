-- Installed code-owned package data. Kernel functions contain no sport identifiers.
create extension if not exists pg_jsonschema with schema extensions;
create table private.discipline_packages (
 discipline_key text not null references public.disciplines(key),version text not null,
 manifest jsonb not null check(jsonb_typeof(manifest)='object'),active boolean not null default true,
 primary key(discipline_key,version)
);
create unique index discipline_packages_active_idx on private.discipline_packages(discipline_key) where active;
alter table private.discipline_packages enable row level security;
revoke all on private.discipline_packages from public,anon,authenticated;
-- Generated from the package's versioned database-manifest.json (parity tested).
insert into private.discipline_packages(discipline_key,version,manifest) values ('football','1.0.0','{"key":"football","version":"1.0.0","schemas":{"section":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{},"additionalProperties":false},"team":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"gameFormat":{"type":"string","enum":["3v3","5v5","7v7","9v9","11v11"],"title":"Spelform"},"targetTeamSize":{"type":"integer","minimum":1,"maximum":100,"title":"Önskad matchtrupp"},"requiredGoalkeepers":{"type":"integer","minimum":0,"maximum":10,"title":"Önskat antal målvakter"},"periods":{"type":"integer","minimum":1,"maximum":10,"title":"Antal perioder"},"periodMinutes":{"type":"integer","minimum":1,"maximum":120,"title":"Minuter per period"}},"additionalProperties":false},"teamMembership":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"shirtNumber":{"type":"integer","minimum":0,"maximum":999,"title":"Tröjnummer","description":"Lagets nummer; tävlingens regler kontrolleras separat."},"positions":{"maxItems":4,"type":"array","items":{"type":"string","enum":["goalkeeper","defender","midfielder","forward"]},"title":"Positioner","uniqueItems":true}},"additionalProperties":false},"activity":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"gameFormat":{"type":"string","enum":["3v3","5v5","7v7","9v9","11v11"],"title":"Spelform"},"targetTeamSize":{"type":"integer","minimum":1,"maximum":100,"title":"Önskad matchtrupp"},"requiredGoalkeepers":{"type":"integer","minimum":0,"maximum":10,"title":"Önskat antal målvakter"},"periods":{"type":"integer","minimum":1,"maximum":10,"title":"Antal perioder"},"periodMinutes":{"type":"integer","minimum":1,"maximum":120,"title":"Minuter per period"},"captainSource":{"type":"string","enum":["teamPlayers","acceptedActivityPlayers"],"title":"Spelarurval för lagkapten"},"captainPersonId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$","title":"Lagkapten","x-player-reference":{"entity":"person","role":"player","defaultSource":"acceptedActivityPlayers","allowedSources":["teamPlayers","acceptedActivityPlayers"],"appliesTo":{"activityTypeSlugs":["match-tavling"],"categories":["competition"]}}},"venue":{"type":"string","enum":["home","away","neutral"],"title":"Hemma/borta"}},"additionalProperties":false},"activityParticipation":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"shirtNumber":{"type":"integer","minimum":0,"maximum":999,"title":"Tröjnummer","description":"Lagets nummer; tävlingens regler kontrolleras separat."},"position":{"type":"string","enum":["goalkeeper","defender","midfielder","forward"],"title":"Position i matchen"}},"additionalProperties":false}},"capabilities":[{"id":"targetTeamSize","version":"1.0.0","defaults":{"notificationsEnabled":false},"field":{"key":"targetTeamSize","label":"Önskad matchtrupp","min":1,"max":100},"appliesTo":{"activityTypeSlugs":["match-tavling"],"categories":["competition"]},"notifications":{"type":"team_size_shortage","beforeStartHours":[72,24],"recipients":"teamInvitationManagers"}}],"appliesTo":{"activityTypeSlugs":["match-tavling"],"categories":["competition"]},"invitationFields":["captainPersonId","captainSource"],"activityReference":{"field":"captainPersonId","sourceField":"captainSource","entity":"person","role":"player","defaultSource":"acceptedActivityPlayers","allowedSources":["teamPlayers","acceptedActivityPlayers"],"appliesTo":{"activityTypeSlugs":["match-tavling"],"categories":["competition"]}},"initialization":{"scope":"activity","fromScope":"team","copyFields":["gameFormat","targetTeamSize","requiredGoalkeepers","periods","periodMinutes"],"defaults":{"captainSource":"acceptedActivityPlayers"}},"constraints":[{"scopes":["team","activity"],"left":"targetTeamSize","operator":"gte","lookup":{"field":"gameFormat","values":{"3v3":3,"5v5":5,"7v7":7,"9v9":9,"11v11":11}}},{"scopes":["team","activity"],"left":"requiredGoalkeepers","operator":"lte","right":"targetTeamSize"}]}');

create function private.validate_discipline_values(package_key text,package_version text,target_scope text,v jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare spec jsonb; constraint_rule jsonb; left_value numeric; right_value numeric;
begin
 select manifest into spec from private.discipline_packages where discipline_key=package_key and version=package_version;
 if not found or spec#>array['schemas',target_scope] is null or jsonb_typeof(v) is distinct from 'object'
  or octet_length(v::text)>4096 or not extensions.jsonb_matches_schema((spec#>array['schemas',target_scope])::json,v) then
  raise exception 'Invalid discipline values' using errcode='22023'; end if;
 for constraint_rule in select value from jsonb_array_elements(coalesce(spec->'constraints','[]')) loop
  if not (constraint_rule->'scopes') ? target_scope or not v ? (constraint_rule->>'left') then continue; end if;
  left_value:=(v->>(constraint_rule->>'left'))::numeric;
  right_value:=case when constraint_rule ? 'lookup' then
    (constraint_rule#>array['lookup','values',v->>(constraint_rule#>>'{lookup,field}')])::text::numeric
   else (v->>(constraint_rule->>'right'))::numeric end;
  if right_value is null then continue; end if;
  if (constraint_rule->>'operator'='gte' and left_value<right_value)
   or (constraint_rule->>'operator'='lte' and left_value>right_value) then
   raise exception 'Invalid discipline relationship' using errcode='22023'; end if;
 end loop;
end $$;
revoke all on function private.validate_discipline_values(text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.validate_discipline_defaults_patch(patch jsonb,discipline_key text,type_slug text,category text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare caps jsonb; spec jsonb; capability_key text; settings jsonb; binding jsonb; field text; input jsonb;
begin
 if patch is null or jsonb_typeof(patch) is distinct from 'object' or not public.validate_discipline_timing_patch(patch-'capabilities') then return false; end if;
 caps:=patch->'capabilities';
 if caps is null or caps='null'::jsonb then return true; end if;
 if jsonb_typeof(caps)<>'object' then return false; end if;
 select manifest into spec from private.discipline_packages p where p.discipline_key=validate_discipline_defaults_patch.discipline_key and p.active;
 for capability_key,settings in select * from jsonb_each(caps) loop
  select value into binding from jsonb_array_elements(coalesce(spec->'capabilities','[]')) c
   where c->>'id'=capability_key and c#>'{appliesTo,activityTypeSlugs}' ? type_slug and c#>'{appliesTo,categories}' ? category;
  if not found then return false; end if;
  if settings='null'::jsonb then continue; end if;
  if jsonb_typeof(settings)<>'object' then return false; end if;
  for field,input in select * from jsonb_each(settings) loop
   if field not in ('notificationsEnabled','notificationHours') then return false; end if;
   if input='null'::jsonb then continue; end if;
   if field='notificationsEnabled' then if jsonb_typeof(input)<>'boolean' then return false; end if;
   else
    if jsonb_typeof(input)<>'array' then return false; end if;
    if jsonb_array_length(input)>5 or (select count(*)<>count(distinct value) from jsonb_array_elements(input))
     or exists(select 1 from jsonb_array_elements(input) h where jsonb_typeof(h)<>'number' or h::text !~ '^[0-9]+$' or (h::text)::numeric not between 1 and 720) then return false; end if;
   end if;
  end loop;
 end loop;
 return true;
end $$;
create function public.discipline_fields(
  target_team_id uuid, target_scope text, target_activity_id uuid default null,
  target_person_id uuid default null, new_values jsonb default null,
  expected_revision integer default null, expected_discipline_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teams%rowtype; a public.activities%rowtype; r private.discipline_values%rowtype;
  permitted boolean; can_manage_invitations boolean; enabled boolean; editable boolean := true; day date; org_zone text;
  team_players jsonb := '[]'; accepted_players jsonb := '[]'; participants jsonb := '[]';
  package_id uuid; package_key text; package_version text; spec jsonb; reference_key text; source_key text; selected_source text;
  candidate jsonb; referenced_person uuid; participant_role text; activity_slug text; activity_category text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if target_scope is null or target_scope not in ('team','teamMembership','activity','activityParticipation') then raise exception 'Invalid scope' using errcode='22023'; end if;
  -- All saves serialize on the owning team, including first insert at revision 0.
  select * into t from public.teams where id=target_team_id for update;
  if not found then raise exception 'Team not found' using errcode='P0002'; end if;
  select d.id,d.key,p.version,p.manifest into package_id,package_key,package_version,spec
   from public.sections s join public.disciplines d on d.id=s.discipline_id
   left join private.discipline_packages p on p.discipline_key=d.key and p.active
   where s.id=t.section_id and s.organization_id=t.organization_id for share of s;
  reference_key:=spec#>>'{activityReference,field}'; source_key:=spec#>>'{activityReference,sourceField}';
  permitted := case when target_scope='team' then public.can_manage_discipline_defaults('team',t.organization_id,t.id)
    when target_scope='teamMembership' then public.has_team_permission(t.id,'roster.manage')
    else public.has_team_permission(t.id,'activity.manage') end;
  if not coalesce(permitted,false) then raise exception 'Permission denied' using errcode='42501'; end if;
  if new_values is not null and expected_discipline_key is distinct from package_key then
   raise exception 'Discipline changed; reload' using errcode='40001'; end if;
  can_manage_invitations := coalesce(public.has_team_permission(t.id,'invitation.manage'),false);
  -- Reject before looking up any invitation/person: errors must not reveal eligibility.
  if not can_manage_invitations and (target_scope='activityParticipation'
    or (target_scope='activity' and exists(select 1 from jsonb_array_elements_text(coalesce(spec->'invitationFields','[]')) k where new_values ? k))) then
    raise exception 'Invitation permission required' using errcode='42501';
  end if;
  if (target_scope in ('team','teamMembership') and target_activity_id is not null)
    or (target_scope in ('team','activity') and target_person_id is not null)
    or (target_scope in ('activity','activityParticipation') and target_activity_id is null)
    or (target_scope in ('teamMembership','activityParticipation') and target_person_id is null) then
    raise exception 'Invalid target' using errcode='22023'; end if;
  select time_zone into org_zone from public.organizations where id=t.organization_id;
  day := (now() at time zone org_zone)::date;
  enabled:=spec is not null;
  if target_activity_id is not null then
    select * into a from public.activities where id=target_activity_id and team_id=t.id and organization_id=t.organization_id for update;
    if not found then raise exception 'Activity not found' using errcode='P0002'; end if;
    select slug,system_category into activity_slug,activity_category from public.activity_types where id=a.activity_type_id;
    enabled := enabled and spec#>'{appliesTo,activityTypeSlugs}' ? activity_slug and spec#>'{appliesTo,categories}' ? activity_category;
    editable := a.status<>'cancelled' and a.source_kind<>'imported' and a.ends_at>now();
    day := (a.starts_at at time zone org_zone)::date;
  end if;
  if target_person_id is not null and not exists(select 1 from public.people where id=target_person_id and organization_id=t.organization_id) then raise exception 'Person not found' using errcode='P0002'; end if;
  if target_scope='teamMembership' and not exists(select 1 from public.memberships where team_id=t.id and organization_id=t.organization_id and person_id=target_person_id and role='participant' and starts_on<=day and (ends_on is null or ends_on>=day)) then raise exception 'Player not in team' using errcode='22023'; end if;
  if target_scope='activityParticipation' and not exists(select 1 from public.invitations i where i.activity_id=a.id and i.organization_id=t.organization_id and i.person_id=target_person_id
    and (i.activity_role='participant' or (i.activity_role is null and exists(select 1 from public.memberships m where m.team_id=t.id and m.person_id=i.person_id and m.role='participant' and m.starts_on<=day and (m.ends_on is null or m.ends_on>=day))))) then raise exception 'Player not in activity' using errcode='22023'; end if;
  if not coalesce(enabled,false) then
    if new_values is not null then raise exception 'Discipline activity fields unavailable' using errcode='22023'; end if;
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
  select * into r from private.discipline_values where discipline_id=package_id and team_id=t.id and scope=target_scope and activity_id is not distinct from target_activity_id and person_id is not distinct from target_person_id;
  if r.id is not null and r.version<>package_version then raise exception 'Unsupported discipline version' using errcode='22023'; end if;
  if new_values is not null then
    if not editable then raise exception 'Activity is read only' using errcode='55000'; end if;
    if expected_revision is null or expected_revision<>coalesce(r.revision,0) then raise exception 'Values changed; reload' using errcode='40001'; end if;
    selected_source := coalesce(new_values->>source_key,spec#>>'{activityReference,defaultSource}');
    if reference_key is not null and (selected_source is null or not (spec#>'{activityReference,allowedSources}') ? selected_source) then raise exception 'Invalid player source' using errcode='22023'; end if;
    if target_scope='activity' and can_manage_invitations and source_key is not null then
      new_values := new_values || jsonb_build_object(source_key,selected_source);
    end if;
    perform private.validate_discipline_values(package_key,package_version,target_scope,new_values);
    if new_values ? reference_key then
      referenced_person := (new_values->>reference_key)::uuid;
      candidate := case selected_source when 'teamPlayers' then team_players else accepted_players end;
      if not exists(select 1 from jsonb_array_elements(candidate) x where x->>'id'=referenced_person::text) then raise exception 'Person not selectable' using errcode='22023'; end if;
      -- Lock eligibility rows until commit; a stale client list is never trusted.
      if selected_source='acceptedActivityPlayers' then
        select activity_role into participant_role from public.invitations where activity_id=a.id and organization_id=t.organization_id and person_id=referenced_person and response='accepted' for update;
        if not found or (participant_role is not null and participant_role<>'participant') then raise exception 'Person eligibility changed' using errcode='40001'; end if;
        if participant_role is null then
          perform 1 from public.memberships where team_id=t.id and organization_id=t.organization_id and person_id=referenced_person and role='participant' and starts_on<=day and (ends_on is null or ends_on>=day) for update;
          if not found then raise exception 'Person eligibility changed' using errcode='40001'; end if;
        end if;
      else
        perform 1 from public.memberships where team_id=t.id and person_id=referenced_person and role='participant' and starts_on<=day and (ends_on is null or ends_on>=day) for update;
        if not found then raise exception 'Person eligibility changed' using errcode='40001'; end if;
      end if;
    end if;
    -- A restricted editor replaces only visible fields. Keep hidden reference fields
    -- without revalidating its invitation state (which would be an oracle).
    if target_scope='activity' and not can_manage_invitations then
      for reference_key in select value from jsonb_array_elements_text(coalesce(spec->'invitationFields','[]')) loop
        if r.values ? reference_key then new_values:=new_values||jsonb_build_object(reference_key,r.values->reference_key); end if;
      end loop;
    end if;
    insert into private.discipline_values(discipline_id,organization_id,team_id,scope,activity_id,person_id,version,values)
      values(package_id,t.organization_id,t.id,target_scope,target_activity_id,target_person_id,package_version,new_values)
      on conflict (discipline_id,team_id,scope,activity_id,person_id) do update set values=excluded.values,revision=private.discipline_values.revision+1,updated_at=now()
      returning * into r;
    if target_activity_id is not null then update public.activities set series_exception=true where id=target_activity_id; end if;
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
      values(t.organization_id,auth.uid(),'discipline_values.saved','discipline_values',r.id::text,jsonb_build_object('disciplineKey',package_key,'scope',target_scope,'revision',r.revision));
  end if;
  return jsonb_build_object('enabled',true,'editable',editable,'version',package_version,'disciplineKey',package_key,'canManageInvitations',can_manage_invitations,
    'values',case when target_scope='activity' and not can_manage_invitations then coalesce(r.values,'{}')-array(select jsonb_array_elements_text(coalesce(spec->'invitationFields','[]'))) else coalesce(r.values,'{}') end,'revision',coalesce(r.revision,0),
    'teamPlayers',team_players,'acceptedPlayers',accepted_players,'participants',participants);
end;
$$;

revoke all on function public.discipline_fields(uuid,text,uuid,uuid,jsonb,integer,text) from public,anon;
grant execute on function public.discipline_fields(uuid,text,uuid,uuid,jsonb,integer,text) to authenticated;

-- Temporary adapter for already open clients; no shared code dispatches through it.
create or replace function public.football_fields(target_team_id uuid,target_scope text,target_activity_id uuid default null,
 target_person_id uuid default null,new_values jsonb default null,expected_revision integer default null,selected_source text default 'acceptedActivityPlayers')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if new_values is not null and target_scope='activity' and coalesce(public.has_team_permission(target_team_id,'invitation.manage'),false) then
  new_values:=new_values||jsonb_build_object('captainSource',coalesce(new_values->>'captainSource',selected_source)); end if;
 result:=public.discipline_fields(target_team_id,target_scope,target_activity_id,target_person_id,new_values,expected_revision,'football');
 if result->>'disciplineKey' is distinct from 'football' then return jsonb_build_object('enabled',false); end if;
 return result||jsonb_build_object('captainSource',case when (result->>'canManageInvitations')::boolean then coalesce(result#>>'{values,captainSource}','acceptedActivityPlayers') else 'teamPlayers' end);
end $$;
drop function private.validate_football_values(text,jsonb);
drop trigger snapshot_football_defaults on public.activities;
drop function private.snapshot_football_defaults();
drop trigger snapshot_discipline_capabilities on public.activities;
drop function private.snapshot_discipline_capabilities();

create table private.discipline_activity_events (
 id bigint generated always as identity primary key,activity_id uuid not null references public.activities(id) on delete cascade,
 discipline_id uuid references public.disciplines(id),discipline_key text,discipline_version text,
 kind text not null check(kind in ('activity.created','activity.updated')),previous_state jsonb,current_state jsonb not null,
 team_values jsonb not null,section_settings jsonb not null,team_settings jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','processed','failed')),
 attempts integer not null default 0,run_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,last_error text,
 created_at timestamptz not null default now(),processed_at timestamptz
);
alter table private.discipline_activity_events enable row level security;
revoke all on private.discipline_activity_events from public,anon,authenticated;
create index discipline_activity_events_due_idx on private.discipline_activity_events(run_at,id) where status in ('pending','processing');
create index discipline_activity_events_order_idx on private.discipline_activity_events(activity_id,id) where status<>'processed';
create table private.discipline_operations (
 id uuid primary key default gen_random_uuid(),activity_id uuid not null references public.activities(id) on delete cascade,
 capability_id text not null,before_start_hours integer not null check(before_start_hours between 1 and 720),
 run_at timestamptz not null,status text not null default 'pending' check(status in ('pending','cancelled','completed')),
 unique(activity_id,capability_id,before_start_hours)
);
alter table private.discipline_operations enable row level security;
revoke all on private.discipline_operations from public,anon,authenticated;
create index discipline_operations_due_idx on private.discipline_operations(run_at,activity_id) where status='pending';
-- Preserve already configured activities and enqueued checkpoints during upgrade.
insert into private.discipline_operations(activity_id,capability_id,before_start_hours,run_at,status)
select a.id,r.capability_id,h::integer,a.starts_at-h::integer*interval '1 hour',
 case when exists(select 1 from private.capability_notification_checks c where c.activity_id=a.id and c.capability_id=r.capability_id and c.before_start_hours=h::integer)
 then 'completed' else 'pending' end
from private.activity_capability_rules r join public.activities a on a.id=r.activity_id
cross join lateral jsonb_array_elements_text(r.definition#>'{notifications,beforeStartHours}') h;

create function private.discipline_activity_state(a public.activities) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',(a).id,'teamId',(a).team_id,'organizationId',(a).organization_id,'title',(a).title,
 'startsAt',(a).starts_at,'endsAt',(a).ends_at,'status',(a).status,'sourceKind',(a).source_kind,
 'description',(a).description_markdown,'location',(a).location,'responseDueAt',(a).response_due_at,'gatheringAt',(a).gathering_at,'invitationSendAt',(a).invitation_send_at,
 'activityTypeSlug',at.slug,'category',at.system_category) from public.activity_types at where at.id=(a).activity_type_id;
$$;
-- Generic transactional capture; package data declares initialization and applicability.
create function private.capture_discipline_activity_event() returns trigger language plpgsql security definer set search_path='' as $$
declare package_id uuid; package_key text; package_version text; spec jsonb; v_section_id uuid;
 v jsonb:='{}'; section_settings jsonb:='{}'; team_settings jsonb:='{}'; binding jsonb; settings jsonb; hours jsonb;
 current_state jsonb; previous_state jsonb; enabled boolean;
begin
 if tg_op='UPDATE' and (to_jsonb(new)-array['updated_at','invitation_materialized_at','invitation_notifications_queued_at'])
  =(to_jsonb(old)-array['updated_at','invitation_materialized_at','invitation_notifications_queued_at']) then return new; end if;
 select s.id,d.id,d.key,p.version,p.manifest into v_section_id,package_id,package_key,package_version,spec
 from public.teams t join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
 left join public.disciplines d on d.id=s.discipline_id
 left join private.discipline_packages p on p.discipline_key=d.key and p.active
 where t.id=new.team_id and t.organization_id=new.organization_id;
 current_state:=private.discipline_activity_state(new);
 if tg_op='UPDATE' then previous_state:=private.discipline_activity_state(old); end if;
 select values into v from private.discipline_values where discipline_id=package_id and version=package_version and team_id=new.team_id and scope='team';
 select values->'capabilities' into section_settings from public.section_discipline_defaults
 where section_id=v_section_id and discipline_id=package_id and version=package_version and activity_type_id=new.activity_type_id;
 select values->'capabilities' into team_settings from public.team_discipline_defaults
 where team_id=new.team_id and discipline_id=package_id and version=package_version and activity_type_id=new.activity_type_id;
 if spec is not null and (tg_op='INSERT' or old.activity_type_id is distinct from new.activity_type_id or old.team_id is distinct from new.team_id) then
  if spec#>>'{initialization,scope}'='activity' and spec#>>'{initialization,fromScope}'='team'
   and spec#>'{appliesTo,activityTypeSlugs}' ? (current_state->>'activityTypeSlug') and spec#>'{appliesTo,categories}' ? (current_state->>'category') then
   select coalesce(jsonb_object_agg(k,x),'{}') into settings from jsonb_each(coalesce(v,'{}')) item(k,x)
    where spec#>'{initialization,copyFields}' ? k;
   settings:=settings||coalesce(spec#>'{initialization,defaults}','{}');
   perform private.validate_discipline_values(package_key,package_version,'activity',settings);
   insert into private.discipline_values(discipline_id,organization_id,team_id,scope,activity_id,version,values)
   values(package_id,new.organization_id,new.team_id,'activity',new.id,package_version,settings) on conflict do nothing;
  end if;
  for binding in select value from jsonb_array_elements(spec->'capabilities') loop
   if not binding#>'{appliesTo,activityTypeSlugs}' ? (current_state->>'activityTypeSlug')
    or not binding#>'{appliesTo,categories}' ? (current_state->>'category') then continue; end if;
   enabled:=coalesce((team_settings#>>array[binding->>'id','notificationsEnabled'])::boolean,
    (section_settings#>>array[binding->>'id','notificationsEnabled'])::boolean,(binding#>>'{defaults,notificationsEnabled}')::boolean);
   hours:=coalesce(nullif(team_settings#>array[binding->>'id','notificationHours'],'null'),
    nullif(section_settings#>array[binding->>'id','notificationHours'],'null'),binding#>'{notifications,beforeStartHours}');
   if enabled and jsonb_array_length(hours)>0 then
    binding:=jsonb_set(binding,'{notifications,beforeStartHours}',hours);
    insert into private.activity_capability_rules(activity_id,capability_id,definition) values(new.id,binding->>'id',binding) on conflict do nothing;
   end if;
  end loop;
 end if;
 insert into private.discipline_activity_events(activity_id,discipline_id,discipline_key,discipline_version,kind,previous_state,current_state,team_values,section_settings,team_settings)
 values(new.id,package_id,package_key,package_version,case tg_op when 'INSERT' then 'activity.created' else 'activity.updated' end,
 previous_state,current_state,coalesce(v,'{}'),coalesce(section_settings,'{}'),coalesce(team_settings,'{}'));
 return new;
end $$;
create trigger capture_discipline_activity_event after insert or update on public.activities
for each row execute function private.capture_discipline_activity_event();
revoke all on function private.capture_discipline_activity_event() from public,anon,authenticated;
revoke all on function private.discipline_activity_state(public.activities) from public,anon,authenticated;

create function public.claim_discipline_activity_events(batch_size integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
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

create function public.apply_discipline_activity_event(event_id bigint,lease_token uuid,operations jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare e private.discipline_activity_events%rowtype; op jsonb; rule jsonb; inserted integer;
begin
 select * into e from private.discipline_activity_events where id=event_id and status='processing'
  and discipline_activity_events.lease_token=apply_discipline_activity_event.lease_token and lease_until>now() for update;
 if not found then return false; end if;
 if jsonb_typeof(operations) is distinct from 'array' or jsonb_array_length(operations)>100 or octet_length(operations::text)>65536 then
  raise exception 'Invalid discipline operations' using errcode='22023'; end if;
 -- Serialize with activity editing and enforce the event's captured object boundaries.
 perform 1 from public.activities where id=e.activity_id for update;
 for op in select value from jsonb_array_elements(operations) loop
  case op->>'kind'
   when 'initializeValues' then
    perform private.validate_discipline_values(e.discipline_key,e.discipline_version,'activity',op->'values');
    insert into private.discipline_values(discipline_id,organization_id,team_id,scope,activity_id,version,values)
    values(e.discipline_id,(e.current_state->>'organizationId')::uuid,(e.current_state->>'teamId')::uuid,'activity',e.activity_id,e.discipline_version,op->'values') on conflict do nothing;
   when 'saveValues' then
    perform private.validate_discipline_values(e.discipline_key,e.discipline_version,'activity',op->'values');
    update private.discipline_values set values=op->'values',revision=revision+1,updated_at=now()
    where discipline_id=e.discipline_id and activity_id=e.activity_id and scope='activity' and revision=(op->>'expectedRevision')::integer;
    get diagnostics inserted=row_count;
    if inserted<>1 then raise exception 'Discipline values changed' using errcode='40001'; end if;
   when 'cancel' then
    update private.discipline_operations set status='cancelled' where activity_id=e.activity_id and capability_id=op->>'capabilityId' and status='pending';
   when 'schedule' then
    select definition into rule from private.activity_capability_rules where activity_id=e.activity_id and capability_id=op#>>'{definition,id}';
    if not found or rule<>op->'definition' or not (rule#>'{notifications,beforeStartHours}') @> jsonb_build_array((op->>'beforeStartHours')::integer)
     or abs(extract(epoch from ((op->>'runAt')::timestamptz-((e.current_state->>'startsAt')::timestamptz-(op->>'beforeStartHours')::integer*interval '1 hour'))))>0.001 then
     raise exception 'Invalid discipline schedule' using errcode='22023'; end if;
    insert into private.discipline_operations(activity_id,capability_id,before_start_hours,run_at,status)
    values(e.activity_id,op#>>'{definition,id}',(op->>'beforeStartHours')::integer,(op->>'runAt')::timestamptz,
     case when exists(select 1 from private.capability_notification_checks c where c.activity_id=e.activity_id and c.capability_id=op#>>'{definition,id}' and c.before_start_hours=(op->>'beforeStartHours')::integer) then 'completed' else 'pending' end)
    on conflict(activity_id,capability_id,before_start_hours) do update set run_at=excluded.run_at,status=excluded.status;
   else raise exception 'Unsupported discipline operation' using errcode='22023';
  end case;
 end loop;
 insert into public.audit_log(organization_id,action,entity_type,entity_id,details) values
 ((e.current_state->>'organizationId')::uuid,'discipline_activity.handled','activity',e.activity_id::text,jsonb_build_object('eventId',e.id,'operationCount',jsonb_array_length(operations)));
 update private.discipline_activity_events set status='processed',processed_at=now(),lease_token=null,lease_until=null,last_error=null where id=e.id;
 return true;
end $$;
revoke all on function public.apply_discipline_activity_event(bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_discipline_activity_event(bigint,uuid,jsonb) to service_role;

create function public.fail_discipline_activity_event(event_id bigint,lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update private.discipline_activity_events set status=case when attempts>=5 then 'failed' else 'pending' end,
  run_at=now()+make_interval(secs=>least(3600,60*(2^greatest(0,attempts-1))::integer)),last_error='handler_failed',lease_token=null,lease_until=null
 where id=event_id and status='processing' and discipline_activity_events.lease_token=fail_discipline_activity_event.lease_token;
 return found;
end $$;
revoke all on function public.fail_discipline_activity_event(bigint,uuid) from public,anon,authenticated;
grant execute on function public.fail_discipline_activity_event(bigint,uuid) to service_role;

create or replace function public.load_capability_contexts(after_activity_id uuid default null,
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
  and exists(select 1 from private.discipline_operations op where op.activity_id=a.id and op.capability_id=r.capability_id and op.status='pending' and op.run_at<=now())
  and not exists(select 1 from private.discipline_activity_events e where e.activity_id=a.id and e.status<>'processed')
 order by a.id,r.capability_id limit greatest(1,least(batch_size,500))
) candidates;
$$;
revoke all on function public.load_capability_contexts(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.load_capability_contexts(uuid,text,integer) to service_role;


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
  if exists(select 1 from private.discipline_packages p cross join lateral jsonb_array_elements(p.manifest->'capabilities') c where c#>>'{notifications,type}'=new.type) then
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

create function private.can_read_discipline_notification(notification_type text,target_organization_id uuid,target_activity_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  not exists(select 1 from private.discipline_packages p cross join lateral jsonb_array_elements(p.manifest->'capabilities') c where c#>>'{notifications,type}'=notification_type)
  or exists(select 1 from public.activities a join public.organizations org on org.id=a.organization_id
   where a.id::text=target_activity_id and a.organization_id=target_organization_id
    and private.has_team_permission(a.team_id,'invitation.manage',auth.uid())
    and exists(select 1 from public.team_access_assignments ta join public.people p on p.id=ta.person_id and p.organization_id=ta.organization_id
     where ta.team_id=a.team_id and ta.organization_id=a.organization_id and p.user_id=auth.uid()
      and ta.starts_on<=(now() at time zone org.time_zone)::date and (ta.ends_on is null or ta.ends_on>=(now() at time zone org.time_zone)::date)))
 );
$$;
revoke all on function private.can_read_discipline_notification(text,uuid,text) from public,anon;
grant execute on function private.can_read_discipline_notification(text,uuid,text) to authenticated;
drop policy "users can read their notifications" on public.notification_outbox;
create policy "users can read their notifications" on public.notification_outbox for select to authenticated using (
 user_id=(select auth.uid()) and private.can_read_discipline_notification(type,organization_id,payload->>'activityId')
);
drop function private.can_read_team_size_notification(uuid,text);

-- Versions belong to installed packages, not to the shared defaults mechanism.
alter table public.section_discipline_defaults drop constraint section_discipline_defaults_version_check;
alter table public.team_discipline_defaults drop constraint team_discipline_defaults_version_check;
alter table public.section_discipline_defaults add constraint section_discipline_defaults_version_check check(length(version) between 1 and 80);
alter table public.team_discipline_defaults add constraint team_discipline_defaults_version_check check(length(version) between 1 and 80);
create or replace function public.save_discipline_defaults(target_type_id uuid,target_scope text,target_organization_id uuid,target_scope_id uuid,expected_revision integer,expected_discipline_id uuid,expected_version text,patch jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; section_id uuid; actual_discipline uuid; v_discipline_key text; t public.activity_types; table_name text; scope_column text;
begin
 if not coalesce(public.can_manage_discipline_defaults(target_scope,target_organization_id,target_scope_id),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 if target_scope='team' then
  select team.section_id into section_id from public.teams team where team.id=target_scope_id and team.organization_id=target_organization_id for share;
 else section_id:=target_scope_id; end if;
 select s.discipline_id into actual_discipline from public.sections s where s.id=section_id and s.organization_id=target_organization_id for share;
 if actual_discipline is null or actual_discipline is distinct from expected_discipline_id then raise exception 'Discipline changed; reload' using errcode='40001'; end if;
 select key into v_discipline_key from public.disciplines where id=actual_discipline;
 select * into t from public.activity_types where id=target_type_id for share;
 if t.id is null or not t.active or (t.organization_id is not null and t.organization_id is distinct from target_organization_id)
 or (t.discipline_id is not null and t.discipline_id is distinct from actual_discipline)
 or expected_revision is null or expected_revision<0 or not public.validate_discipline_defaults_patch(patch,v_discipline_key,t.slug,t.system_category)
 then raise exception 'Invalid defaults' using errcode='22023'; end if;
 if not exists(select 1 from private.discipline_packages p where p.discipline_key=v_discipline_key and p.version=expected_version and p.active) then raise exception 'Discipline changed; reload' using errcode='40001'; end if;
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
