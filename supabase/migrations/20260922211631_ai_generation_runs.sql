create table public.ai_generation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  feature text not null check (feature in ('team_briefing')),
  model text not null check (length(model) between 1 and 160),
  status text not null check (status in ('success', 'fallback')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  signal_count integer not null check (signal_count between 0 and 20),
  error_code text,
  created_at timestamptz not null default now(),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade
);

create index ai_generation_runs_team_created_idx
on public.ai_generation_runs(team_id, created_at desc);

alter table public.ai_generation_runs enable row level security;

create policy "team managers can read ai generation runs" on public.ai_generation_runs
for select to authenticated
using (public.can_manage_team(team_id));

create policy "team managers can record ai generation runs" on public.ai_generation_runs
for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and public.can_manage_team(team_id)
);

grant select, insert on table public.ai_generation_runs to authenticated;
