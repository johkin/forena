create table public.sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, slug),
  unique (organization_id, name)
);

alter table public.teams add column section_id uuid;
alter table public.teams add column slug text;

insert into public.sections (organization_id, slug, name)
select id, 'verksamhet', 'Verksamhet' from public.organizations;

update public.teams team
set section_id = section.id
from public.sections section
where section.organization_id = team.organization_id;

update public.teams
set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'));

alter table public.teams alter column section_id set not null;
alter table public.teams alter column slug set not null;
alter table public.teams add constraint teams_section_organization_fk
  foreign key (section_id, organization_id) references public.sections(id, organization_id) on delete cascade;
alter table public.teams add constraint teams_organization_slug_key unique (organization_id, slug);

create table public.section_staff (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  section_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('section_admin', 'editor')),
  created_at timestamptz not null default now(),
  primary key (section_id, user_id),
  foreign key (section_id, organization_id) references public.sections(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.team_staff (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('team_manager', 'coach', 'editor')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);

create index sections_organization_idx on public.sections(organization_id);
create index section_staff_user_idx on public.section_staff(user_id);
create index team_staff_user_idx on public.team_staff(user_id);

create trigger sections_touch_updated_at before update on public.sections
for each row execute function public.touch_updated_at();

create or replace function public.has_section_role(target_section_id uuid, allowed_roles text[], target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.section_staff
    where section_id = target_section_id
      and user_id = target_user_id
      and role = any(allowed_roles)
  );
$$;

create or replace function public.has_team_role(target_team_id uuid, allowed_roles text[], target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_staff
    where team_id = target_team_id
      and user_id = target_user_id
      and role = any(allowed_roles)
  );
$$;

create or replace function public.can_manage_team(target_team_id uuid, target_user_id uuid default auth.uid())
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
      and (
        public.has_organization_role(team.organization_id, array['owner', 'admin', 'leader'], target_user_id)
        or public.has_section_role(team.section_id, array['section_admin'], target_user_id)
        or public.has_team_role(team.id, array['team_manager', 'coach'], target_user_id)
      )
  );
$$;

revoke all on function public.has_section_role(uuid, text[], uuid) from public;
revoke all on function public.has_team_role(uuid, text[], uuid) from public;
revoke all on function public.can_manage_team(uuid, uuid) from public;
grant execute on function public.has_section_role(uuid, text[], uuid) to authenticated;
grant execute on function public.has_team_role(uuid, text[], uuid) to authenticated;
grant execute on function public.can_manage_team(uuid, uuid) to authenticated;

alter table public.sections enable row level security;
alter table public.section_staff enable row level security;
alter table public.team_staff enable row level security;

create policy "members can read sections" on public.sections
for select to authenticated using (public.is_organization_member(organization_id));
create policy "organization admins can manage sections" on public.sections
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read section staff" on public.section_staff
for select to authenticated using (public.is_organization_member(organization_id));
create policy "organization admins can manage section staff" on public.section_staff
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read team staff" on public.team_staff
for select to authenticated using (public.is_organization_member(organization_id));
create policy "organization and section admins can manage team staff" on public.team_staff
for all to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.teams
    where teams.id = team_staff.team_id
      and public.has_section_role(teams.section_id, array['section_admin'])
  )
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.teams
    where teams.id = team_staff.team_id
      and public.has_section_role(teams.section_id, array['section_admin'])
  )
);

drop policy "leaders can manage activities" on public.activities;
create policy "scoped leaders can manage activities" on public.activities
for all to authenticated using (team_id is not null and public.can_manage_team(team_id))
with check (team_id is not null and public.can_manage_team(team_id));

drop policy "leaders can create and delete invitations" on public.invitations;
drop policy "invitees and leaders can update invitations" on public.invitations;
drop policy "leaders can delete invitations" on public.invitations;

create policy "scoped leaders can create invitations" on public.invitations
for insert to authenticated with check (
  exists (select 1 from public.activities where activities.id = invitations.activity_id and public.can_manage_team(activities.team_id))
);
create policy "invitees and scoped leaders can update invitations" on public.invitations
for update to authenticated using (
  exists (select 1 from public.activities where activities.id = invitations.activity_id and public.can_manage_team(activities.team_id))
  or exists (select 1 from public.people where people.id = invitations.person_id and people.user_id = auth.uid())
  or exists (select 1 from public.person_guardians where person_guardians.person_id = invitations.person_id and person_guardians.guardian_user_id = auth.uid())
);
create policy "scoped leaders can delete invitations" on public.invitations
for delete to authenticated using (
  exists (select 1 from public.activities where activities.id = invitations.activity_id and public.can_manage_team(activities.team_id))
);
