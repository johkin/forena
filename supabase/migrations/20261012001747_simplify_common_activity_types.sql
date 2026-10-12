-- Four common creation choices. Archive surplus built-ins rather than remapping
-- IDs: historical activities, series, discipline defaults and documents stay intact.
update public.activity_types
set active = false
where organization_id is null and slug in ('mote', 'utbildning');

-- Keep the competition key/category stable for discipline capabilities and imports.
update public.activity_types
set name = 'Tävling/Match'
where organization_id is null and slug = 'match-tavling';
