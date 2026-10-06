-- Discipline is public club metadata used by the anonymous workspace query.
-- Keep all other column restrictions intact.
grant select (discipline_id) on public.organizations to anon;
grant select (discipline_id) on public.sections to anon;
grant select (discipline_id) on public.teams to anon;

-- A deliberately narrow directory API. Do not broaden people/guardian RLS:
-- attendance, invitation answers, birthdays and account IDs remain private.
create function public.team_contact_directory(target_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid;
  result jsonb;
begin
  select organization_id into organization from public.teams where id = target_team_id;
  if auth.uid() is null or organization is null
    or not public.is_organization_member(organization)
    or not (
      public.has_team_permission(target_team_id, 'roster.manage')
      or exists (
        select 1 from public.memberships m
        join public.people p on p.id = m.person_id and p.organization_id = m.organization_id
        where m.team_id = target_team_id and m.organization_id = organization
          and m.starts_on <= current_date and (m.ends_on is null or m.ends_on >= current_date)
          and (p.user_id = auth.uid() or exists (
            select 1 from public.person_guardians g
            where g.person_id = p.id and g.organization_id = organization and g.guardian_user_id = auth.uid()
          ))
      )
    ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(entry order by display_name), '[]'::jsonb) into result
  from (
    select p.display_name, jsonb_build_object(
      'id', p.id, 'name', p.display_name,
      'roles', to_jsonb(array_agg(distinct m.role)),
      'leaderTitle', max(m.leader_title),
      -- Only adult leader contacts, never player account emails.
      'email', case when bool_or(m.role = 'leader') then max(u.email) end,
      'guardians', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(nullif(g.contact_name, ''), gp.display_name, 'Målsman'),
          'phone', g.contact_phone, 'email', gu.email
        ) order by g.contact_name)
        from public.person_guardians g
        join auth.users gu on gu.id = g.guardian_user_id
        left join public.people gp on gp.user_id = g.guardian_user_id and gp.organization_id = organization
        where g.person_id = p.id and g.organization_id = organization
      ), '[]'::jsonb)
    ) as entry
    from public.memberships m
    join public.people p on p.id = m.person_id and p.organization_id = m.organization_id
    left join auth.users u on u.id = p.user_id
    where m.team_id = target_team_id and m.organization_id = organization
      and m.starts_on <= current_date and (m.ends_on is null or m.ends_on >= current_date)
    group by p.id
  ) entries;

  insert into public.audit_log (organization_id, actor_user_id, action, entity_type, entity_id, details)
  values (organization, auth.uid(), 'team.directory.read', 'team', target_team_id::text,
    jsonb_build_object('count', jsonb_array_length(result)));
  return result;
end;
$$;
revoke all on function public.team_contact_directory(uuid) from public, anon;
grant execute on function public.team_contact_directory(uuid) to authenticated;
