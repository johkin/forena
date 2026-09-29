alter table public.activities
  add column if not exists invitation_audience_responsibility_type_ids uuid[] not null default '{}';

alter table public.activities drop constraint if exists activities_invitation_selection_check;
alter table public.activities add constraint activities_invitation_selection_check
  check (
    invitation_audience_kind <> 'selection'
    or cardinality(invitation_audience_roles)
       + cardinality(invitation_audience_group_ids)
       + cardinality(invitation_audience_responsibility_type_ids) > 0
  );

create or replace function public.materialize_due_activity_invitations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
    a.id,
    a.organization_id,
    a.team_id,
    a.invitation_audience_kind,
    a.invitation_group_id,
    a.invitation_audience_roles,
    a.invitation_audience_group_ids,
    a.invitation_audience_responsibility_type_ids
  from public.activities a
  where a.status = 'published'
    and a.invitation_send_at is not null
    and a.invitation_send_at <= now()
    and a.invitation_audience_kind is not null
    and a.invitation_materialized_at is null
    and a.team_id is not null
  order by a.invitation_send_at
  for update skip locked
  limit greatest(1, least(batch_size, 500));

  with audience_people as (
    select distinct da.id as activity_id, da.organization_id, m.person_id
    from due_invitation_activities_v3 da
    join public.memberships m on m.team_id = da.team_id and m.organization_id = da.organization_id
    where da.invitation_audience_kind = 'players'
      and m.role = 'participant'
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)

    union

    select distinct da.id, da.organization_id, m.person_id
    from due_invitation_activities_v3 da
    join public.memberships m on m.team_id = da.team_id and m.organization_id = da.organization_id
    where da.invitation_audience_kind = 'leaders'
      and m.role = 'leader'
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)

    union

    select distinct da.id, da.organization_id, gm.person_id
    from due_invitation_activities_v3 da
    join public.team_group_members gm on gm.group_id = da.invitation_group_id and gm.organization_id = da.organization_id
    join public.memberships m on m.team_id = da.team_id
      and m.organization_id = da.organization_id
      and m.person_id = gm.person_id
      and m.role in ('participant', 'leader')
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    where da.invitation_audience_kind = 'group'

    union

    select distinct da.id, da.organization_id, m.person_id
    from due_invitation_activities_v3 da
    join public.memberships m on m.team_id = da.team_id and m.organization_id = da.organization_id
    where da.invitation_audience_kind = 'selection'
      and m.role = any(da.invitation_audience_roles)
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)

    union

    select distinct da.id, da.organization_id, gm.person_id
    from due_invitation_activities_v3 da
    join public.team_group_members gm on gm.group_id = any(da.invitation_audience_group_ids) and gm.organization_id = da.organization_id
    join public.team_groups g on g.id = gm.group_id and g.team_id = da.team_id and g.organization_id = da.organization_id
    join public.memberships m on m.team_id = da.team_id
      and m.organization_id = da.organization_id
      and m.person_id = gm.person_id
      and m.role in ('participant', 'leader', 'volunteer')
      and m.starts_on <= current_date
      and (m.ends_on is null or m.ends_on >= current_date)
    where da.invitation_audience_kind = 'selection'

    union

    select distinct da.id, da.organization_id, p.id as person_id
    from due_invitation_activities_v3 da
    join public.team_responsibilities tr
      on tr.team_id = da.team_id
     and tr.organization_id = da.organization_id
     and tr.responsibility_type_id = any(da.invitation_audience_responsibility_type_ids)
     and tr.starts_on <= current_date
     and (tr.ends_on is null or tr.ends_on >= current_date)
    join public.people p
      on p.organization_id = da.organization_id
     and p.user_id = tr.user_id
    where da.invitation_audience_kind = 'selection'
  ),
  inserted as (
    insert into public.invitations (organization_id, activity_id, person_id)
    select ap.organization_id, ap.activity_id, ap.person_id
    from audience_people ap
    on conflict (activity_id, person_id) do nothing
    returning id
  )
  select count(*) into inserted_count from inserted;

  update public.activities a
  set invitation_materialized_at = now()
  from due_invitation_activities_v3 da
  where a.id = da.id;

  return inserted_count;
end;
$$;
