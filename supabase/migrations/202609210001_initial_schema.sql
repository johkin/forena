create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  assistant_name text not null default 'Föreningsassistenten' check (length(assistant_name) between 1 and 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'leader', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  season text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name, season)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, user_id)
);

create table public.person_guardians (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_id, guardian_user_id),
  foreign key (person_id, organization_id) references public.people(id, organization_id) on delete cascade
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  team_id uuid,
  role text not null check (role in ('participant', 'leader', 'volunteer')),
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  unique nulls not distinct (organization_id, person_id, team_id, role),
  foreign key (person_id, organization_id) references public.people(id, organization_id) on delete cascade,
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid,
  title text not null check (length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (id, organization_id),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_id uuid not null,
  person_id uuid not null,
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined', 'maybe')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (activity_id, person_id),
  check ((response = 'pending' and responded_at is null) or (response <> 'pending' and responded_at is not null)),
  foreign key (activity_id, organization_id) references public.activities(id, organization_id) on delete cascade,
  foreign key (person_id, organization_id) references public.people(id, organization_id) on delete cascade
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz,
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index teams_organization_idx on public.teams(organization_id);
create index people_organization_idx on public.people(organization_id);
create index person_guardians_user_idx on public.person_guardians(guardian_user_id);
create index memberships_team_idx on public.memberships(team_id);
create index activities_team_start_idx on public.activities(team_id, starts_at);
create index invitations_activity_idx on public.invitations(activity_id);
create index notification_outbox_pending_idx on public.notification_outbox(scheduled_at) where status = 'pending';
create index audit_log_organization_created_idx on public.audit_log(organization_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_touch_updated_at before update on public.organizations
for each row execute function public.touch_updated_at();
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger teams_touch_updated_at before update on public.teams
for each row execute function public.touch_updated_at();
create trigger people_touch_updated_at before update on public.people
for each row execute function public.touch_updated_at();
create trigger activities_touch_updated_at before update on public.activities
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Ny användare')
  );
  return new;
end;
$$;

create trigger auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_organization_member(target_organization_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = target_user_id
  );
$$;

create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles text[], target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = target_user_id
      and role = any(allowed_roles)
  );
$$;

create or replace function public.add_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger organizations_add_owner after insert on public.organizations
for each row execute function public.add_organization_owner();

revoke all on function public.is_organization_member(uuid, uuid) from public;
revoke all on function public.has_organization_role(uuid, text[], uuid) from public;
grant execute on function public.is_organization_member(uuid, uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[], uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.teams enable row level security;
alter table public.people enable row level security;
alter table public.person_guardians enable row level security;
alter table public.memberships enable row level security;
alter table public.activities enable row level security;
alter table public.invitations enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.audit_log enable row level security;

create policy "members can read their organizations" on public.organizations
for select to authenticated using (public.is_organization_member(id));
create policy "users can create organizations" on public.organizations
for insert to authenticated with check (created_by = auth.uid());
create policy "admins can update organizations" on public.organizations
for update to authenticated using (public.has_organization_role(id, array['owner', 'admin']));

create policy "users can read profiles in shared organizations" on public.profiles
for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy "users can update their profile" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members can read organization memberships" on public.organization_members
for select to authenticated using (public.is_organization_member(organization_id));
create policy "admins can manage organization memberships" on public.organization_members
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read teams" on public.teams
for select to authenticated using (public.is_organization_member(organization_id));
create policy "leaders can manage teams" on public.teams
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']))
with check (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']));

create policy "members can read people" on public.people
for select to authenticated using (public.is_organization_member(organization_id));
create policy "leaders can manage people" on public.people
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']))
with check (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']));

create policy "members can read guardian links" on public.person_guardians
for select to authenticated using (public.is_organization_member(organization_id));
create policy "leaders can manage guardian links" on public.person_guardians
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']))
with check (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']));

create policy "members can read memberships" on public.memberships
for select to authenticated using (public.is_organization_member(organization_id));
create policy "leaders can manage memberships" on public.memberships
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']))
with check (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']));

create policy "members can read activities" on public.activities
for select to authenticated using (public.is_organization_member(organization_id));
create policy "leaders can manage activities" on public.activities
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']))
with check (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']));

create policy "members can read invitations" on public.invitations
for select to authenticated using (public.is_organization_member(organization_id));
create policy "leaders can create and delete invitations" on public.invitations
for insert to authenticated with check (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']));
create policy "invitees and leaders can update invitations" on public.invitations
for update to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'leader'])
  or exists (select 1 from public.people where people.id = invitations.person_id and people.user_id = auth.uid())
  or exists (select 1 from public.person_guardians where person_guardians.person_id = invitations.person_id and person_guardians.guardian_user_id = auth.uid())
);
create policy "leaders can delete invitations" on public.invitations
for delete to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin', 'leader']));

create policy "users manage their push subscriptions" on public.push_subscriptions
for all to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_organization_member(organization_id));

create policy "users can read their notifications" on public.notification_outbox
for select to authenticated using (user_id = auth.uid());

create policy "admins can read audit log" on public.audit_log
for select to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']));
