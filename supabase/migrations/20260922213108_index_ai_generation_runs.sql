drop index public.ai_generation_runs_team_created_idx;

create index ai_generation_runs_team_created_idx
on public.ai_generation_runs(team_id, organization_id, created_at desc);

create index ai_generation_runs_organization_idx
on public.ai_generation_runs(organization_id);

create index ai_generation_runs_requested_by_idx
on public.ai_generation_runs(requested_by)
where requested_by is not null;
