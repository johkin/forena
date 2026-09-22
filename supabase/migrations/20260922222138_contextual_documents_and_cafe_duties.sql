create table public.contextual_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  category text not null check (category in ('cafe', 'match_host', 'travel', 'equipment', 'other')),
  summary text not null check (length(summary) between 1 and 600),
  content_markdown text not null default '',
  audience text[] not null default array['leaders']::text[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (audience <@ array['leaders', 'guardians', 'players', 'volunteers']::text[])
);

create table public.contextual_document_secrets (
  document_id uuid primary key references public.contextual_documents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  foreign key (document_id, organization_id) references public.contextual_documents(id, organization_id) on delete cascade
);

create table public.team_duties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  document_id uuid,
  duty_type text not null check (duty_type in ('cafe', 'match_host', 'travel', 'equipment', 'other')),
  title text not null check (length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  foreign key (document_id, organization_id) references public.contextual_documents(id, organization_id) on delete set null (document_id),
  check (ends_at > starts_at)
);

create index team_duties_team_start_idx on public.team_duties(team_id, starts_at);

create trigger contextual_documents_touch_updated_at before update on public.contextual_documents
for each row execute function public.touch_updated_at();
create trigger contextual_document_secrets_touch_updated_at before update on public.contextual_document_secrets
for each row execute function public.touch_updated_at();
create trigger team_duties_touch_updated_at before update on public.team_duties
for each row execute function public.touch_updated_at();

alter table public.contextual_documents enable row level security;
alter table public.contextual_document_secrets enable row level security;
alter table public.team_duties enable row level security;

create policy "members can read contextual documents" on public.contextual_documents
for select to authenticated using (public.is_organization_member(organization_id));
create policy "organization admins can manage contextual documents" on public.contextual_documents
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "scoped leaders can read document secrets" on public.contextual_document_secrets
for select to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'leader'])
  or exists (
    select 1 from public.team_duties duty
    where duty.document_id = contextual_document_secrets.document_id
      and public.can_manage_team(duty.team_id)
  )
);
create policy "organization admins can manage document secrets" on public.contextual_document_secrets
for all to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read team duties" on public.team_duties
for select to authenticated using (public.is_organization_member(organization_id));
create policy "scoped leaders can manage team duties" on public.team_duties
for all to authenticated using (public.can_manage_team(team_id))
with check (public.can_manage_team(team_id));

grant select on public.contextual_documents, public.team_duties to authenticated;
grant insert, update, delete on public.contextual_documents, public.team_duties to authenticated;
grant select, insert, update, delete on public.contextual_document_secrets to authenticated;

with cafe_teams as (
  select team.id as team_id, team.organization_id
  from public.teams team
  where upper(replace(team.name, ' ', '')) = 'F2016'
), inserted_documents as (
  insert into public.contextual_documents (organization_id, title, category, summary, content_markdown, audience)
  select distinct
    organization_id,
    'Caféinstruktion för lagledare',
    'cafe',
    'Planera minst två vuxna per pass, ordna hembakat fika och förbered öppning, försäljning, städning och stängning.',
    E'## Före passet\n\n- Gör ett bemanningsschema med minst två vuxna hela tiden.\n- Ordna föräldrar som bakar; bakverk ska inte köpas in.\n- Kontrollera helgens hemmamatcher och anpassa bemanningen.\n- Säkerställ nycklar och planera hämtning av beställda varor.\n- Kontrollera om korv behöver tinas dagen före.\n\n## Under passet\n\n- En vuxen måste alltid vara på plats.\n- Märk öppnade färskvaror med datum och förvara dem förslutna.\n- Alla som står i caféet betalar för det de tar.\n- Använd rätt muggar och sopsäckar enligt caféets instruktioner.\n\n## Stängning\n\n- Städa kök och samtliga toaletter.\n- Följ veckodagens golvschema.\n- Släng hushållssopor och ta plast, metall och kartong till återvinning.\n- Lämna klubbhuset i städat skick.',
    array['leaders', 'guardians', 'volunteers']::text[]
  from cafe_teams
  returning id, organization_id
)
insert into public.team_duties (organization_id, team_id, document_id, duty_type, title, starts_at, ends_at)
select
  team.organization_id,
  team.team_id,
  document.id,
  'cafe',
  'F2016 ansvarar för caféet',
  '2026-09-27 08:00:00 Europe/Stockholm'::timestamptz,
  '2026-09-27 18:00:00 Europe/Stockholm'::timestamptz
from cafe_teams team
join inserted_documents document using (organization_id);

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
          select count(*) from public.invitations invitation
          where invitation.activity_id = activity.id and invitation.response = 'pending'
        )
      )
      from public.activities activity
      where activity.team_id = team.id and activity.ends_at >= now()
      order by activity.starts_at limit 1
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', task.id, 'title', task.title, 'dueAt', task.due_at) order by task.due_at)
      from (
        select id, title, due_at from public.team_tasks
        where team_id = team.id and status = 'open'
        order by due_at limit 8
      ) task
    ), '[]'::jsonb),
    'instructions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', duty.id,
        'title', duty.title,
        'dueAt', duty.starts_at,
        'documentTitle', document.title,
        'summary', document.summary
      ) order by duty.starts_at)
      from public.team_duties duty
      join public.contextual_documents document on document.id = duty.document_id
      where duty.team_id = team.id and duty.ends_at >= now()
      limit 4
    ), '[]'::jsonb)
  )
  from public.teams team
  where team.id = target_team_id and public.can_manage_team(team.id);
$$;

revoke all on function public.get_team_briefing_context(uuid) from public;
revoke all on function public.get_team_briefing_context(uuid) from anon;
grant execute on function public.get_team_briefing_context(uuid) to authenticated;
