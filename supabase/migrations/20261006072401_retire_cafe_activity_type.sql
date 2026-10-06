-- Retire the legacy café-specific choice. New café events use Arbetspass.
-- Preserve existing activity/series IDs, snapshots, defaults and documents:
-- deactivation removes the type from creation pickers without deleting history.
update public.activity_types
set active = false
where slug = 'cafepass' and system_category = 'work';
