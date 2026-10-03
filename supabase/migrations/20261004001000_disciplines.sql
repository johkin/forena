-- Disciplines describe what a club, section or team does without making
-- organizational structure depend on sport. They are orthogonal qualifiers
-- that can also specialize assistant memory and future schemas/skills.

create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger disciplines_touch_updated_at before update on public.disciplines
for each row execute function public.touch_updated_at();

-- System catalogue. Clients can use disciplines but cannot mutate the catalogue.
alter table public.disciplines enable row level security;
create policy "authenticated users can read disciplines" on public.disciplines
for select to authenticated using (true);
revoke all on table public.disciplines from anon;
grant select on table public.disciplines to authenticated;

insert into public.disciplines (key, name, category) values
  ('football', 'Fotboll', 'sport'),
  ('floorball', 'Innebandy', 'sport'),
  ('ice-hockey', 'Ishockey', 'sport'),
  ('handball', 'Handboll', 'sport'),
  ('basketball', 'Basket', 'sport'),
  ('swimming', 'Simning', 'sport'),
  ('athletics', 'Friidrott', 'sport'),
  ('choir', 'Körsång', 'culture'),
  ('theatre', 'Teater', 'culture'),
  ('scouting', 'Scouting', 'outdoor'),
  ('chess', 'Schack', 'game'),
  ('esports', 'E-sport', 'game')
on conflict (key) do nothing;

-- Discipline assignment is deliberately independent of the section hierarchy.
-- A lower level can override an inherited organization/section discipline.
alter table public.organizations add column discipline_id uuid references public.disciplines(id) on delete set null;
alter table public.sections add column discipline_id uuid references public.disciplines(id) on delete set null;
alter table public.teams add column discipline_id uuid references public.disciplines(id) on delete set null;

create index organizations_discipline_idx on public.organizations(discipline_id);
create index sections_discipline_idx on public.sections(discipline_id);
create index teams_discipline_idx on public.teams(discipline_id);

-- Best-effort initial mapping for existing data. The relation remains explicit,
-- not name-based, after this migration.
update public.sections section
set discipline_id = discipline.id
from public.disciplines discipline
where section.discipline_id is null
  and discipline.key = case
    when lower(section.name) in ('fotboll', 'football') then 'football'
    when lower(section.name) in ('innebandy', 'floorball') then 'floorball'
    when lower(section.name) in ('ishockey', 'ice hockey') then 'ice-hockey'
    when lower(section.name) in ('handboll', 'handball') then 'handball'
    when lower(section.name) in ('basket', 'basketboll', 'basketball') then 'basketball'
    when lower(section.name) in ('simning', 'swimming') then 'swimming'
    when lower(section.name) in ('friidrott', 'athletics') then 'athletics'
    when lower(section.name) in ('kör', 'körsång', 'choir') then 'choir'
    when lower(section.name) in ('teater', 'theatre') then 'theatre'
    when lower(section.name) in ('scouting', 'scout') then 'scouting'
    when lower(section.name) in ('schack', 'chess') then 'chess'
    when lower(section.name) in ('e-sport', 'esport', 'esports') then 'esports'
  end;

-- Memory scope remains organizational. Discipline is an orthogonal qualifier.
alter table public.assistant_memories
  add column discipline_id uuid references public.disciplines(id) on delete set null;

create index assistant_memories_discipline_idx on public.assistant_memories(discipline_id);

-- Keyed memories may coexist for different disciplines. Unkeyed memories are
-- intentionally not unique, so a scope can contain any number of free-form items.
alter table public.assistant_memories drop constraint assistant_memories_scope_key_unique;
create unique index assistant_memories_scope_discipline_key_unique
  on public.assistant_memories (scope, scope_id, discipline_id, memory_key) nulls not distinct
  where memory_key is not null;

-- PostgREST upsert cannot express the predicate of the partial unique index.
-- Keep keyed writes atomic behind a narrow security-invoker RPC so normal RLS
-- remains authoritative for the caller.
create or replace function public.upsert_assistant_memory(
  target_organization_id uuid,
  target_discipline_id uuid,
  target_scope text,
  target_scope_id uuid,
  target_kind text,
  target_subject text,
  target_memory_key text,
  target_content text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $
declare
  memory_id uuid;
begin
  if target_memory_key is null then
    raise exception 'Minnesnyckel krävs' using errcode = '22023';
  end if;

  insert into public.assistant_memories (
    organization_id,
    discipline_id,
    scope,
    scope_id,
    kind,
    subject,
    memory_key,
    content,
    created_by
  )
  values (
    target_organization_id,
    target_discipline_id,
    target_scope,
    target_scope_id,
    target_kind,
    target_subject,
    target_memory_key,
    target_content,
    auth.uid()
  )
  on conflict (scope, scope_id, discipline_id, memory_key)
    where memory_key is not null
  do update set
    kind = excluded.kind,
    subject = excluded.subject,
    content = excluded.content,
    updated_at = now()
  returning id into memory_id;

  return memory_id;
end;
$;

revoke all on function public.upsert_assistant_memory(uuid, uuid, text, uuid, text, text, text, text) from public;
grant execute on function public.upsert_assistant_memory(uuid, uuid, text, uuid, text, text, text, text) to authenticated;

-- Resolve the effective discipline by nearest explicit assignment.
create or replace function public.resolve_team_discipline(target_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(team.discipline_id, section.discipline_id, organization.discipline_id)
  from public.teams team
  join public.sections section on section.id = team.section_id
  join public.organizations organization on organization.id = team.organization_id
  where team.id = target_team_id
$$;

revoke all on function public.resolve_team_discipline(uuid) from public;
grant execute on function public.resolve_team_discipline(uuid) to authenticated;
