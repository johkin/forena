insert into public.team_responsibilities (
  organization_id, team_id, user_id, responsibility_type_id, starts_on
)
select organization.id, first_team.id, organization.created_by, type.id, organization.created_at::date
from public.organizations organization
join lateral (
  select team.id
  from public.teams team
  where team.organization_id = organization.id
  order by team.created_at
  limit 1
) first_team on true
join public.responsibility_types type
  on type.organization_id = organization.id and type.slug = 'lagledare'
where organization.created_by is not null
  and not exists (
    select 1
    from public.team_responsibilities responsibility
    where responsibility.team_id = first_team.id
      and responsibility.user_id = organization.created_by
      and responsibility.responsibility_type_id = type.id
      and responsibility.ends_on is null
  );

create index activity_series_organization_idx on public.activity_series(organization_id);
create index activity_type_documents_organization_idx on public.activity_type_documents(organization_id);
create index team_responsibilities_organization_idx on public.team_responsibilities(organization_id);
