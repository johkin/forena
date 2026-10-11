-- Preserve the existing identity/team permission policy; lifecycle is an AND condition.
create policy "open activities permit invitation updates"
on public.invitations as restrictive for update to authenticated
using (
  exists (
    select 1 from public.activities activity
    where activity.id = invitations.activity_id
      and activity.status <> 'cancelled'
      and activity.ends_at > clock_timestamp()
  )
)
with check (
  exists (
    select 1 from public.activities activity
    where activity.id = invitations.activity_id
      and activity.status <> 'cancelled'
      and activity.ends_at > clock_timestamp()
  )
);

-- RLS alone reads an MVCC snapshot. A shared row lock serializes the reply
-- with cancellation/time changes (which take a conflicting row lock).
-- The private definer is needed so guardians can lock an activity without
-- being granted activity-update privileges. It cannot be called as an RPC.
create function private.guard_invitation_response_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare activity_status text; activity_end timestamptz;
begin
  if (new.response, new.response_comment, new.responded_at) is not distinct from
     (old.response, old.response_comment, old.responded_at) then
    return new;
  end if;
  select activity.status, activity.ends_at into activity_status, activity_end
    from public.activities activity where activity.id = old.activity_id for share;
  if not found or activity_status = 'cancelled' or activity_end <= clock_timestamp() then
    raise exception 'Activity is read-only' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_invitation_response_lifecycle() from public, anon, authenticated;
create trigger invitations_guard_response_lifecycle
before update of response, response_comment, responded_at on public.invitations
for each row execute function private.guard_invitation_response_lifecycle();
