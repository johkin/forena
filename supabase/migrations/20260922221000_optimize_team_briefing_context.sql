create or replace function public.get_team_briefing_context(target_team_id uuid)
returns jsonb
language sql
stable
security invoker
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
          select count(*)
          from public.invitations invitation
          where invitation.activity_id = activity.id
            and invitation.response = 'pending'
        )
      )
      from public.activities activity
      where activity.team_id = team.id
        and activity.ends_at >= now()
      order by activity.starts_at
      limit 1
    ),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', task.id,
          'title', task.title,
          'dueAt', task.due_at
        )
        order by task.due_at
      )
      from (
        select id, title, due_at
        from public.team_tasks
        where team_id = team.id
          and status = 'open'
        order by due_at
        limit 8
      ) task
    ), '[]'::jsonb)
  )
  from public.teams team
  where team.id = target_team_id
    and public.can_manage_team(team.id);
$$;

revoke all on function public.get_team_briefing_context(uuid) from public;
revoke all on function public.get_team_briefing_context(uuid) from anon;
grant execute on function public.get_team_briefing_context(uuid) to authenticated;
