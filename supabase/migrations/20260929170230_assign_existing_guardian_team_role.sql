drop policy if exists "team managers can create member invitations" on public.team_member_invitations;
create policy "team managers can invite guardians and admins can invite leaders"
on public.team_member_invitations for insert to authenticated
with check (
  public.can_manage_team(team_id)
  and (role <> 'leader' or public.has_organization_role(organization_id, array['owner', 'admin']))
  and invited_by = auth.uid()
  and accepted_at is null
  and accepted_by is null
);

create policy "organization admins can record role changes" on public.audit_log
for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and public.has_organization_role(organization_id, array['owner', 'admin'])
  and action = 'team_staff.assigned'
);

create function public.assign_existing_guardian_team_role(
  target_organization_id uuid,
  target_team_id uuid,
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  guardian_person_id uuid;
begin
  if not public.has_organization_role(target_organization_id, array['owner', 'admin']) then
    raise exception 'Only organization admins can assign team roles' using errcode = '42501';
  end if;

  if target_role not in ('team_manager', 'coach') then
    raise exception 'Invalid team role' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.teams
    where id = target_team_id and organization_id = target_organization_id
  ) then
    raise exception 'Team is outside the organization' using errcode = '22023';
  end if;

  select person.id into guardian_person_id
  from public.people person
  join public.organization_members member
    on member.organization_id = person.organization_id and member.user_id = person.user_id
  where person.organization_id = target_organization_id
    and person.user_id = target_user_id
    and exists (
      select 1 from public.person_guardians guardian
      where guardian.organization_id = person.organization_id
        and guardian.guardian_user_id = target_user_id
    );

  if guardian_person_id is null then
    raise exception 'The user is not an existing guardian in this organization' using errcode = '22023';
  end if;

  insert into public.team_staff (organization_id, team_id, user_id, role)
  values (target_organization_id, target_team_id, target_user_id, target_role)
  on conflict (team_id, user_id) do update set role = excluded.role;

  insert into public.memberships (organization_id, person_id, team_id, role)
  values (target_organization_id, guardian_person_id, target_team_id, 'leader')
  on conflict (organization_id, person_id, team_id, role) do update
    set starts_on = least(public.memberships.starts_on, current_date), ends_on = null;

  insert into public.audit_log (organization_id, actor_user_id, action, entity_type, entity_id, details)
  values (target_organization_id, auth.uid(), 'team_staff.assigned', 'team', target_team_id::text,
    jsonb_build_object('user_id', target_user_id, 'role', target_role));
end;
$$;

revoke all on function public.assign_existing_guardian_team_role(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.assign_existing_guardian_team_role(uuid, uuid, uuid, text) to authenticated;
