update public.invitations
set response = 'pending', responded_at = null
where response = 'maybe';

alter table public.invitations
  add column response_comment text;

alter table public.invitations
  add constraint invitations_response_comment_length
    check (response_comment is null or length(response_comment) <= 500);

alter table public.invitations
  add constraint invitations_pending_has_no_comment
    check (response <> 'pending' or response_comment is null);

alter table public.invitations
  drop constraint invitations_response_check;

alter table public.invitations
  add constraint invitations_response_check
    check (response in ('pending', 'accepted', 'declined'));

create or replace function public.log_invitation_response_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.response is distinct from new.response
     or old.response_comment is distinct from new.response_comment then
    insert into public.activity_events (
      organization_id,
      activity_id,
      invitation_id,
      event_type,
      metadata,
      created_by
    )
    values (
      new.organization_id,
      new.activity_id,
      new.id,
      'invitation_response_changed',
      jsonb_build_object(
        'from', old.response,
        'to', new.response,
        'comment', new.response_comment
      ),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invitations_log_response_event on public.invitations;

create trigger invitations_log_response_event
after update of response, response_comment on public.invitations
for each row
execute function public.log_invitation_response_event();

create or replace function public.get_team_briefing_context(target_team_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'teamId', team.id,
    'organizationId', team.organization_id,
    'activity', (
      select jsonb_build_object(
        'id', activity.id,
        'title', activity.title,
        'dueAt', coalesce(activity.gathering_at, activity.starts_at),
        'pendingInvitations', (
          select count(*) from public.invitations invitation
          where invitation.activity_id = activity.id and invitation.response = 'pending'
        ),
        'acceptedInvitations', (
          select count(*) from public.invitations invitation
          where invitation.activity_id = activity.id and invitation.response = 'accepted'
        ),
        'declinedInvitations', (
          select count(*) from public.invitations invitation
          where invitation.activity_id = activity.id and invitation.response = 'declined'
        ),
        'responseComments', coalesce((
          select jsonb_agg(invitation.response_comment order by invitation.responded_at nulls last)
          from public.invitations invitation
          where invitation.activity_id = activity.id
            and nullif(btrim(invitation.response_comment), '') is not null
        ), '[]'::jsonb)
      )
      from public.activities activity
      where activity.team_id = team.id and activity.ends_at >= now()
      order by activity.starts_at limit 1
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', task.id, 'title', task.title, 'dueAt', task.due_at) order by task.due_at)
      from (select id, title, due_at from public.team_tasks where team_id = team.id and status = 'open' order by due_at limit 8) task
    ), '[]'::jsonb),
    'instructions', coalesce((
      select jsonb_agg(instruction.payload order by instruction.due_at)
      from (
        select jsonb_build_object(
          'id', activity.id,
          'title', activity.title,
          'dueAt', activity.starts_at,
          'documentTitle', document.title,
          'summary', document.summary
        ) as payload, activity.starts_at as due_at
        from public.activities activity
        join public.activity_type_documents link on link.activity_type_id = activity.activity_type_id
        join public.contextual_documents document on document.id = link.document_id
        where activity.team_id = team.id
          and activity.ends_at >= now()
          and now() >= activity.starts_at - link.visible_from_offset
          and now() <= activity.ends_at + link.visible_until_offset
        order by activity.starts_at
        limit 4
      ) instruction
    ), '[]'::jsonb)
  )
  from public.teams team
  where team.id = target_team_id and public.can_manage_team(team.id);
$$;
