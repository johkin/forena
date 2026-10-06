-- Allow explicit multi-day events up to seven elapsed days.
create or replace function public.validate_activity_defaults_patch(patch jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; r text; n numeric; option_key text; choices jsonb; choice jsonb; begin
 if jsonb_typeof(patch)<>'object' then return false; end if;
 for k,v in select * from jsonb_each(patch) loop
  if k='options' then
   if v='null'::jsonb then continue; end if;
   if jsonb_typeof(v)<>'object' then return false; end if;
   for option_key,choices in select * from jsonb_each(v) loop
    if option_key not in ('duration','gatheringRule','invitationRule','responseDueRule','reminderRules') then return false; end if;
    if choices='null'::jsonb then continue; end if;
    if jsonb_typeof(choices)<>'array' then return false; end if;
    if jsonb_array_length(choices)<1 or jsonb_array_length(choices)>32 then return false; end if;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(choices)) then return false; end if;
    for choice in select value from jsonb_array_elements(choices) loop
     if jsonb_typeof(choice)<>'string' then return false; end if;
     -- These zero-offset choices can never satisfy strict schedule ordering.
     if option_key in ('invitationRule','reminderRules') and (choice #>> '{}') !~ '/d$'
       and not exists(select 1 from regexp_matches(choice #>> '{}','-([0-9]+)([dhm])','g') m where m[1]::numeric>0)
       then return false; end if;
     if not public.validate_activity_defaults_patch(jsonb_build_object(option_key,
       case when option_key='reminderRules' then jsonb_build_array(choice) else choice end)) then return false; end if;
    end loop;
   end loop;
   continue;
  end if;
  if k not in ('duration','gatheringRule','invitationRule','responseDueRule','reminderRules') then return false; end if;
  if v='null'::jsonb then continue; end if;
  if k='reminderRules' then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>5 then return false; end if;
   if (select count(*)<>count(distinct value) from jsonb_array_elements(v)) then return false; end if;
   if exists(select 1 from jsonb_array_elements(v) item where jsonb_typeof(item)<>'string') then return false; end if;
   for r in select value #>> '{}' from jsonb_array_elements(v) loop
    if not public.valid_activity_time_rule(r,'deadline') then return false; end if;
   end loop;
  else
   if jsonb_typeof(v)<>'string' then return false; end if;
   r:=v #>> '{}';
   if k='duration' then
    if r !~ '^PT([0-9]{1,4}H)?([0-9]{1,5}M)?$' or r='PT' then return false; end if;
    n:=coalesce((substring(r from '([0-9]+)H'))::numeric,0)*60+coalesce((substring(r from '([0-9]+)M'))::numeric,0);
    if n<1 or n>10080 then return false; end if;
   elsif not public.valid_activity_time_rule(r,'start') then return false; end if;
  end if;
 end loop;
 return true;
end $$;

revoke all on function public.validate_activity_defaults_patch(jsonb) from public, anon, authenticated;
