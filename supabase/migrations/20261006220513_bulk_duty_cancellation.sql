-- Cancel a selection in one transaction, with the same guards as single-duty editing.
create function public.cancel_activity_duties(target_activity_id uuid, duties jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.activities%rowtype;
  d public.activity_duties%rowtype;
  item jsonb;
  ids uuid[] := array[]::uuid[];
  affected uuid[];
  previous_duties jsonb;
  previous_slots jsonb;
begin
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into a from public.activities where id = target_activity_id for update;
  if a.id is null then raise exception 'Activity not found' using errcode = 'P0002'; end if;
  if not coalesce(public.has_team_permission(a.team_id, 'invitation.manage'), false) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if a.status = 'cancelled' or not exists (
    select 1 from public.activity_types where id = a.activity_type_id and system_category = 'work'
  ) then raise exception 'Not a work activity' using errcode = '23514'; end if;
  if jsonb_typeof(duties) is distinct from 'array' then
    raise exception 'Invalid duties' using errcode = '23514';
  end if;
  if jsonb_array_length(duties) not between 1 and 100 then
    raise exception 'Invalid duties' using errcode = '23514';
  end if;
  -- All items are validated before modifying any duty. Casts also reject malformed RPC input.
  for item in select value from jsonb_array_elements(duties) loop
    if jsonb_typeof(item->'dutyId') is distinct from 'string'
      or jsonb_typeof(item->'revision') is distinct from 'number'
      or (item->>'revision') !~ '^[1-9][0-9]*$' then
      raise exception 'Invalid duty' using errcode = '23514';
    end if;
    if (item->>'dutyId')::uuid = any(ids) then
      raise exception 'Duplicate duty' using errcode = '23514';
    end if;
    select * into d from public.activity_duties
      where id = (item->>'dutyId')::uuid and activity_id = a.id for update;
    if d.id is null or d.cancelled_at is not null or d.revision is distinct from (item->>'revision')::integer then
      raise exception 'Duty changed' using errcode = '40001';
    end if;
    if exists (select 1 from public.activity_duty_slots where duty_id = d.id and completed_at is not null) then
      raise exception 'Completed history is immutable' using errcode = '23514';
    end if;
    ids := array_append(ids, d.id);
  end loop;
  select jsonb_agg(to_jsonb(old_duty) order by old_duty.id) into previous_duties
    from public.activity_duties old_duty where id = any(ids);
  select array_agg(distinct person_id), jsonb_agg(to_jsonb(slot) order by slot.id)
    into affected, previous_slots from public.activity_duty_slots slot
    where duty_id = any(ids) and retired_at is null;
  update public.activity_duties set cancelled_at = now(), revision = revision + 1 where id = any(ids);
  update public.activity_duty_slots set person_id = null, retired_at = now(), revision = revision + 1
    where duty_id = any(ids) and retired_at is null;
  update public.activity_duty_change_requests set status = 'expired', resolved_at = now()
    where activity_id = a.id and status = 'pending' and (
      source_slot_id in (select id from public.activity_duty_slots where duty_id = any(ids))
      or target_slot_id in (select id from public.activity_duty_slots where duty_id = any(ids))
    );
  perform private.queue_duty_update(a.id, affected, gen_random_uuid()::text, 'cancelled');
  insert into public.audit_log(organization_id, actor_user_id, action, entity_type, entity_id, details)
    values (a.organization_id, auth.uid(), 'activity_duty.cancel_duties', 'activity', a.id::text,
      jsonb_build_object('command', jsonb_build_object('op', 'cancel_duties', 'duties', duties),
        'previousDuties', previous_duties, 'previousSlots', previous_slots));
  return public.get_activity_duty_schedule(a.id);
end;
$$;
revoke all on function public.cancel_activity_duties(uuid, jsonb) from public, anon;
grant execute on function public.cancel_activity_duties(uuid, jsonb) to authenticated;
