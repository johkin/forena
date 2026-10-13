-- Section-scoped metadata commands; system administrators need no club membership.
create function administration.require_section_team_admin(target uuid, section_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (
  public.has_platform_role(array['system_admin'])
  or public.has_organization_role(target,array['owner','admin'])
  or public.has_section_role(section_id,array['section_admin'])
 ) then raise exception 'Forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.sections s where s.id=section_id and s.organization_id=target) then
  raise exception 'Section not found' using errcode='P0002';
 end if;
end $$;

-- Conservatively protect all FK-backed data, including historical/inactive rows
-- and future extensions. Scoped memories are the one non-FK team anchor.
create function administration.team_used(target uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare reference record; used boolean;
begin
 if exists(select 1 from public.assistant_memories where scope='team' and scope_id=target) then return true; end if;
 for reference in
  select distinct n.nspname, c.relname, a.attname
  from pg_catalog.pg_constraint fk
  join pg_catalog.pg_class c on c.oid=fk.conrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral unnest(fk.conkey,fk.confkey) keys(local_key,foreign_key)
  join pg_catalog.pg_attribute a on a.attrelid=fk.conrelid and a.attnum=keys.local_key
  join pg_catalog.pg_attribute referenced on referenced.attrelid=fk.confrelid and referenced.attnum=keys.foreign_key
  where fk.contype='f' and fk.confrelid='public.teams'::regclass and referenced.attname='id'
 loop
  execute format('select exists(select 1 from %I.%I where %I=$1)',reference.nspname,reference.relname,reference.attname) into used using target;
  if used then return true; end if;
 end loop;
 return false;
end $$;

create function administration.section_team_structure(target uuid, section_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform administration.require_section_team_admin(target,section_id);
 select jsonb_build_object(
  'organization',jsonb_build_object('id',o.id,'slug',o.slug,'name',o.name,'assistantName',o.assistant_name,'timeZone',o.time_zone),
  'section',jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'disciplineName',d.name),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,'season',t.season,'canDelete',not administration.team_used(t.id)) order by t.name,t.id) from public.teams t where t.organization_id=target and t.section_id=s.id),'[]'::jsonb)
 ) into result from public.sections s join public.organizations o on o.id=s.organization_id left join public.disciplines d on d.id=s.discipline_id where s.id=section_id and o.id=target;
 return result;
end $$;

create function administration.save_section_team(target uuid, section_id uuid, team_id uuid, input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.teams%rowtype; result uuid; slug text:=input->>'slug';
begin
 perform administration.require_section_team_admin(target,section_id);
 -- Same lock order as section changes/deletion. FK inserts cannot race deletion.
 perform 1 from public.organizations where id=target for update;
 perform 1 from public.sections s where s.id=section_id and s.organization_id=target for update;
 if not found then raise exception 'Section not found' using errcode='P0002'; end if;
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'name') is distinct from 'string'
 or nullif(btrim(input->>'name'),'') is null or length(input->>'name')>120
 or jsonb_typeof(input->'slug') is distinct from 'string' or slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(slug)>120
 or jsonb_typeof(input->'season') is distinct from 'string' or length(input->>'season')>40 then
  raise exception 'Invalid team' using errcode='22023';
 end if;
 if team_id is null then
  insert into public.teams(organization_id,section_id,name,slug,season) values(target,section_id,btrim(input->>'name'),slug,btrim(input->>'season')) returning id into result;
 else
  select * into existing from public.teams t where t.id=$3 and t.organization_id=$1 and t.section_id=$2 for update;
  if not found then raise exception 'Team not found' using errcode='P0002'; end if;
  if slug<>existing.slug then raise exception 'Team address cannot change' using errcode='22023'; end if;
  update public.teams t set name=btrim(input->>'name'),season=btrim(input->>'season') where t.id=team_id returning id into result;
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
 values(target,auth.uid(),case when team_id is null then 'team.created' else 'team.metadata_changed' end,'team',result::text,jsonb_build_object('sectionId',section_id));
 return result;
end $$;

create function administration.guard_team_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if administration.team_used(old.id) then raise exception 'Team is in use' using errcode='55000'; end if;
 return old;
end $$;
create trigger teams_guard_delete before delete on public.teams for each row execute function administration.guard_team_delete();

create function administration.delete_section_team(target uuid, section_id uuid, team_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform administration.require_section_team_admin(target,section_id);
 perform 1 from public.organizations where id=target for update;
 delete from public.teams t where t.id=$3 and t.organization_id=$1 and t.section_id=$2;
 if not found then raise exception 'Team not found' using errcode='P0002'; end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
 values(target,auth.uid(),'team.deleted','team',team_id::text,jsonb_build_object('sectionId',section_id));
end $$;

create function administration.can_administer_section_teams(target_section_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.sections s where s.id=target_section_id and (
  public.has_platform_role(array['system_admin']) or public.has_organization_role(s.organization_id,array['owner','admin']) or public.has_section_role(s.id,array['section_admin'])
 ));
$$;

create function public.can_administer_section_teams(target_section_id uuid) returns boolean language sql security invoker set search_path='' as $$ select administration.can_administer_section_teams(target_section_id); $$;
create function public.section_team_structure(target uuid, section_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select administration.section_team_structure(target,section_id); $$;
create function public.save_section_team(target uuid, section_id uuid, team_id uuid, input jsonb) returns uuid language sql security invoker set search_path='' as $$ select administration.save_section_team(target,section_id,team_id,input); $$;
create function public.delete_section_team(target uuid, section_id uuid, team_id uuid) returns void language sql security invoker set search_path='' as $$ select administration.delete_section_team(target,section_id,team_id); $$;

revoke all on function administration.require_section_team_admin(uuid,uuid),administration.team_used(uuid),administration.guard_team_delete() from public,anon,authenticated;
revoke all on function administration.can_administer_section_teams(uuid),administration.section_team_structure(uuid,uuid),administration.save_section_team(uuid,uuid,uuid,jsonb),administration.delete_section_team(uuid,uuid,uuid) from public,anon;
grant execute on function administration.can_administer_section_teams(uuid),administration.section_team_structure(uuid,uuid),administration.save_section_team(uuid,uuid,uuid,jsonb),administration.delete_section_team(uuid,uuid,uuid) to authenticated;
revoke all on function public.can_administer_section_teams(uuid),public.section_team_structure(uuid,uuid),public.save_section_team(uuid,uuid,uuid,jsonb),public.delete_section_team(uuid,uuid,uuid) from public,anon;
grant execute on function public.can_administer_section_teams(uuid),public.section_team_structure(uuid,uuid),public.save_section_team(uuid,uuid,uuid,jsonb),public.delete_section_team(uuid,uuid,uuid) to authenticated;

-- Scope-based team memories have no FK. Give their writes the equivalent
-- parent lock so they cannot appear concurrently after an empty-team deletion.
create function administration.guard_team_memory_anchor() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.scope='team' then
  perform 1 from public.teams t where t.id=new.scope_id and t.organization_id=new.organization_id for key share;
  if not found then raise exception 'Team not found' using errcode='P0002'; end if;
 end if;
 return new;
end $$;
revoke all on function administration.guard_team_memory_anchor() from public,anon,authenticated;
create trigger assistant_memories_guard_team_anchor before insert or update of organization_id,scope,scope_id on public.assistant_memories
for each row execute function administration.guard_team_memory_anchor();
