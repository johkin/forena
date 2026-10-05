-- All writes use the authorized commands below; clients cannot mutate slots directly.
create schema if not exists private;
create table public.activity_duties (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 activity_id uuid not null, duty_type_id uuid not null,
 timing_kind text not null check(timing_kind in ('interval','deadline','none')),
 starts_at timestamptz, ends_at timestamptz, due_at timestamptz,
 instructions text not null default '' check(length(instructions)<=2000),
 unique(id, organization_id), unique(id,activity_id),
 foreign key(activity_id,organization_id) references public.activities(id,organization_id) on delete cascade,
 foreign key(duty_type_id,organization_id) references public.activity_duty_types(id,organization_id),
 check ((timing_kind='interval' and starts_at is not null and ends_at is not null and ends_at>starts_at and due_at is null)
 or (timing_kind='deadline' and starts_at is null and ends_at is null and due_at is not null)
 or (timing_kind='none' and starts_at is null and ends_at is null and due_at is null))
);
create table public.activity_duty_slots (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 activity_id uuid not null, duty_id uuid not null, person_id uuid,
 revision integer not null default 1, completed_at timestamptz,
 unique(id,activity_id),
 unique(duty_id,person_id) deferrable initially deferred,
 foreign key(duty_id,activity_id) references public.activity_duties(id,activity_id) on delete cascade,
 foreign key(duty_id,organization_id) references public.activity_duties(id,organization_id) on delete cascade,
 foreign key(person_id,organization_id) references public.people(id,organization_id),
 check(completed_at is null or person_id is not null)
);
create index activity_duty_slots_person_idx on public.activity_duty_slots(person_id,activity_id);
create table public.activity_duty_change_requests (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
 source_slot_id uuid, target_slot_id uuid,
 source_revision integer, target_revision integer,
 person_id uuid not null references public.people(id), target_person_id uuid references public.people(id),
 requested_by uuid not null references auth.users(id),
 counterpart_approved boolean not null default false,
 manager_approved boolean not null default false,
 status text not null default 'pending' check(status in ('pending','applied','rejected','withdrawn','expired')),
 created_at timestamptz not null default now(), resolved_at timestamptz,
 foreign key(source_slot_id,activity_id) references public.activity_duty_slots(id,activity_id),
 foreign key(target_slot_id,activity_id) references public.activity_duty_slots(id,activity_id),
 check(source_slot_id is not null or target_slot_id is not null),
 check(source_slot_id is distinct from target_slot_id)
);
create index activity_duty_requests_activity_idx on public.activity_duty_change_requests(activity_id,status);
alter table public.activities add column duty_claim_requires_approval boolean not null default false,
 add column duty_change_requires_approval boolean not null default false,
 add column duty_self_service_until timestamptz;
alter table public.activity_duties enable row level security;
alter table public.activity_duty_slots enable row level security;
alter table public.activity_duty_change_requests enable row level security;
revoke all on public.activity_duties, public.activity_duty_slots, public.activity_duty_change_requests from public,anon,authenticated;

create function private.duty_owns_person(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.people p where p.id=person and p.user_id=auth.uid())
 or exists(select 1 from public.person_guardians g where g.person_id=person and g.guardian_user_id=auth.uid()));
$$;
create function private.duty_person_eligible(activity uuid, person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.activities a join public.people p on p.organization_id=a.organization_id
 where a.id=activity and p.id=person and (exists(select 1 from public.invitations i where i.activity_id=a.id and i.person_id=p.id)
 or exists(select 1 from public.memberships m where m.team_id=a.team_id and m.person_id=p.id and m.role='participant'
 and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date))));
$$;
revoke all on function private.duty_owns_person(uuid), private.duty_person_eligible(uuid,uuid) from public,anon,authenticated;

-- Migrate existing assignments once. The old columns remain read-only compatibility data.
insert into public.activity_duties(id,organization_id,activity_id,duty_type_id,timing_kind)
select i.id,i.organization_id,i.activity_id,i.duty_type_id,'none' from public.invitations i where i.duty_type_id is not null;
insert into public.activity_duty_slots(organization_id,activity_id,duty_id,person_id,completed_at)
select i.organization_id,i.activity_id,i.id,i.person_id,i.duty_completed_at from public.invitations i where i.duty_type_id is not null;

create function public.get_activity_duty_schedule(target_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype; manager boolean; result jsonb;
begin
 select * into a from public.activities where id=target_activity_id;
 manager:=coalesce(public.has_team_permission(a.team_id,'invitation.manage'),false);
 if auth.uid() is null or a.id is null or (not manager and not exists(select 1 from public.people p
 where private.duty_owns_person(p.id) and private.duty_person_eligible(a.id,p.id))) then
 raise exception 'Not allowed' using errcode='42501'; end if;
 select jsonb_build_object(
 'isWork',exists(select 1 from public.activity_types t where t.id=a.activity_type_id and t.system_category='work'),
 'canManage',manager,'claimRequiresApproval',a.duty_claim_requires_approval,'changeRequiresApproval',a.duty_change_requires_approval,
 'selfServiceUntil',coalesce(a.duty_self_service_until,a.starts_at),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)) from public.people p where
 private.duty_person_eligible(a.id,p.id) and (manager or private.duty_owns_person(p.id))),'[]'::jsonb),
 'duties',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',t.name,'timingKind',d.timing_kind,'startsAt',d.starts_at,'endsAt',d.ends_at,'dueAt',d.due_at,'instructions',d.instructions,
 'slots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'personId',case when manager or private.duty_owns_person(s.person_id) then s.person_id else null end,
 'personName',case when manager or private.duty_owns_person(s.person_id) then (select p.display_name from public.people p where p.id=s.person_id) else null end,
 'occupied',s.person_id is not null,'mine',private.duty_owns_person(s.person_id),'completedAt',s.completed_at,'revision',s.revision) order by s.id)
 from public.activity_duty_slots s where s.duty_id=d.id),'[]'::jsonb)) order by coalesce(d.starts_at,d.due_at,a.starts_at),d.id)
 from public.activity_duties d join public.activity_duty_types t on t.id=d.duty_type_id where d.activity_id=a.id),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'sourceSlotId',r.source_slot_id,'targetSlotId',r.target_slot_id,
 'status',r.status,'counterpartApproved',r.counterpart_approved,'managerApproved',r.manager_approved,
 'mine',private.duty_owns_person(r.person_id),'canApprove',manager or (r.target_person_id is not null and private.duty_owns_person(r.target_person_id)),
 'requestedAt',r.created_at) order by r.created_at desc) from public.activity_duty_change_requests r where r.activity_id=a.id
 and (manager or private.duty_owns_person(r.person_id) or private.duty_owns_person(r.target_person_id))),'[]'::jsonb)) into result;
 return result;
end; $$;

-- Serialized per activity: a claim or accepted change is always all-or-nothing.
create function public.command_activity_duty(target_activity_id uuid, command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype; manager boolean; op text:=command->>'op'; d uuid; dtype uuid;
 src public.activity_duty_slots%rowtype; dst public.activity_duty_slots%rowtype;
 r public.activity_duty_change_requests%rowtype; person uuid; n integer; item jsonb; cutoff timestamptz;
begin
 if auth.uid() is null then raise exception 'Not allowed' using errcode='42501'; end if;
 select * into a from public.activities where id=target_activity_id for update;
 if a.id is null then raise exception 'Activity not found' using errcode='P0002'; end if;
 manager:=coalesce(public.has_team_permission(a.team_id,'invitation.manage'),false);
 if a.status='cancelled' or not exists(select 1 from public.activity_types t where t.id=a.activity_type_id and t.system_category='work') then
 raise exception 'Not an active work activity' using errcode='23514'; end if;
 cutoff:=least(coalesce(a.duty_self_service_until,a.starts_at),a.starts_at);
 if op in ('create','settings','assign','complete') and not manager then raise exception 'Not allowed' using errcode='42501'; end if;
 if op='settings' then
 if (command->>'selfServiceUntil')::timestamptz>a.starts_at then raise exception 'Self service must close by activity start' using errcode='23514'; end if;
 update public.activities set duty_claim_requires_approval=(command->>'claimRequiresApproval')::boolean,
 duty_change_requires_approval=(command->>'changeRequiresApproval')::boolean,
 duty_self_service_until=(command->>'selfServiceUntil')::timestamptz where id=a.id;
 elsif op='create' then
 dtype:=(command->>'dutyTypeId')::uuid;
 if not exists(select 1 from public.activity_duty_types t where t.id=dtype and t.team_id=a.team_id) then raise exception 'Invalid duty type' using errcode='23514'; end if;
 if jsonb_typeof(command->'duties') is distinct from 'array' or jsonb_array_length(command->'duties') not between 1 and 48 then raise exception 'Invalid duties' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(command->'duties') loop
 n:=(item->>'places')::integer;
 if n is null or n not between 1 and 50 then raise exception 'Invalid places' using errcode='23514'; end if;
 if item->>'timingKind'='interval' and ((item->>'startsAt')::timestamptz<a.starts_at or (item->>'endsAt')::timestamptz>a.ends_at) then raise exception 'Outside activity' using errcode='23514'; end if;
 insert into public.activity_duties(organization_id,activity_id,duty_type_id,timing_kind,starts_at,ends_at,due_at,instructions)
 values(a.organization_id,a.id,dtype,item->>'timingKind',(item->>'startsAt')::timestamptz,(item->>'endsAt')::timestamptz,(item->>'dueAt')::timestamptz,coalesce(item->>'instructions','')) returning id into d;
 insert into public.activity_duty_slots(organization_id,activity_id,duty_id) select a.organization_id,a.id,d from generate_series(1,n);
 end loop;
 elsif op in ('assign','complete') then
 select * into dst from public.activity_duty_slots where id=(command->>'slotId')::uuid and activity_id=a.id for update;
 if dst.id is null or dst.revision<>(command->>'revision')::integer or command->>'revision' is null then raise exception 'Slot changed' using errcode='40001'; end if;
 if op='assign' then
 person:=(command->>'personId')::uuid;
 if person is not null and not private.duty_person_eligible(a.id,person) then raise exception 'Invalid person' using errcode='23514'; end if;
 if dst.completed_at is not null then raise exception 'Completed slot' using errcode='23514'; end if;
 update public.activity_duty_slots set person_id=person,revision=revision+1 where id=dst.id;
 else
 if dst.person_id is null or (coalesce((command->>'completed')::boolean,false) and exists(select 1 from public.activity_duties where id=dst.duty_id and timing_kind='interval' and starts_at>now())) then raise exception 'Cannot complete yet' using errcode='23514'; end if;
 update public.activity_duty_slots set completed_at=case when (command->>'completed')::boolean then coalesce(completed_at,now()) else null end,revision=revision+1 where id=dst.id;
 end if;
 elsif op in ('claim','propose') then
 if not manager and now()>=cutoff then raise exception 'Self service closed; contact leader' using errcode='23514'; end if;
 person:=(command->>'personId')::uuid;
 if not private.duty_person_eligible(a.id,person) or (not manager and not private.duty_owns_person(person)) then raise exception 'Not allowed' using errcode='42501'; end if;
 if op='propose' then
 select * into src from public.activity_duty_slots where id=(command->>'sourceSlotId')::uuid and activity_id=a.id for update;
 if src.id is null or src.person_id is distinct from person or src.completed_at is not null then raise exception 'Invalid source slot' using errcode='23514'; end if;
 end if;
 if command->>'targetSlotId' is not null then
 select * into dst from public.activity_duty_slots where id=(command->>'targetSlotId')::uuid and activity_id=a.id for update;
 if dst.id is null or dst.id=src.id or dst.completed_at is not null or dst.person_id=person then raise exception 'Invalid target slot' using errcode='23514'; end if;
 end if;
 if not manager and exists(select 1 from public.activity_duties t where t.id in (src.duty_id,dst.duty_id) and coalesce(t.starts_at,t.due_at,a.starts_at)<=now()) then raise exception 'Duty already started' using errcode='23514'; end if;
 if op='claim' and (dst.id is null or dst.person_id is not null) then raise exception 'Slot already occupied' using errcode='40001'; end if;
 if exists(select 1 from public.activity_duty_change_requests q where q.activity_id=a.id and q.status='pending' and q.person_id=person
 and q.source_slot_id is not distinct from src.id and q.target_slot_id is not distinct from dst.id) then raise exception 'Request already exists' using errcode='23514'; end if;
 insert into public.activity_duty_change_requests(activity_id,source_slot_id,target_slot_id,source_revision,target_revision,person_id,target_person_id,requested_by,counterpart_approved,manager_approved)
 values(a.id,src.id,dst.id,src.revision,dst.revision,person,dst.person_id,auth.uid(),dst.person_id is null,manager) returning * into r;
 elsif op in ('approve','reject','withdraw') then
 select * into r from public.activity_duty_change_requests where id=(command->>'requestId')::uuid and activity_id=a.id for update;
 if r.id is null or r.status<>'pending' then raise exception 'Request no longer pending' using errcode='40001'; end if;
 if op='withdraw' then
 if not private.duty_owns_person(r.person_id) and r.requested_by<>auth.uid() then raise exception 'Not allowed' using errcode='42501'; end if;
 update public.activity_duty_change_requests set status='withdrawn',resolved_at=now() where id=r.id;
 elsif op='reject' then
 if not manager and not private.duty_owns_person(r.target_person_id) then raise exception 'Not allowed' using errcode='42501'; end if;
 update public.activity_duty_change_requests set status='rejected',resolved_at=now() where id=r.id;
 else
 if not manager and not private.duty_owns_person(r.target_person_id) then raise exception 'Not allowed' using errcode='42501'; end if;
 if manager then r.manager_approved:=true; end if;
 if private.duty_owns_person(r.target_person_id) then r.counterpart_approved:=true; end if;
 update public.activity_duty_change_requests set manager_approved=r.manager_approved,counterpart_approved=r.counterpart_approved where id=r.id;
 end if;
 else raise exception 'Unknown command' using errcode='23514'; end if;
 if r.id is not null and op in ('claim','propose','approve') then
 select * into src from public.activity_duty_slots where id=r.source_slot_id;
 select * into dst from public.activity_duty_slots where id=r.target_slot_id;
 if (r.source_slot_id is not null and (src.id is null or src.revision<>r.source_revision or src.person_id is distinct from r.person_id))
 or (r.target_slot_id is not null and (dst.id is null or dst.revision<>r.target_revision or dst.person_id is distinct from r.target_person_id)) then
 update public.activity_duty_change_requests set status='expired',resolved_at=now() where id=r.id;
 elsif r.counterpart_approved and (r.manager_approved or (not exists(select 1 from public.activity_duties t where t.id in (src.duty_id,dst.duty_id) and coalesce(t.starts_at,t.due_at,a.starts_at)<=now()) and now()<cutoff and r.target_slot_id is not null and
 case when r.source_slot_id is null then not a.duty_claim_requires_approval else not a.duty_change_requires_approval end)) then
 if src.id is not null then update public.activity_duty_slots set person_id=r.target_person_id,revision=revision+1 where id=src.id; end if;
 if dst.id is not null then update public.activity_duty_slots set person_id=r.person_id,revision=revision+1 where id=dst.id; end if;
 update public.activity_duty_change_requests set status='applied',resolved_at=now() where id=r.id;
 end if;
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
 values(a.organization_id,auth.uid(),'activity_duty.'||op,'activity',a.id::text,
 jsonb_build_object('command',command,'requestId',r.id,'previousPersonId',dst.person_id,'previousRevision',dst.revision));
 return public.get_activity_duty_schedule(a.id);
end; $$;
revoke all on function public.get_activity_duty_schedule(uuid), public.command_activity_duty(uuid,jsonb) from public,anon;
grant execute on function public.get_activity_duty_schedule(uuid), public.command_activity_duty(uuid,jsonb) to authenticated;

create or replace function public.activity_duty_history(target_team_id uuid, target_person_id uuid)
returns table(activity_title text, starts_at timestamptz, duty_name text, completed_at timestamptz, response text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_team_permission(target_team_id,'invitation.manage') then raise exception 'Not allowed' using errcode='42501'; end if;
 return query select a.title, coalesce(d.starts_at,d.due_at,a.starts_at),t.name,s.completed_at,
 coalesce(i.response,'pending') from public.activity_duty_slots s
 join public.activity_duties d on d.id=s.duty_id join public.activity_duty_types t on t.id=d.duty_type_id
 join public.activities a on a.id=d.activity_id
 left join public.invitations i on i.activity_id=a.id and i.person_id=s.person_id
 where a.team_id=target_team_id and s.person_id=target_person_id and a.status<>'cancelled'
 and coalesce(d.starts_at,d.due_at,a.starts_at)<=now()
 order by coalesce(d.starts_at,d.due_at,a.starts_at) desc,s.id limit 20;
end; $$;

create function public.my_activity_duty_links(target_organization_id uuid)
returns table(activity_id uuid,team_id uuid,person_id uuid)
language sql stable security definer set search_path='' as $$
 select distinct a.id,a.team_id,s.person_id from public.activity_duty_slots s
 join public.activities a on a.id=s.activity_id
 where auth.uid() is not null and a.organization_id=target_organization_id
 and a.status<>'cancelled' and a.ends_at>=now() and private.duty_owns_person(s.person_id);
$$;
revoke all on function public.my_activity_duty_links(uuid) from public,anon;
grant execute on function public.my_activity_duty_links(uuid) to authenticated;
