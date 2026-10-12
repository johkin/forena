-- One rule drives both administrative presentation and mutation validation.
-- Kept internal: club_structure and save_club_section check caller authorization.
create function administration.section_discipline_change_allowed(target_section uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not (
  exists(select 1 from public.teams where section_id=target_section)
  or exists(select 1 from public.section_discipline_defaults where section_id=target_section)
  or exists(select 1 from public.assistant_memories where scope='section' and scope_id=target_section)
 );
$$;
revoke all on function administration.section_discipline_change_allowed(uuid) from public,anon,authenticated;

create or replace function administration.club_structure(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform administration.require_club_admin(target);
 select jsonb_build_object('organization',jsonb_build_object('id',o.id,'slug',o.slug,'name',o.name,'assistantName',o.assistant_name,'timeZone',o.time_zone),'sections',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'disciplineId',s.discipline_id,'canChangeDiscipline',administration.section_discipline_change_allowed(s.id),'teamCount',(select count(*) from public.teams t where t.section_id=s.id and t.organization_id=o.id)) order by s.name,s.id) from public.sections s where s.organization_id=o.id),'[]'::jsonb)) into result from public.organizations o where o.id=target;
 if result is null then raise exception 'Club not found' using errcode='P0002'; end if;
 return result;
end $$;

create or replace function administration.save_club_section(target uuid,section_id uuid,input jsonb) returns uuid
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
  if discipline is distinct from existing.discipline_id and not administration.section_discipline_change_allowed(existing.id) then raise exception 'Section discipline is in use' using errcode='55000'; end if;
  update public.sections set name=btrim(input->>'name'),discipline_id=discipline,updated_at=now() where id=section_id and organization_id=target returning id into result;
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id) values(target,auth.uid(),'section.saved','section',result::text);
 return result;
end $$;

