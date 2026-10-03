-- Bootstrap and invitation flow for platform administrators.
-- A platform-admin invitation is bound to a verified auth.users email and can
-- only be claimed by the authenticated user owning that address.

create table public.platform_admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'failed', 'cancelled')),
  source text not null default 'system_admin' check (source in ('bootstrap', 'system_admin')),
  invited_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (status = 'accepted' and accepted_at is not null and accepted_by is not null)
    or (status <> 'accepted' and accepted_at is null and accepted_by is null)
  )
);

create unique index platform_admin_invites_pending_email_idx
  on public.platform_admin_invites (lower(email))
  where status = 'pending';

create index platform_admin_invites_status_created_idx
  on public.platform_admin_invites (status, created_at desc);

alter table public.platform_admin_invites enable row level security;

create policy "system admins can read platform admin invites"
on public.platform_admin_invites
for select to authenticated
using (public.has_platform_role(array['system_admin']));

create policy "system admins can create platform admin invites"
on public.platform_admin_invites
for insert to authenticated
with check (
  public.has_platform_role(array['system_admin'])
  and source = 'system_admin'
  and invited_by = auth.uid()
  and status = 'pending'
  and accepted_at is null
  and accepted_by is null
);

create policy "system admins can update platform admin invites"
on public.platform_admin_invites
for update to authenticated
using (public.has_platform_role(array['system_admin']))
with check (public.has_platform_role(array['system_admin']));

revoke all on table public.platform_admin_invites from anon;
grant select, insert, update on table public.platform_admin_invites to authenticated;

create or replace function public.claim_platform_admin_invite()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_email text;
  matched_invite_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select lower(trim(user_row.email))
  into current_email
  from auth.users user_row
  where user_row.id = auth.uid()
    and user_row.email is not null
    and user_row.email_confirmed_at is not null;

  if current_email is null then
    return false;
  end if;

  update public.platform_admin_invites
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  select invite.id
  into matched_invite_id
  from public.platform_admin_invites invite
  where invite.status = 'pending'
    and invite.expires_at > now()
    and lower(invite.email) = current_email
  order by invite.created_at
  limit 1
  for update;

  if matched_invite_id is null then
    return false;
  end if;

  insert into public.platform_roles (user_id, role)
  values (auth.uid(), 'system_admin')
  on conflict (user_id) do update set role = excluded.role;

  update public.platform_admin_invites
  set status = 'accepted',
      accepted_at = now(),
      accepted_by = auth.uid()
  where id = matched_invite_id;

  return true;
end;
$$;

revoke all on function public.claim_platform_admin_invite() from public;
grant execute on function public.claim_platform_admin_invite() to authenticated;

create or replace function public.list_platform_admins()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.has_platform_role(array['system_admin'], auth.uid()) then
    raise exception 'Systemadministratör krävs' using errcode = '42501';
  end if;

  return query
  select role_row.user_id, user_row.email::text, role_row.created_at
  from public.platform_roles role_row
  left join auth.users user_row on user_row.id = role_row.user_id
  where role_row.role = 'system_admin'
  order by role_row.created_at;
end;
$$;

revoke all on function public.list_platform_admins() from public;
grant execute on function public.list_platform_admins() to authenticated;


-- Do not expose a platform-role membership oracle for arbitrary user ids.
-- Internal callers already pass auth.uid(); keep the existing signature so
-- dependent policies/functions remain stable while binding checks to the caller.
create or replace function public.has_platform_role(
  allowed_roles text[],
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid()
    and exists (
      select 1 from public.platform_roles
      where user_id = auth.uid() and role = any(allowed_roles)
    );
$$;
