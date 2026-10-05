-- Shared types are explicit system configuration; local custom types stay private.
alter table public.activity_types alter column organization_id drop not null;
alter table public.activity_types add column discipline_id uuid references public.disciplines(id);
create unique index activity_types_system_slug on public.activity_types(slug) where organization_id is null;

-- Replace tenant-composite type references with identity references. The trigger
-- below preserves the tenant boundary for local types, including direct API writes.
do $$ declare item record; begin
  for item in select conrelid::regclass as tbl, conname from pg_constraint
    where contype = 'f' and confrelid = 'public.activity_types'::regclass loop
    execute format('alter table %s drop constraint %I', item.tbl, item.conname);
  end loop;
end $$;
alter table public.activities add foreign key (activity_type_id) references public.activity_types(id);
alter table public.activity_series add foreign key (activity_type_id) references public.activity_types(id);
alter table public.activity_type_documents add foreign key (activity_type_id) references public.activity_types(id);

insert into public.activity_types (name, slug, system_category) values
 ('Träning', 'traning', 'session'), ('Match eller tävling', 'match-tavling', 'competition'),
 ('Arbetspass', 'arbetspass', 'work'), ('Möte', 'mote', 'meeting'),
 ('Utbildning', 'utbildning', 'education'), ('Övrigt', 'ovrigt', 'other');
-- Only migrate unmodified built-ins, never publish an organization's custom data.
create temporary table type_mapping on commit drop as
 select local.id as old_id, shared.id as new_id
 from public.activity_types local join public.activity_types shared
 on shared.organization_id is null and local.organization_id is not null
 and local.slug = shared.slug and local.name = shared.name
 and local.system_category = shared.system_category
 where local.active and local.color is null and local.icon is null;
update public.activities a set activity_type_id = m.new_id from type_mapping m where a.activity_type_id = m.old_id;
update public.activity_series a set activity_type_id = m.new_id from type_mapping m where a.activity_type_id = m.old_id;
update public.activity_type_documents a set activity_type_id = m.new_id from type_mapping m where a.activity_type_id = m.old_id;
delete from public.activity_types where id in (select old_id from type_mapping);

-- Shared type IDs must not cross-link documents from different organizations.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' loop
  definition := pg_get_functiondef(f.oid);
  if definition like '%join public.activity_type_documents link on link.activity_type_id = activity.activity_type_id%' then
   execute replace(definition,
    'join public.activity_type_documents link on link.activity_type_id = activity.activity_type_id',
    'join public.activity_type_documents link on link.activity_type_id = activity.activity_type_id and link.organization_id = activity.organization_id');
  end if;
 end loop;
end $$;
drop policy "admins and team administrators can read document secrets" on public.contextual_document_secrets;
create policy "admins and team administrators can read document secrets" on public.contextual_document_secrets
for select to authenticated using (
 public.has_organization_role(organization_id, array['owner','admin']) or exists (
 select 1 from public.activity_type_documents link join public.activities activity
 on activity.activity_type_id=link.activity_type_id and activity.organization_id=link.organization_id
 where link.document_id=contextual_document_secrets.document_id
 and link.organization_id=contextual_document_secrets.organization_id
 and activity.team_id is not null and public.has_team_permission(activity.team_id,'team.manage')));

drop policy "members can read activity types" on public.activity_types;
create policy "members can read activity types" on public.activity_types for select to authenticated
using (organization_id is null or public.is_organization_member(organization_id));
drop policy "admins can insert activity types" on public.activity_types;
drop policy "admins can update activity types" on public.activity_types;
drop policy "admins can delete activity types" on public.activity_types;
create policy "system admins manage common activity types" on public.activity_types for all to authenticated
using (organization_id is null and public.has_platform_role(array['system_admin']))
with check (organization_id is null and public.has_platform_role(array['system_admin']));
-- Local legacy types remain readable; new catalogue administration is system-only.
create policy "local admins update legacy types" on public.activity_types for update to authenticated
using (organization_id is not null and public.has_organization_role(organization_id,array['owner','admin']))
with check (organization_id is not null and public.has_organization_role(organization_id,array['owner','admin']));
create policy "public reads common type categories" on public.activity_types for select to anon using (organization_id is null);

create function public.check_activity_type_target() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.activity_types; effective uuid; begin
 select * into t from public.activity_types where id=new.activity_type_id;
 if t.id is null or (t.organization_id is not null and t.organization_id<>new.organization_id) then
  raise exception 'Invalid activity type organization' using errcode='23514';
 end if;
 if tg_table_name in ('activities','activity_series') then
  -- Keep historical activities editable when a type is archived/reclassified.
  if tg_op='UPDATE' and new.activity_type_id=old.activity_type_id and new.team_id is not distinct from old.team_id and new.organization_id=old.organization_id then return new; end if;
  if not t.active then raise exception 'Inactive activity type' using errcode='23514'; end if;
  effective := public.resolve_team_discipline(new.team_id);
  if t.discipline_id is not null and t.discipline_id is distinct from effective then
   raise exception 'Activity type does not match discipline' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.check_activity_type_target() from public,anon,authenticated;
create trigger activities_type_target before insert or update of activity_type_id,team_id,organization_id on public.activities for each row execute function public.check_activity_type_target();
create trigger series_type_target before insert or update of activity_type_id,team_id,organization_id on public.activity_series for each row execute function public.check_activity_type_target();
create trigger documents_type_target before insert or update of activity_type_id,organization_id on public.activity_type_documents for each row execute function public.check_activity_type_target();

create table public.activity_defaults (
 id uuid primary key default gen_random_uuid(),
 activity_type_id uuid not null references public.activity_types(id),
 scope text not null check (scope in ('system','organization','section','team')),
 organization_id uuid references public.organizations(id) on delete cascade,
 scope_id uuid,
 revision integer not null default 1 check (revision>0),
 rule_version integer not null default 1 check (rule_version=1),
 values jsonb not null default '{}',
 updated_at timestamptz not null default now(),
 unique nulls not distinct (activity_type_id,scope,organization_id,scope_id),
 check ((scope='system' and organization_id is null and scope_id is null) or
 (scope<>'system' and organization_id is not null and scope_id is not null))
);
alter table public.activity_defaults enable row level security;
revoke all on public.activity_defaults from anon,authenticated;
grant select on public.activity_defaults to authenticated;
create index activity_defaults_organization_idx on public.activity_defaults(organization_id);

create function public.can_manage_activity_defaults(target_scope text, target_organization_id uuid, target_scope_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and case target_scope
 when 'system' then target_organization_id is null and target_scope_id is null and public.has_platform_role(array['system_admin'])
 when 'organization' then target_scope_id=target_organization_id and public.has_organization_role(target_organization_id,array['owner','admin'])
 when 'section' then exists(select 1 from public.sections s where s.id=target_scope_id and s.organization_id=target_organization_id)
 and (public.has_organization_role(target_organization_id,array['owner','admin']) or public.has_section_role(target_scope_id,array['section_admin']))
 when 'team' then exists(select 1 from public.teams t where t.id=target_scope_id and t.organization_id=target_organization_id)
 and public.has_team_permission(target_scope_id,'activity.manage') else false end;
$$;
revoke all on function public.can_manage_activity_defaults(text,uuid,uuid) from public,anon;
grant execute on function public.can_manage_activity_defaults(text,uuid,uuid) to authenticated;
create policy "read applicable defaults" on public.activity_defaults for select to authenticated using (
 scope='system' or public.has_organization_role(organization_id,array['owner','admin'])
 or (scope='organization' and public.is_organization_member(organization_id))
 or (scope='section' and (public.has_section_role(scope_id,array['section_admin']) or exists (
 select 1 from public.teams t where t.section_id=scope_id and t.organization_id=activity_defaults.organization_id and public.has_team_permission(t.id,'activity.manage'))))
 or (scope='team' and public.has_team_permission(scope_id,'activity.manage')));

create function public.valid_activity_time_rule(rule text, anchor text) returns boolean
language sql immutable set search_path='' as $$
 select rule is not null and length(rule)<=80
 and rule ~ ('^' || anchor || '(-[0-9]+[dhm]){0,4}(/d)?$')
 and coalesce((select sum(m[1]::numeric * case m[2] when 'd' then 1440 when 'h' then 60 else 1 end)
 from regexp_matches(rule,'-([0-9]+)([dhm])','g') m),0)<=527040;
$$;
revoke all on function public.valid_activity_time_rule(text,text) from public,anon,authenticated;

-- Defence in depth: bounded syntax/JSON checks apply to the public write RPC too.
create function public.validate_activity_defaults_patch(patch jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; r text; n numeric; begin
 if jsonb_typeof(patch)<>'object' then return false; end if;
 for k,v in select * from jsonb_each(patch) loop
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
    if r !~ '^PT([0-9]{1,4}H)?([0-9]{1,4}M)?$' or r='PT' then return false; end if;
    n:=coalesce((substring(r from '([0-9]+)H'))::numeric,0)*60+coalesce((substring(r from '([0-9]+)M'))::numeric,0);
    if n<1 or n>1440 then return false; end if;
   elsif not public.valid_activity_time_rule(r,'start') then return false; end if;
  end if;
 end loop;
 return true;
end $$;
revoke all on function public.validate_activity_defaults_patch(jsonb) from public,anon,authenticated;
alter table public.activity_defaults add check (public.validate_activity_defaults_patch(values));

create function public.save_activity_defaults(target_type_id uuid,target_scope text,target_organization_id uuid,target_scope_id uuid,expected_revision integer,patch jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; t public.activity_types; begin
 if not coalesce(public.can_manage_activity_defaults(target_scope,target_organization_id,target_scope_id),false) then
 raise exception 'Forbidden' using errcode='42501'; end if;
 select * into t from public.activity_types where id=target_type_id;
 if t.id is null or (t.organization_id is not null and t.organization_id is distinct from target_organization_id) or not public.validate_activity_defaults_patch(patch) then
 raise exception 'Invalid defaults' using errcode='22023'; end if;
 if expected_revision=0 then
  insert into public.activity_defaults(activity_type_id,scope,organization_id,scope_id,values)
  values(target_type_id,target_scope,target_organization_id,target_scope_id,patch)
  on conflict do nothing returning id into result;
 else
  update public.activity_defaults set values=patch,revision=revision+1,updated_at=now()
  where activity_type_id=target_type_id and scope=target_scope and organization_id is not distinct from target_organization_id
  and scope_id is not distinct from target_scope_id and revision=expected_revision returning id into result;
 end if;
 if result is null then raise exception 'Defaults changed; reload' using errcode='40001'; end if;
 return result;
end $$;
revoke all on function public.save_activity_defaults(uuid,text,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_activity_defaults(uuid,text,uuid,uuid,integer,jsonb) to authenticated;

grant select,insert on public.activity_events to authenticated;

-- One row change persists all reminders atomically; no partial schedule writes.
alter table public.activities add column reminder_send_ats timestamptz[];
alter table public.activities add column timing_rules jsonb;
alter table public.activities add column timing_rule_version integer check (timing_rule_version=1);
create function public.sync_activity_rule_reminders() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.reminder_send_ats is null then return new; end if;
 if auth.uid() is not null and not public.has_team_permission(new.team_id,'invitation.manage') then
  raise exception 'Invitation permission required' using errcode='42501';
 end if;
 if cardinality(new.reminder_send_ats)>5 or (select count(*)<>count(distinct r) from unnest(new.reminder_send_ats) r)
 or exists(select 1 from unnest(new.reminder_send_ats) r where r is null or r<=new.invitation_send_at or r>=new.response_due_at)
 or (cardinality(new.reminder_send_ats)>0 and (new.invitation_send_at is null or new.response_due_at is null)) then
 raise exception 'Invalid reminder schedule' using errcode='23514'; end if;
 delete from public.activity_reminder_schedules where activity_id=new.id and materialized_at is null;
 insert into public.activity_reminder_schedules(organization_id,activity_id,send_at,created_by)
 select new.organization_id,new.id,r,new.created_by from unnest(new.reminder_send_ats) r
 on conflict(activity_id,send_at) do nothing;
 insert into public.activity_events(organization_id,activity_id,event_type,metadata,created_by)
 select new.organization_id,new.id,'reminder_scheduled',jsonb_build_object('scheduledAt',r),new.created_by
 from unnest(new.reminder_send_ats) r;
 return new;
end $$;
revoke all on function public.sync_activity_rule_reminders() from public,anon,authenticated;
create trigger activity_rule_reminders after insert or update of reminder_send_ats on public.activities
for each row execute function public.sync_activity_rule_reminders();

create function public.set_activity_discipline(target_scope text,target_organization_id uuid,target_scope_id uuid,target_discipline_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if target_scope='system' or not coalesce(public.can_manage_activity_defaults(target_scope,target_organization_id,target_scope_id),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 case target_scope
 when 'organization' then update public.organizations set discipline_id=target_discipline_id where id=target_scope_id;
 when 'section' then update public.sections set discipline_id=target_discipline_id where id=target_scope_id;
 when 'team' then update public.teams set discipline_id=target_discipline_id where id=target_scope_id;
 else raise exception 'Invalid scope'; end case;
end $$;
revoke all on function public.set_activity_discipline(text,uuid,uuid,uuid) from public,anon;
grant execute on function public.set_activity_discipline(text,uuid,uuid,uuid) to authenticated;

create function public.preserve_activity_type_owner() returns trigger language plpgsql set search_path='' as $$
begin
 if new.organization_id is distinct from old.organization_id then raise exception 'Activity type owner is immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function public.preserve_activity_type_owner() from public,anon,authenticated;
create trigger activity_type_owner before update of organization_id on public.activity_types
for each row execute function public.preserve_activity_type_owner();
