drop policy "organization admins can manage contextual documents" on public.contextual_documents;
create policy "organization admins can insert contextual documents" on public.contextual_documents
for insert to authenticated with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can update contextual documents" on public.contextual_documents
for update to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can delete contextual documents" on public.contextual_documents
for delete to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']));

drop policy "organization admins can manage document secrets" on public.contextual_document_secrets;
create policy "organization admins can insert document secrets" on public.contextual_document_secrets
for insert to authenticated with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can update document secrets" on public.contextual_document_secrets
for update to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "organization admins can delete document secrets" on public.contextual_document_secrets
for delete to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']));

drop policy "scoped leaders can manage team duties" on public.team_duties;
create policy "scoped leaders can insert team duties" on public.team_duties
for insert to authenticated with check (public.can_manage_team(team_id));
create policy "scoped leaders can update team duties" on public.team_duties
for update to authenticated using (public.can_manage_team(team_id))
with check (public.can_manage_team(team_id));
create policy "scoped leaders can delete team duties" on public.team_duties
for delete to authenticated using (public.can_manage_team(team_id));

create index contextual_documents_organization_idx on public.contextual_documents(organization_id);
create index contextual_documents_created_by_idx on public.contextual_documents(created_by) where created_by is not null;
create index contextual_document_secrets_document_organization_idx on public.contextual_document_secrets(document_id, organization_id);
create index contextual_document_secrets_organization_idx on public.contextual_document_secrets(organization_id);
create index team_duties_team_organization_idx on public.team_duties(team_id, organization_id);
create index team_duties_document_organization_idx on public.team_duties(document_id, organization_id) where document_id is not null;
create index team_duties_organization_idx on public.team_duties(organization_id);
