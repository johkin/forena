drop policy if exists "members can read their organizations"
  on public.organizations;

drop policy if exists "members and creators can read their organizations"
  on public.organizations;

create policy "members and creators can read their organizations"
  on public.organizations
  for select
  to authenticated
  using (
    public.is_organization_member(id)
    or created_by = (select auth.uid())
  );
