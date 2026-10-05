-- Each generated activity owns its concrete start and end timestamps.
update public.activity_series
set recurrence_rule = recurrence_rule - 'durationMinutes'
where recurrence_rule ? 'durationMinutes';
