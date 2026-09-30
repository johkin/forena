-- Separate a person's relation to a team from responsibilities and permissions.
-- memberships.role remains the team relation during the transition; responsibility
-- assignments belong to people, while team_staff continues to authorize access.

alter table public.team_responsibilities
  add column if not exists person_id uuid;

insert into public.people (organization_id, user_id, display_name)
select distinct
  responsibility.organization_id,
  responsibility.user_id,
  coalesce(nullif(trim(profile.display_name), ''), 'Medlem')
from public.team_responsibilities responsibility
left join public.profiles profile on profile.id = responsibility.user_id
where responsibility.person_id is null
  and responsibility.user_id is not null
  and not exists (
    select 1
    from public.people person
    where person.organization_id = responsibility.organization_id
      and person.user_id = responsibility.user_id
  )
on conflict (organization_id, user_id) do nothing;

update public.team_responsibilities responsibility
set person_id = person.id
from public.people person
where person.organization_id = responsibility.organization_id
  and person.user_id = responsibility.user_id
  and responsibility.person_id is null;

alter table public.team_responsibilities
  alter column person_id set not null;

alter table public.team_responsibilities
  add constraint team_responsibilities_person_organization_fk
  foreign key (person_id, organization_id)
  references public.people(id, organization_id)
  on delete cascade;

alter table public.team_responsibilities
  alter column user_id drop not null;

create index if not exists team_responsibilities_person_idx
  on public.team_responsibilities(person_id, organization_id);

-- Preserve the old user_id temporarily for compatibility while application code
-- migrates to person_id. New code must use person_id for domain responsibilities.

-- Move the old free-text leader title into the responsibility model when it
-- matches an existing responsibility type.
insert into public.team_responsibilities (
  organization_id, team_id, user_id, person_id, responsibility_type_id, starts_on
)
select
  membership.organization_id,
  membership.team_id,
  person.user_id,
  membership.person_id,
  responsibility_type.id,
  membership.starts_on
from public.memberships membership
join public.people person
  on person.id = membership.person_id
 and person.organization_id = membership.organization_id
join public.responsibility_types responsibility_type
  on responsibility_type.organization_id = membership.organization_id
 and lower(responsibility_type.name) = lower(trim(membership.leader_title))
where membership.role = 'leader'
  and membership.team_id is not null
  and membership.leader_title is not null
on conflict do nothing;

-- Primary contact is an assignment/responsibility, not a team relation.
insert into public.responsibility_types (organization_id, name, slug, capabilities)
select organization.id, 'Kontaktperson', 'kontaktperson', '{}'
from public.organizations organization
on conflict (organization_id, slug) do nothing;

insert into public.team_responsibilities (
  organization_id, team_id, user_id, person_id, responsibility_type_id, starts_on
)
select
  membership.organization_id,
  membership.team_id,
  person.user_id,
  membership.person_id,
  responsibility_type.id,
  membership.starts_on
from public.memberships membership
join public.people person
  on person.id = membership.person_id
 and person.organization_id = membership.organization_id
join public.responsibility_types responsibility_type
  on responsibility_type.organization_id = membership.organization_id
 and responsibility_type.slug = 'kontaktperson'
where membership.role = 'leader'
  and membership.team_id is not null
  and membership.is_primary_contact
on conflict do nothing;


-- Preserve current leader management access explicitly before team relation
-- and authorization are separated.
insert into public.team_staff (organization_id, team_id, user_id, role)
select
  membership.organization_id,
  membership.team_id,
  person.user_id,
  'coach'
from public.memberships membership
join public.people person
  on person.id = membership.person_id
 and person.organization_id = membership.organization_id
where membership.role = 'leader'
  and membership.team_id is not null
  and membership.starts_on <= current_date
  and (membership.ends_on is null or membership.ends_on >= current_date)
  and person.user_id is not null
on conflict (team_id, user_id) do nothing;

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
        public.has_organization_role(team.organization_id, array['owner', 'admin'], target_user_id)
        or public.has_section_role(team.section_id, array['section_admin'], target_user_id)
        or public.has_team_role(team.id, array['team_manager', 'coach'], target_user_id)
      )
  );
$$;

-- Volunteer was a third team relation in the old model. After authorization is
-- explicit, volunteers can become leaders without gaining management access.
update public.memberships
set role = 'leader'
where role = 'volunteer';

alter table public.memberships
  drop constraint if exists memberships_role_check;

alter table public.memberships
  add constraint memberships_role_check
  check (role in ('participant', 'leader'));

-- Responsibility types describe functions, never authorization. Capabilities
-- remain temporarily for compatibility but are cleared so new code cannot infer
-- permissions from responsibilities.
update public.responsibility_types
set capabilities = '{}'
where cardinality(capabilities) > 0;

alter table public.activities
  drop constraint if exists activities_invitation_roles_check;

alter table public.activities
  add constraint activities_invitation_roles_check
  check (invitation_audience_roles <@ array['participant', 'leader']::text[]);
