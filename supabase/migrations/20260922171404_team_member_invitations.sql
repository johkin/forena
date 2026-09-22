create table public.team_member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text not null check (role in ('leader', 'guardian')),
  person_display_name text check (
    (role = 'leader' and person_display_name is null)
    or (role = 'guardian' and length(person_display_name) between 1 and 120)
  ),
  token_hash text not null unique check (length(token_hash) = 64),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade
);

create unique index team_member_invitations_pending_key
  on public.team_member_invitations(team_id, email, role)
  where accepted_at is null;
create index team_member_invitations_team_idx
  on public.team_member_invitations(team_id, created_at desc);

alter table public.team_member_invitations enable row level security;

create policy "team managers can read member invitations"
on public.team_member_invitations for select to authenticated
using (public.can_manage_team(team_id));

create policy "team managers can create member invitations"
on public.team_member_invitations for insert to authenticated
with check (
  public.can_manage_team(team_id)
  and invited_by = (select auth.uid())
  and accepted_at is null
  and accepted_by is null
);

create policy "team managers can delete member invitations"
on public.team_member_invitations for delete to authenticated
using (public.can_manage_team(team_id));

grant select, insert, delete on public.team_member_invitations to authenticated;

create or replace function public.accept_team_member_invitation(invitation_token_hash text)
returns table (organization_slug text, team_slug text, invitation_role text)
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

  if invitation.id is null then
    raise exception 'Inbjudan kunde inte hittas';
  end if;
  if invitation.accepted_at is not null then
    raise exception 'Inbjudan har redan använts';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'Inbjudan har gått ut';
  end if;
  if invitation.email <> accepting_email then
    raise exception 'Inbjudan tillhör en annan e-postadress';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invitation.organization_id, accepting_user_id, case when invitation.role = 'leader' then 'leader' else 'member' end)
  on conflict (organization_id, user_id) do update
  set role = case
    when organization_members.role in ('owner', 'admin') then organization_members.role
    when excluded.role = 'leader' then 'leader'
    else organization_members.role
  end;

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
    on conflict (organization_id, person_id, team_id, role) do nothing;

    insert into public.team_staff (organization_id, team_id, user_id, role)
    values (invitation.organization_id, invitation.team_id, accepting_user_id, 'coach')
    on conflict (team_id, user_id) do nothing;
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
  values (invitation.organization_id, accepting_user_id, 'team_invitation.accepted', 'team_member_invitation', invitation.id::text,
    jsonb_build_object('team_id', invitation.team_id, 'role', invitation.role));

  return query
  select organization.slug, team.slug, invitation.role
  from public.organizations organization
  join public.teams team on team.id = invitation.team_id
  where organization.id = invitation.organization_id;
end;
$$;

revoke all on function public.accept_team_member_invitation(text) from public;
grant execute on function public.accept_team_member_invitation(text) to authenticated;
