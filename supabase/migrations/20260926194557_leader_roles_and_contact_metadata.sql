alter table public.memberships
  add column if not exists leader_title text,
  add column if not exists is_primary_contact boolean not null default false;

alter table public.memberships
  drop constraint if exists memberships_leader_metadata_check,
  add constraint memberships_leader_metadata_check
  check (
    role = 'leader'
    or (leader_title is null and is_primary_contact = false)
  );

alter table public.memberships
  drop constraint if exists memberships_leader_title_check,
  add constraint memberships_leader_title_check
  check (leader_title is null or length(trim(leader_title)) between 1 and 80);

create unique index if not exists memberships_one_primary_contact_per_team_idx
  on public.memberships(team_id)
  where team_id is not null
    and role = 'leader'
    and is_primary_contact = true
    and ends_on is null;

insert into public.people (organization_id, user_id, display_name)
select
  om.organization_id,
  om.user_id,
  coalesce(nullif(trim(p.display_name), ''), 'Medlem')
from public.organization_members om
left join public.profiles p on p.id = om.user_id
where not exists (
  select 1
  from public.people person
  where person.organization_id = om.organization_id
    and person.user_id = om.user_id
)
on conflict (organization_id, user_id) do nothing;

create or replace function public.ensure_organization_member_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.people (organization_id, user_id, display_name)
  select
    new.organization_id,
    new.user_id,
    coalesce(nullif(trim(profile.display_name), ''), 'Medlem')
  from public.profiles profile
  where profile.id = new.user_id
  on conflict (organization_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists organization_member_ensure_person on public.organization_members;
create trigger organization_member_ensure_person
after insert on public.organization_members
for each row execute function public.ensure_organization_member_person();

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
        or exists (
          select 1
          from public.memberships membership
          join public.people person
            on person.id = membership.person_id
           and person.organization_id = membership.organization_id
          where membership.team_id = team.id
            and membership.role = 'leader'
            and membership.starts_on <= current_date
            and (membership.ends_on is null or membership.ends_on >= current_date)
            and person.user_id = target_user_id
        )
      )
  );
$$;

drop policy if exists "leaders can manage memberships" on public.memberships;
create policy "scoped leaders can manage memberships" on public.memberships
for all to authenticated
using (
  (team_id is not null and public.can_manage_team(team_id))
  or public.has_organization_role(organization_id, array['owner', 'admin'])
)
with check (
  (team_id is not null and public.can_manage_team(team_id))
  or public.has_organization_role(organization_id, array['owner', 'admin'])
);

drop policy if exists "leaders can manage people" on public.people;
create policy "scoped leaders can manage people" on public.people
for all to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.memberships membership
    where membership.person_id = people.id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.memberships membership
    where membership.person_id = people.id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
);

drop policy if exists "leaders can manage guardian links" on public.person_guardians;
create policy "scoped leaders can manage guardian links" on public.person_guardians
for all to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.memberships membership
    where membership.person_id = person_guardians.person_id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.memberships membership
    where membership.person_id = person_guardians.person_id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
);

create or replace function public.accept_team_member_invitation(invitation_token_hash text)
returns table(organization_slug text, team_slug text, invitation_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.team_member_invitations%rowtype;
  accepting_user_id uuid := auth.uid();
  accepting_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  accepting_name text;
  person_id uuid;
begin
  if accepting_user_id is null or accepting_email = '' then
    raise exception 'Du måste vara inloggad för att acceptera inbjudan';
  end if;

  select * into invitation
  from public.team_member_invitations
  where token_hash = invitation_token_hash
  for update;

  if invitation.id is null then raise exception 'Inbjudan kunde inte hittas'; end if;
  if invitation.accepted_at is not null then raise exception 'Inbjudan har redan använts'; end if;
  if invitation.expires_at <= now() then raise exception 'Inbjudan har gått ut'; end if;
  if invitation.email <> accepting_email then raise exception 'Inbjudan tillhör en annan e-postadress'; end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invitation.organization_id, accepting_user_id, 'member')
  on conflict (organization_id, user_id) do nothing;

  select coalesce(nullif(display_name, ''), split_part(accepting_email, '@', 1))
  into accepting_name
  from public.profiles
  where id = accepting_user_id;
  accepting_name := coalesce(accepting_name, split_part(accepting_email, '@', 1));

  if invitation.role = 'leader' then
    insert into public.people (organization_id, user_id, display_name)
    values (invitation.organization_id, accepting_user_id, accepting_name)
    on conflict (organization_id, user_id) do update set updated_at = now()
    returning id into person_id;

    insert into public.memberships (organization_id, person_id, team_id, role)
    values (invitation.organization_id, person_id, invitation.team_id, 'leader')
    on conflict (organization_id, person_id, team_id, role) do update
      set ends_on = null;
  else
    insert into public.people (organization_id, display_name)
    values (invitation.organization_id, invitation.person_display_name)
    returning id into person_id;

    insert into public.memberships (organization_id, person_id, team_id, role)
    values (invitation.organization_id, person_id, invitation.team_id, 'participant');

    insert into public.person_guardians (organization_id, person_id, guardian_user_id, contact_name)
    values (invitation.organization_id, person_id, accepting_user_id, accepting_name);
  end if;

  update public.team_member_invitations
  set accepted_at = now(), accepted_by = accepting_user_id
  where id = invitation.id;

  insert into public.audit_log (organization_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    invitation.organization_id,
    accepting_user_id,
    'team_invitation.accepted',
    'team_member_invitation',
    invitation.id::text,
    jsonb_build_object('team_id', invitation.team_id, 'role', invitation.role)
  );

  return query
  select organization.slug, team.slug, invitation.role
  from public.organizations organization
  join public.teams team on team.id = invitation.team_id
  where organization.id = invitation.organization_id;
end;
$$;
