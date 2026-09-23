alter table public.activities
  add column invitation_send_at timestamptz,
  add column response_due_at timestamptz,
  add column reminder_send_at timestamptz;

alter table public.activities
  add constraint activities_invitation_before_response_due
    check (invitation_send_at is null or response_due_at is null or invitation_send_at <= response_due_at),
  add constraint activities_response_due_before_start
    check (response_due_at is null or response_due_at <= starts_at),
  add constraint activities_reminder_window
    check (
      reminder_send_at is null
      or (
        (invitation_send_at is null or reminder_send_at >= invitation_send_at)
        and (response_due_at is null or reminder_send_at <= response_due_at)
      )
    );

create index activities_invitation_send_idx
  on public.activities(invitation_send_at)
  where invitation_send_at is not null and status = 'published';

create index activities_reminder_send_idx
  on public.activities(reminder_send_at)
  where reminder_send_at is not null and status = 'published';
