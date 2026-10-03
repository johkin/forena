-- Platform administration is deliberately separate from organization roles.
create table public.platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('system_admin')),
  created_at timestamptz not null default now()
);

alter table public.platform_roles enable row level security;

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
  select exists (
    select 1 from public.platform_roles
    where user_id = target_user_id and role = any(allowed_roles)
  );
$$;

revoke all on function public.has_platform_role(text[], uuid) from public;
grant execute on function public.has_platform_role(text[], uuid) to authenticated;

create policy "system admins can read platform roles" on public.platform_roles
for select to authenticated using (public.has_platform_role(array['system_admin']));

revoke all on table public.platform_roles from anon;
grant select on table public.platform_roles to authenticated;

-- Platform admins maintain the global discipline catalogue.
create policy "system admins can create disciplines" on public.disciplines
for insert to authenticated with check (public.has_platform_role(array['system_admin']));
create policy "system admins can update disciplines" on public.disciplines
for update to authenticated using (public.has_platform_role(array['system_admin']))
with check (public.has_platform_role(array['system_admin']));
create policy "system admins can delete disciplines" on public.disciplines
for delete to authenticated using (public.has_platform_role(array['system_admin']));
grant insert, update, delete on table public.disciplines to authenticated;

-- Replace the previous hard block on system-memory management with a platform role.
create or replace function private.can_manage_assistant_memory(
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
    when 'system' then public.has_platform_role(array['system_admin'], target_user_id)
    when 'personal' then memory_scope_id = target_user_id
      and exists (
        select 1 from public.organization_members member
        where member.organization_id = memory_organization_id and member.user_id = target_user_id
      )
    when 'organization' then memory_scope_id = memory_organization_id
      and public.has_organization_role(memory_organization_id, array['owner', 'admin'], target_user_id)
    when 'section' then exists (
      select 1 from public.sections section
      where section.id = memory_scope_id and section.organization_id = memory_organization_id
        and (
          public.has_organization_role(memory_organization_id, array['owner', 'admin'], target_user_id)
          or public.has_section_role(section.id, array['section_admin'], target_user_id)
        )
    )
    when 'team' then exists (
      select 1 from public.teams team
      where team.id = memory_scope_id and team.organization_id = memory_organization_id
        and private.has_team_permission(team.id, 'assistant.memory.manage', target_user_id)
    )
    else false
  end;
$$;
