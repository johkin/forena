create table public.activity_attendance_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_id uuid not null unique,
  reported_by uuid not null references auth.users(id),
  reported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (activity_id, organization_id) references public.activities(id, organization_id) on delete cascade
);

create table public.activity_attendance_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null,
  person_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (report_id, person_id),
  foreign key (report_id, organization_id) references public.activity_attendance_reports(id, organization_id) on delete cascade,
  foreign key (person_id, organization_id) references public.people(id, organization_id) on delete cascade
);

create index activity_attendance_records_person_idx
  on public.activity_attendance_records(person_id, organization_id);

create trigger activity_attendance_reports_touch_updated_at
before update on public.activity_attendance_reports
for each row execute function public.touch_updated_at();

alter table public.activity_attendance_reports enable row level security;
alter table public.activity_attendance_records enable row level security;

create policy "team members can read attendance reports"
on public.activity_attendance_reports
for select to authenticated
using (
  exists (
    select 1 from public.activities a
    where a.id = activity_id
      and public.is_organization_member(a.organization_id)
  )
);

create policy "team leaders can manage attendance reports"
on public.activity_attendance_reports
for all to authenticated
using (
  exists (
    select 1 from public.activities a
    where a.id = activity_id
      and a.team_id is not null
      and public.can_manage_team(a.team_id)
  )
)
with check (
  exists (
    select 1 from public.activities a
    where a.id = activity_id
      and a.team_id is not null
      and public.can_manage_team(a.team_id)
  )
);

create policy "team members can read attendance records"
on public.activity_attendance_records
for select to authenticated
using (
  exists (
    select 1
    from public.activity_attendance_reports r
    join public.activities a on a.id = r.activity_id
    where r.id = report_id
      and public.is_organization_member(a.organization_id)
  )
);

create policy "team leaders can manage attendance records"
on public.activity_attendance_records
for all to authenticated
using (
  exists (
    select 1
    from public.activity_attendance_reports r
    join public.activities a on a.id = r.activity_id
    where r.id = report_id
      and a.team_id is not null
      and public.can_manage_team(a.team_id)
  )
)
with check (
  exists (
    select 1
    from public.activity_attendance_reports r
    join public.activities a on a.id = r.activity_id
    where r.id = report_id
      and a.team_id is not null
      and public.can_manage_team(a.team_id)
  )
);

grant select, insert, update, delete on public.activity_attendance_reports, public.activity_attendance_records to authenticated;
