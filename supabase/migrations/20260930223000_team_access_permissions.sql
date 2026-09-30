create schema if not exists private;

create table public.team_permissions (
  key text primary key,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.team_access_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, key)
);

create table public.team_access_profile_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  access_profile_id uuid not null,
  permission_key text not null references public.team_permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (access_profile_id, permission_key),
  foreign key (access_profile_id, organization_id)
    references public.team_access_profiles(id, organization_id) on delete cascade
);

create table public.team_access_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  person_id uuid not null,
  access_profile_id uuid not null,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  foreign key (team_id, organization_id)
    references public.teams(id, organization_id) on delete cascade,
  foreign key (person_id, organization_id)
    references public.people(id, organization_id) on delete cascade,
  foreign key (access_profile_id, organization_id)
    references public.team_access_profiles(id, organization_id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on),
  unique (team_id, person_id, access_profile_id, starts_on)
);

create index team_access_profiles_organization_idx
  on public.team_access_profiles(organization_id);
create index team_access_profile_permissions_profile_idx
  on public.team_access_profile_permissions(access_profile_id, organization_id);
create index team_access_assignments_team_idx
  on public.team_access_assignments(team_id, organization_id);
create index team_access_assignments_person_idx
  on public.team_access_assignments(person_id, organization_id);
create index team_access_assignments_profile_idx
  on public.team_access_assignments(access_profile_id, organization_id);

insert into public.team_permissions (key, description) values
  ('team.manage', 'Full operational access to a team workspace'),
  ('activity.manage', 'Create and edit team activities'),
  ('invitation.manage', 'Manage activity invitations and reminders'),
  ('attendance.manage', 'Report and edit attendance'),
  ('roster.manage', 'Manage team membership and guardian links'),
  ('responsibility.manage', 'Manage team responsibilities'),
  ('task.manage', 'Manage team tasks')
on conflict (key) do nothing;

create or replace function private.seed_default_team_access_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_record record;
begin
  insert into public.team_access_profiles (organization_id, key, name)
  values
    (new.id, 'team_admin', 'Lagadministratör'),
    (new.id, 'team_editor', 'Lagredaktör'),
    (new.id, 'attendance_manager', 'Närvarohanterare')
  on conflict (organization_id, key) do nothing;

  for profile_record in
    select id, key
    from public.team_access_profiles
    where organization_id = new.id
  loop
    if profile_record.key = 'team_admin' then
      insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
      select new.id, profile_record.id, permission.key
      from public.team_permissions permission
      on conflict do nothing;
    elsif profile_record.key = 'team_editor' then
      insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
      select new.id, profile_record.id, permission.key
      from public.team_permissions permission
      where permission.key in ('activity.manage', 'invitation.manage', 'attendance.manage', 'task.manage')
      on conflict do nothing;
    elsif profile_record.key = 'attendance_manager' then
      insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
      values (new.id, profile_record.id, 'attendance.manage')
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$$;

do $$
declare
  organization_record record;
begin
  for organization_record in select id from public.organizations loop
    perform private.seed_default_team_access_profiles()
    from (select organization_record.id as id) new_row;
  end loop;
end
$$;

-- The trigger function above expects NEW and cannot be called directly in normal SQL.
-- Seed existing organizations explicitly.
insert into public.team_access_profiles (organization_id, key, name)
select organization.id, profile.key, profile.name
from public.organizations organization
cross join (values
  ('team_admin', 'Lagadministratör'),
  ('team_editor', 'Lagredaktör'),
  ('attendance_manager', 'Närvarohanterare')
) profile(key, name)
on conflict (organization_id, key) do nothing;

insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
select profile.organization_id, profile.id, permission.key
from public.team_access_profiles profile
join public.team_permissions permission
  on profile.key = 'team_admin'
  or (profile.key = 'team_editor' and permission.key in ('activity.manage', 'invitation.manage', 'attendance.manage', 'task.manage'))
  or (profile.key = 'attendance_manager' and permission.key = 'attendance.manage')
on conflict do nothing;

drop trigger if exists organizations_seed_team_access_profiles on public.organizations;
create trigger organizations_seed_team_access_profiles
after insert on public.organizations
for each row execute function private.seed_default_team_access_profiles();

insert into public.team_access_assignments (
  organization_id, team_id, person_id, access_profile_id, starts_on
)
select
  staff.organization_id,
  staff.team_id,
  person.id,
  profile.id,
  staff.created_at::date
from public.team_staff staff
join public.people person
  on person.organization_id = staff.organization_id
 and person.user_id = staff.user_id
join public.team_access_profiles profile
  on profile.organization_id = staff.organization_id
 and profile.key = case
   when staff.role in ('team_manager', 'coach') then 'team_admin'
   else 'team_editor'
 end
on conflict do nothing;

create or replace function private.has_team_permission(
  target_team_id uuid,
  target_permission text,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams team
    where team.id = target_team_id
      and target_user_id is not null
      and (
        exists (
          select 1
          from public.organization_members member
          where member.organization_id = team.organization_id
            and member.user_id = target_user_id
            and member.role in ('owner', 'admin')
        )
        or exists (
          select 1
          from public.section_staff staff
          where staff.section_id = team.section_id
            and staff.organization_id = team.organization_id
            and staff.user_id = target_user_id
            and staff.role = 'section_admin'
        )
        or exists (
          select 1
          from public.people person
          join public.team_access_assignments assignment
            on assignment.person_id = person.id
           and assignment.organization_id = person.organization_id
           and assignment.team_id = team.id
          join public.team_access_profile_permissions profile_permission
            on profile_permission.access_profile_id = assignment.access_profile_id
           and profile_permission.organization_id = assignment.organization_id
          where person.organization_id = team.organization_id
            and person.user_id = target_user_id
            and profile_permission.permission_key = target_permission
            and assignment.starts_on <= current_date
            and (assignment.ends_on is null or assignment.ends_on >= current_date)
        )
      )
  );
$$;

create or replace function public.has_team_permission(
  target_team_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_team_permission(target_team_id, target_permission, auth.uid());
$$;

create or replace function public.can_manage_team(
  target_team_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_team_permission(target_team_id, 'team.manage', target_user_id);
$$;

revoke all on function private.seed_default_team_access_profiles() from public;
revoke all on function private.has_team_permission(uuid, text, uuid) from public;
revoke all on function public.has_team_permission(uuid, text) from public;
revoke all on function public.can_manage_team(uuid, uuid) from public;
revoke all on function public.has_team_permission(uuid, text) from anon;
revoke all on function public.can_manage_team(uuid, uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.has_team_permission(uuid, text, uuid) to authenticated;
grant execute on function public.has_team_permission(uuid, text) to authenticated;
grant execute on function public.can_manage_team(uuid, uuid) to authenticated;

alter table public.team_permissions enable row level security;
alter table public.team_access_profiles enable row level security;
alter table public.team_access_profile_permissions enable row level security;
alter table public.team_access_assignments enable row level security;

create policy "authenticated can read team permissions"
on public.team_permissions for select to authenticated
using (true);

create policy "members can read team access profiles"
on public.team_access_profiles for select to authenticated
using (public.is_organization_member(organization_id));

create policy "organization admins can manage team access profiles"
on public.team_access_profiles for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read team access profile permissions"
on public.team_access_profile_permissions for select to authenticated
using (public.is_organization_member(organization_id));

create policy "organization admins can manage team access profile permissions"
on public.team_access_profile_permissions for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read team access assignments"
on public.team_access_assignments for select to authenticated
using (public.is_organization_member(organization_id));

create policy "organization and section admins can manage team access assignments"
on public.team_access_assignments for all to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.teams team
    where team.id = team_access_assignments.team_id
      and team.organization_id = team_access_assignments.organization_id
      and public.has_section_role(team.section_id, array['section_admin'])
  )
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.teams team
    where team.id = team_access_assignments.team_id
      and team.organization_id = team_access_assignments.organization_id
      and public.has_section_role(team.section_id, array['section_admin'])
  )
);

revoke all on public.team_permissions from anon;
revoke all on public.team_access_profiles from anon;
revoke all on public.team_access_profile_permissions from anon;
revoke all on public.team_access_assignments from anon;
grant select on public.team_permissions to authenticated;
grant select, insert, update, delete on public.team_access_profiles to authenticated;
grant select, insert, update, delete on public.team_access_profile_permissions to authenticated;
grant select, insert, update, delete on public.team_access_assignments to authenticated;

create trigger team_access_profiles_touch_updated_at
before update on public.team_access_profiles
for each row execute function public.touch_updated_at();

drop policy if exists "organization admins can record role changes" on public.audit_log;
create policy "organization admins can record team access changes" on public.audit_log
for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and public.has_organization_role(organization_id, array['owner', 'admin'])
  and action = 'team_access.assigned'
);

create or replace function public.assign_existing_guardian_team_access(
  target_organization_id uuid,
  target_team_id uuid,
  target_user_id uuid,
  target_responsibility_slug text,
  target_access_profile_key text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  guardian_person_id uuid;
  responsibility_type_id uuid;
  access_profile_id uuid;
begin
  if not public.has_organization_role(target_organization_id, array['owner', 'admin']) then
    raise exception 'Only organization admins can assign team access' using errcode = '42501';
  end if;

  if target_responsibility_slug not in ('lagledare', 'tranare') then
    raise exception 'Invalid team responsibility' using errcode = '22023';
  end if;

  if target_access_profile_key not in ('team_admin', 'team_editor', 'attendance_manager') then
    raise exception 'Invalid team access profile' using errcode = '22023';
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
    on member.organization_id = person.organization_id
   and member.user_id = person.user_id
  where person.organization_id = target_organization_id
    and person.user_id = target_user_id
    and exists (
      select 1
      from public.person_guardians guardian
      where guardian.organization_id = person.organization_id
        and guardian.guardian_user_id = target_user_id
    );

  if guardian_person_id is null then
    raise exception 'The user is not an existing guardian in this organization' using errcode = '22023';
  end if;

  select type.id into responsibility_type_id
  from public.responsibility_types type
  where type.organization_id = target_organization_id
    and type.slug = target_responsibility_slug;

  if responsibility_type_id is null then
    raise exception 'Responsibility type is missing' using errcode = '22023';
  end if;

  select profile.id into access_profile_id
  from public.team_access_profiles profile
  where profile.organization_id = target_organization_id
    and profile.key = target_access_profile_key;

  if access_profile_id is null then
    raise exception 'Access profile is missing' using errcode = '22023';
  end if;

  insert into public.memberships (organization_id, person_id, team_id, role)
  values (target_organization_id, guardian_person_id, target_team_id, 'leader')
  on conflict (organization_id, person_id, team_id, role) do update
    set starts_on = least(public.memberships.starts_on, current_date),
        ends_on = null;

  insert into public.team_responsibilities (
    organization_id, team_id, user_id, person_id, responsibility_type_id
  )
  values (
    target_organization_id, target_team_id, target_user_id, guardian_person_id, responsibility_type_id
  )
  on conflict do nothing;

  insert into public.team_access_assignments (
    organization_id, team_id, person_id, access_profile_id
  )
  values (
    target_organization_id, target_team_id, guardian_person_id, access_profile_id
  )
  on conflict do nothing;

  insert into public.audit_log (
    organization_id, actor_user_id, action, entity_type, entity_id, details
  )
  values (
    target_organization_id,
    auth.uid(),
    'team_access.assigned',
    'team',
    target_team_id::text,
    jsonb_build_object(
      'person_id', guardian_person_id,
      'responsibility', target_responsibility_slug,
      'access_profile', target_access_profile_key
    )
  );
end;
$$;

revoke all on function public.assign_existing_guardian_team_access(uuid, uuid, uuid, text, text) from public;
revoke all on function public.assign_existing_guardian_team_access(uuid, uuid, uuid, text, text) from anon;
grant execute on function public.assign_existing_guardian_team_access(uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.assign_existing_guardian_team_role(
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
begin
  if target_role = 'team_manager' then
    perform public.assign_existing_guardian_team_access(
      target_organization_id, target_team_id, target_user_id, 'lagledare', 'team_admin'
    );
  elsif target_role = 'coach' then
    perform public.assign_existing_guardian_team_access(
      target_organization_id, target_team_id, target_user_id, 'tranare', 'team_admin'
    );
  else
    raise exception 'Invalid team role' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assign_existing_guardian_team_role(uuid, uuid, uuid, text) from public;
revoke all on function public.assign_existing_guardian_team_role(uuid, uuid, uuid, text) from anon;
grant execute on function public.assign_existing_guardian_team_role(uuid, uuid, uuid, text) to authenticated;

drop function public.has_team_role(uuid, text[], uuid);
drop table public.team_staff;
