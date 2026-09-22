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
  player_person_id uuid;
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

  player_person_id := application.activated_person_id;
  if player_person_id is null then
    insert into public.people (organization_id, display_name)
    values (application.organization_id, application.player_first_name || ' ' || application.player_last_name)
    returning id into player_person_id;
    insert into public.memberships (organization_id, person_id, team_id, role)
    values (application.organization_id, player_person_id, application.team_id, 'participant');
    update public.membership_applications set activated_person_id = player_person_id, activation_status = 'activated'
      where id = application.id;
  end if;

  insert into public.person_guardians (organization_id, person_id, guardian_user_id, contact_name, contact_phone)
  values (application.organization_id, player_person_id, accepting_user_id, guardian.first_name || ' ' || guardian.last_name, guardian.mobile)
  on conflict on constraint person_guardians_pkey do update
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

revoke all on function public.accept_membership_application_invitation(text) from public;
grant execute on function public.accept_membership_application_invitation(text) to authenticated;
