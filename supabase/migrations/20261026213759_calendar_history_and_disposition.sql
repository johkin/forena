-- Preserve every activity after invitation dispatch, including unanswered invitations.
create function private.calendar_invitations_sent(target public.activities) returns boolean
language sql stable security definer set search_path='' as $$
 select target.invitation_materialized_at is not null
   or target.invitation_notifications_queued_at is not null
   or (coalesce(target.invitation_send_at, '-infinity'::timestamptz) <= now()
       and exists(select 1 from public.invitations i where i.activity_id=target.id));
$$;
revoke all on function private.calendar_invitations_sent(public.activities) from public,anon,authenticated;

create function public.activity_deletion_options(target_activity_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a public.activities%rowtype;
begin
 select * into a from public.activities where id=target_activity_id;
 if a.id is null then raise exception 'Activity not found' using errcode='P0002'; end if;
 if auth.uid() is null or not private.has_team_permission(a.team_id,'activity.manage',auth.uid()) then
   raise exception 'Not allowed' using errcode='42501';
 end if;
 return a.source_kind<>'imported' and not private.calendar_invitations_sent(a);
end;
$$;
revoke all on function public.activity_deletion_options(uuid) from public,anon;
grant execute on function public.activity_deletion_options(uuid) to authenticated;

create function public.set_activity_disposition(target_activity_id uuid, target_action text, target_cancellation_reason text default null)
returns text language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype;
begin
 select * into a from public.activities where id=target_activity_id for update;
 if a.id is null or a.team_id is null then raise exception 'Activity not found' using errcode='P0002'; end if;
 if auth.uid() is null or not private.has_team_permission(a.team_id,'activity.manage',auth.uid()) then
   raise exception 'Not allowed' using errcode='42501';
 end if;
 if a.source_kind='imported' then raise exception 'Imported activity' using errcode='55000'; end if;
 if target_action not in ('delete','cancel','auto') or target_action is null then
   raise exception 'Invalid action' using errcode='22023';
 end if;
 if target_action='delete' and private.calendar_invitations_sent(a) then
   raise exception 'Invitations already sent' using errcode='55000';
 end if;
 if target_action='delete' or (target_action='auto' and not private.calendar_invitations_sent(a)) then
   delete from public.activities where id=a.id;
   return 'deleted';
 end if;
 update public.activities set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),
   cancellation_reason=coalesce(nullif(trim(target_cancellation_reason),''),'Inställd av ledare') where id=a.id;
 return 'cancelled';
end;
$$;
revoke all on function public.set_activity_disposition(uuid,text,text) from public,anon;
grant execute on function public.set_activity_disposition(uuid,text,text) to authenticated;

-- Existing series and assistant callers keep their API and receive the stricter rule.
create or replace function public.delete_or_cancel_activity(target_activity_id uuid,target_cancellation_reason text default null)
returns text language sql security invoker set search_path='' as $$
 select public.set_activity_disposition(target_activity_id,'auto',target_cancellation_reason);
$$;

-- Only an audience classification is exposed, never other families' invitation rows.
create function public.calendar_activity_audiences(target_activity_ids uuid[])
returns table(activity_id uuid, leaders_only boolean)
language sql stable security definer set search_path='' as $$
 select a.id, coalesce(
   a.invitation_audience_kind='leaders'
   or (a.invitation_audience_kind='selection' and a.invitation_audience_roles=array['leader']::text[]
       and cardinality(a.invitation_audience_group_ids)=0 and cardinality(a.invitation_audience_responsibility_type_ids)=0)
   or (exists(select 1 from public.invitations i where i.activity_id=a.id)
       and not exists(select 1 from public.invitations i where i.activity_id=a.id
           and not exists(select 1 from public.memberships m where m.person_id=i.person_id and m.team_id=a.team_id
               and m.role='leader' and m.starts_on <= (a.starts_at at time zone o.time_zone)::date
               and (m.ends_on is null or m.ends_on >= (a.starts_at at time zone o.time_zone)::date))))
 ,false)
 from public.activities a join public.organizations o on o.id=a.organization_id
 where auth.uid() is not null and a.id=any(target_activity_ids)
   and public.is_organization_member(a.organization_id);
$$;
revoke all on function public.calendar_activity_audiences(uuid[]) from public,anon;
grant execute on function public.calendar_activity_audiences(uuid[]) to authenticated;
