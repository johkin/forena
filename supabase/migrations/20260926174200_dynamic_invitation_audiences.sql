create table public.team_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (team_id, name),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade
);

create table public.team_group_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null,
  person_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, person_id),
  foreign key (group_id, organization_id) references public.team_groups(id, organization_id) on delete cascade,
  foreign key (person_id, organization_id) references public.people(id, organization_id) on delete cascade
);

alter table public.activities
  add column invitation_audience_kind text check (invitation_audience_kind in ('players', 'leaders', 'group')),
  add column invitation_group_id uuid,
  add foreign key (invitation_group_id, organization_id) references public.team_groups(id, organization_id) on delete set null;

create index team_groups_team_idx on public.team_groups(team_id, organization_id);
create index team_group_members_person_idx on public.team_group_members(person_id, organization_id);
create index activities_invitation_group_idx on public.activities(invitation_group_id, organization_id) where invitation_group_id is not null;

create trigger team_groups_touch_updated_at before update on public.team_groups
for each row execute function public.touch_updated_at();

alter table public.team_groups enable row level security;
alter table public.team_group_members enable row level security;

create policy "members can read team groups" on public.team_groups
for select to authenticated using (public.is_organization_member(organization_id));
create policy "team managers can create team groups" on public.team_groups
for insert to authenticated with check (public.can_manage_team(team_id));
create policy "team managers can update team groups" on public.team_groups
for update to authenticated using (public.can_manage_team(team_id)) with check (public.can_manage_team(team_id));
create policy "team managers can delete team groups" on public.team_groups
for delete to authenticated using (public.can_manage_team(team_id));

create policy "members can read team group members" on public.team_group_members
for select to authenticated using (public.is_organization_member(organization_id));
create policy "team managers can add team group members" on public.team_group_members
for insert to authenticated with check (
  exists (select 1 from public.team_groups g where g.id = group_id and public.can_manage_team(g.team_id))
);
create policy "team managers can delete team group members" on public.team_group_members
for delete to authenticated using (
  exists (select 1 from public.team_groups g where g.id = group_id and public.can_manage_team(g.team_id))
);

grant select, insert, update, delete on public.team_groups, public.team_group_members to authenticated;

create or replace function public.materialize_due_activity_invitations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  with due_activities as (
    select a.id, a.organization_id, a.team_id, a.invitation_audience_kind, a.invitation_group_id
    from public.activities a
    where a.status = 'published'
      and a.invitation_send_at is not null
      and a.invitation_send_at <= now()
      and a.invitation_audience_kind is not null
      and a.team_id is not null
    order by a.invitation_send_at
    limit greatest(1, least(batch_size, 500))
  ),
  audience_people as (
    select distinct da.id as activity_id, da.organization_id, m.person_id
    from due_activities da
    join public.memberships m on m.team_id = da.team_id and m.organization_id = da.organization_id
    where da.invitation_audience_kind = 'players'
      and m.role = 'participant'
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    union
    select distinct da.id, da.organization_id, m.person_id
    from due_activities da
    join public.memberships m on m.team_id = da.team_id and m.organization_id = da.organization_id
    where da.invitation_audience_kind = 'leaders'
      and m.role = 'leader'
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    union
    select distinct da.id, da.organization_id, gm.person_id
    from due_activities da
    join public.team_group_members gm on gm.group_id = da.invitation_group_id and gm.organization_id = da.organization_id
    join public.memberships m on m.team_id = da.team_id
      and m.organization_id = da.organization_id
      and m.person_id = gm.person_id
      and m.role in ('participant', 'leader')
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    where da.invitation_audience_kind = 'group'
  ),
  inserted as (
    insert into public.invitations (organization_id, activity_id, person_id)
    select ap.organization_id, ap.activity_id, ap.person_id
    from audience_people ap
    on conflict (activity_id, person_id) do nothing
    returning id
  )
  select count(*) into inserted_count from inserted;

  return inserted_count;
end;
$$;

revoke all on function public.materialize_due_activity_invitations(integer) from public, anon, authenticated;
grant execute on function public.materialize_due_activity_invitations(integer) to service_role;

create or replace function public.queue_due_activity_invitations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
begin
  perform public.materialize_due_activity_invitations(batch_size);

  with due_activities as (
    select a.*
    from public.activities a
    where a.status = 'published'
      and a.invitation_send_at is not null
      and a.invitation_send_at <= now()
      and a.invitation_audience_kind is not null
      and a.team_id is not null
    order by a.invitation_send_at
    limit greatest(1, least(batch_size, 500))
  ),
  invited_people as (
    select distinct da.organization_id, da.id as activity_id, da.team_id, da.title, da.starts_at, da.location, i.person_id
    from due_activities da
    join public.invitations i on i.activity_id = da.id
  ),
  recipients as (
    select distinct ip.organization_id, ip.activity_id, ip.team_id, ip.title, ip.starts_at, ip.location, p.user_id
    from invited_people ip
    join public.people p on p.id = ip.person_id
    join public.organization_members om on om.organization_id = ip.organization_id and om.user_id = p.user_id
    where p.user_id is not null
    union
    select distinct ip.organization_id, ip.activity_id, ip.team_id, ip.title, ip.starts_at, ip.location, pg.guardian_user_id
    from invited_people ip
    join public.person_guardians pg on pg.person_id = ip.person_id
    join public.organization_members om on om.organization_id = ip.organization_id and om.user_id = pg.guardian_user_id
  ),
  inserted as (
    insert into public.notification_outbox (organization_id, user_id, type, payload, scheduled_at, status)
    select
      r.organization_id,
      r.user_id,
      'activity_invitation',
      jsonb_build_object('activityId', r.activity_id, 'teamId', r.team_id, 'title', r.title, 'startsAt', r.starts_at, 'location', r.location),
      now(),
      'pending'
    from recipients r
    where not exists (
      select 1 from public.notification_outbox existing
      where existing.user_id = r.user_id
        and existing.type = 'activity_invitation'
        and existing.payload ->> 'activityId' = r.activity_id::text
        and existing.status <> 'cancelled'
    )
    returning id
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;

revoke all on function public.queue_due_activity_invitations(integer) from public, anon, authenticated;
grant execute on function public.queue_due_activity_invitations(integer) to service_role;
