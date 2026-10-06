-- Shared across tenants and server instances. The insert reserves one send even
-- if the email provider fails, so failures cannot bypass the dispatch budget.
create index membership_application_verifications_created_idx
  on public.membership_application_verifications(created_at);
create index membership_application_guardians_verification_email_idx
  on public.membership_application_guardians(email, application_id) where position = 1;

create or replace function public.prepare_membership_application_verification(
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

  -- One global lock makes the rolling budget atomic across all recipients and
  -- clubs. It is held only for the database transaction, never for email I/O.
  perform pg_advisory_xact_lock(hashtextextended('membership-verification-global-budget', 0));
  if (select count(*) from public.membership_application_verifications
      where created_at > now() - interval '1 hour') >= 100 then
    return false;
  end if;
  -- A recipient cannot be flooded by changing the organization or application.
  if exists (
    select 1 from public.membership_application_verifications v
    join public.membership_application_guardians g on g.application_id = v.application_id and g.position = 1
    where g.email = normalized_email and v.created_at > now() - interval '60 seconds'
  ) or (select count(*) from public.membership_application_verifications v
    join public.membership_application_guardians g on g.application_id = v.application_id and g.position = 1
    where g.email = normalized_email and v.created_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  update public.membership_application_verifications set invalidated_at = now()
    where application_id = application.id and invalidated_at is null;
  insert into public.membership_application_verifications(application_id, token_hash)
    values(application.id, verification_token_hash);
  return true;
end;
$$;
revoke all on function public.prepare_membership_application_verification(uuid,text,text) from public, anon, authenticated;
grant execute on function public.prepare_membership_application_verification(uuid,text,text) to service_role;
