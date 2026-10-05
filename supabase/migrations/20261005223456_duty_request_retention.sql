-- Retain ordinary family changes without a per-family quota.
create index activity_duty_requests_pending_idx
  on public.activity_duty_change_requests(activity_id) where status='pending';
create index activity_duty_requests_history_idx
  on public.activity_duty_change_requests(activity_id,created_at desc,id desc) where status<>'pending';

-- Internal only. Callers run as the database owner after authorization or via cron.
-- Use the same activity lock as commands so cleanup cannot race with a booking.
create function private.maintain_activity_duty_requests(target_activity_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.activities%rowtype;
begin
  select * into a from public.activities where id=target_activity_id for update;
  if a.starts_at<=now() then
    update public.activity_duty_change_requests
    set status='expired',resolved_at=now()
    where activity_id=a.id and status='pending';
    if a.ends_at<=now()-interval '30 days' then
      delete from public.activity_duty_change_requests
      where activity_id=a.id and status<>'pending';
    end if;
  end if;
end;
$$;
revoke all on function private.maintain_activity_duty_requests(uuid) from public,anon,authenticated;

create function private.maintain_due_activity_duty_requests()
returns void language plpgsql security invoker set search_path='' as $$
declare activity_id uuid;
begin
  -- Limit each run and skip activities currently being edited; retry next minute.
  for activity_id in
    select a.id from public.activities a
    where a.starts_at<=now() and exists (
      select 1 from public.activity_duty_change_requests r
      where r.activity_id=a.id
        and (r.status='pending' or a.ends_at<=now()-interval '30 days')
    )
    order by a.starts_at,a.id limit 100 for update of a skip locked
  loop
    perform private.maintain_activity_duty_requests(activity_id);
  end loop;
end;
$$;
revoke all on function private.maintain_due_activity_duty_requests() from public,anon,authenticated;

select cron.schedule('maintain-activity-duty-requests','* * * * *',
  'select private.maintain_due_activity_duty_requests();');

create or replace function public.get_activity_duty_schedule(target_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype; manager boolean; result jsonb;
begin
 select * into a from public.activities where id=target_activity_id;
 manager:=coalesce(public.has_team_permission(a.team_id,'invitation.manage'),false);
 if auth.uid() is null or a.id is null or (not manager and not exists(select 1 from public.people p
 where private.duty_owns_person(p.id) and private.duty_person_eligible(a.id,p.id))) then
 raise exception 'Not allowed' using errcode='42501'; end if;
 -- Close overdue requests even between scheduled maintenance runs.
 if a.starts_at <= now() then
   perform private.maintain_activity_duty_requests(a.id);
 end if;
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
 'requestedAt',r.created_at) order by r.created_at desc,r.id desc) from (
   select visible.* from public.activity_duty_change_requests visible
   where visible.activity_id=a.id and visible.status='pending'
     and (manager or private.duty_owns_person(visible.person_id) or private.duty_owns_person(visible.target_person_id))
   union all
   (select visible.* from public.activity_duty_change_requests visible
    where visible.activity_id=a.id and visible.status<>'pending'
      and (manager or private.duty_owns_person(visible.person_id) or private.duty_owns_person(visible.target_person_id))
    order by visible.created_at desc, visible.id desc limit 20)
 ) r),'[]'::jsonb)) into result;
 return result;
end; $$;

create or replace function public.command_activity_duty(target_activity_id uuid, command jsonb) returns jsonb
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
 -- Managers can still assign slots directly after start, but proposals are closed.
 if op in ('claim','propose') and a.starts_at<=now() then
   raise exception 'Activity already started' using errcode='23514';
 end if;
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
 if a.starts_at<=now() or (r.source_slot_id is not null and (src.id is null or src.revision<>r.source_revision or src.person_id is distinct from r.person_id))
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
