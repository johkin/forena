drop policy if exists "members can read invitations" on public.invitations;

create policy "scoped users can read invitations" on public.invitations
for select to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  or exists (
    select 1
    from public.activities activity
    where activity.id = invitations.activity_id
      and activity.organization_id = invitations.organization_id
      and activity.team_id is not null
      and public.can_manage_team(activity.team_id)
  )
  or exists (
    select 1
    from public.people person
    where person.id = invitations.person_id
      and person.organization_id = invitations.organization_id
      and person.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.person_guardians guardian
    where guardian.person_id = invitations.person_id
      and guardian.organization_id = invitations.organization_id
      and guardian.guardian_user_id = (select auth.uid())
  )
);
