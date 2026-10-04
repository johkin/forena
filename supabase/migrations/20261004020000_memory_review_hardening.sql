-- Keep section knowledge inside its authorized section, including inherited
-- access for active team managers, participants and guardians.
create or replace function private.can_read_assistant_memory(
  memory_scope text,
  memory_organization_id uuid,
  memory_scope_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null and case memory_scope
    when 'system' then true
    when 'personal' then memory_scope_id = target_user_id and exists (
      select 1 from public.organization_members member
      where member.organization_id = memory_organization_id and member.user_id = target_user_id
    )
    when 'organization' then memory_scope_id = memory_organization_id and exists (
      select 1 from public.organization_members member
      where member.organization_id = memory_organization_id and member.user_id = target_user_id
    )
    when 'section' then exists (
      select 1 from public.sections section
      where section.id = memory_scope_id
        and section.organization_id = memory_organization_id
        and exists (
          select 1 from public.organization_members member
          where member.organization_id = memory_organization_id and member.user_id = target_user_id
        )
        and (
          public.has_organization_role(memory_organization_id, array['owner', 'admin'], target_user_id)
          or public.has_section_role(section.id, array['section_admin', 'editor'], target_user_id)
          or exists (
            select 1 from public.teams team
            where team.section_id = section.id and team.organization_id = memory_organization_id
              -- CASE dispatches to the non-recursive team branch below.
              and private.can_read_assistant_memory('team', memory_organization_id, team.id, target_user_id)
          )
        )
    )
    when 'team' then exists (
      select 1 from public.teams team
      where team.id = memory_scope_id and team.organization_id = memory_organization_id
        and exists (
          select 1 from public.organization_members member
          where member.organization_id = memory_organization_id and member.user_id = target_user_id
        )
        and (
          private.has_team_permission(team.id, 'team.view', target_user_id)
          or private.has_team_permission(team.id, 'assistant.memory.manage', target_user_id)
          or exists (
            select 1 from public.people person
            join public.memberships membership
              on membership.person_id = person.id
             and membership.organization_id = memory_organization_id
             and membership.team_id = team.id
             and membership.role = 'participant'
             and membership.starts_on <= current_date
             and (membership.ends_on is null or membership.ends_on >= current_date)
            where person.organization_id = memory_organization_id and (
              person.user_id = target_user_id
              or exists (
                select 1 from public.person_guardians guardian
                where guardian.organization_id = memory_organization_id
                  and guardian.person_id = person.id and guardian.guardian_user_id = target_user_id
              )
            )
          )
        )
    )
    else false
  end;
$$;

-- A normal authenticated admin may manage delivery/cancellation, but cannot
-- rewrite the recipient, token or acceptance provenance or reopen terminal rows.
drop policy "system admins can update platform admin invites" on public.platform_admin_invites;
create policy "system admins can update platform admin invites"
on public.platform_admin_invites for update to authenticated
using (public.has_platform_role(array['system_admin']) and status = 'pending')
with check (
  public.has_platform_role(array['system_admin'])
  and status in ('pending', 'cancelled', 'expired', 'failed')
  and accepted_at is null and accepted_by is null
);

-- Column grants do not subtract a pre-existing table-wide grant.
revoke all on table public.platform_admin_invites from public, anon, authenticated;
revoke update (id, email, token_hash, status, source, invited_by, sent_at,
  expires_at, accepted_at, accepted_by, created_at)
  on public.platform_admin_invites from public, anon, authenticated;
grant select, insert on public.platform_admin_invites to authenticated;
grant update (status, sent_at) on public.platform_admin_invites to authenticated;

-- Preserve the acceptance event when an auth account is deleted. The claim RPC
-- remains the only authenticated path that sets acceptance metadata. The FK may
-- subsequently clear accepted_by; accepted_at still records the event.
alter table public.platform_admin_invites drop constraint platform_admin_invites_check;
alter table public.platform_admin_invites add constraint platform_admin_invites_check check (
  (status = 'accepted' and accepted_at is not null)
  or (status <> 'accepted' and accepted_at is null and accepted_by is null)
);
