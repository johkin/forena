-- Lift only the category restriction in the existing, audited command bodies.
-- Exact replacements deliberately fail on unexpected definitions instead of
-- copying legacy bodies or accidentally removing their authorization guards.
do $$
declare fn regprocedure; before_definition text; definition text;
begin
  foreach fn in array array[
    'private.command_activity_duty_base(uuid,jsonb)'::regprocedure,
    'public.command_activity_duty(uuid,jsonb)'::regprocedure,
    'public.command_activity_duty_series(uuid,jsonb)'::regprocedure,
    'public.cancel_activity_duties(uuid,jsonb)'::regprocedure
  ] loop
    before_definition:=pg_get_functiondef(fn);
    definition:=replace(before_definition,
      'not exists(select 1 from public.activity_types t where t.id=a.activity_type_id and t.system_category=''work'')', 'a.team_id is null');
    definition:=replace(definition,
      'not exists(select 1 from public.activity_types where id=a.activity_type_id and system_category=''work'')', 'a.team_id is null');
    definition:=replace(definition, E'not exists (\n    select 1 from public.activity_types where id = a.activity_type_id and system_category = ''work''\n  )', 'a.team_id is null');
    if definition=before_definition then raise exception 'Unexpected duty guard in %',fn; end if;
    definition:=replace(replace(definition,'Not a work activity','Not an active team activity'),'Not an active work activity','Not an active team activity');
    execute definition;
  end loop;
  fn:='private.get_activity_duty_schedule_base(uuid)'::regprocedure;
  before_definition:=pg_get_functiondef(fn);
  definition:=replace(before_definition,'''isWork'',','''supportsDuties'',a.team_id is not null,''isWork'',');
  if definition=before_definition then raise exception 'Unexpected schedule definition'; end if;
  execute definition;
end; $$;

alter table public.activity_duty_series add column batch_id uuid,
  add column follows_activity boolean not null default false;
create index activity_duty_series_batch_idx on public.activity_duty_series(batch_id) where batch_id is not null;

-- Receipts make repeated button presses/network retries idempotent. No client
-- access; they contain no people or assignments and live with their team.
create table private.activity_duty_batches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  command jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique(team_id,actor_user_id,fingerprint)
);
alter table private.activity_duty_batches enable row level security;
revoke all on private.activity_duty_batches from public,anon,authenticated;

create function private.activity_duty_target(a public.activities) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',a.id,'title',a.title,'startsAt',a.starts_at,'endsAt',a.ends_at,
    'category',t.system_category,'sourceKind',a.source_kind,'externalSource',a.external_source,
    'seriesId',a.series_id,'seriesTitle',s.title,
    'venue',case when v.values->>'venue' in ('home','away','neutral') then v.values->>'venue' end)
  from public.activity_types t
  left join public.activity_series s on s.id=a.series_id and s.team_id=a.team_id
  left join public.teams team on team.id=a.team_id
  left join public.sections section on section.id=team.section_id
  left join private.discipline_values v on v.activity_id=a.id and v.team_id=a.team_id
    and v.organization_id=a.organization_id and v.scope='activity' and v.discipline_id=section.discipline_id
  where t.id=a.activity_type_id;
$$;
revoke all on function private.activity_duty_target(public.activities) from public,anon,authenticated;

create function public.list_activity_duty_targets(target_team_id uuid,from_time timestamptz default null,through_time timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.has_team_permission(target_team_id,'invitation.manage'),false) then raise exception 'Not allowed' using errcode='42501'; end if;
  if from_time is not null and through_time is not null and through_time<from_time then raise exception 'Invalid period' using errcode='23514'; end if;
  select coalesce(jsonb_agg(private.activity_duty_target(a) order by a.starts_at,a.id),'[]'::jsonb) into result
  from (select * from public.activities where team_id=target_team_id and status<>'cancelled' and starts_at>now()
    and (from_time is null or starts_at>=from_time) and (through_time is null or starts_at<=through_time)
    order by starts_at,id limit 201) a;
  if jsonb_array_length(result)>200 then raise exception 'Narrow period' using errcode='23514'; end if;
  return result;
end; $$;
revoke all on function public.list_activity_duty_targets(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.list_activity_duty_targets(uuid,timestamptz,timestamptz) to authenticated;

create function public.preview_activity_duty_batch(target_team_id uuid,command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[]; a public.activities%rowtype; rows jsonb:='[]'::jsonb; snapshots jsonb:='[]'::jsonb;
  existing jsonb; target jsonb; normalized_name text:=lower(btrim(command->>'name')); places integer;
begin
  if auth.uid() is null or not coalesce(public.has_team_permission(target_team_id,'invitation.manage'),false) then raise exception 'Not allowed' using errcode='42501'; end if;
  if jsonb_typeof(command) is distinct from 'object' or command - array['activityIds','name','places','instructions'] <> '{}'::jsonb
    or jsonb_typeof(command->'activityIds') is distinct from 'array' or jsonb_typeof(command->'name') is distinct from 'string'
    or jsonb_typeof(command->'instructions') is distinct from 'string' or length(command->>'instructions')>2000
    or jsonb_typeof(command->'places') is distinct from 'number' or (command->>'places') !~ '^[0-9]+$'
    or length(btrim(command->>'name')) not between 1 and 80 then raise exception 'Invalid command' using errcode='23514'; end if;
  places:=(command->>'places')::integer;
  if places not between 1 and 50 or jsonb_array_length(command->'activityIds') not between 1 and 100 then raise exception 'Invalid size' using errcode='23514'; end if;
  select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(command->'activityIds');
  if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'Duplicate activity' using errcode='23514'; end if;
  if (select count(*) from public.activities where id=any(ids) and team_id=target_team_id and status<>'cancelled' and starts_at>now())<>cardinality(ids) then raise exception 'Invalid selection' using errcode='40001'; end if;
  -- Validate the reusable catalogue even if all targets already have the duty.
  if exists(select 1 from public.activity_duty_types where team_id=target_team_id and lower(btrim(name))=normalized_name and not active) then raise exception 'Inactive duty type' using errcode='23514'; end if;
  for a in select * from public.activities where id=any(ids) order by starts_at,id loop
    select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'revision',d.revision) order by d.id),'[]'::jsonb) into existing
    from public.activity_duties d where d.activity_id=a.id and d.cancelled_at is null and lower(btrim(d.name))=normalized_name;
    target:=private.activity_duty_target(a);
    rows:=rows||jsonb_build_array(target||jsonb_build_object('exists',jsonb_array_length(existing)>0));
    snapshots:=snapshots||jsonb_build_array(jsonb_build_object('target',target,'generation',a.discipline_generation,'updatedAt',a.updated_at,'existing',existing));
  end loop;
  return jsonb_build_object('activities',rows,'fingerprint',md5(command::text||snapshots::text));
end; $$;
revoke all on function public.preview_activity_duty_batch(uuid,jsonb) from public,anon;
grant execute on function public.preview_activity_duty_batch(uuid,jsonb) to authenticated;

create function public.confirm_activity_duty_batch(target_team_id uuid,command jsonb,expected_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare preview jsonb; item jsonb; dtype uuid; org uuid; receipt private.activity_duty_batches%rowtype;
  created integer:=0; skipped integer:=0; batch uuid:=gen_random_uuid(); series uuid; result jsonb;
begin
  if auth.uid() is null or not coalesce(public.has_team_permission(target_team_id,'invitation.manage'),false) then raise exception 'Not allowed' using errcode='42501'; end if;
  -- Lock in consistent order: team, then all target activities. Existing duty
  -- writes already use activity locks. This protects both snapshots and dedup.
  select organization_id into org from public.teams where id=target_team_id for update;
  select * into receipt from private.activity_duty_batches where team_id=target_team_id and actor_user_id=auth.uid() and fingerprint=expected_fingerprint;
  if receipt.id is not null then
    if receipt.command is distinct from command then raise exception 'Changed command' using errcode='40001'; end if;
    return receipt.result;
  end if;
  -- Validate JSON before casting target IDs for locks.
  preview:=public.preview_activity_duty_batch(target_team_id,command);
  perform 1 from public.activities where id in(select value::uuid from jsonb_array_elements_text(command->'activityIds')) order by id for update;
  preview:=public.preview_activity_duty_batch(target_team_id,command);
  if expected_fingerprint is distinct from preview->>'fingerprint' then raise exception 'Selection changed' using errcode='40001'; end if;
  insert into public.activity_duty_types(organization_id,team_id,name) values(org,target_team_id,btrim(command->>'name')) on conflict do nothing;
  select id into dtype from public.activity_duty_types where team_id=target_team_id and lower(btrim(name))=lower(btrim(command->>'name')) and active for update;
  if dtype is null then raise exception 'Inactive duty type' using errcode='23514'; end if;
  for item in select value from jsonb_array_elements(preview->'activities') loop
    if (item->>'exists')::boolean then skipped:=skipped+1; continue; end if;
    perform public.command_activity_duty_series((item->>'id')::uuid,jsonb_build_object('op','create_series','dutyTypeId',dtype,
      'definition',jsonb_build_object('timingKind','interval','startsAt',item->>'startsAt','endsAt',item->>'endsAt','places',command->'places','instructions',command->>'instructions')));
    select id into series from public.activity_duty_series where activity_id=(item->>'id')::uuid and duty_type_id=dtype
      and lower(btrim(name))=lower(btrim(command->>'name')) and cancelled_at is null order by id limit 1;
    update public.activity_duty_series set batch_id=batch,follows_activity=true where id=series;
    created:=created+1;
  end loop;
  result:=jsonb_build_object('created',created,'skipped',skipped);
  insert into private.activity_duty_batches(id,team_id,actor_user_id,fingerprint,command,result) values(batch,target_team_id,auth.uid(),expected_fingerprint,command,result);
  insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
    values(org,auth.uid(),'activity_duty.batch_created','activity_duty_batch',batch::text,jsonb_build_object('command',command,'result',result));
  return result;
end; $$;
revoke all on function public.confirm_activity_duty_batch(uuid,jsonb,text) from public,anon;
grant execute on function public.confirm_activity_duty_batch(uuid,jsonb,text) to authenticated;

-- An individual time edit opts out of following the match. Nested updates
-- from the lifecycle trigger keep the anchor; user edits are depth one.
create function private.detach_duty_time_anchor() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if pg_trigger_depth()=1 then
    if tg_table_name='activity_duty_series' then
      if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.due_at is distinct from old.due_at or new.timing_kind is distinct from old.timing_kind or new.interval_minutes is distinct from old.interval_minutes then new.follows_activity:=false; end if;
    elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.due_at is distinct from old.due_at or new.timing_kind is distinct from old.timing_kind then
      update public.activity_duty_series set follows_activity=false where id=new.series_id;
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.detach_duty_time_anchor() from public,anon,authenticated;
create trigger detach_duty_series_time_anchor before update on public.activity_duty_series for each row execute function private.detach_duty_time_anchor();
create trigger detach_duty_time_anchor before update on public.activity_duties for each row execute function private.detach_duty_time_anchor();

-- Importers retain ownership of the activity. Local duty data follows its
-- lifecycle without writing back to match/source fields or invitations.
create function private.sync_activity_duty_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; people_ids uuid[]; previous jsonb;
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    select array_agg(d.id) into ids from public.activity_duties d where d.activity_id=new.id and d.cancelled_at is null
      and not exists(select 1 from public.activity_duty_slots s where s.duty_id=d.id and s.completed_at is not null);
    if ids is null then return new; end if;
    select array_agg(distinct s.person_id),jsonb_agg(to_jsonb(s) order by s.id) into people_ids,previous
      from public.activity_duty_slots s where s.duty_id=any(ids) and s.retired_at is null;
    update public.activity_duties set cancelled_at=now(),revision=revision+1 where id=any(ids);
    update public.activity_duty_slots set person_id=null,retired_at=now(),revision=revision+1 where duty_id=any(ids) and retired_at is null;
    update public.activity_duty_change_requests set status='expired',resolved_at=now() where activity_id=new.id and status='pending'
      and (source_slot_id in(select id from public.activity_duty_slots where duty_id=any(ids)) or target_slot_id in(select id from public.activity_duty_slots where duty_id=any(ids)));
    perform private.queue_duty_update(new.id,people_ids,gen_random_uuid()::text,'cancelled');
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
      values(new.organization_id,auth.uid(),'activity_duty.activity_cancelled','activity',new.id::text,jsonb_build_object('dutyIds',ids,'previousSlots',previous));
  elsif new.status<>'cancelled' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
    select array_agg(d.id) into ids from public.activity_duties d join public.activity_duty_series g on g.id=d.series_id
      where d.activity_id=new.id and d.cancelled_at is null and g.follows_activity and g.cancelled_at is null
        and not exists(select 1 from public.activity_duty_slots s join public.activity_duties d0 on d0.id=s.duty_id where d0.series_id=g.id and s.completed_at is not null);
    if ids is null then return new; end if;
    select array_agg(distinct s.person_id),jsonb_agg(to_jsonb(s) order by s.id) into people_ids,previous
      from public.activity_duty_slots s where s.duty_id=any(ids) and s.retired_at is null;
    update public.activity_duty_series set starts_at=new.starts_at,ends_at=new.ends_at,revision=revision+1
      where id in(select series_id from public.activity_duties where id=any(ids));
    update public.activity_duties set starts_at=new.starts_at,ends_at=new.ends_at,revision=revision+1 where id=any(ids);
    update public.activity_duty_slots set revision=revision+1 where duty_id=any(ids) and retired_at is null;
    update public.activity_duty_change_requests set status='expired',resolved_at=now() where activity_id=new.id and status='pending'
      and (source_slot_id in(select id from public.activity_duty_slots where duty_id=any(ids)) or target_slot_id in(select id from public.activity_duty_slots where duty_id=any(ids)));
    perform private.queue_duty_update(new.id,people_ids,gen_random_uuid()::text,'edited');
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
      values(new.organization_id,auth.uid(),'activity_duty.activity_time_changed','activity',new.id::text,jsonb_build_object('dutyIds',ids,'previousSlots',previous,'previousStart',old.starts_at,'previousEnd',old.ends_at));
  end if;
  return new;
end; $$;
revoke all on function private.sync_activity_duty_lifecycle() from public,anon,authenticated;
create trigger sync_activity_duty_lifecycle after update of starts_at,ends_at,status on public.activities
  for each row execute function private.sync_activity_duty_lifecycle();
