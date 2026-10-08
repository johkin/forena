-- Signal state is independent of delivery checkpoints and notification preferences.
create table public.capability_signals (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 team_id uuid not null, activity_id uuid not null,
 discipline_key text not null, discipline_version text not null, capability_id text not null, type text not null,
 status text not null default 'active' check(status in ('active','resolved','dismissed')),
 severity text not null check(severity in ('info','warning')),
 title text not null, message text not null,
 facts jsonb not null check(jsonb_typeof(facts)='object'),
 actions jsonb not null check(jsonb_typeof(actions)='array'),
 episode integer not null default 1, revision integer not null default 1,
 detected_at timestamptz not null default now(), evaluated_at timestamptz not null default now(),
 resolved_at timestamptz, dismissed_at timestamptz, dismissed_by uuid references auth.users(id) on delete set null,
 unique(activity_id,discipline_key,capability_id,type), unique(id,organization_id),
 foreign key(activity_id,team_id,organization_id) references public.activities(id,team_id,organization_id) on delete cascade
);
create index capability_signals_team_status_idx on public.capability_signals(team_id,status,detected_at);
create table public.signal_actions (
 id uuid primary key default gen_random_uuid(), signal_id uuid not null, organization_id uuid not null,
 episode integer not null, action_id text not null, actor_user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), result jsonb not null default '{}', source_key text,
 foreign key(signal_id,organization_id) references public.capability_signals(id,organization_id) on delete cascade,
 unique(signal_id,source_key)
);
create index signal_actions_history_idx on public.signal_actions(signal_id,created_at desc);
alter table public.capability_signals enable row level security;
alter table public.signal_actions enable row level security;
revoke all on public.capability_signals,public.signal_actions from public,anon,authenticated;
grant select on public.capability_signals,public.signal_actions to authenticated;
grant all on public.capability_signals,public.signal_actions to service_role;
create policy "Invitation managers read signals" on public.capability_signals for select to authenticated
 using (public.has_team_permission(team_id,'invitation.manage'));
create policy "Invitation managers read signal actions" on public.signal_actions for select to authenticated
 using (exists(select 1 from public.capability_signals s where s.id=signal_id and s.organization_id=signal_actions.organization_id));

-- One durable, revisioned evaluation slot per activity; input changes invalidate claims.
create table private.signal_evaluation_queue (
 activity_id uuid primary key references public.activities(id) on delete cascade,
 revision bigint not null default 1, next_evaluation_at timestamptz not null default now()
);
alter table private.signal_evaluation_queue enable row level security;
revoke all on private.signal_evaluation_queue from public,anon,authenticated;
create index signal_evaluation_due_idx on private.signal_evaluation_queue(next_evaluation_at,activity_id);
create function private.dirty_activity_signals(target uuid) returns void language sql security definer set search_path='' as $$
 insert into private.signal_evaluation_queue(activity_id) select id from public.activities where id=target
 on conflict(activity_id) do update set revision=signal_evaluation_queue.revision+1,next_evaluation_at=now();
$$;
revoke all on function private.dirty_activity_signals(uuid) from public,anon,authenticated;
create function private.dirty_signal_inputs() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if tg_table_name='activities' then
  if tg_op='UPDATE' and (to_jsonb(new)-array['updated_at','invitation_materialized_at','invitation_notifications_queued_at'])
   is not distinct from (to_jsonb(old)-array['updated_at','invitation_materialized_at','invitation_notifications_queued_at']) then return null; end if;
  target:=new.id;
 else
  target:=case when tg_op='DELETE' then old.activity_id else new.activity_id end;
  if tg_op='UPDATE' and old.activity_id is distinct from new.activity_id then perform private.dirty_activity_signals(old.activity_id); end if;
 end if;
 if target is not null then perform private.dirty_activity_signals(target); end if;
 return null;
end $$;
revoke all on function private.dirty_signal_inputs() from public,anon,authenticated;
create trigger dirty_activity_signals after insert or update on public.activities for each row execute function private.dirty_signal_inputs();
create trigger dirty_invitation_signals after insert or update or delete on public.invitations for each row execute function private.dirty_signal_inputs();
create trigger dirty_value_signals after insert or update or delete on private.discipline_values for each row execute function private.dirty_signal_inputs();
create function private.dirty_team_signals() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='sections' then
  if old.discipline_id is not distinct from new.discipline_id then return null; end if;
  perform private.dirty_activity_signals(a.id) from public.activities a join public.teams t on t.id=a.team_id
   where t.section_id=new.id and (a.starts_at>now() or exists(select 1 from public.capability_signals s where s.activity_id=a.id and s.status<>'resolved'));
 elsif tg_table_name='teams' then
  if old.section_id is not distinct from new.section_id then return null; end if;
  perform private.dirty_activity_signals(a.id) from public.activities a where a.team_id=new.id and a.starts_at>now();
 else
  perform private.dirty_activity_signals(a.id) from public.activities a where a.team_id=case when tg_op='DELETE' then old.team_id else new.team_id end and a.starts_at>now();
  if tg_op='UPDATE' and old.team_id is distinct from new.team_id then
   perform private.dirty_activity_signals(a.id) from public.activities a where a.team_id=old.team_id and a.starts_at>now();
  end if;
 end if;
 return null;
end $$;
revoke all on function private.dirty_team_signals() from public,anon,authenticated;
create trigger dirty_section_signals after update on public.sections for each row execute function private.dirty_team_signals();
create trigger dirty_team_signals after update on public.teams for each row execute function private.dirty_team_signals();
create trigger dirty_membership_signals after insert or update or delete on public.memberships for each row execute function private.dirty_team_signals();
insert into private.signal_evaluation_queue(activity_id) select id from public.activities where team_id is not null and starts_at>now();

-- Authorized data adapter supplies facts, regardless of notification enablement/checkpoints.
create function private.signal_contexts_for_activity(target uuid) returns jsonb
language sql security definer set search_path='' as $$
select coalesce(ctx.items,'[]') from public.activities a
left join public.teams t on t.id=a.team_id and t.organization_id=a.organization_id
left join public.sections s on s.id=t.section_id and s.organization_id=t.organization_id
left join public.disciplines d on d.id=s.discipline_id
join public.activity_types at on at.id=a.activity_type_id
join public.organizations o on o.id=a.organization_id
left join lateral (
 select jsonb_agg(jsonb_build_object(
  'activityId',a.id,'activityGeneration',a.discipline_generation,'teamId',a.team_id,'organizationId',a.organization_id,
  'disciplineKey',d.key,'disciplineVersion',p.version,'currentDisciplineKey',d.key,
  'definition',c,'values',coalesce(v.values,'{}'),'evaluatedAt',now(),
  'title',a.title,'startsAt',a.starts_at,'responseDueAt',a.response_due_at,'status',a.status,'sourceKind',a.source_kind,
  'activityTypeSlug',at.slug,'category',at.system_category,
  'acceptedPlayers',stats.accepted,'pendingPlayers',stats.pending,'invitedPlayers',stats.invited,
  'completedCheckpoints','[]'::jsonb,'lastReminderAt',(
   select max(e.created_at) from public.activity_events e where e.activity_id=a.id
    and (e.event_type='reminder_sent' or (e.event_type='reminder_scheduled' and e.metadata ? 'queuedAt'))
    and e.recipient_count>0
  )) order by c->>'id') as items
 from private.discipline_packages p
 left join private.discipline_values v on v.activity_id=a.id and v.scope='activity' and v.discipline_id=d.id and v.version=p.version
 cross join lateral jsonb_array_elements(coalesce(p.manifest->'capabilities','[]')) c
 cross join lateral (
  select count(*) filter(where i.response='accepted')::integer accepted,
   count(*) filter(where i.response='pending')::integer pending,count(*)::integer invited
  from public.invitations i join public.people person on person.id=i.person_id and person.organization_id=a.organization_id
  where i.activity_id=a.id and i.organization_id=a.organization_id
   and (i.activity_role='participant' or (i.activity_role is null and exists(
    select 1 from public.memberships m where m.team_id=a.team_id and m.organization_id=a.organization_id
     and m.person_id=i.person_id and m.role='participant'
     and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
     and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date))))
 ) stats
 where c#>'{appliesTo,activityTypeSlugs}' ? at.slug and c#>'{appliesTo,categories}' ? at.system_category
  and p.discipline_key=d.key and p.version=coalesce((select dv.version from private.discipline_values dv
  where dv.activity_id=a.id and dv.scope='activity' and dv.discipline_id=d.id),
  (select ap.version from private.discipline_packages ap where ap.discipline_key=d.key and ap.active))
) ctx on true where a.id=target;
$$;
revoke all on function private.signal_contexts_for_activity(uuid) from public,anon,authenticated;

create function public.claim_signal_contexts(batch_size integer default 100) returns jsonb
language sql security definer set search_path='' as $$
with due as (
 select q.activity_id from private.signal_evaluation_queue q where q.next_evaluation_at<=now()
  and not exists(select 1 from private.discipline_activity_events e where e.activity_id=q.activity_id and e.status<>'processed')
 order by q.next_evaluation_at,q.activity_id limit greatest(1,least(batch_size,100)) for update of q skip locked
), claimed as (
 update private.signal_evaluation_queue q set next_evaluation_at=now()+interval '1 minute',revision=q.revision+1
 from due where q.activity_id=due.activity_id returning q.*
)
select coalesce(jsonb_agg(jsonb_build_object('activityId',q.activity_id,'revision',q.revision,'contexts',private.signal_contexts_for_activity(a.id)) order by q.activity_id),'[]')
from claimed q join public.activities a on a.id=q.activity_id

$$;
revoke all on function public.claim_signal_contexts(integer) from public,anon,authenticated;
grant execute on function public.claim_signal_contexts(integer) to service_role;

create function public.apply_signal_evaluations(evaluations jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare evaluation jsonb; signal jsonb; q private.signal_evaluation_queue%rowtype;
 a public.activities%rowtype; applied integer:=0; current_key text; spec jsonb;
begin
 if jsonb_typeof(evaluations) is distinct from 'array' or jsonb_array_length(evaluations)>100 or octet_length(evaluations::text)>2097152 then
  raise exception 'Invalid signal evaluation' using errcode='22023'; end if;
 for evaluation in select value from jsonb_array_elements(evaluations) loop
  if jsonb_typeof(evaluation->'signals') is distinct from 'array' or jsonb_array_length(evaluation->'signals')>20 then
   raise exception 'Invalid signals' using errcode='22023'; end if;
  -- Input writers take the activity lock before dirtying its slot. Use the same order.
  select * into a from public.activities where id=(evaluation->>'activityId')::uuid for update;
  if not found then continue; end if;
  select * into q from private.signal_evaluation_queue where activity_id=a.id for update;
  if not found or q.revision is distinct from (evaluation->>'revision')::bigint then continue; end if;
  if exists(select 1 from private.discipline_activity_events e where e.activity_id=a.id and e.status<>'processed') then continue; end if;
  select d.key into current_key from public.teams t join public.sections sec on sec.id=t.section_id and sec.organization_id=t.organization_id
   join public.disciplines d on d.id=sec.discipline_id where t.id=a.team_id and t.organization_id=a.organization_id;
  for signal in select value from jsonb_array_elements(evaluation->'signals') loop
   select manifest into spec from private.discipline_packages p where p.discipline_key=signal->>'disciplineKey' and p.version=signal->>'disciplineVersion';
   if signal->>'disciplineKey' is distinct from current_key or spec is null
    or not exists(select 1 from jsonb_array_elements(spec->'capabilities') c where c->>'id'=signal->>'capabilityId')
    or coalesce(signal->>'severity','') not in ('info','warning') or coalesce(length(signal->>'type'),0) not between 1 and 100
    or coalesce(length(signal->>'title'),0) not between 1 and 300 or coalesce(length(signal->>'text'),0) not between 1 and 2000
    or jsonb_typeof(signal->'facts') is distinct from 'object' or jsonb_typeof(signal->'actions') is distinct from 'array'
    or jsonb_array_length(signal->'actions')>5 or octet_length(signal::text)>16384
    or exists(select 1 from jsonb_array_elements(signal->'actions') action where coalesce(action->>'id','') not in ('remind-unanswered','invite-more-players')
     or coalesce(length(action->>'label'),0) not between 1 and 100) then
    raise exception 'Invalid signal proposal' using errcode='22023'; end if;
   insert into public.capability_signals(organization_id,team_id,activity_id,discipline_key,discipline_version,capability_id,type,severity,title,message,facts,actions)
    values(a.organization_id,a.team_id,a.id,signal->>'disciplineKey',signal->>'disciplineVersion',signal->>'capabilityId',signal->>'type',
     signal->>'severity',signal->>'title',signal->>'text',signal->'facts',signal->'actions')
   on conflict(activity_id,discipline_key,capability_id,type) do update set
    status=case when capability_signals.status='resolved' then 'active' else capability_signals.status end,
    severity=excluded.severity,title=excluded.title,message=excluded.message,facts=excluded.facts,actions=excluded.actions,
    discipline_version=excluded.discipline_version,evaluated_at=now(),
    revision=capability_signals.revision+case when (capability_signals.status='resolved' or
     (capability_signals.severity,capability_signals.title,capability_signals.message,capability_signals.facts,capability_signals.actions)
      is distinct from (excluded.severity,excluded.title,excluded.message,excluded.facts,excluded.actions)) then 1 else 0 end,
    episode=capability_signals.episode+case when capability_signals.status='resolved' then 1 else 0 end,
    detected_at=case when capability_signals.status='resolved' then now() else capability_signals.detected_at end,
    resolved_at=null,dismissed_at=case when capability_signals.status='resolved' then null else capability_signals.dismissed_at end,
    dismissed_by=case when capability_signals.status='resolved' then null else capability_signals.dismissed_by end;
  end loop;
  update public.capability_signals s set status='resolved',resolved_at=now(),evaluated_at=now(),revision=s.revision+1
   where s.activity_id=a.id and s.status<>'resolved' and not exists(
    select 1 from jsonb_array_elements(evaluation->'signals') item where item->>'disciplineKey'=s.discipline_key
     and item->>'capabilityId'=s.capability_id and item->>'type'=s.type);
  -- Keep future work for deadline/severity/cooldown changes, even with no active problem.
  if a.starts_at<=now() or evaluation->>'keepEvaluating'='false' then delete from private.signal_evaluation_queue where activity_id=a.id;
  else update private.signal_evaluation_queue set next_evaluation_at=least(a.starts_at,now()+interval '1 minute') where activity_id=a.id; end if;
  applied:=applied+1;
 end loop;
 return applied;
end $$;
revoke all on function public.apply_signal_evaluations(jsonb) from public,anon,authenticated;
grant execute on function public.apply_signal_evaluations(jsonb) to service_role;

-- Dismissal applies to this episode for the whole team; a solved/recurrent problem reopens.
create function public.dismiss_capability_signal(target_signal_id uuid,expected_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare s public.capability_signals%rowtype;
begin
 select * into s from public.capability_signals where id=target_signal_id for update;
 if not found or auth.uid() is null or not coalesce(private.has_team_permission(s.team_id,'invitation.manage',auth.uid()),false) then
  raise exception 'Permission denied' using errcode='42501'; end if;
 if s.revision is distinct from expected_revision or s.status<>'active' then
  raise exception 'Signal changed; reload' using errcode='40001'; end if;
 update public.capability_signals set status='dismissed',dismissed_at=now(),dismissed_by=auth.uid(),revision=revision+1 where id=s.id;
 insert into public.signal_actions(signal_id,organization_id,episode,action_id,actor_user_id,result)
  values(s.id,s.organization_id,s.episode,'dismiss',auth.uid(),'{"status":"dismissed"}');
end $$;
revoke all on function public.dismiss_capability_signal(uuid,integer) from public,anon,authenticated;
grant execute on function public.dismiss_capability_signal(uuid,integer) to authenticated;

-- The existing reminder command records a decision in the same transaction.
create function private.record_signal_reminder() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.recipient_count>0 and (new.event_type='reminder_sent' or (new.event_type='reminder_scheduled' and new.metadata ? 'queuedAt')) then
  insert into public.signal_actions(signal_id,organization_id,episode,action_id,actor_user_id,result,source_key)
   select s.id,s.organization_id,s.episode,'remind-unanswered',new.created_by,
    jsonb_build_object('status','queued','recipientCount',new.recipient_count),'event:'||new.id::text
   from public.capability_signals s where s.activity_id=new.activity_id and s.organization_id=new.organization_id and s.status<>'resolved'
    and s.actions @> '[{"id":"remind-unanswered"}]' on conflict do nothing;
  perform private.dirty_activity_signals(new.activity_id);
 end if;
 return null;
end $$;
revoke all on function private.record_signal_reminder() from public,anon,authenticated;
create trigger record_signal_reminder after insert on public.activity_events for each row execute function private.record_signal_reminder();
-- Statement-level history groups a participant command into one action per signal.
create function private.record_signal_invitations() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.signal_actions(signal_id,organization_id,episode,action_id,actor_user_id,result)
  select s.id,s.organization_id,s.episode,'invite-more-players',auth.uid(),jsonb_build_object('status','created','invitationCount',added.total)
  from (select activity_id,organization_id,count(*) total from added_invitations where activity_role='participant' group by activity_id,organization_id) added
  join public.capability_signals s on s.activity_id=added.activity_id and s.organization_id=added.organization_id
  where s.status<>'resolved' and s.actions @> '[{"id":"invite-more-players"}]';
 return null;
end $$;
revoke all on function private.record_signal_invitations() from public,anon,authenticated;
create trigger record_signal_invitations after insert on public.invitations referencing new table as added_invitations for each statement execute function private.record_signal_invitations();

-- Read through a checked command; no cross-team facts are returned to families.
create function public.read_team_signals(target_team_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce(private.has_team_permission(target_team_id,'invitation.manage',auth.uid()),false) then
  raise exception 'Permission denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(item order by severity desc,starts_at,id),'[]') into result from (
  select s.id,s.severity,a.starts_at,jsonb_build_object('id',s.id,'activityId',s.activity_id,'revision',s.revision,
   'severity',s.severity,'title',s.title,'text',s.message,'actions',s.actions,
   'capabilityId',s.capability_id,'type',s.type,'facts',s.facts,'evaluatedAt',s.evaluated_at,
   'lastAction',(select jsonb_build_object('id',h.action_id,'createdAt',h.created_at,'result',h.result) from public.signal_actions h
    where h.signal_id=s.id and h.episode=s.episode order by h.created_at desc,h.id desc limit 1)) item
  from public.capability_signals s join public.activities a on a.id=s.activity_id
  join public.teams t on t.id=s.team_id join public.sections sec on sec.id=t.section_id
  join public.disciplines d on d.id=sec.discipline_id and d.key=s.discipline_key
  where s.team_id=target_team_id and s.status='active' and a.status='published' and a.starts_at>now() and a.source_kind<>'imported'
  order by s.severity desc,a.starts_at,s.id limit 200
 ) visible;
 return result;
end $$;
revoke all on function public.read_team_signals(uuid) from public,anon,authenticated;
grant execute on function public.read_team_signals(uuid) to authenticated;

-- Preserve transport behavior; suppress only notifications for a dismissed episode.
alter function private.queue_evaluated_capability_notifications(jsonb) rename to queue_evaluated_capability_notifications_transport;
create function private.queue_evaluated_capability_notifications(evaluation jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare filtered jsonb;
begin
 if evaluation->>'error' is not null or jsonb_typeof(evaluation->'proposals') is distinct from 'array' then
  return private.queue_evaluated_capability_notifications_transport(evaluation); end if;
 if jsonb_array_length(evaluation->'proposals')>500 or octet_length(evaluation::text)>2097152 then
  raise exception 'Invalid capability evaluation' using errcode='22023'; end if;
 select coalesce(jsonb_agg(proposal),'[]') into filtered from jsonb_array_elements(evaluation->'proposals') proposal
 where not exists(select 1 from public.capability_signals s where s.activity_id::text=proposal->>'activityId'
  and s.discipline_key=proposal->>'disciplineKey' and s.capability_id=proposal->>'capabilityId'
  and s.type=proposal->>'type' and s.status='dismissed');
 return private.queue_evaluated_capability_notifications_transport(jsonb_set(evaluation,'{proposals}',filtered));
end $$;
revoke all on function private.queue_evaluated_capability_notifications(jsonb) from public,anon,authenticated;

-- User actions load fresh facts through the same data adapter, then commit with a revision guard.
create function public.capability_signal_action_context(target_signal_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.capability_signals%rowtype; q private.signal_evaluation_queue%rowtype;
begin
 select * into s from public.capability_signals where id=target_signal_id;
 if not found or auth.uid() is null or not coalesce(private.has_team_permission(s.team_id,'invitation.manage',auth.uid()),false) then
  raise exception 'Permission denied' using errcode='42501'; end if;
 select * into q from private.signal_evaluation_queue where activity_id=s.activity_id;
 if not found or s.status<>'active' or exists(select 1 from private.discipline_activity_events e where e.activity_id=s.activity_id and e.status<>'processed') then
  raise exception 'Signal changed; reload' using errcode='40001'; end if;
 return jsonb_build_object('activityId',s.activity_id,'revision',q.revision,'signalRevision',s.revision,
  'disciplineKey',s.discipline_key,'capabilityId',s.capability_id,'type',s.type,
  'contexts',private.signal_contexts_for_activity(s.activity_id));
end $$;
revoke all on function public.capability_signal_action_context(uuid) from public,anon,authenticated;
grant execute on function public.capability_signal_action_context(uuid) to authenticated;

create function public.remind_capability_signal(target_signal_id uuid,expected_signal_revision integer,expected_input_revision bigint) returns integer
language plpgsql security definer set search_path='' as $$
declare s public.capability_signals%rowtype; a public.activities%rowtype; q private.signal_evaluation_queue%rowtype;
begin
 -- Obtain the same activity -> input -> signal lock order as evaluation.
 select activity_id into a.id from public.capability_signals where id=target_signal_id;
 if a.id is not null then select * into a from public.activities where id=a.id for update; end if;
 if a.id is null or auth.uid() is null or not coalesce(private.has_team_permission(a.team_id,'invitation.manage',auth.uid()),false) then
  raise exception 'Permission denied' using errcode='42501'; end if;
 select * into q from private.signal_evaluation_queue where activity_id=a.id for update;
 select * into s from public.capability_signals where id=target_signal_id for update;
 if q.revision is distinct from expected_input_revision or s.revision is distinct from expected_signal_revision
  or s.status<>'active' or not s.actions @> '[{"id":"remind-unanswered"}]'
  or a.starts_at<=now() or a.status<>'published' or a.source_kind='imported'
  or a.response_due_at<=now()
  or not exists(select 1 from public.invitations i where i.activity_id=a.id and i.response='pending')
  or exists(select 1 from public.activity_events e where e.activity_id=a.id and e.created_at>now()-interval '1 hour'
   and e.recipient_count>0 and (e.event_type='reminder_sent' or (e.event_type='reminder_scheduled' and e.metadata ? 'queuedAt')))
  or exists(select 1 from private.discipline_activity_events e where e.activity_id=a.id and e.status<>'processed') then
  raise exception 'Signal changed; reload' using errcode='40001'; end if;
 return public.queue_activity_reminder(a.id);
end $$;
revoke all on function public.remind_capability_signal(uuid,integer,bigint) from public,anon,authenticated;
grant execute on function public.remind_capability_signal(uuid,integer,bigint) to authenticated;
