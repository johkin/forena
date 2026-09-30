-- auto_expose_new_tables=false requires explicit grants. Keep row access
-- governed by the existing RLS policies; do not restore automatic anon grants.
grant select, insert, update on public.organizations to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.organization_members,
  public.teams,
  public.people,
  public.person_guardians,
  public.memberships,
  public.activities,
  public.invitations,
  public.push_subscriptions,
  public.sections,
  public.section_staff,
  public.team_staff,
  public.team_tasks
to authenticated;
grant select, insert, update on public.person_login_emails to authenticated;
grant select on public.notification_outbox to authenticated;
grant select, insert on public.audit_log to authenticated;
grant usage on sequence public.audit_log_id_seq to authenticated;
