create table public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  title text not null check (length(title) between 1 and 160),
  description text not null default '',
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'completed')),
  created_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  check ((status = 'open' and completed_at is null) or (status = 'completed' and completed_at is not null))
);

create index team_tasks_team_due_idx on public.team_tasks(team_id, due_at) where status = 'open';

create trigger team_tasks_touch_updated_at before update on public.team_tasks
for each row execute function public.touch_updated_at();

alter table public.team_tasks enable row level security;

create policy "team members can read tasks" on public.team_tasks
for select to authenticated using (public.is_organization_member(organization_id));

create policy "organization and section admins can create tasks" on public.team_tasks
for insert to authenticated with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.teams
    where teams.id = team_tasks.team_id
      and public.has_section_role(teams.section_id, array['section_admin'])
  )
);

create policy "scoped leaders can update tasks" on public.team_tasks
for update to authenticated using (public.can_manage_team(team_id))
with check (public.can_manage_team(team_id));

create policy "organization and section admins can delete tasks" on public.team_tasks
for delete to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.teams
    where teams.id = team_tasks.team_id
      and public.has_section_role(teams.section_id, array['section_admin'])
  )
);

alter table public.person_guardians add column contact_name text;
alter table public.person_guardians add column contact_phone text;

drop policy "members can read guardian links" on public.person_guardians;
create policy "guardians and scoped leaders can read guardian contacts" on public.person_guardians
for select to authenticated using (
  guardian_user_id = auth.uid()
  or exists (
    select 1
    from public.memberships
    where memberships.person_id = person_guardians.person_id
      and memberships.team_id is not null
      and public.can_manage_team(memberships.team_id)
  )
);
