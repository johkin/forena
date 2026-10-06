-- Preview and atomically remove the same protected occurrence set as series editing.
create function public.delete_activity_series_from(target_activity_id uuid,
  preview_only boolean default true, expected_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  anchor public.activities; item public.activities; zone text; result jsonb := '[]';
  skipped integer := 0; token text; entry jsonb; disposition text;
  deleted_count integer := 0; cancelled_count integer := 0;
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
  select time_zone into zone from public.organizations where id=anchor.organization_id;
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
    result:=result || jsonb_build_array(jsonb_build_object('id',item.id,
      'updatedAt',item.updated_at,'startsAt',item.starts_at,'endsAt',item.ends_at));
  end loop;
  token:=md5('delete:' || target_activity_id::text || result::text || skipped::text);
  if not preview_only then
    if expected_token is distinct from token then
      raise exception 'Serien har ändrats. Förhandsgranska igen.' using errcode='40001';
    end if;
    for entry in select value from jsonb_array_elements(result) loop
      -- Keep the established rules: answered published activities are cancelled.
      disposition:=public.delete_or_cancel_activity((entry->>'id')::uuid,'Inställd av ledare');
      if disposition='deleted' then deleted_count:=deleted_count+1;
      else cancelled_count:=cancelled_count+1; end if;
    end loop;
    insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
    values(anchor.organization_id,auth.uid(),'activity.series.removed','activity_series',anchor.series_id::text,
      jsonb_build_object('fromActivityId',anchor.id,'activities',result,'deleted',deleted_count,
        'cancelled',cancelled_count,'skipped',skipped));
  end if;
  return jsonb_build_object('activities',result,'count',jsonb_array_length(result),'skipped',skipped,
    'token',token,'deleted',deleted_count,'cancelled',cancelled_count);
end; $$;
revoke all on function public.delete_activity_series_from(uuid,boolean,text) from public,anon;
grant execute on function public.delete_activity_series_from(uuid,boolean,text) to authenticated;
