-- Existing applications retain their status, without invented verification evidence.
alter table public.membership_applications
  add column submission_source text not null default 'legacy'
    check (submission_source in ('legacy', 'public_form', 'verified_member')),
  add column email_verified_at timestamptz,
  add column verified_email text;
alter table public.membership_applications alter column review_status set default 'draft';

-- Only the server can submit or establish verification evidence.
revoke all on function public.submit_membership_application(jsonb) from anon, authenticated;
grant execute on function public.submit_membership_application(jsonb) to service_role;
revoke update on public.membership_applications from authenticated;
grant update (review_status, reviewed_by, reviewed_at, rejection_reason, activation_status)
  on public.membership_applications to authenticated;

alter policy "organization admins can read membership applications"
  on public.membership_applications using (
    review_status <> 'draft' and public.has_organization_role(organization_id, array['owner', 'admin'])
  );
alter policy "organization admins can update membership applications"
  on public.membership_applications using (
    review_status <> 'draft' and public.has_organization_role(organization_id, array['owner', 'admin'])
  ) with check (
    review_status <> 'draft' and public.has_organization_role(organization_id, array['owner', 'admin'])
  );
alter policy "organization admins can read application guardians"
  on public.membership_application_guardians using (
    exists (select 1 from public.membership_applications a where a.id = application_id)
    and public.has_organization_role(organization_id, array['owner', 'admin'])
  );

create table public.membership_application_verifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.membership_applications(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  invalidated_at timestamptz,
  consumed_at timestamptz
);
create index membership_application_verifications_application_idx
  on public.membership_application_verifications(application_id, created_at);
alter table public.membership_application_verifications enable row level security;
revoke all on public.membership_application_verifications from public, anon, authenticated;
grant all on public.membership_application_verifications to service_role;

-- Atomic preparation and rotation; the raw token never reaches the database.
create function public.prepare_membership_application_verification(
  requested_application_id uuid, requested_email text, verification_token_hash text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  application public.membership_applications%rowtype;
  normalized_email text := lower(trim(requested_email));
begin
  select * into application from public.membership_applications
    where id = requested_application_id and review_status = 'draft' for update;
  if application.id is null or not exists (
    select 1 from public.membership_application_guardians
    where application_id = application.id and position = 1 and email = normalized_email
  ) then return false; end if;

  -- Serialize sends for this address/club, including separate new applications.
  perform pg_advisory_xact_lock(hashtextextended(application.organization_id::text || normalized_email, 0));
  if exists (
    select 1 from public.membership_application_verifications v
    join public.membership_application_guardians g on g.application_id = v.application_id and g.position = 1
    where g.organization_id = application.organization_id and g.email = normalized_email
      and v.created_at > now() - interval '60 seconds'
  ) or (select count(*) from public.membership_application_verifications v
    join public.membership_application_guardians g on g.application_id = v.application_id and g.position = 1
    where g.organization_id = application.organization_id and g.email = normalized_email
      and v.created_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  update public.membership_application_verifications set invalidated_at = now()
    where application_id = application.id and invalidated_at is null;
  insert into public.membership_application_verifications(application_id, token_hash)
    values(application.id, verification_token_hash);
  return true;
end;
$$;

create function public.start_membership_application(
  payload jsonb, verification_token_hash text, submitting_user_id uuid default null
) returns table(application_id uuid, email_verified boolean)
language plpgsql security definer set search_path = '' as $$
declare
  new_application_id uuid;
  guardian_email text := lower(trim(payload -> 'guardians' -> 0 ->> 'email'));
  already_verified boolean;
begin
  already_verified := exists (
    select 1 from auth.users u join public.organization_members m on m.user_id = u.id
    where u.id = submitting_user_id and lower(u.email) = guardian_email
      and u.email_confirmed_at is not null
      and m.organization_id = (payload ->> 'organization_id')::uuid
  );
  new_application_id := public.submit_membership_application(payload);
  update public.membership_applications set
    submission_source = case when already_verified then 'verified_member' else 'public_form' end,
    review_status = case when already_verified then 'submitted' else 'draft' end,
    email_verified_at = case when already_verified then now() end,
    verified_email = case when already_verified then guardian_email end
    where id = new_application_id;
  if not already_verified and not public.prepare_membership_application_verification(
    new_application_id, guardian_email, verification_token_hash
  ) then
    raise exception 'Vänta innan du skickar en ny ansökan';
  end if;
  return query select new_application_id, already_verified;
end;
$$;

create function public.verify_membership_application_email(verification_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  verification public.membership_application_verifications%rowtype;
  target_application_id uuid;
  application public.membership_applications%rowtype;
  organization_slug text;
begin
  select application_id into target_application_id from public.membership_application_verifications
    where token_hash = verification_token_hash;
  -- Same lock order as resending: application before verification.
  select * into application from public.membership_applications
    where id = target_application_id for update;
  select * into verification from public.membership_application_verifications
    where token_hash = verification_token_hash for update;
  if verification.id is null or verification.invalidated_at is not null then
    raise exception 'Länken är ogiltig eller har ersatts';
  end if;
  if verification.consumed_at is null then
    if verification.expires_at <= now() then raise exception 'Länken har gått ut'; end if;
    if application.review_status <> 'draft' then raise exception 'Ansökan är redan behandlad'; end if;
    update public.membership_applications set review_status = 'submitted', email_verified_at = now(),
      verified_email = (select email from public.membership_application_guardians
        where application_id = application.id and position = 1)
      where id = application.id;
    update public.membership_application_verifications set consumed_at = now() where id = verification.id;
    insert into public.audit_log(organization_id, action, entity_type, entity_id, details)
      values(application.organization_id, 'membership_application.email_verified',
        'membership_application', application.id::text, '{"guardian_position":1}'::jsonb);
  end if;
  select slug into organization_slug from public.organizations where id = application.organization_id;
  return organization_slug;
end;
$$;

-- No direct REST/RPC route may bypass the server-verified identity or email delivery.
revoke all on function public.prepare_membership_application_verification(uuid,text,text) from public, anon, authenticated;
revoke all on function public.start_membership_application(jsonb,text,uuid) from public, anon, authenticated;
revoke all on function public.verify_membership_application_email(text) from public, anon, authenticated;
grant execute on function public.prepare_membership_application_verification(uuid,text,text) to service_role;
grant execute on function public.start_membership_application(jsonb,text,uuid) to service_role;
grant execute on function public.verify_membership_application_email(text) to service_role;

-- Read-only context lets an expired link offer resending without exposing contact data.
create function public.membership_application_verification_context(verification_token_hash text)
returns table(application_id uuid, organization_slug text)
language sql stable security definer set search_path = '' as $$
  select a.id, o.slug from public.membership_application_verifications v
  join public.membership_applications a on a.id = v.application_id
  join public.organizations o on o.id = a.organization_id
  where v.token_hash = verification_token_hash and a.review_status = 'draft';
$$;
revoke all on function public.membership_application_verification_context(text) from public, anon, authenticated;
grant execute on function public.membership_application_verification_context(text) to service_role;
