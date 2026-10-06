-- A template belongs to one work activity; duties are persisted instances of it.
create table public.activity_duty_series (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  activity_id uuid not null, duty_type_id uuid not null, name text not null,
  timing_kind text not null check (timing_kind in ('interval','deadline','none')),
  starts_at timestamptz, ends_at timestamptz, due_at timestamptz,
  interval_minutes integer check (interval_minutes >= 5 and interval_minutes % 5 = 0),
  places integer not null check (places between 1 and 50),
  instructions text not null default '' check (length(instructions) <= 2000),
  opening_instructions text not null default '' check (length(opening_instructions) <= 500),
  closing_instructions text not null default '' check (length(closing_instructions) <= 500),
  revision integer not null default 1, cancelled_at timestamptz,
  legacy_singleton boolean not null default false,
  unique (id, activity_id, organization_id),
  foreign key (activity_id, organization_id) references public.activities(id, organization_id) on delete cascade,
  foreign key (duty_type_id, organization_id) references public.activity_duty_types(id, organization_id),
  check ((timing_kind='interval' and starts_at is not null and ends_at is not null and ends_at>starts_at and due_at is null)
    or (timing_kind='deadline' and starts_at is null and ends_at is null and due_at is not null and interval_minutes is null)
    or (timing_kind='none' and starts_at is null and ends_at is null and due_at is null and interval_minutes is null))
);
create index activity_duty_series_activity_idx on public.activity_duty_series(activity_id);
alter table public.activity_duty_series enable row level security;
revoke all on public.activity_duty_series from public, anon, authenticated;
alter table public.activity_duties add column series_id uuid, add column series_position integer not null default 1 check (series_position > 0);
-- Historic batches cannot be inferred safely: retain each existing duty as a singleton.
insert into public.activity_duty_series(id,organization_id,activity_id,duty_type_id,name,timing_kind,starts_at,ends_at,due_at,places,instructions,cancelled_at,legacy_singleton)
select d.id,d.organization_id,d.activity_id,d.duty_type_id,d.name,d.timing_kind,d.starts_at,d.ends_at,d.due_at,
 greatest(1,(select count(*)::integer from public.activity_duty_slots s where s.duty_id=d.id and s.retired_at is null)),d.instructions,d.cancelled_at,true
from public.activity_duties d;
update public.activity_duties set series_id=id;
alter table public.activity_duties alter column series_id set not null;
alter table public.activity_duties add constraint activity_duty_series_scope_fk
  foreign key(series_id,activity_id,organization_id) references public.activity_duty_series(id,activity_id,organization_id) on delete cascade;
create unique index activity_duty_series_position_idx on public.activity_duties(series_id,series_position) where cancelled_at is null;

-- Keep old clients and legacy create RPCs safe, without guessing their batch intent.
create function private.attach_singleton_duty_series() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.series_id is null then
   insert into public.activity_duty_series(organization_id,activity_id,duty_type_id,name,timing_kind,starts_at,ends_at,due_at,places,instructions,legacy_singleton)
   select new.organization_id,new.activity_id,new.duty_type_id,t.name,new.timing_kind,new.starts_at,new.ends_at,new.due_at,1,new.instructions,true
   from public.activity_duty_types t where t.id=new.duty_type_id returning id into new.series_id;
 end if;
 return new;
end; $$;
revoke all on function private.attach_singleton_duty_series() from public,anon,authenticated;
create trigger attach_duty_series before insert on public.activity_duties for each row execute function private.attach_singleton_duty_series();

-- Every instance or booking change invalidates an outstanding series preview.
create function private.bump_duty_series_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.activity_duty_series set revision=revision+1,
 cancelled_at=case when not exists(select 1 from public.activity_duties where series_id=new.series_id and cancelled_at is null) then now() else cancelled_at end
 where id=new.series_id;
 return new;
end; $$;
revoke all on function private.bump_duty_series_revision() from public,anon,authenticated;
create trigger duty_series_revision after insert or update on public.activity_duties for each row execute function private.bump_duty_series_revision();
create function private.sync_singleton_duty_places() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.activity_duty_series g set places=greatest(1,(select count(*)::integer from public.activity_duty_slots where duty_id=new.duty_id and retired_at is null)),revision=g.revision+1
 where g.id=(select series_id from public.activity_duties where id=new.duty_id) and g.legacy_singleton;
 return new;
end; $$;
revoke all on function private.sync_singleton_duty_places() from public,anon,authenticated;
create trigger singleton_duty_places after insert or update of retired_at on public.activity_duty_slots for each row execute function private.sync_singleton_duty_places();

create function private.duty_series_definition(g public.activity_duty_series) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('timingKind',g.timing_kind,'startsAt',g.starts_at,'endsAt',g.ends_at,'dueAt',g.due_at,
 'intervalMinutes',g.interval_minutes,'places',g.places,'instructions',g.instructions,
 'openingInstructions',g.opening_instructions,'closingInstructions',g.closing_instructions);
$$;
revoke all on function private.duty_series_definition(public.activity_duty_series) from public,anon,authenticated;

create function private.expand_duty_series_definition(definition jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare kind text:=definition->>'timingKind'; first_at timestamptz:=(definition->>'startsAt')::timestamptz;
 last_at timestamptz:=(definition->>'endsAt')::timestamptz; due timestamptz:=(definition->>'dueAt')::timestamptz;
 minutes integer:=(definition->>'intervalMinutes')::integer; places integer:=(definition->>'places')::integer;
 at_time timestamptz; stop_time timestamptz; step interval; text_value text; result jsonb:='[]'::jsonb;
 instructions text:=coalesce(definition->>'instructions',''); opening text:=coalesce(definition->>'openingInstructions',''); closing text:=coalesce(definition->>'closingInstructions','');
begin
 if places is null or places not between 1 and 50 or length(instructions)>2000 or length(opening)>500 or length(closing)>500 then raise exception 'Invalid series definition' using errcode='23514'; end if;
 if kind='interval' then
   if first_at is null or last_at is null or last_at<=first_at or due is not null or (minutes is not null and (minutes<5 or minutes%5<>0)) then raise exception 'Invalid interval' using errcode='23514'; end if;
   step:=case when minutes is null then last_at-first_at else make_interval(mins=>minutes) end;
   if ceil(extract(epoch from(last_at-first_at))/extract(epoch from step))>48 then raise exception 'Too many duties' using errcode='23514'; end if;
   at_time:=first_at;
   while at_time<last_at loop
     stop_time:=least(last_at,at_time+step);
     text_value:=concat_ws(E'\n',nullif(instructions,''),case when at_time=first_at then nullif(opening,'') end,case when stop_time=last_at then nullif(closing,'') end);
     if length(text_value)>2000 then raise exception 'Instructions too long' using errcode='23514'; end if;
     result:=result||jsonb_build_array(jsonb_build_object('timingKind',kind,'startsAt',at_time,'endsAt',stop_time,'dueAt',null,'places',places,'instructions',text_value));
     at_time:=stop_time;
   end loop;
 elsif kind in ('deadline','none') then
   if first_at is not null or last_at is not null or minutes is not null or opening<>'' or closing<>'' or (kind='deadline' and due is null) or (kind='none' and due is not null) then raise exception 'Invalid timing' using errcode='23514'; end if;
   result:=jsonb_build_array(jsonb_build_object('timingKind',kind,'startsAt',null,'endsAt',null,'dueAt',due,'places',places,'instructions',instructions));
 else raise exception 'Invalid timing kind' using errcode='23514';
 end if;
 return result;
end; $$;
revoke all on function private.expand_duty_series_definition(jsonb) from public,anon,authenticated;

-- Preserve the existing permission-filtered schedule and enrich it with series metadata.
alter function public.get_activity_duty_schedule(uuid) set schema private;
alter function private.get_activity_duty_schedule(uuid) rename to get_activity_duty_schedule_base;
revoke all on function private.get_activity_duty_schedule_base(uuid) from public,anon,authenticated;
create function public.get_activity_duty_schedule(target_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.get_activity_duty_schedule_base(target_activity_id);
 return result||jsonb_build_object('duties',coalesce((select jsonb_agg(item||jsonb_build_object('seriesId',d.series_id,'position',d.series_position) order by ordinal)
 from jsonb_array_elements(result->'duties') with ordinality x(item,ordinal) join public.activity_duties d on d.id=(item->>'id')::uuid),'[]'::jsonb),
 'series',case when (result->>'canManage')::boolean then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'revision',g.revision,'name',g.name,'dutyTypeId',g.duty_type_id,'definition',private.duty_series_definition(g)) order by coalesce(g.starts_at,g.due_at),g.id)
 from public.activity_duty_series g where g.activity_id=target_activity_id and g.cancelled_at is null and exists(select 1 from public.activity_duties d where d.series_id=g.id and d.cancelled_at is null)),'[]'::jsonb) else '[]'::jsonb end);
end; $$;
revoke all on function public.get_activity_duty_schedule(uuid) from public,anon;
grant execute on function public.get_activity_duty_schedule(uuid) to authenticated;

create function public.command_activity_duty_series(target_activity_id uuid,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype; g public.activity_duty_series%rowtype; d public.activity_duties%rowtype;
 op text:=command->>'op'; definition jsonb:=command->'definition'; definitions jsonb; item jsonb; position integer:=0;
 desired integer; total integer; occupied integer; type_name text; affected uuid[]; previous_duties jsonb; previous_slots jsonb; previous_series jsonb;
begin
 if auth.uid() is null then raise exception 'Not allowed' using errcode='42501'; end if;
 select * into a from public.activities where id=target_activity_id for update;
 if a.id is null then raise exception 'Activity not found' using errcode='P0002'; end if;
 if not coalesce(public.has_team_permission(a.team_id,'invitation.manage'),false) then raise exception 'Not allowed' using errcode='42501'; end if;
 if a.status='cancelled' or not exists(select 1 from public.activity_types where id=a.activity_type_id and system_category='work') then raise exception 'Not a work activity' using errcode='23514'; end if;
 if op not in ('create_series','edit_series','cancel_series') or op is null then raise exception 'Invalid command' using errcode='23514'; end if;
 if op<>'create_series' then
   select * into g from public.activity_duty_series where id=(command->>'seriesId')::uuid and activity_id=a.id for update;
   if g.id is null or g.cancelled_at is not null or g.revision is distinct from (command->>'revision')::integer then raise exception 'Series changed' using errcode='40001'; end if;
   if exists(select 1 from public.activity_duty_slots s join public.activity_duties d0 on d0.id=s.duty_id where d0.series_id=g.id and s.completed_at is not null) then raise exception 'Completed history is immutable' using errcode='23514'; end if;
   previous_series:=to_jsonb(g);
   select jsonb_agg(to_jsonb(d0) order by d0.series_position) into previous_duties from public.activity_duties d0 where d0.series_id=g.id and d0.cancelled_at is null;
   select array_agg(distinct s.person_id),jsonb_agg(to_jsonb(s) order by s.id) into affected,previous_slots from public.activity_duty_slots s join public.activity_duties d0 on d0.id=s.duty_id where d0.series_id=g.id and d0.cancelled_at is null and s.retired_at is null;
 end if;
 if op='cancel_series' then
   perform public.cancel_activity_duties(a.id,(select jsonb_agg(jsonb_build_object('dutyId',id,'revision',revision)) from public.activity_duties where series_id=g.id and cancelled_at is null));
   update public.activity_duty_series set cancelled_at=now(),revision=revision+1 where id=g.id;
 else
   definitions:=private.expand_duty_series_definition(definition); desired:=jsonb_array_length(definitions);
   if exists(select 1 from jsonb_array_elements(definitions) x where x->>'timingKind'='interval' and ((x->>'startsAt')::timestamptz<a.starts_at or (x->>'endsAt')::timestamptz>a.ends_at)) then raise exception 'Outside activity' using errcode='23514'; end if;
   if op='create_series' then
     select name into type_name from public.activity_duty_types where id=(command->>'dutyTypeId')::uuid and team_id=a.team_id and active;
     if type_name is null then raise exception 'Invalid duty type' using errcode='23514'; end if;
     insert into public.activity_duty_series(organization_id,activity_id,duty_type_id,name,timing_kind,starts_at,ends_at,due_at,interval_minutes,places,instructions,opening_instructions,closing_instructions)
     values(a.organization_id,a.id,(command->>'dutyTypeId')::uuid,type_name,definition->>'timingKind',(definition->>'startsAt')::timestamptz,(definition->>'endsAt')::timestamptz,(definition->>'dueAt')::timestamptz,(definition->>'intervalMinutes')::integer,(definition->>'places')::integer,coalesce(definition->>'instructions',''),coalesce(definition->>'openingInstructions',''),coalesce(definition->>'closingInstructions','')) returning * into g;
   else
     -- Never silently release a booking when regeneration removes an instance or place.
     if exists(select 1 from public.activity_duty_slots s join public.activity_duties d0 on d0.id=s.duty_id where d0.series_id=g.id and d0.cancelled_at is null and d0.series_position>desired and s.retired_at is null and s.person_id is not null) then raise exception 'Release bookings on removed duties first' using errcode='23514'; end if;
     if exists(select 1 from public.activity_duties d0 where d0.series_id=g.id and d0.cancelled_at is null and d0.series_position<=desired and (select count(*) from public.activity_duty_slots s where s.duty_id=d0.id and s.retired_at is null and s.person_id is not null)>(definition->>'places')::integer) then raise exception 'Release assigned slots first' using errcode='23514'; end if;
     update public.activity_duty_series set timing_kind=definition->>'timingKind',starts_at=(definition->>'startsAt')::timestamptz,ends_at=(definition->>'endsAt')::timestamptz,due_at=(definition->>'dueAt')::timestamptz,interval_minutes=(definition->>'intervalMinutes')::integer,places=(definition->>'places')::integer,instructions=coalesce(definition->>'instructions',''),opening_instructions=coalesce(definition->>'openingInstructions',''),closing_instructions=coalesce(definition->>'closingInstructions',''),revision=revision+1,legacy_singleton=false where id=g.id;
   end if;
   for item in select value from jsonb_array_elements(definitions) loop
     position:=position+1;
     select * into d from public.activity_duties where series_id=g.id and series_position=position and cancelled_at is null for update;
     if d.id is null then
       insert into public.activity_duties(organization_id,activity_id,duty_type_id,series_id,series_position,timing_kind,starts_at,ends_at,due_at,instructions)
       values(a.organization_id,a.id,g.duty_type_id,g.id,position,item->>'timingKind',(item->>'startsAt')::timestamptz,(item->>'endsAt')::timestamptz,(item->>'dueAt')::timestamptz,item->>'instructions') returning * into d;
       -- Reuse the series' name snapshot even if the catalogue has since been renamed.
       update public.activity_duties set name=g.name where id=d.id and name<>g.name;
     else
       update public.activity_duties set timing_kind=item->>'timingKind',starts_at=(item->>'startsAt')::timestamptz,ends_at=(item->>'endsAt')::timestamptz,due_at=(item->>'dueAt')::timestamptz,instructions=item->>'instructions',revision=revision+1 where id=d.id;
     end if;
     select count(*) into total from public.activity_duty_slots where duty_id=d.id and retired_at is null;
     occupied:=(item->>'places')::integer;
     if total<occupied then
       insert into public.activity_duty_slots(organization_id,activity_id,duty_id) select a.organization_id,a.id,d.id from generate_series(1,occupied-total);
     elsif total>occupied then
       update public.activity_duty_slots set retired_at=now() where id in(select id from public.activity_duty_slots where duty_id=d.id and retired_at is null and person_id is null order by id limit(total-occupied));
     end if;
     if op='edit_series' then update public.activity_duty_slots set revision=revision+1 where duty_id=d.id and retired_at is null; end if;
   end loop;
   update public.activity_duties set cancelled_at=now(),revision=revision+1 where series_id=g.id and series_position>desired and cancelled_at is null;
   update public.activity_duty_slots set retired_at=now(),revision=revision+1 where retired_at is null and duty_id in(select id from public.activity_duties where series_id=g.id and cancelled_at is not null);
   if op='edit_series' then
     update public.activity_duty_change_requests set status='expired',resolved_at=now() where activity_id=a.id and status='pending' and (source_slot_id in(select s.id from public.activity_duty_slots s join public.activity_duties d0 on d0.id=s.duty_id where d0.series_id=g.id) or target_slot_id in(select s.id from public.activity_duty_slots s join public.activity_duties d0 on d0.id=s.duty_id where d0.series_id=g.id));
     perform private.queue_duty_update(a.id,affected,gen_random_uuid()::text,'edited');
   end if;
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
 values(a.organization_id,auth.uid(),'activity_duty.'||op,'activity_duty_series',g.id::text,jsonb_build_object('command',command,'previousSeries',previous_series,'previousDuties',previous_duties,'previousSlots',previous_slots));
 return public.get_activity_duty_schedule(a.id);
end; $$;
revoke all on function public.command_activity_duty_series(uuid,jsonb) from public,anon;
grant execute on function public.command_activity_duty_series(uuid,jsonb) to authenticated;
