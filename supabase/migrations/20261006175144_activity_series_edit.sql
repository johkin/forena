-- Single-occurrence edits are explicit exceptions to subsequent series edits.
alter table public.activities add column series_exception boolean not null default false;

create function public.edit_activity_series_from(target_activity_id uuid, changes jsonb,
  preview_only boolean default true, expected_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  anchor public.activities; item public.activities; zone text; result jsonb := '[]';
  skipped integer := 0; token text; start_delta interval; end_delta interval;
  new_start timestamptz; new_end timestamptz; new_gathering timestamptz;
  target_start timestamptz := (changes->>'startsAt')::timestamptz;
  target_end timestamptz := (changes->>'endsAt')::timestamptz;
  target_gathering timestamptz := (changes->>'gatheringAt')::timestamptz;
  type_id uuid; timing_changed boolean;
begin
  select * into anchor from public.activities where id=target_activity_id;
  if auth.uid() is null or anchor.id is null or not coalesce(public.has_team_permission(anchor.team_id,'activity.manage'),false)
  then raise exception 'Du saknar behörighet för serien.' using errcode='42501'; end if;
  -- Serialize series edits; lock occurrences in a stable order as well.
  perform 1 from public.activity_series where id=anchor.series_id for update;
  perform 1 from public.activities where series_id=anchor.series_id order by id for update;
  select * into anchor from public.activities where id=target_activity_id;
  if not coalesce(public.has_team_permission(anchor.team_id,'activity.manage'),false) then raise exception 'Du saknar behörighet för serien.' using errcode='42501'; end if;
  if anchor.series_id is null or anchor.starts_at<=now() or anchor.status='cancelled' or anchor.source_kind='imported'
  then raise exception 'Välj ett kommande, redigerbart tillfälle i serien.' using errcode='23514'; end if;
  if nullif(trim(changes->>'title'),'') is null or target_start is null or target_end is null
    or not isfinite(target_start) or not isfinite(target_end) or target_end<=target_start
    or target_start<=now() or (target_gathering is not null and not isfinite(target_gathering)) or target_gathering>target_start
  then raise exception 'Ogiltiga aktivitetsuppgifter.' using errcode='23514'; end if;
  type_id := coalesce((changes->>'activityTypeId')::uuid,anchor.activity_type_id);
  -- Series editing preserves the type; change it on individual occurrences if needed.
  if type_id<>anchor.activity_type_id then raise exception 'Aktivitetstyp ändras per tillfälle.' using errcode='23514'; end if;
  select time_zone into zone from public.organizations where id=anchor.organization_id;
  start_delta := (target_start at time zone zone)-(anchor.starts_at at time zone zone);
  end_delta := (target_end at time zone zone)-(anchor.ends_at at time zone zone);
  for item in select * from public.activities where series_id=anchor.series_id
    and organization_id=anchor.organization_id and team_id=anchor.team_id
    and starts_at>=anchor.starts_at and starts_at>now() order by starts_at,id
  loop
    -- Existing differences are also respected for older data, before exception tracking.
    if item.status='cancelled' or item.source_kind='imported' or (item.id<>anchor.id and (
      item.series_exception or item.title is distinct from anchor.title or item.location is distinct from anchor.location
      or item.description_markdown is distinct from anchor.description_markdown or item.activity_type_id<>anchor.activity_type_id
      or (item.starts_at at time zone zone)::time<>(anchor.starts_at at time zone zone)::time
      or item.ends_at-item.starts_at<>anchor.ends_at-anchor.starts_at
      or item.starts_at-item.gathering_at is distinct from anchor.starts_at-anchor.gathering_at))
    then skipped:=skipped+1; continue; end if;
    new_start:=((item.starts_at at time zone zone)+start_delta) at time zone zone;
    new_end:=((item.ends_at at time zone zone)+end_delta) at time zone zone;
    new_gathering:=case when target_gathering is null then null else new_start-(target_start-target_gathering) end;
    if new_start<=now() or new_end<=new_start or new_end-new_start>interval '7 days'
      or new_gathering>new_start or item.response_due_at>new_start or item.invitation_send_at>new_start
      or item.reminder_send_at>=new_start
      or exists(select 1 from unnest(coalesce(item.reminder_send_ats,'{}'::timestamptz[])) reminder where reminder>=new_start)
      or exists(select 1 from public.activity_reminder_schedules reminder
        where reminder.activity_id=item.id and reminder.materialized_at is null and reminder.send_at>=new_start)
    then raise exception 'Tidsändringen krockar med aktivitetens tider eller kallelseschema.' using errcode='23514'; end if;
    timing_changed := new_start<>item.starts_at or new_end<>item.ends_at;
    if timing_changed and exists(select 1 from public.activity_duties where activity_id=item.id and cancelled_at is null)
    then raise exception 'Ett tillfälle har uppgiftsschema. Anpassa dess tider separat först.' using errcode='23514'; end if;
    result:=result || jsonb_build_array(jsonb_build_object('id',item.id,'updatedAt',item.updated_at,
      'startsAt',new_start,'endsAt',new_end,'gatheringAt',new_gathering,'previousStart',item.starts_at));
  end loop;
  token:=md5(result::text || changes::text || skipped::text);
  if not preview_only then
    if expected_token is distinct from token then raise exception 'Serien har ändrats. Förhandsgranska igen.' using errcode='40001'; end if;
    update public.activities a set title=trim(changes->>'title'),location=coalesce(trim(changes->>'location'),''),
      description_markdown=coalesce(trim(changes->>'description'),''),
      starts_at=(r->>'startsAt')::timestamptz,ends_at=(r->>'endsAt')::timestamptz,
      gathering_at=(r->>'gatheringAt')::timestamptz
    from jsonb_array_elements(result) r where a.id=(r->>'id')::uuid;
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
    values(anchor.organization_id,auth.uid(),'activity.series.updated','activity_series',anchor.series_id::text,
      jsonb_build_object('fromActivityId',anchor.id,'count',jsonb_array_length(result),'skipped',skipped));
  end if;
  return jsonb_build_object('activities',result,'count',jsonb_array_length(result),'skipped',skipped,'token',token);
end; $$;
revoke all on function public.edit_activity_series_from(uuid,jsonb,boolean,text) from public,anon;
grant execute on function public.edit_activity_series_from(uuid,jsonb,boolean,text) to authenticated;
