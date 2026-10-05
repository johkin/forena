-- Preserve the numeric meaning of legacy offsets with excessive leading zeros.
-- This repairs defaults only; activity times and activity rules are untouched.
create function pg_temp.canonical_activity_offset(rule text) returns text
language plpgsql as $$
declare item text[]; begin
 for item in select regexp_matches(rule, '-([0-9]{7,})([dhm])', 'g') loop
  rule := replace(rule, '-' || item[1] || item[2], '-' || (item[1]::numeric)::text || item[2]);
 end loop;
 return rule;
end $$;
with repaired as (
 select d.id, jsonb_object_agg(field.key, case
  when field.key = 'reminderRules' and jsonb_typeof(field.value) = 'array' then
   coalesce((select jsonb_agg(to_jsonb(item.rule) order by item.first_position)
    from (select pg_temp.canonical_activity_offset(value) as rule, min(ordinality) as first_position
     from jsonb_array_elements_text(field.value) with ordinality original(value, ordinality)
     group by pg_temp.canonical_activity_offset(value)) item), '[]'::jsonb)
  when field.key in ('gatheringRule', 'invitationRule', 'responseDueRule') and jsonb_typeof(field.value) = 'string' then
   to_jsonb(pg_temp.canonical_activity_offset(field.value #>> '{}'))
  else field.value end) as values
 from public.activity_defaults d cross join lateral jsonb_each(d.values) field
 group by d.id
)
update public.activity_defaults d set values=r.values, revision=d.revision+1, updated_at=now()
from repaired r where d.id=r.id and d.values is distinct from r.values;
drop function pg_temp.canonical_activity_offset(text);

-- Match parseTimeRule: each of the up to four offsets contains 1..6 digits.
create or replace function public.valid_activity_time_rule(rule text, anchor text) returns boolean
language sql immutable set search_path='' as $$
 select rule is not null and length(rule)<=80
 and rule ~ ('^' || anchor || '(-[0-9]{1,6}[dhm]){0,4}(/d)?$')
 and coalesce((select sum(m[1]::numeric * case m[2] when 'd' then 1440 when 'h' then 60 else 1 end)
 from regexp_matches(rule,'-([0-9]+)([dhm])','g') m),0)<=527040;
$$;
revoke all on function public.valid_activity_time_rule(text,text) from public,anon,authenticated;
