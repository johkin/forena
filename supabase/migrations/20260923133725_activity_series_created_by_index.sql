create index activity_series_created_by_idx
on public.activity_series(created_by)
where created_by is not null;
