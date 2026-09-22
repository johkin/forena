alter table public.activities
add column gathering_at timestamptz;

alter table public.activities
add constraint activities_gathering_before_start_check
check (gathering_at is null or gathering_at <= starts_at);

create table public.ai_team_briefing_cache (
  team_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_hash text not null check (length(signal_hash) = 64),
  briefing jsonb not null,
  model text not null check (length(model) between 1 and 160),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  check (expires_at > generated_at)
);

create index ai_team_briefing_cache_organization_idx
on public.ai_team_briefing_cache(organization_id);

create index ai_team_briefing_cache_team_organization_idx
on public.ai_team_briefing_cache(team_id, organization_id);

alter table public.ai_team_briefing_cache enable row level security;

create policy "team managers can read ai briefing cache" on public.ai_team_briefing_cache
for select to authenticated
using (public.can_manage_team(team_id));

create policy "team managers can create ai briefing cache" on public.ai_team_briefing_cache
for insert to authenticated
with check (public.can_manage_team(team_id));

create policy "team managers can update ai briefing cache" on public.ai_team_briefing_cache
for update to authenticated
using (public.can_manage_team(team_id))
with check (public.can_manage_team(team_id));

grant select, insert, update on table public.ai_team_briefing_cache to authenticated;
