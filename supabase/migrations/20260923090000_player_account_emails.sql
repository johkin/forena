create table public.person_login_emails (
  person_id uuid primary key,
  organization_id uuid not null,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, organization_id) references public.people(id, organization_id) on delete cascade
);

create unique index person_login_emails_organization_email_idx
on public.person_login_emails (organization_id, lower(email));

create trigger person_login_emails_touch_updated_at before update on public.person_login_emails
for each row execute function public.touch_updated_at();

alter table public.person_login_emails enable row level security;

create policy "team managers can read player login emails" on public.person_login_emails
for select to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
);

create policy "team managers can create player login emails" on public.person_login_emails
for insert to authenticated with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
);

create policy "team managers can update player login emails" on public.person_login_emails
for update to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
) with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1 from public.memberships membership
    where membership.person_id = person_login_emails.person_id
      and membership.team_id is not null
      and public.can_manage_team(membership.team_id)
  )
);

create or replace function public.claim_person_account()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_email text;
  linked_count integer;
begin
  if auth.uid() is null then
    raise exception 'Du behöver vara inloggad';
  end if;

  select lower(email) into account_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  if account_email is null then
    return 0;
  end if;

  update public.people person
  set user_id = auth.uid()
  from public.person_login_emails login
  where login.person_id = person.id
    and login.email = account_email
    and (person.user_id is null or person.user_id = auth.uid());

  get diagnostics linked_count = row_count;

  insert into public.organization_members (organization_id, user_id, role)
  select distinct login.organization_id, auth.uid(), 'member'
  from public.person_login_emails login
  join public.people person on person.id = login.person_id
  where login.email = account_email and person.user_id = auth.uid()
  on conflict (organization_id, user_id) do nothing;

  return linked_count;
end;
$$;

revoke all on function public.claim_person_account() from public;
grant execute on function public.claim_person_account() to authenticated;
