alter table public.activity_duty_types add column active boolean not null default true, add column revision integer not null default 1;
alter table public.activity_duties add column name text, add column revision integer not null default 1, add column cancelled_at timestamptz;
update public.activity_duties d set name=t.name from public.activity_duty_types t where t.id=d.duty_type_id;
alter table public.activity_duties alter column name set not null;
alter table public.activity_duty_slots add column retired_at timestamptz;
-- Keep names on existing duties when the reusable catalogue is renamed.
create function private.snapshot_duty_name() returns trigger language plpgsql security invoker set search_path='' as $$
begin select name into new.name from public.activity_duty_types where id=new.duty_type_id; return new; end; $$;
revoke all on function private.snapshot_duty_name() from public,anon,authenticated;
create trigger duty_name_snapshot before insert on public.activity_duties for each row execute function private.snapshot_duty_name();

-- A booking after an editor preview must also invalidate that preview.
create function private.bump_duty_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.person_id is distinct from old.person_id or new.completed_at is distinct from old.completed_at then
   update public.activity_duties set revision=revision+1 where id=new.duty_id;
 end if;
 return new;
end; $$;
revoke all on function private.bump_duty_revision() from public,anon,authenticated;
create trigger duty_assignment_revision after update of person_id,completed_at on public.activity_duty_slots for each row execute function private.bump_duty_revision();

create unique index duty_notification_event_idx on public.notification_outbox(user_id,(payload->>'eventKey')) where type='duty_update';
create function private.queue_duty_update(activity uuid, people_ids uuid[], event_key text, reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.activities%rowtype;
begin
 select * into a from public.activities where id=activity;
 insert into public.notification_outbox(organization_id,user_id,type,payload)
 select a.organization_id,om.user_id,'duty_update',jsonb_build_object('activityId',a.id,'teamId',a.team_id,'title',a.title,'startsAt',a.starts_at,'eventKey',event_key,'reason',reason)
 from public.organization_members om where om.organization_id=a.organization_id and (
 private.has_team_permission(a.team_id,'invitation.manage',om.user_id)
 or exists(select 1 from public.people p where p.id=any(people_ids) and p.organization_id=a.organization_id and p.user_id=om.user_id)
 or exists(select 1 from public.person_guardians g where g.person_id=any(people_ids) and g.guardian_user_id=om.user_id))
 on conflict do nothing;
end; $$;
revoke all on function private.queue_duty_update(uuid,uuid[],text,text) from public,anon,authenticated;

create function private.notify_duty_request() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 -- Supersede pending notifications when a request reaches a decision in the same transaction.
 if new.status<>'pending' then
 update public.notification_outbox set status='cancelled'
 where type='duty_update' and status='pending' and payload->>'eventKey'=new.id::text||':pending';
 end if;
 perform private.queue_duty_update(new.activity_id,array[new.person_id,new.target_person_id],new.id::text||':'||new.status,new.status);
 return new;
end; $$;
revoke all on function private.notify_duty_request() from public,anon,authenticated;
create trigger duty_request_notification after insert or update of status on public.activity_duty_change_requests for each row execute function private.notify_duty_request();

alter function public.command_activity_duty(uuid,jsonb) set schema private;
alter function private.command_activity_duty(uuid,jsonb) rename to command_activity_duty_base;
revoke all on function private.command_activity_duty_base(uuid,jsonb) from public,anon,authenticated;

create function public.command_activity_duty(target_activity_id uuid,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype; d public.activity_duties%rowtype; s public.activity_duty_slots%rowtype;
 op text:=command->>'op'; item jsonb; total integer; wanted integer; affected uuid[]; previous_slots jsonb; result jsonb; event_key text:=gen_random_uuid()::text;
begin
 if auth.uid() is null then raise exception 'Not allowed' using errcode='42501'; end if;
 select * into a from public.activities where id=target_activity_id for update;
 if a.id is null then raise exception 'Activity not found' using errcode='P0002'; end if;
 if op in ('edit_duty','cancel_duty','edit_type','assign_batch') then
 if not public.has_team_permission(a.team_id,'invitation.manage') then raise exception 'Not allowed' using errcode='42501'; end if;
 if a.status='cancelled' or not exists(select 1 from public.activity_types where id=a.activity_type_id and system_category='work') then raise exception 'Not a work activity' using errcode='23514'; end if;
 if op='edit_type' then
 if length(btrim(command->>'name')) not between 1 and 80 or command->>'active' is null then raise exception 'Invalid name' using errcode='23514'; end if;
 update public.activity_duty_types set name=btrim(command->>'name'),active=(command->>'active')::boolean,revision=revision+1
 where id=(command->>'dutyTypeId')::uuid and team_id=a.team_id and revision=(command->>'revision')::integer;
 if not found then raise exception 'Type changed' using errcode='40001'; end if;
 elsif op='assign_batch' then
 if jsonb_typeof(command->'assignments') is distinct from 'array' or jsonb_array_length(command->'assignments') not between 1 and 100 then raise exception 'Invalid assignments' using errcode='23514'; end if;
 if (select count(*)<>count(distinct value->>'slotId') from jsonb_array_elements(command->'assignments')) then raise exception 'Duplicate slot' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(command->'assignments') loop
 select s0.* into s from public.activity_duty_slots s0 join public.activity_duties d0 on d0.id=s0.duty_id
 where s0.id=(item->>'slotId')::uuid and s0.activity_id=a.id and s0.retired_at is null and d0.cancelled_at is null;
 if s.id is null or s.person_id is not null or s.revision is distinct from (item->>'revision')::integer or item->>'personId' is null then raise exception 'Slot changed' using errcode='40001'; end if;
 perform private.command_activity_duty_base(a.id,item||'{"op":"assign"}'::jsonb);
 affected:=array_append(affected,(item->>'personId')::uuid);
 end loop;
 perform private.queue_duty_update(a.id,affected,event_key,'assigned');
 else
 select * into d from public.activity_duties where id=(command->>'dutyId')::uuid and activity_id=a.id for update;
 if d.id is null or d.cancelled_at is not null or d.revision is distinct from (command->>'revision')::integer then raise exception 'Duty changed' using errcode='40001'; end if;
 if exists(select 1 from public.activity_duty_slots where duty_id=d.id and completed_at is not null) then raise exception 'Completed history is immutable' using errcode='23514'; end if;
 select array_agg(person_id),jsonb_agg(to_jsonb(sl)) into affected,previous_slots from public.activity_duty_slots sl where duty_id=d.id and retired_at is null;
 if op='cancel_duty' then
 update public.activity_duties set cancelled_at=now(),revision=revision+1 where id=d.id;
 update public.activity_duty_slots set person_id=null,retired_at=now(),revision=revision+1 where duty_id=d.id and retired_at is null;
 else
 wanted:=(command->'definition'->>'places')::integer;
 if wanted is null or wanted not between 1 and 50 then raise exception 'Invalid places' using errcode='23514'; end if;
 if (command->'definition'->>'timingKind')='interval' and ((command->'definition'->>'startsAt')::timestamptz<a.starts_at or (command->'definition'->>'endsAt')::timestamptz>a.ends_at) then raise exception 'Outside activity' using errcode='23514'; end if;
 select count(*) into total from public.activity_duty_slots where duty_id=d.id and retired_at is null;
 if wanted<(select count(*) from public.activity_duty_slots where duty_id=d.id and retired_at is null and person_id is not null) then raise exception 'Release assigned slots first' using errcode='23514'; end if;
 update public.activity_duties set timing_kind=command->'definition'->>'timingKind',starts_at=(command->'definition'->>'startsAt')::timestamptz,ends_at=(command->'definition'->>'endsAt')::timestamptz,due_at=(command->'definition'->>'dueAt')::timestamptz,instructions=coalesce(command->'definition'->>'instructions',''),revision=revision+1 where id=d.id;
 if wanted>total then
 insert into public.activity_duty_slots(organization_id,activity_id,duty_id) select a.organization_id,a.id,d.id from generate_series(1,wanted-total);
 elsif wanted<total then
 update public.activity_duty_slots set retired_at=now() where id in (select id from public.activity_duty_slots where duty_id=d.id and retired_at is null and person_id is null order by id limit(total-wanted));
 end if;
 update public.activity_duty_slots set revision=revision+1 where duty_id=d.id;
 end if;
 update public.activity_duty_change_requests set status='expired',resolved_at=now() where activity_id=a.id and status='pending' and (source_slot_id in(select id from public.activity_duty_slots where duty_id=d.id) or target_slot_id in(select id from public.activity_duty_slots where duty_id=d.id));
 perform private.queue_duty_update(a.id,affected,event_key,case when op='cancel_duty' then 'cancelled' else 'edited' end);
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details) values(a.organization_id,auth.uid(),'activity_duty.'||op,'activity',a.id::text,jsonb_build_object('command',command,'previousDuty',to_jsonb(d),'previousSlots',previous_slots));
 return public.get_activity_duty_schedule(a.id);
 end if;
 -- The original command remains private, so retired slots cannot be reached by bypassing this guard.
 if op='create' and not exists(select 1 from public.activity_duty_types where id=(command->>'dutyTypeId')::uuid and team_id=a.team_id and active) then raise exception 'Inactive duty type' using errcode='23514'; end if;
 if exists(select 1 from public.activity_duty_slots s0 join public.activity_duties d0 on d0.id=s0.duty_id where s0.activity_id=a.id and (s0.retired_at is not null or d0.cancelled_at is not null) and s0.id in ((command->>'slotId')::uuid,(command->>'sourceSlotId')::uuid,(command->>'targetSlotId')::uuid)) then raise exception 'Duty cancelled' using errcode='40001'; end if;
 if op='assign' then select * into s from public.activity_duty_slots where id=(command->>'slotId')::uuid and activity_id=a.id; end if;
 result:=private.command_activity_duty_base(a.id,command);
 if op='assign' and s.person_id is distinct from (command->>'personId')::uuid then perform private.queue_duty_update(a.id,array[s.person_id,(command->>'personId')::uuid],event_key,'assigned'); end if;
 return result;
end; $$;
revoke all on function public.command_activity_duty(uuid,jsonb) from public,anon;
grant execute on function public.command_activity_duty(uuid,jsonb) to authenticated;

create function public.activity_duty_fairness(target_activity_id uuid,from_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype; result jsonb;
begin
 select * into a from public.activities where id=target_activity_id;
 if auth.uid() is null or a.id is null or not public.has_team_permission(a.team_id,'invitation.manage') then raise exception 'Not allowed' using errcode='42501'; end if;
 if from_date is null or from_date>current_date or from_date<current_date-interval '10 years' then raise exception 'Invalid period' using errcode='23514'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'name',p.display_name,
 'completed', (select count(*) from public.activity_duty_slots s join public.activities h on h.id=s.activity_id where s.person_id=p.id and h.team_id=a.team_id and s.completed_at>=from_date and s.completed_at<=now()),
 'byType',coalesce((select jsonb_object_agg(x.duty_type_id,x.n) from (select d.duty_type_id,count(*) n from public.activity_duty_slots s join public.activity_duties d on d.id=s.duty_id join public.activities h on h.id=s.activity_id where s.person_id=p.id and h.team_id=a.team_id and s.completed_at>=from_date and s.completed_at<=now() group by d.duty_type_id) x),'{}'::jsonb),
 'lastType',(select d.duty_type_id from public.activity_duty_slots s join public.activity_duties d on d.id=s.duty_id join public.activities h on h.id=s.activity_id where s.person_id=p.id and h.team_id=a.team_id and s.completed_at>=from_date and s.completed_at<=now() order by s.completed_at desc,s.id limit 1)
 )),'[]'::jsonb) into result from public.people p where private.duty_person_eligible(a.id,p.id);
 return result;
end; $$;
revoke all on function public.activity_duty_fairness(uuid,date) from public,anon;
grant execute on function public.activity_duty_fairness(uuid,date) to authenticated;

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
 'types',case when manager then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'active',t.active,'revision',t.revision) order by t.name),'[]'::jsonb) from public.activity_duty_types t where t.team_id=a.team_id) else '[]'::jsonb end,
 'canManage',manager,'claimRequiresApproval',a.duty_claim_requires_approval,'changeRequiresApproval',a.duty_change_requires_approval,
 'selfServiceUntil',coalesce(a.duty_self_service_until,a.starts_at),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)) from public.people p where
 private.duty_person_eligible(a.id,p.id) and (manager or private.duty_owns_person(p.id))),'[]'::jsonb),
 'duties',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'dutyTypeId',d.duty_type_id,'revision',d.revision,'timingKind',d.timing_kind,'startsAt',d.starts_at,'endsAt',d.ends_at,'dueAt',d.due_at,'instructions',d.instructions,
 'slots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'personId',case when manager or private.duty_owns_person(s.person_id) then s.person_id else null end,
 'personName',case when manager or private.duty_owns_person(s.person_id) then (select p.display_name from public.people p where p.id=s.person_id) else null end,
 'occupied',s.person_id is not null,'mine',private.duty_owns_person(s.person_id),'completedAt',s.completed_at,'revision',s.revision) order by s.id)
 from public.activity_duty_slots s where s.duty_id=d.id and s.retired_at is null),'[]'::jsonb)) order by coalesce(d.starts_at,d.due_at,a.starts_at),d.id)
 from public.activity_duties d join public.activity_duty_types t on t.id=d.duty_type_id where d.activity_id=a.id and d.cancelled_at is null),'[]'::jsonb),
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


create or replace function public.activity_duty_history(target_team_id uuid, target_person_id uuid)
returns table(activity_title text, starts_at timestamptz, duty_name text, completed_at timestamptz, response text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_team_permission(target_team_id,'invitation.manage') then raise exception 'Not allowed' using errcode='42501'; end if;
 return query select a.title, coalesce(d.starts_at,d.due_at,a.starts_at),d.name,s.completed_at,
 coalesce(i.response,'pending') from public.activity_duty_slots s
 join public.activity_duties d on d.id=s.duty_id join public.activity_duty_types t on t.id=d.duty_type_id
 join public.activities a on a.id=d.activity_id
 left join public.invitations i on i.activity_id=a.id and i.person_id=s.person_id
 where s.retired_at is null and d.cancelled_at is null and a.team_id=target_team_id and s.person_id=target_person_id and a.status<>'cancelled'
 and coalesce(d.starts_at,d.due_at,a.starts_at)<=now()
 order by coalesce(d.starts_at,d.due_at,a.starts_at) desc,s.id limit 20;
end; $$;

create or replace function public.my_activity_duty_links(target_organization_id uuid)
returns table(activity_id uuid,team_id uuid,person_id uuid)
language sql stable security definer set search_path='' as $$
 select distinct a.id,a.team_id,s.person_id from public.activity_duty_slots s
 join public.activities a on a.id=s.activity_id
 where auth.uid() is not null and a.organization_id=target_organization_id
 and a.status<>'cancelled' and a.ends_at>=now() and private.duty_owns_person(s.person_id);
$$;
revoke all on function public.my_activity_duty_links(uuid) from public,anon;
grant execute on function public.my_activity_duty_links(uuid) to authenticated;
