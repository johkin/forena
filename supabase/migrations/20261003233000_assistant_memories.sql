-- Long-lived assistant memory with explicit hierarchical scope.
-- System memories are readable by signed-in users but are intentionally not writable
-- through the client role. They can only be maintained by trusted backend/migrations.

insert into public.team_permissions (key, description)
values ('assistant.memory.manage', 'Create, update and remove shared assistant memories for a team')
on conflict (key) do nothing;

insert into public.team_access_profile_permissions (organization_id, access_profile_id, permission_key)
select profile.organization_id, profile.id, 'assistant.memory.manage'
from public.team_access_profiles profile
where profile.key = 'team_admin'
on conflict do nothing;

create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('system', 'organization', 'section', 'team', 'personal')),
  scope_id uuid,
  kind text not null default 'fact' check (kind in ('fact', 'preference', 'instruction', 'convention')),
  subject text not null default 'general' check (length(trim(subject)) between 1 and 80),
  memory_key text check (memory_key is null or memory_key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  content text not null check (length(trim(content)) between 1 and 1200),
  structured_value jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint assistant_memories_scope_shape check (
    (scope = 'system' and organization_id is null and scope_id is null)
    or (scope = 'organization' and organization_id is not null and scope_id = organization_id)
    or (scope in ('section', 'team', 'personal') and organization_id is not null and scope_id is not null)
  )
);

create index assistant_memories_organization_idx on public.assistant_memories(organization_id);
create index assistant_memories_scope_idx on public.assistant_memories(scope, scope_id);
create index assistant_memories_active_idx on public.assistant_memories(updated_at desc)
  where expires_at is null;
create unique index assistant_memories_key_unique
  on public.assistant_memories(scope, scope_id, memory_key)
  where memory_key is not null;

create trigger assistant_memories_touch_updated_at
before update on public.assistant_memories
for each row execute function public.touch_updated_at();

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
  select target_user_id is not null and (
    memory_scope = 'system'
    or (memory_scope = 'personal' and memory_scope_id = target_user_id)
    or (
      memory_organization_id is not null
      and exists (
        select 1 from public.organization_members member
        where member.organization_id = memory_organization_id
          and member.user_id = target_user_id
      )
      and (
        memory_scope = 'organization'
        or (
          memory_scope = 'section'
          and exists (
            select 1 from public.sections section
            where section.id = memory_scope_id
              and section.organization_id = memory_organization_id
          )
        )
        or (
          memory_scope = 'team'
          and exists (
            select 1 from public.teams team
            where team.id = memory_scope_id
              and team.organization_id = memory_organization_id
              and (
                private.has_team_permission(team.id, 'team.view', target_user_id)
                or exists (
                  select 1
                  from public.people person
                  join public.memberships membership
                    on membership.person_id = person.id
                   and membership.team_id = team.id
                   and membership.role = 'participant'
                   and membership.starts_on <= current_date
                   and (membership.ends_on is null or membership.ends_on >= current_date)
                  where person.organization_id = memory_organization_id
                    and person.user_id = target_user_id
                )
                or exists (
                  select 1
                  from public.person_guardians guardian
                  join public.memberships membership
                    on membership.person_id = guardian.person_id
                   and membership.team_id = team.id
                   and membership.role = 'participant'
                   and membership.starts_on <= current_date
                   and (membership.ends_on is null or membership.ends_on >= current_date)
                  where guardian.organization_id = memory_organization_id
                    and guardian.guardian_user_id = target_user_id
                )
              )
          )
        )
      )
    )
  );
$$;

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
    when 'system' then false
    when 'personal' then memory_scope_id = target_user_id
      and exists (
        select 1 from public.organization_members member
        where member.organization_id = memory_organization_id
          and member.user_id = target_user_id
      )
    when 'organization' then memory_scope_id = memory_organization_id
      and public.has_organization_role(memory_organization_id, array['owner', 'admin'], target_user_id)
    when 'section' then
      exists (
        select 1 from public.sections section
        where section.id = memory_scope_id
          and section.organization_id = memory_organization_id
          and (
            public.has_organization_role(memory_organization_id, array['owner', 'admin'], target_user_id)
            or public.has_section_role(section.id, array['section_admin'], target_user_id)
          )
      )
    when 'team' then
      exists (
        select 1 from public.teams team
        where team.id = memory_scope_id
          and team.organization_id = memory_organization_id
          and private.has_team_permission(team.id, 'assistant.memory.manage', target_user_id)
      )
    else false
  end;
$$;

revoke all on function private.can_read_assistant_memory(text, uuid, uuid, uuid) from public;
revoke all on function private.can_manage_assistant_memory(text, uuid, uuid, uuid) from public;

alter table public.assistant_memories enable row level security;

create policy "read scoped assistant memories" on public.assistant_memories
for select to authenticated
using (private.can_read_assistant_memory(scope, organization_id, scope_id, auth.uid()));

create policy "create scoped assistant memories" on public.assistant_memories
for insert to authenticated
with check (
  created_by = auth.uid()
  and private.can_manage_assistant_memory(scope, organization_id, scope_id, auth.uid())
);

create policy "update scoped assistant memories" on public.assistant_memories
for update to authenticated
using (private.can_manage_assistant_memory(scope, organization_id, scope_id, auth.uid()))
with check (private.can_manage_assistant_memory(scope, organization_id, scope_id, auth.uid()));

create policy "delete scoped assistant memories" on public.assistant_memories
for delete to authenticated
using (private.can_manage_assistant_memory(scope, organization_id, scope_id, auth.uid()));

revoke all on table public.assistant_memories from anon;
grant select, insert, update, delete on table public.assistant_memories to authenticated;
