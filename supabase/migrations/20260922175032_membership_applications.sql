create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  section_id uuid not null,
  team_id uuid not null,
  player_first_name text not null check (length(player_first_name) between 1 and 80),
  player_last_name text not null check (length(player_last_name) between 1 and 80),
  player_birth_date date not null check (player_birth_date <= current_date),
  address text not null default '' check (length(address) <= 200),
  postal_code text not null default '' check (length(postal_code) <= 20),
  city text not null default '' check (length(city) <= 100),
  allergies text not null default '' check (length(allergies) <= 1000),
  message text not null default '' check (length(message) <= 2000),
  previous_club text not null default '' check (length(previous_club) <= 160),
  photo_consent boolean,
  review_status text not null default 'submitted' check (review_status in ('draft', 'submitted', 'approved', 'rejected')),
  activation_status text not null default 'not_started' check (activation_status in ('not_started', 'invitation_sent', 'email_verified', 'activated')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (length(rejection_reason) <= 1000),
  activated_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (section_id, organization_id) references public.sections(id, organization_id) on delete restrict,
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete restrict,
  foreign key (activated_person_id, organization_id) references public.people(id, organization_id) on delete restrict,
  check (
    (review_status in ('draft', 'submitted') and reviewed_at is null and reviewed_by is null)
    or (review_status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
  )
);

create table public.membership_application_guardians (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  first_name text not null check (length(first_name) between 1 and 80),
  last_name text not null check (length(last_name) between 1 and 80),
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  mobile text not null default '' check (length(mobile) <= 40),
  created_at timestamptz not null default now(),
  unique (application_id, position),
  foreign key (application_id, organization_id) references public.membership_applications(id, organization_id) on delete cascade
);

create table public.membership_application_tokens (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  guardian_id uuid not null references public.membership_application_guardians(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (application_id, guardian_id),
  foreign key (application_id, organization_id) references public.membership_applications(id, organization_id) on delete cascade
);

create index membership_applications_review_idx on public.membership_applications(organization_id, review_status, created_at);
create index membership_application_tokens_hash_idx on public.membership_application_tokens(token_hash);

create trigger membership_applications_touch_updated_at before update on public.membership_applications
for each row execute function public.touch_updated_at();

alter table public.membership_applications enable row level security;
alter table public.membership_application_guardians enable row level security;
alter table public.membership_application_tokens enable row level security;

create policy "organization admins can read membership applications"
on public.membership_applications for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can update membership applications"
on public.membership_applications for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "organization admins can read application guardians"
on public.membership_application_guardians for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "organization admins can create activation tokens"
on public.membership_application_tokens for insert to authenticated
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can read activation tokens"
on public.membership_application_tokens for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can delete activation tokens"
on public.membership_application_tokens for delete to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can update activation tokens"
on public.membership_application_tokens for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

grant select, update on public.membership_applications to authenticated;
grant select on public.membership_application_guardians to authenticated;
grant select, insert, update, delete on public.membership_application_tokens to authenticated;

create or replace function public.get_join_options(requested_organization_slug text)
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  section_id uuid,
  section_name text,
  section_slug text,
  team_id uuid,
  team_name text,
  team_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select organization.id, organization.name, organization.slug,
    section.id, section.name, section.slug,
    team.id, team.name, team.slug
  from public.organizations organization
  join public.sections section on section.organization_id = organization.id
  join public.teams team on team.organization_id = organization.id and team.section_id = section.id
  where organization.slug = requested_organization_slug
  order by section.name, team.name;
$$;

create or replace function public.submit_membership_application(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_team public.teams%rowtype;
  application_id uuid;
  guardian jsonb;
  guardian_position integer := 0;
begin
  select * into requested_team from public.teams
  where id = (payload ->> 'team_id')::uuid
    and section_id = (payload ->> 'section_id')::uuid
    and organization_id = (payload ->> 'organization_id')::uuid;
  if requested_team.id is null then raise exception 'Ogiltig förening, sektion eller lag'; end if;
  if jsonb_array_length(coalesce(payload -> 'guardians', '[]'::jsonb)) not between 1 and 2 then
    raise exception 'En eller två målsmän måste anges';
  end if;

  insert into public.membership_applications (
    organization_id, section_id, team_id, player_first_name, player_last_name, player_birth_date,
    address, postal_code, city, allergies, message, previous_club, photo_consent
  ) values (
    requested_team.organization_id, requested_team.section_id, requested_team.id,
    trim(payload ->> 'player_first_name'), trim(payload ->> 'player_last_name'), (payload ->> 'player_birth_date')::date,
    trim(coalesce(payload ->> 'address', '')), trim(coalesce(payload ->> 'postal_code', '')),
    trim(coalesce(payload ->> 'city', '')), trim(coalesce(payload ->> 'allergies', '')),
    trim(coalesce(payload ->> 'message', '')), trim(coalesce(payload ->> 'previous_club', '')),
    case when payload ? 'photo_consent' then (payload ->> 'photo_consent')::boolean else null end
  ) returning id into application_id;

  for guardian in select * from jsonb_array_elements(payload -> 'guardians') loop
    guardian_position := guardian_position + 1;
    insert into public.membership_application_guardians (
      application_id, organization_id, position, first_name, last_name, email, mobile
    ) values (
      application_id, requested_team.organization_id, guardian_position,
      trim(guardian ->> 'first_name'), trim(guardian ->> 'last_name'), lower(trim(guardian ->> 'email')),
      trim(coalesce(guardian ->> 'mobile', ''))
    );
  end loop;
  return application_id;
end;
$$;

create or replace function public.accept_membership_application_invitation(invitation_token_hash text)
returns table (organization_slug text, team_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_token public.membership_application_tokens%rowtype;
  application public.membership_applications%rowtype;
  guardian public.membership_application_guardians%rowtype;
  accepting_user_id uuid := auth.uid();
  accepting_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  person_id uuid;
begin
  if accepting_user_id is null or accepting_email = '' then raise exception 'Du måste vara inloggad'; end if;
  select * into activation_token from public.membership_application_tokens
    where token_hash = invitation_token_hash for update;
  if activation_token.id is null then raise exception 'Inbjudan kunde inte hittas'; end if;
  if activation_token.accepted_at is not null then raise exception 'Inbjudan har redan använts'; end if;
  if activation_token.expires_at <= now() then raise exception 'Inbjudan har gått ut'; end if;
  select * into application from public.membership_applications where id = activation_token.application_id for update;
  select * into guardian from public.membership_application_guardians where id = activation_token.guardian_id;
  if application.review_status <> 'approved' then raise exception 'Ansökan är inte godkänd'; end if;
  if guardian.email <> accepting_email then raise exception 'Inbjudan tillhör en annan e-postadress'; end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (application.organization_id, accepting_user_id, 'member')
  on conflict (organization_id, user_id) do nothing;

  person_id := application.activated_person_id;
  if person_id is null then
    insert into public.people (organization_id, display_name)
    values (application.organization_id, application.player_first_name || ' ' || application.player_last_name)
    returning id into person_id;
    insert into public.memberships (organization_id, person_id, team_id, role)
    values (application.organization_id, person_id, application.team_id, 'participant');
    update public.membership_applications set activated_person_id = person_id, activation_status = 'activated'
      where id = application.id;
  end if;

  insert into public.person_guardians (organization_id, person_id, guardian_user_id, contact_name, contact_phone)
  values (application.organization_id, person_id, accepting_user_id, guardian.first_name || ' ' || guardian.last_name, guardian.mobile)
  on conflict (person_id, guardian_user_id) do update
    set contact_name = excluded.contact_name, contact_phone = excluded.contact_phone;
  update public.membership_application_tokens set accepted_at = now(), accepted_by = accepting_user_id
    where id = activation_token.id;

  insert into public.audit_log (organization_id, actor_user_id, action, entity_type, entity_id, details)
  values (application.organization_id, accepting_user_id, 'membership_application.activated', 'membership_application', application.id::text,
    jsonb_build_object('team_id', application.team_id, 'guardian_position', guardian.position));

  return query select organization.slug, team.slug
    from public.organizations organization join public.teams team on team.id = application.team_id
    where organization.id = application.organization_id;
end;
$$;

revoke all on function public.get_join_options(text) from public;
revoke all on function public.submit_membership_application(jsonb) from public;
revoke all on function public.accept_membership_application_invitation(text) from public;
grant execute on function public.get_join_options(text) to anon, authenticated;
grant execute on function public.submit_membership_application(jsonb) to anon, authenticated;
grant execute on function public.accept_membership_application_invitation(text) to authenticated;
