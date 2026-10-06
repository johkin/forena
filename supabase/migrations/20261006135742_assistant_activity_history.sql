-- Read-only history APIs. Names and facts are scoped to teams the caller manages.
create function public.activity_history_teams(target_organization_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,
 'canReadAttendance',public.has_team_permission(t.id,'attendance.manage'),
 'canReadWork',public.has_team_permission(t.id,'invitation.manage')) order by t.name),'[]'::jsonb)
 from public.teams t where auth.uid() is not null and t.organization_id=target_organization_id
 and (public.has_team_permission(t.id,'attendance.manage') or public.has_team_permission(t.id,'invitation.manage'));
$$;
revoke all on function public.activity_history_teams(uuid) from public,anon;
grant execute on function public.activity_history_teams(uuid) to authenticated;

create function public.read_activity_history(target_team_id uuid, from_date date, through_date date,
 category text, guests_only boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teams; zone text; can_attend boolean; can_invite boolean; result jsonb;
begin
 select * into t from public.teams where id=target_team_id;
 can_attend:=coalesce(public.has_team_permission(target_team_id,'attendance.manage'),false);
 can_invite:=coalesce(public.has_team_permission(target_team_id,'invitation.manage'),false);
 if auth.uid() is null or t.id is null or not (case when category='work' then can_invite else can_attend end)
 then raise exception 'Not allowed' using errcode='42501'; end if;
 if category is null or category not in ('session','competition','work') or from_date is null or through_date is null
 or through_date<from_date or through_date-from_date>365 then raise exception 'Choose at most 366 days' using errcode='23514'; end if;
 select time_zone into zone from public.organizations where id=t.organization_id;
 with activities as (
   select a.id,a.title,a.starts_at,(a.starts_at at time zone zone)::date as day,r.id as report_id
   from public.activities a join public.activity_types at on at.id=a.activity_type_id
   left join public.activity_attendance_reports r on r.activity_id=a.id
   where a.team_id=t.id and a.organization_id=t.organization_id and a.status<>'cancelled'
     and at.system_category=category and a.starts_at<now()
     and a.starts_at >= (from_date::timestamp at time zone zone)
     and a.starts_at < ((through_date+1)::timestamp at time zone zone)
 ), identities as (
   select a.id as activity_id,ar.person_id from activities a join public.activity_attendance_records ar on ar.report_id=a.report_id where can_attend
   union
   select i.activity_id,i.person_id from activities a join public.invitations i on i.activity_id=a.id where can_invite
   union
   select s.activity_id,s.person_id from activities a join public.activity_duty_slots s on s.activity_id=a.id
   join public.activity_duties d on d.id=s.duty_id
   where category='work' and s.person_id is not null and s.retired_at is null and d.cancelled_at is null
 ), facts as (
   select a.*,p.id as person_id,p.display_name,
   exists(select 1 from public.memberships m where m.person_id=p.id and m.team_id=t.id and m.role='participant'
    and m.starts_on<=a.day and (m.ends_on is null or m.ends_on>=a.day)) as home_member,
   coalesce((select jsonb_agg(distinct other.name) from public.memberships m join public.teams other on other.id=m.team_id
    where m.person_id=p.id and m.organization_id=t.organization_id and other.organization_id=t.organization_id
    and m.team_id<>t.id and m.role='participant' and m.starts_on<=a.day and (m.ends_on is null or m.ends_on>=a.day)), '[]'::jsonb) as other_teams,
   case when not can_attend then null when a.report_id is null then 'unreported'
    when exists(select 1 from public.activity_attendance_records ar where ar.report_id=a.report_id and ar.person_id=p.id) then 'present'
    else 'not_recorded' end as attendance,
   case when can_invite then (select i.response from public.invitations i where i.activity_id=a.id and i.person_id=p.id) end as response,
   case when category='work' then coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'completed',s.completed_at is not null))
    from public.activity_duty_slots s join public.activity_duties d on d.id=s.duty_id
    where s.activity_id=a.id and s.person_id=p.id and s.retired_at is null and d.cancelled_at is null),'[]'::jsonb) else '[]'::jsonb end as duties,
   case when category='work' then exists(select 1 from public.invitations i where i.activity_id=a.id and i.person_id=p.id and i.duty_completed_at is not null) else false end as legacy_work_completed
   from identities x join activities a on a.id=x.activity_id join public.people p on p.id=x.person_id and p.organization_id=t.organization_id
 ), filtered as (
   select * from facts where not guests_only or (not home_member and jsonb_array_length(other_teams)>0)
 ), limited as (select * from filtered order by starts_at desc,id,person_id limit 200)
 select jsonb_build_object('team',t.name,'from',from_date,'through',through_date,'category',category,'timeZone',zone,
   'activityCount',(select count(*) from activities),
   'unreportedActivityCount',case when can_attend then (select count(*) from activities where report_id is null) end,
   'totalRecords',(select count(*) from filtered),'truncated',(select count(*)>200 from filtered),
   'records',coalesce((select jsonb_agg(jsonb_build_object('personId',person_id,'name',display_name,'activityId',id,'activity',title,'startsAt',starts_at,
     'otherTeamsAtActivity',other_teams,'memberOfTargetTeamAtActivity',home_member,'attendance',attendance,'invitationResponse',response,
     'duties',duties,'legacyWorkCompleted',legacy_work_completed) order by starts_at desc,id,person_id) from limited),'[]'::jsonb)) into result;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details)
 values(t.organization_id,auth.uid(),'activity.history.read','team',t.id::text,
 jsonb_build_object('from',from_date,'through',through_date,'category',category,'guestsOnly',guests_only,'returned',jsonb_array_length(result->'records')));
 return result;
end; $$;
revoke all on function public.read_activity_history(uuid,date,date,text,boolean) from public,anon;
grant execute on function public.read_activity_history(uuid,date,date,text,boolean) to authenticated;
