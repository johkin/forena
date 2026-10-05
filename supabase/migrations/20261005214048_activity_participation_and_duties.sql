-- Activity roles are participation metadata, never access assignments.
create table public.activity_duty_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  team_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade
);
create unique index activity_duty_types_name_idx on public.activity_duty_types(team_id, lower(btrim(name)));
alter table public.activity_duty_types enable row level security;
revoke all on public.activity_duty_types from anon, authenticated;
grant select, insert on public.activity_duty_types to authenticated;
create policy "members read duty names" on public.activity_duty_types for select to authenticated
using (public.is_organization_member(organization_id));
create policy "invitation managers create duty types" on public.activity_duty_types for insert to authenticated
with check (public.has_team_permission(team_id, 'invitation.manage'));

alter table public.invitations
  add column activity_role text check (activity_role in ('participant', 'leader', 'guardian', 'volunteer')),
  add column duty_type_id uuid,
  add column duty_completed_at timestamptz,
  add column registered_by uuid references auth.users(id) on delete set null,
  add constraint invitations_duty_type_fk foreign key (duty_type_id, organization_id)
    references public.activity_duty_types(id, organization_id),
  add constraint invitations_completed_duty_check check (duty_completed_at is null or duty_type_id is not null);
update public.invitations i set activity_role = case when exists (
  select 1 from public.memberships m join public.activities a on a.team_id = m.team_id
  where a.id = i.activity_id and m.person_id = i.person_id and m.role = 'leader'
    and m.starts_on <= a.starts_at::date and (m.ends_on is null or m.ends_on >= a.starts_at::date)
) then 'leader' else 'participant' end;

create function public.validate_activity_participation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.activities%rowtype;
begin
  select * into a from public.activities where id = new.activity_id;
  if tg_op = 'UPDATE' then
    if (new.activity_id, new.organization_id, new.person_id) is distinct from
       (old.activity_id, old.organization_id, old.person_id) then
      raise exception 'Invitation identity is immutable' using errcode = '23514';
    end if;
    if (new.activity_role, new.duty_type_id, new.duty_completed_at, new.registered_by) is distinct from
       (old.activity_role, old.duty_type_id, old.duty_completed_at, old.registered_by)
       and auth.uid() is not null and not public.has_team_permission(a.team_id, 'invitation.manage') then
      raise exception 'Not allowed to change participation metadata' using errcode = '42501';
    end if;
  end if;
  if new.activity_role is null then
    select m.role into new.activity_role from public.memberships m
      where m.person_id = new.person_id and m.team_id = a.team_id
        and m.starts_on <= current_date and (m.ends_on is null or m.ends_on >= current_date)
      order by case m.role when 'leader' then 0 else 1 end limit 1;
    new.activity_role := coalesce(new.activity_role, 'participant');
  end if;
  if new.duty_type_id is not null and not exists (
    select 1 from public.activity_duty_types d join public.activity_types t on t.id = a.activity_type_id
    where d.id = new.duty_type_id and d.team_id = a.team_id and d.organization_id = a.organization_id
      and t.system_category = 'work'
  ) then
    raise exception 'Duty must belong to the activity team and a work activity' using errcode = '23514';
  end if;
  if new.duty_completed_at is not null and (a.starts_at > now() or a.status = 'cancelled') then
    raise exception 'Duty cannot be completed before activity starts or on a cancelled activity' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_activity_participation() from public, anon, authenticated;
create trigger invitations_validate_participation before insert or update on public.invitations
for each row execute function public.validate_activity_participation();
alter table public.invitations alter column activity_role set not null;

-- One transaction validates all people, creates invitations and queues delivery.
create function public.add_activity_participants(target_activity_id uuid, participants jsonb, register_accepted boolean default false)
returns integer language plpgsql security invoker set search_path = '' as $$
declare a public.activities%rowtype; item jsonb; ids uuid[] := '{}'; person uuid; role_name text;
begin
  select * into a from public.activities where id = target_activity_id;
  if a.id is null then raise exception 'Activity not found' using errcode = 'P0002'; end if;
  if auth.uid() is null or not public.has_team_permission(a.team_id, 'invitation.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a.id::text, 0));
  if a.status = 'cancelled' then raise exception 'Activity cancelled' using errcode = '23514'; end if;
  if jsonb_typeof(participants) <> 'array' or jsonb_array_length(participants) not between 1 and 200 then
    raise exception 'Choose 1 to 200 people' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(participants) loop
    person := (item->>'personId')::uuid;
    role_name := item->>'role';
    if role_name is null or role_name not in ('participant', 'leader', 'guardian', 'volunteer')
      or not exists (select 1 from public.people p where p.id = person and p.organization_id = a.organization_id) then
      raise exception 'Invalid person or role' using errcode = '23514';
    end if;
    if person = any(ids) then raise exception 'Duplicate person' using errcode = '23514'; end if;
    -- Never silently overwrite a family's answer or an existing assignment.
    if exists (select 1 from public.invitations i where i.activity_id = a.id and i.person_id = person) then
      raise exception 'Person already invited; refresh the activity' using errcode = '23514';
    end if;
    insert into public.invitations(organization_id, activity_id, person_id, activity_role, response, responded_at, registered_by)
    values(a.organization_id, a.id, person, role_name,
      case when register_accepted then 'accepted' else 'pending' end,
      case when register_accepted then now() else null end,
      case when register_accepted then auth.uid() else null end);
    ids := array_append(ids, person);
  end loop;
  if register_accepted then return 0; end if;
  return public.queue_activity_invitation(a.id, ids);
end;
$$;
revoke all on function public.add_activity_participants(uuid, jsonb, boolean) from public, anon;
grant execute on function public.add_activity_participants(uuid, jsonb, boolean) to authenticated;

create function public.activity_duty_history(target_team_id uuid, target_person_id uuid)
returns table(activity_title text, starts_at timestamptz, duty_name text, completed_at timestamptz, response text)
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_team_permission(target_team_id, 'invitation.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select a.title, a.starts_at, d.name, i.duty_completed_at, i.response
  from public.invitations i join public.activities a on a.id = i.activity_id
  join public.activity_types t on t.id = a.activity_type_id
  left join public.activity_duty_types d on d.id = i.duty_type_id
  where a.team_id = target_team_id and i.person_id = target_person_id
    and t.system_category = 'work' and a.status <> 'cancelled' and a.starts_at <= now()
  order by a.starts_at desc, a.id limit 20;
end;
$$;
revoke all on function public.activity_duty_history(uuid, uuid) from public, anon;
grant execute on function public.activity_duty_history(uuid, uuid) to authenticated;
