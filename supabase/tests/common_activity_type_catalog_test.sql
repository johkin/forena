begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
select results_eq(
 $$select name from public.activity_types where organization_id is null and active order by slug$$,
 array['Arbetspass','Tävling/Match','Övrigt','Träning']::text[],
 'Four common activity types remain available for new activities'
);
select is((select count(*)::integer from public.activity_types where organization_id is null and slug in ('mote','utbildning') and not active),2,
 'Meeting and education types are archived without deleting their identities');
select is((select system_category from public.activity_types where organization_id is null and slug='match-tavling'),'competition',
 'Competition key and category remain compatible with discipline capabilities');
select * from finish();
rollback;
