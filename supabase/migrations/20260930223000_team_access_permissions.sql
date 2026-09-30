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
  ('team.view', 'Open and view a team workspace'),
  ('team.manage', 'Full operational access to a team workspace'),
  ('activity.manage', 'Create and edit team activities'),
  ('invitation.manage', 'Manage activity invitations and reminders'),
  ('attendance.manage', 'Report and edit attendance'),
  ('roster.manage', 'Manage team membership, groups and guardian links'),
  ('responsibility.manage', 'Manage team responsibilities'),
  ('task.manage', 'Manage team tasks')
on conflict (key) do nothing;

insert into public.team_access_profiles (organization_id, key, name)
select organization.id, profile.key, profile.name
from public.organizations organization
cross join (values
  ('team_admin', 'Lagadministratör'),
  ('team_editor', 'Lagredaktör'),
  ('attendance_manager', 'Närvarohanterare'),
  ('team_viewer', 'Lagvisning')
) profile(key, name)
on conflict (organization_id, key) do nothing;

insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
select profile.organization_id, profile.id, permission.key
from public.team_access_profiles profile
join public.team_permissions permission
  on profile.key = 'team_admin'
  or (
    profile.key = 'team_editor'
    and permission.key in ('team.view', 'activity.manage', 'invitation.manage', 'attendance.manage', 'task.manage')
  )
  or (
    profile.key = 'attendance_manager'
    and permission.key in ('team.view', 'attendance.manage')
  )
  or (
    profile.key = 'team_viewer'
    and permission.key = 'team.view'
  )
on conflict do nothing;

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
    (new.id, 'attendance_manager', 'Närvarohanterare'),
    (new.id, 'team_viewer', 'Lagvisning')
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
      where permission.key in ('team.view', 'activity.manage', 'invitation.manage', 'attendance.manage', 'task.manage')
      on conflict do nothing;
    elsif profile_record.key = 'attendance_manager' then
      insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
      select new.id, profile_record.id, permission.key
      from public.team_permissions permission
      where permission.key in ('team.view', 'attendance.manage')
      on conflict do nothing;
    elsif profile_record.key = 'team_viewer' then
      insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
      values (new.id, profile_record.id, 'team.view')
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.seed_default_team_access_profiles() from public;

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
   else 'team_viewer'
 end
on conflict do nothing;

alter table public.team_responsibilities
  drop column user_id;

alter table public.team_responsibilities
  add constraint team_responsibilities_person_type_start_key
  unique (team_id, person_id, responsibility_type_id, starts_on);


create or replace function public.materialize_due_activity_invitations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $materialize$
declare
  inserted_count integer := 0;
begin
  create temporary table if not exists due_invitation_activities_v3 (
    id uuid primary key,
    organization_id uuid not null,
    team_id uuid not null,
    invitation_audience_kind text not null,
    invitation_group_id uuid,
    invitation_audience_roles text[] not null,
    invitation_audience_group_ids uuid[] not null,
    invitation_audience_responsibility_type_ids uuid[] not null
  ) on commit drop;
  truncate due_invitation_activities_v3;

  insert into due_invitation_activities_v3
  select
    activity.id,
    activity.organization_id,
    activity.team_id,
    activity.invitation_audience_kind,
    activity.invitation_group_id,
    activity.invitation_audience_roles,
    activity.invitation_audience_group_ids,
    activity.invitation_audience_responsibility_type_ids
  from public.activities activity
  where activity.status = 'published'
    and activity.invitation_send_at is not null
    and activity.invitation_send_at <= now()
    and activity.invitation_audience_kind is not null
    and activity.invitation_materialized_at is null
    and activity.team_id is not null
  order by activity.invitation_send_at
  for update skip locked
  limit greatest(1, least(batch_size, 500));

  with audience_people as (
    select distinct due.id as activity_id, due.organization_id, membership.person_id
    from due_invitation_activities_v3 due
    join public.memberships membership
      on membership.team_id = due.team_id
     and membership.organization_id = due.organization_id
    where due.invitation_audience_kind = 'players'
      and membership.role = 'participant'
      and membership.starts_on <= current_date
      and (membership.ends_on is null or membership.ends_on >= current_date)

    union

    select distinct due.id, due.organization_id, membership.person_id
    from due_invitation_activities_v3 due
    join public.memberships membership
      on membership.team_id = due.team_id
     and membership.organization_id = due.organization_id
    where due.invitation_audience_kind = 'leaders'
      and membership.role = 'leader'
      and membership.starts_on <= current_date
      and (membership.ends_on is null or membership.ends_on >= current_date)

    union

    select distinct due.id, due.organization_id, group_member.person_id
    from due_invitation_activities_v3 due
    join public.team_group_members group_member
      on group_member.group_id = due.invitation_group_id
     and group_member.organization_id = due.organization_id
    join public.memberships membership
      on membership.team_id = due.team_id
     and membership.organization_id = due.organization_id
     and membership.person_id = group_member.person_id
     and membership.role in ('participant', 'leader')
     and membership.starts_on <= current_date
     and (membership.ends_on is null or membership.ends_on >= current_date)
    where due.invitation_audience_kind = 'group'

    union

    select distinct due.id, due.organization_id, membership.person_id
    from due_invitation_activities_v3 due
    join public.memberships membership
      on membership.team_id = due.team_id
     and membership.organization_id = due.organization_id
    where due.invitation_audience_kind = 'selection'
      and membership.role = any(due.invitation_audience_roles)
      and membership.starts_on <= current_date
      and (membership.ends_on is null or membership.ends_on >= current_date)

    union

    select distinct due.id, due.organization_id, group_member.person_id
    from due_invitation_activities_v3 due
    join public.team_group_members group_member
      on group_member.group_id = any(due.invitation_audience_group_ids)
     and group_member.organization_id = due.organization_id
    join public.team_groups team_group
      on team_group.id = group_member.group_id
     and team_group.team_id = due.team_id
     and team_group.organization_id = due.organization_id
    join public.memberships membership
      on membership.team_id = due.team_id
     and membership.organization_id = due.organization_id
     and membership.person_id = group_member.person_id
     and membership.role in ('participant', 'leader')
     and membership.starts_on <= current_date
     and (membership.ends_on is null or membership.ends_on >= current_date)
    where due.invitation_audience_kind = 'selection'

    union

    select distinct due.id, due.organization_id, responsibility.person_id
    from due_invitation_activities_v3 due
    join public.team_responsibilities responsibility
      on responsibility.team_id = due.team_id
     and responsibility.organization_id = due.organization_id
     and responsibility.responsibility_type_id = any(due.invitation_audience_responsibility_type_ids)
     and responsibility.starts_on <= current_date
     and (responsibility.ends_on is null or responsibility.ends_on >= current_date)
    where due.invitation_audience_kind = 'selection'
  ),
  inserted as (
    insert into public.invitations (organization_id, activity_id, person_id)
    select audience.organization_id, audience.activity_id, audience.person_id
    from audience_people audience
    on conflict (activity_id, person_id) do nothing
    returning id
  )
  select count(*) into inserted_count from inserted;

  update public.activities activity
  set invitation_materialized_at = now()
  from due_invitation_activities_v3 due
  where activity.id = due.id;

  return inserted_count;
end;
$materialize$;

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

revoke all on function private.has_team_permission(uuid, text, uuid) from public;

create or replace function public.has_team_permission(
  target_team_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
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
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid()
     and private.has_team_permission(target_team_id, 'team.manage', target_user_id);
$$;

revoke all on function public.has_team_permission(uuid, text) from public;
revoke all on function public.can_manage_team(uuid, uuid) from public;
revoke all on function public.has_team_permission(uuid, text) from anon;
revoke all on function public.can_manage_team(uuid, uuid) from anon;
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

alter table public.responsibility_types
  drop column capabilities;

drop policy if exists "scoped leaders can manage activities" on public.activities;
create policy "team activity managers can manage activities"
on public.activities for all to authenticated
using (team_id is not null and public.has_team_permission(team_id, 'activity.manage'))
with check (team_id is not null and public.has_team_permission(team_id, 'activity.manage'));

drop policy if exists "leaders can insert activity series" on public.activity_series;
drop policy if exists "leaders can update activity series" on public.activity_series;
drop policy if exists "leaders can delete activity series" on public.activity_series;
create policy "team activity managers can insert activity series"
on public.activity_series for insert to authenticated
with check (public.has_team_permission(team_id, 'activity.manage'));
create policy "team activity managers can update activity series"
on public.activity_series for update to authenticated
using (public.has_team_permission(team_id, 'activity.manage'))
with check (public.has_team_permission(team_id, 'activity.manage'));
create policy "team activity managers can delete activity series"
on public.activity_series for delete to authenticated
using (public.has_team_permission(team_id, 'activity.manage'));

drop policy if exists "scoped leaders can create invitations" on public.invitations;
drop policy if exists "invitees and scoped leaders can update invitations" on public.invitations;
drop policy if exists "scoped leaders can delete invitations" on public.invitations;
drop policy if exists "scoped users can read invitations" on public.invitations;
create policy "team invitation managers can create invitations"
on public.invitations for insert to authenticated
with check (
  exists (
    select 1 from public.activities activity
    where activity.id = invitations.activity_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'invitation.manage')
  )
);
create policy "invitees and team invitation managers can update invitations"
on public.invitations for update to authenticated
using (
  exists (
    select 1 from public.activities activity
    where activity.id = invitations.activity_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'invitation.manage')
  )
  or exists (
    select 1 from public.people person
    where person.id = invitations.person_id
      and person.user_id = auth.uid()
  )
  or exists (
    select 1 from public.person_guardians guardian
    where guardian.person_id = invitations.person_id
      and guardian.guardian_user_id = auth.uid()
  )
);
create policy "team invitation managers can delete invitations"
on public.invitations for delete to authenticated
using (
  exists (
    select 1 from public.activities activity
    where activity.id = invitations.activity_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'invitation.manage')
  )
);
create policy "scoped users can read invitations"
on public.invitations for select to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.activities activity
    where activity.id = invitations.activity_id
      and activity.organization_id = invitations.organization_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'invitation.manage')
  )
  or exists (
    select 1
    from public.people person
    where person.id = invitations.person_id
      and person.organization_id = invitations.organization_id
      and person.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.person_guardians guardian
    where guardian.person_id = invitations.person_id
      and guardian.organization_id = invitations.organization_id
      and guardian.guardian_user_id = auth.uid()
  )
);

drop policy if exists "team leaders can manage reminder schedules" on public.activity_reminder_schedules;
create policy "team invitation managers can manage reminder schedules"
on public.activity_reminder_schedules for all to authenticated
using (
  exists (
    select 1 from public.activities activity
    where activity.id = activity_reminder_schedules.activity_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'invitation.manage')
  )
)
with check (
  exists (
    select 1 from public.activities activity
    where activity.id = activity_reminder_schedules.activity_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'invitation.manage')
  )
);

drop policy if exists "activity events manageable by team managers" on public.activity_events;
create policy "activity events manageable by invitation managers"
on public.activity_events for insert to authenticated
with check (
  exists (
    select 1 from public.activities activity
    where activity.id = activity_events.activity_id
      and activity.organization_id = activity_events.organization_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'invitation.manage')
  )
);

drop policy if exists "team leaders can manage attendance reports" on public.activity_attendance_reports;
create policy "team attendance managers can manage attendance reports"
on public.activity_attendance_reports for all to authenticated
using (
  exists (
    select 1 from public.activities activity
    where activity.id = activity_attendance_reports.activity_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'attendance.manage')
  )
)
with check (
  exists (
    select 1 from public.activities activity
    where activity.id = activity_attendance_reports.activity_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'attendance.manage')
  )
);

drop policy if exists "team leaders can manage attendance records" on public.activity_attendance_records;
create policy "team attendance managers can manage attendance records"
on public.activity_attendance_records for all to authenticated
using (
  exists (
    select 1
    from public.activity_attendance_reports report
    join public.activities activity on activity.id = report.activity_id
    where report.id = activity_attendance_records.report_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'attendance.manage')
  )
)
with check (
  exists (
    select 1
    from public.activity_attendance_reports report
    join public.activities activity on activity.id = report.activity_id
    where report.id = activity_attendance_records.report_id
      and activity.team_id is not null
      and public.has_team_permission(activity.team_id, 'attendance.manage')
  )
);

drop policy if exists "scoped leaders can manage memberships" on public.memberships;
create policy "team roster managers can manage memberships"
on public.memberships for all to authenticated
using (
  (team_id is not null and public.has_team_permission(team_id, 'roster.manage'))
  or public.has_organization_role(organization_id, array['owner', 'admin'])
)
with check (
  (team_id is not null and public.has_team_permission(team_id, 'roster.manage'))
  or public.has_organization_role(organization_id, array['owner', 'admin'])
);

drop policy if exists "scoped leaders can manage people" on public.people;
create policy "team roster managers can manage people"
on public.people for all to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = people.id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = people.id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
);

drop policy if exists "scoped leaders can manage guardian links" on public.person_guardians;
drop policy if exists "guardians and scoped leaders can read guardian contacts" on public.person_guardians;
create policy "guardians and team roster managers can read guardian contacts"
on public.person_guardians for select to authenticated
using (
  guardian_user_id = auth.uid()
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_guardians.person_id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
);
create policy "team roster managers can manage guardian links"
on public.person_guardians for all to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_guardians.person_id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_guardians.person_id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
);

drop policy if exists "team managers can read player login emails" on public.person_login_emails;
drop policy if exists "team managers can create player login emails" on public.person_login_emails;
drop policy if exists "team managers can update player login emails" on public.person_login_emails;
create policy "team roster managers can read player login emails"
on public.person_login_emails for select to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
);
create policy "team roster managers can create player login emails"
on public.person_login_emails for insert to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
);
create policy "team roster managers can update player login emails"
on public.person_login_emails for update to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.has_team_permission(membership.team_id, 'roster.manage')
  )
);

drop policy if exists "team managers can create team groups" on public.team_groups;
drop policy if exists "team managers can update team groups" on public.team_groups;
drop policy if exists "team managers can delete team groups" on public.team_groups;
create policy "team roster managers can create team groups"
on public.team_groups for insert to authenticated
with check (public.has_team_permission(team_id, 'roster.manage'));
create policy "team roster managers can update team groups"
on public.team_groups for update to authenticated
using (public.has_team_permission(team_id, 'roster.manage'))
with check (public.has_team_permission(team_id, 'roster.manage'));
create policy "team roster managers can delete team groups"
on public.team_groups for delete to authenticated
using (public.has_team_permission(team_id, 'roster.manage'));

drop policy if exists "team managers can add team group members" on public.team_group_members;
drop policy if exists "team managers can delete team group members" on public.team_group_members;
create policy "team roster managers can add team group members"
on public.team_group_members for insert to authenticated
with check (
  exists (
    select 1 from public.team_groups team_group
    where team_group.id = team_group_members.group_id
      and public.has_team_permission(team_group.team_id, 'roster.manage')
  )
);
create policy "team roster managers can delete team group members"
on public.team_group_members for delete to authenticated
using (
  exists (
    select 1 from public.team_groups team_group
    where team_group.id = team_group_members.group_id
      and public.has_team_permission(team_group.team_id, 'roster.manage')
  )
);

drop policy if exists "team managers can invite guardians and admins can invite leaders" on public.team_member_invitations;
drop policy if exists "team managers can invite guardians and admins can invite leader" on public.team_member_invitations;
drop policy if exists "team managers can read member invitations" on public.team_member_invitations;
drop policy if exists "team managers can delete member invitations" on public.team_member_invitations;
create policy "team roster managers can invite guardians and admins can invite leaders"
on public.team_member_invitations for insert to authenticated
with check (
  public.has_team_permission(team_id, 'roster.manage')
  and (role <> 'leader' or public.has_organization_role(organization_id, array['owner', 'admin']))
  and invited_by = auth.uid()
  and accepted_at is null
  and accepted_by is null
);
create policy "team roster managers can read member invitations"
on public.team_member_invitations for select to authenticated
using (public.has_team_permission(team_id, 'roster.manage'));
create policy "team roster managers can delete member invitations"
on public.team_member_invitations for delete to authenticated
using (public.has_team_permission(team_id, 'roster.manage'));

drop policy if exists "team managers can insert responsibilities" on public.team_responsibilities;
drop policy if exists "team managers can update responsibilities" on public.team_responsibilities;
drop policy if exists "team managers can delete responsibilities" on public.team_responsibilities;
create policy "team responsibility managers can insert responsibilities"
on public.team_responsibilities for insert to authenticated
with check (public.has_team_permission(team_id, 'responsibility.manage'));
create policy "team responsibility managers can update responsibilities"
on public.team_responsibilities for update to authenticated
using (public.has_team_permission(team_id, 'responsibility.manage'))
with check (public.has_team_permission(team_id, 'responsibility.manage'));
create policy "team responsibility managers can delete responsibilities"
on public.team_responsibilities for delete to authenticated
using (public.has_team_permission(team_id, 'responsibility.manage'));

drop policy if exists "scoped leaders can update tasks" on public.team_tasks;
create policy "team task managers can update tasks"
on public.team_tasks for update to authenticated
using (public.has_team_permission(team_id, 'task.manage'))
with check (public.has_team_permission(team_id, 'task.manage'));

drop policy if exists "organization admins can record role changes" on public.audit_log;
create policy "organization admins can record team access changes"
on public.audit_log for insert to authenticated
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
  selected_access_profile_id uuid;
begin
  if not public.has_organization_role(target_organization_id, array['owner', 'admin']) then
    raise exception 'Only organization admins can assign team access' using errcode = '42501';
  end if;

  if target_responsibility_slug not in ('lagledare', 'tranare') then
    raise exception 'Invalid team responsibility' using errcode = '22023';
  end if;

  if target_access_profile_key not in ('team_admin', 'team_editor', 'attendance_manager', 'team_viewer') then
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
      select 1 from public.person_guardians guardian
      where guardian.organization_id = person.organization_id
        and guardian.guardian_user_id = target_user_id
    );

  if guardian_person_id is null then
    raise exception 'The user is not an existing guardian in this organization' using errcode = '22023';
  end if;

  select responsibility.id into responsibility_type_id
  from public.responsibility_types responsibility
  where responsibility.organization_id = target_organization_id
    and responsibility.slug = target_responsibility_slug;

  if responsibility_type_id is null then
    raise exception 'Responsibility type is missing' using errcode = '22023';
  end if;

  select profile.id into selected_access_profile_id
  from public.team_access_profiles profile
  where profile.organization_id = target_organization_id
    and profile.key = target_access_profile_key;

  if selected_access_profile_id is null then
    raise exception 'Access profile is missing' using errcode = '22023';
  end if;

  insert into public.memberships (organization_id, person_id, team_id, role)
  values (target_organization_id, guardian_person_id, target_team_id, 'leader')
  on conflict (organization_id, person_id, team_id, role) do update
    set starts_on = least(public.memberships.starts_on, current_date),
        ends_on = null;

  insert into public.team_responsibilities (
    organization_id, team_id, person_id, responsibility_type_id
  )
  values (
    target_organization_id, target_team_id, guardian_person_id, responsibility_type_id
  )
  on conflict do nothing;

  delete from public.team_access_assignments
  where organization_id = target_organization_id
    and team_id = target_team_id
    and person_id = guardian_person_id
    and ends_on is null;

  insert into public.team_access_assignments (
    organization_id, team_id, person_id, access_profile_id
  )
  values (
    target_organization_id, target_team_id, guardian_person_id, selected_access_profile_id
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


create or replace function public.queue_activity_invitation(target_activity_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_activity public.activities%rowtype;
  queued_count integer := 0;
begin
  select * into target_activity
  from public.activities
  where id = target_activity_id;

  if target_activity.id is null or target_activity.team_id is null then
    raise exception 'Activity not found';
  end if;
  if not public.has_team_permission(target_activity.team_id, 'invitation.manage') then
    raise exception 'Not allowed';
  end if;

  with invited_people as (
    select distinct invitation.person_id
    from public.invitations invitation
    where invitation.activity_id = target_activity_id
  ),
  recipients as (
    select distinct person.user_id
    from invited_people invited
    join public.people person on person.id = invited.person_id
    where person.user_id is not null
    union
    select distinct guardian.guardian_user_id
    from invited_people invited
    join public.person_guardians guardian on guardian.person_id = invited.person_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      target_activity.organization_id,
      recipient.user_id,
      'activity_invitation',
      jsonb_build_object(
        'activityId', target_activity.id,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at,
        'location', target_activity.location
      ),
      coalesce(target_activity.invitation_send_at, now()),
      'pending'
    from recipients recipient
    where not exists (
      select 1
      from public.notification_outbox existing
      where existing.user_id = recipient.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = target_activity.id::text
        and existing.status <> 'cancelled'
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$function$;

create or replace function public.queue_activity_invitation(
  target_activity_id uuid,
  target_person_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_activity public.activities%rowtype;
  queued_count integer := 0;
begin
  select * into target_activity
  from public.activities
  where id = target_activity_id;

  if target_activity.id is null or target_activity.team_id is null then
    raise exception 'Activity not found';
  end if;
  if not public.has_team_permission(target_activity.team_id, 'invitation.manage') then
    raise exception 'Not allowed';
  end if;

  with invited_people as (
    select distinct invitation.person_id
    from public.invitations invitation
    where invitation.activity_id = target_activity_id
      and invitation.person_id = any(target_person_ids)
  ),
  recipients as (
    select distinct person.user_id
    from invited_people invited
    join public.people person on person.id = invited.person_id
    where person.user_id is not null
    union
    select distinct guardian.guardian_user_id
    from invited_people invited
    join public.person_guardians guardian on guardian.person_id = invited.person_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      target_activity.organization_id,
      recipient.user_id,
      'activity_invitation',
      jsonb_build_object(
        'activityId', target_activity.id,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at,
        'location', target_activity.location
      ),
      now(),
      'pending'
    from recipients recipient
    where not exists (
      select 1
      from public.notification_outbox existing
      where existing.user_id = recipient.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = target_activity.id::text
        and existing.status <> 'cancelled'
        and not (existing.status = 'failed' and existing.attempts >= 5)
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$function$;

create or replace function public.queue_activity_reminder(target_activity_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_activity public.activities%rowtype;
  queued_count integer := 0;
begin
  select * into target_activity
  from public.activities
  where id = target_activity_id;

  if target_activity.id is null or target_activity.team_id is null then
    raise exception 'Activity not found';
  end if;
  if not public.has_team_permission(target_activity.team_id, 'invitation.manage') then
    raise exception 'Not allowed';
  end if;

  with pending_people as (
    select distinct invitation.person_id
    from public.invitations invitation
    where invitation.activity_id = target_activity_id
      and invitation.response = 'pending'
  ),
  recipients as (
    select distinct person.user_id
    from pending_people pending
    join public.people person on person.id = pending.person_id
    where person.user_id is not null
    union
    select distinct guardian.guardian_user_id
    from pending_people pending
    join public.person_guardians guardian on guardian.person_id = pending.person_id
  ),
  inserted as (
    insert into public.notification_outbox (
      organization_id, user_id, type, payload, scheduled_at, status
    )
    select
      target_activity.organization_id,
      recipient.user_id,
      'invitation_reminder',
      jsonb_build_object(
        'activityId', target_activity.id,
        'teamId', target_activity.team_id,
        'title', target_activity.title,
        'startsAt', target_activity.starts_at
      ),
      now(),
      'pending'
    from recipients recipient
    returning id
  )
  select count(*) into queued_count from inserted;

  insert into public.activity_events (
    organization_id,
    activity_id,
    event_type,
    recipient_count,
    metadata,
    created_by
  )
  values (
    target_activity.organization_id,
    target_activity.id,
    'reminder_scheduled',
    queued_count,
    jsonb_build_object(
      'queuedAt', now(),
      'pendingInvitations', (
        select count(*)
        from public.invitations
        where activity_id = target_activity.id
          and response = 'pending'
      )
    ),
    auth.uid()
  );

  return queued_count;
end;
$function$;

create or replace function public.get_activity_delivery_status(target_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_team_id uuid;
begin
  select activity.team_id
  into target_team_id
  from public.activities activity
  where activity.id = target_activity_id;

  if target_team_id is null
     or not public.has_team_permission(target_team_id, 'invitation.manage') then
    raise exception 'Not allowed';
  end if;

  return (
    select jsonb_build_object(
      'queued', count(*) filter (where outbox.status in ('pending', 'processing')),
      'sent', count(*) filter (where outbox.status = 'sent'),
      'failed', count(*) filter (where outbox.status = 'failed'),
      'deliveries', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'outboxId', outbox.id,
            'type', outbox.type,
            'status', outbox.status,
            'scheduledAt', outbox.scheduled_at,
            'sentAt', outbox.sent_at,
            'attempts', outbox.attempts,
            'lastError', outbox.last_error,
            'channels', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'channel', delivery.channel,
                  'status', delivery.status,
                  'provider', delivery.provider,
                  'attempts', delivery.attempts,
                  'sentAt', delivery.sent_at,
                  'lastError', delivery.last_error
                )
                order by delivery.channel
              )
              from public.notification_deliveries delivery
              where delivery.outbox_id = outbox.id
            ), '[]'::jsonb)
          )
          order by outbox.created_at desc
        ),
        '[]'::jsonb
      )
    )
    from public.notification_outbox outbox
    where outbox.payload ->> 'activityId' = target_activity_id::text
  );
end;
$function$;

revoke all on function public.queue_activity_invitation(uuid) from public, anon;
revoke all on function public.queue_activity_invitation(uuid, uuid[]) from public, anon;
revoke all on function public.queue_activity_reminder(uuid) from public, anon;
revoke all on function public.get_activity_delivery_status(uuid) from public, anon;
grant execute on function public.queue_activity_invitation(uuid) to authenticated;
grant execute on function public.queue_activity_invitation(uuid, uuid[]) to authenticated;
grant execute on function public.queue_activity_reminder(uuid) to authenticated;
grant execute on function public.get_activity_delivery_status(uuid) to authenticated;

drop function public.assign_existing_guardian_team_role(uuid, uuid, uuid, text);
drop function public.has_team_role(uuid, text[], uuid);
drop table public.team_staff;
