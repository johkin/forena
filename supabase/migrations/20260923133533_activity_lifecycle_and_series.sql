alter table public.activities
  add column status text not null default 'published'
    check (status in ('draft', 'published', 'cancelled')),
  add column cancelled_at timestamptz,
  add column cancellation_reason text,
  add check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  );

alter table public.activity_series
  add column status text not null default 'published'
    check (status in ('draft', 'published', 'ended', 'cancelled')),
  add column created_by uuid references auth.users(id) on delete set null;

create index activities_team_status_start_idx
on public.activities(team_id, status, starts_at);
