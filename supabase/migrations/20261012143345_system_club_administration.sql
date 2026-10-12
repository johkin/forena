-- Narrow metadata commands. Platform administration never grants club membership.
create schema if not exists administration;
revoke all on schema administration from public, anon;
grant usage on schema administration to authenticated;

create function administration.require_club_admin(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.has_platform_role(array['system_admin']) or public.has_organization_role(target,array['owner','admin'])) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
end $$;

create function administration.create_club_workspace(input jsonb, managed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare club uuid; section uuid; team uuid; club_slug text:=input->>'organizationSlug'; section_slug text:=input->>'sectionSlug'; team_slug text:=input->>'teamSlug';
begin
 if auth.uid() is null or managed is null or (managed and not public.has_platform_role(array['system_admin'])) then raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or nullif(btrim(input->>'organizationName'),'') is null or nullif(btrim(input->>'sectionName'),'') is null
 or length(input->>'organizationName')>120 or length(input->>'sectionName')>120
 or club_slug is null or club_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(club_slug)>120
 or section_slug is null or section_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(section_slug)>120
 or nullif(input->>'disciplineId','') is null
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=input->>'timeZone')
 then raise exception 'Invalid club setup' using errcode='22023'; end if;
 -- Both rows and the optional team commit together; any error rolls everything back.
 insert into public.organizations(name,slug,time_zone,created_by) values(btrim(input->>'organizationName'),club_slug,input->>'timeZone',case when managed then null else auth.uid() end) returning id into club;
 insert into public.sections(organization_id,name,slug,discipline_id) values(club,btrim(input->>'sectionName'),section_slug,(input->>'disciplineId')::uuid) returning id into section;
 if nullif(btrim(input->>'teamName'),'') is not null then
  if length(input->>'teamName')>120 or team_slug is null or team_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(team_slug)>120 or length(coalesce(input->>'season',''))>40 then raise exception 'Invalid team' using errcode='22023'; end if;
  insert into public.teams(organization_id,section_id,name,slug,season) values(club,section,btrim(input->>'teamName'),team_slug,coalesce(input->>'season','')) returning id into team;
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details) values(club,auth.uid(),'organization.created','organization',club::text,jsonb_build_object('managed',managed,'sectionId',section,'teamId',team));
 return jsonb_build_object('id',club,'slug',club_slug,'sectionId',section,'teamId',team,'teamSlug',case when team is not null then team_slug else null end);
end $$;

create function administration.club_structure(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform administration.require_club_admin(target);
 select jsonb_build_object('organization',jsonb_build_object('id',o.id,'slug',o.slug,'name',o.name,'assistantName',o.assistant_name,'timeZone',o.time_zone),'sections',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'disciplineId',s.discipline_id,'teamCount',(select count(*) from public.teams t where t.section_id=s.id and t.organization_id=o.id)) order by s.name,s.id) from public.sections s where s.organization_id=o.id),'[]'::jsonb)) into result from public.organizations o where o.id=target;
 if result is null then raise exception 'Club not found' using errcode='P0002'; end if;
 return result;
end $$;

create function administration.save_club_metadata(target uuid,input jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform administration.require_club_admin(target);
 if jsonb_typeof(input) is distinct from 'object' or nullif(btrim(input->>'name'),'') is null or length(input->>'name')>120
 or nullif(btrim(input->>'assistantName'),'') is null or length(input->>'assistantName')>60
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=input->>'timeZone') then raise exception 'Invalid club' using errcode='22023'; end if;
 update public.organizations set name=btrim(input->>'name'),assistant_name=btrim(input->>'assistantName'),time_zone=input->>'timeZone',updated_at=now() where id=target;
 if not found then raise exception 'Club not found' using errcode='P0002'; end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id) values(target,auth.uid(),'organization.metadata_changed','organization',target::text);
end $$;

create function administration.save_club_section(target uuid,section_id uuid,input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.sections%rowtype; result uuid; slug text:=input->>'slug'; discipline uuid;
begin
 perform administration.require_club_admin(target);
 discipline:=nullif(input->>'disciplineId','')::uuid;
 -- Serialize mutations on one club, also protecting the last-section invariant.
 perform 1 from public.organizations where id=target for update;
 if not found then raise exception 'Club not found' using errcode='P0002'; end if;
 if jsonb_typeof(input) is distinct from 'object' or nullif(btrim(input->>'name'),'') is null or length(input->>'name')>120
 or slug is null or slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(slug)>120 or discipline is null then raise exception 'Invalid section' using errcode='22023'; end if;
 if section_id is null then
  insert into public.sections(organization_id,name,slug,discipline_id) values(target,btrim(input->>'name'),slug,discipline) returning id into result;
 else
  select * into existing from public.sections where id=section_id and organization_id=target for update;
  if not found then raise exception 'Section not found' using errcode='P0002'; end if;
  -- Existing URLs remain stable; changing a populated discipline needs migration.
  if slug<>existing.slug then raise exception 'Section address cannot change' using errcode='22023'; end if;
  if discipline is distinct from existing.discipline_id and (exists(select 1 from public.teams t where t.section_id=existing.id) or exists(select 1 from public.section_discipline_defaults d where d.section_id=existing.id) or exists(select 1 from public.assistant_memories where scope='section' and scope_id=existing.id)) then raise exception 'Section discipline is in use' using errcode='55000'; end if;
  update public.sections set name=btrim(input->>'name'),discipline_id=discipline,updated_at=now() where id=section_id and organization_id=target returning id into result;
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id) values(target,auth.uid(),'section.saved','section',result::text);
 return result;
end $$;

-- Protect deletes even through the existing direct table grants; no cascading teams.
create function administration.guard_section_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.organizations where id=old.organization_id for update;
 if not found then return old; end if; -- deletion as part of an entire club cascade
 if (select count(*) from public.sections where organization_id=old.organization_id)<=1 then raise exception 'The last section cannot be deleted' using errcode='55000'; end if;
 if exists(select 1 from public.teams where section_id=old.id) or exists(select 1 from public.section_staff where section_id=old.id)
 or exists(select 1 from public.section_discipline_defaults where section_id=old.id) or exists(select 1 from public.assistant_memories where scope='section' and scope_id=old.id)
 or exists(select 1 from public.membership_applications where section_id=old.id) then raise exception 'Section is in use' using errcode='55000'; end if;
 return old;
end $$;
create trigger sections_guard_delete before delete on public.sections for each row execute function administration.guard_section_delete();

create function administration.delete_club_section(target uuid,section_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform administration.require_club_admin(target);
 perform 1 from public.organizations where id=target for update;
 delete from public.sections where id=section_id and organization_id=target;
 if not found then raise exception 'Section not found' using errcode='P0002'; end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id) values(target,auth.uid(),'section.deleted','section',section_id::text);
end $$;

create function administration.discipline_used(target uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.organizations where discipline_id=target)
 or exists(select 1 from public.sections where discipline_id=target)
 or exists(select 1 from public.teams where discipline_id=target)
 or exists(select 1 from public.assistant_memories where discipline_id=target)
 or exists(select 1 from public.activity_types where discipline_id=target)
 or exists(select 1 from public.section_discipline_defaults where discipline_id=target)
 or exists(select 1 from public.team_discipline_defaults where discipline_id=target)
 or exists(select 1 from private.discipline_values where discipline_id=target)
 or exists(select 1 from private.discipline_activity_events where discipline_id=target)
 or exists(select 1 from private.discipline_packages p join public.disciplines d on d.key=p.discipline_key where d.id=target);
$$;
create function administration.guard_discipline_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if administration.discipline_used(old.id) then raise exception 'Discipline is in use' using errcode='55000'; end if;
 return old;
end $$;
create trigger disciplines_guard_delete before delete on public.disciplines for each row execute function administration.guard_discipline_delete();

create function administration.system_discipline_usage() returns table(id uuid,in_use boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_platform_role(array['system_admin']) then raise exception 'Forbidden' using errcode='42501'; end if;
 return query select d.id,administration.discipline_used(d.id) from public.disciplines d;
end $$;

-- Invoker wrappers expose only the checked commands, not the private schema.
create function public.create_club_workspace(input jsonb,managed boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select administration.create_club_workspace(input,managed); $$;
create function public.club_structure(target uuid) returns jsonb language sql security invoker set search_path='' as $$ select administration.club_structure(target); $$;
create function public.save_club_metadata(target uuid,input jsonb) returns void language sql security invoker set search_path='' as $$ select administration.save_club_metadata(target,input); $$;
create function public.save_club_section(target uuid,section_id uuid,input jsonb) returns uuid language sql security invoker set search_path='' as $$ select administration.save_club_section(target,section_id,input); $$;
create function public.delete_club_section(target uuid,section_id uuid) returns void language sql security invoker set search_path='' as $$ select administration.delete_club_section(target,section_id); $$;
create function public.system_discipline_usage() returns table(id uuid,in_use boolean) language sql security invoker set search_path='' as $$ select * from administration.system_discipline_usage(); $$;

revoke all on all functions in schema administration from public,anon,authenticated;
grant execute on function administration.create_club_workspace(jsonb,boolean),administration.club_structure(uuid),administration.save_club_metadata(uuid,jsonb),administration.save_club_section(uuid,uuid,jsonb),administration.delete_club_section(uuid,uuid),administration.system_discipline_usage() to authenticated;
revoke all on function public.create_club_workspace(jsonb,boolean),public.club_structure(uuid),public.save_club_metadata(uuid,jsonb),public.save_club_section(uuid,uuid,jsonb),public.delete_club_section(uuid,uuid),public.system_discipline_usage() from public,anon;
grant execute on function public.create_club_workspace(jsonb,boolean),public.club_structure(uuid),public.save_club_metadata(uuid,jsonb),public.save_club_section(uuid,uuid,jsonb),public.delete_club_section(uuid,uuid),public.system_discipline_usage() to authenticated;
