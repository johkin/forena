create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete set null,
  event_type text not null check (event_type in (
    'invitation_scheduled',
    'invitation_sent',
    'reminder_scheduled',
    'reminder_sent',
    'invitation_response_changed',
    'activity_updated',
    'activity_cancelled'
  )),
  channel text check (channel is null or channel in ('push', 'email', 'sms', 'in_app')),
  recipient_count integer check (recipient_count is null or recipient_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index activity_events_activity_created_idx
  on public.activity_events(activity_id, created_at desc);

create index activity_events_invitation_created_idx
  on public.activity_events(invitation_id, created_at desc)
  where invitation_id is not null;

alter table public.activity_events enable row level security;

create policy "activity events readable by organization members"
on public.activity_events for select
using (public.is_organization_member(organization_id));

create policy "activity events manageable by team managers"
on public.activity_events for insert
with check (
  exists (
    select 1
    from public.activities a
    where a.id = activity_events.activity_id
      and a.organization_id = activity_events.organization_id
      and a.team_id is not null
      and public.can_manage_team(a.team_id)
  )
);

create or replace function public.log_invitation_response_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.response is distinct from new.response then
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
      jsonb_build_object('from', old.response, 'to', new.response),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger invitations_log_response_event
after update of response on public.invitations
for each row
execute function public.log_invitation_response_event();
