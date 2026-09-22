create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  system_category text not null check (system_category in ('session', 'competition', 'work', 'meeting', 'education', 'other')),
  color text,
  icon text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

create table public.activity_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  activity_type_id uuid not null,
  title text not null check (length(title) between 1 and 160),
  location text not null default '',
  recurrence_rule jsonb not null,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  foreign key (activity_type_id, organization_id) references public.activity_types(id, organization_id),
  check (ends_on is null or ends_on >= starts_on)
);

alter table public.activities
  add column activity_type_id uuid,
  add column series_id uuid,
  add column description_markdown text not null default '',
  add column source_kind text not null default 'manual' check (source_kind in ('manual', 'imported')),
  add column external_source text,
  add column external_id text,
  add foreign key (activity_type_id, organization_id) references public.activity_types(id, organization_id),
  add foreign key (series_id, organization_id) references public.activity_series(id, organization_id) on delete set null (series_id),
  add check (
    (source_kind = 'manual' and external_source is null and external_id is null)
    or (source_kind = 'imported' and external_source is not null and external_id is not null)
  );

create unique index activities_external_identity_idx
on public.activities(organization_id, external_source, external_id)
where source_kind = 'imported';
create index activities_type_idx on public.activities(activity_type_id, organization_id);
create index activities_series_idx on public.activities(series_id, organization_id) where series_id is not null;

create table public.activity_type_documents (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_type_id uuid not null,
  document_id uuid not null,
  visible_from_offset interval not null default interval '7 days',
  visible_until_offset interval not null default interval '0 days',
  created_at timestamptz not null default now(),
  primary key (activity_type_id, document_id),
  foreign key (activity_type_id, organization_id) references public.activity_types(id, organization_id) on delete cascade,
  foreign key (document_id, organization_id) references public.contextual_documents(id, organization_id) on delete cascade
);

create table public.responsibility_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

create table public.team_responsibilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  responsibility_type_id uuid not null,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  foreign key (responsibility_type_id, organization_id) references public.responsibility_types(id, organization_id),
  check (ends_on is null or ends_on >= starts_on),
  unique (team_id, user_id, responsibility_type_id, starts_on)
);

insert into public.activity_types (organization_id, name, slug, system_category)
select organization.id, seed.name, seed.slug, seed.category
from public.organizations organization
cross join (values
  ('Träning', 'traning', 'session'),
  ('Match eller tävling', 'match-tavling', 'competition'),
  ('Arbetspass', 'arbetspass', 'work'),
  ('Möte', 'mote', 'meeting'),
  ('Utbildning', 'utbildning', 'education'),
  ('Övrigt', 'ovrigt', 'other')
) seed(name, slug, category);

update public.activities activity
set activity_type_id = type.id
from public.activity_types type
where type.organization_id = activity.organization_id and type.slug = 'ovrigt';

insert into public.activity_types (organization_id, name, slug, system_category)
select distinct duty.organization_id, 'Cafépass', 'cafepass', 'work'
from public.team_duties duty
on conflict (organization_id, slug) do nothing;

insert into public.activities (
  organization_id, team_id, activity_type_id, title, description_markdown,
  starts_at, ends_at, location
)
select
  duty.organization_id, duty.team_id, type.id, duty.title,
  coalesce(document.summary, ''), duty.starts_at, duty.ends_at, ''
from public.team_duties duty
join public.activity_types type on type.organization_id = duty.organization_id and type.slug = 'cafepass'
left join public.contextual_documents document on document.id = duty.document_id;

insert into public.activity_type_documents (organization_id, activity_type_id, document_id)
select distinct duty.organization_id, type.id, duty.document_id
from public.team_duties duty
join public.activity_types type on type.organization_id = duty.organization_id and type.slug = 'cafepass'
where duty.document_id is not null
on conflict do nothing;

alter table public.activities alter column activity_type_id set not null;
alter table public.contextual_documents drop column category;

insert into public.responsibility_types (organization_id, name, slug, capabilities)
select organization.id, seed.name, seed.slug, seed.capabilities
from public.organizations organization
cross join (values
  ('Lagledare', 'lagledare', array['manage_team', 'manage_activities', 'manage_members']::text[]),
  ('Tränare', 'tranare', array['manage_activities']::text[]),
  ('Redaktör', 'redaktor', array['edit_content']::text[])
) seed(name, slug, capabilities);

insert into public.team_responsibilities (organization_id, team_id, user_id, responsibility_type_id, starts_on)
select staff.organization_id, staff.team_id, staff.user_id, type.id, staff.created_at::date
from public.team_staff staff
join public.responsibility_types type
  on type.organization_id = staff.organization_id
 and type.slug = case staff.role when 'team_manager' then 'lagledare' when 'coach' then 'tranare' else 'redaktor' end
on conflict do nothing;

drop policy "scoped leaders can read document secrets" on public.contextual_document_secrets;
create policy "scoped leaders can read document secrets" on public.contextual_document_secrets
for select to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'leader'])
  or exists (
    select 1
    from public.activity_type_documents link
    join public.activities activity on activity.activity_type_id = link.activity_type_id
    where link.document_id = contextual_document_secrets.document_id
      and public.can_manage_team(activity.team_id)
  )
);

drop function public.get_team_briefing_context(uuid);
drop table public.team_duties;

create trigger activity_types_touch_updated_at before update on public.activity_types
for each row execute function public.touch_updated_at();
create trigger activity_series_touch_updated_at before update on public.activity_series
for each row execute function public.touch_updated_at();
create trigger responsibility_types_touch_updated_at before update on public.responsibility_types
for each row execute function public.touch_updated_at();

alter table public.activity_types enable row level security;
alter table public.activity_series enable row level security;
alter table public.activity_type_documents enable row level security;
alter table public.responsibility_types enable row level security;
alter table public.team_responsibilities enable row level security;

create policy "members can read activity types" on public.activity_types
for select to authenticated using (public.is_organization_member(organization_id));
create policy "admins can insert activity types" on public.activity_types
for insert to authenticated with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "admins can update activity types" on public.activity_types
for update to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "admins can delete activity types" on public.activity_types
for delete to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read activity series" on public.activity_series
for select to authenticated using (public.is_organization_member(organization_id));
create policy "leaders can insert activity series" on public.activity_series
for insert to authenticated with check (public.can_manage_team(team_id));
create policy "leaders can update activity series" on public.activity_series
for update to authenticated using (public.can_manage_team(team_id)) with check (public.can_manage_team(team_id));
create policy "leaders can delete activity series" on public.activity_series
for delete to authenticated using (public.can_manage_team(team_id));

create policy "members can read activity document links" on public.activity_type_documents
for select to authenticated using (public.is_organization_member(organization_id));
create policy "admins can insert activity document links" on public.activity_type_documents
for insert to authenticated with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "admins can update activity document links" on public.activity_type_documents
for update to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "admins can delete activity document links" on public.activity_type_documents
for delete to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read responsibility types" on public.responsibility_types
for select to authenticated using (public.is_organization_member(organization_id));
create policy "admins can insert responsibility types" on public.responsibility_types
for insert to authenticated with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "admins can update responsibility types" on public.responsibility_types
for update to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy "admins can delete responsibility types" on public.responsibility_types
for delete to authenticated using (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy "members can read team responsibilities" on public.team_responsibilities
for select to authenticated using (public.is_organization_member(organization_id));
create policy "team managers can insert responsibilities" on public.team_responsibilities
for insert to authenticated with check (public.can_manage_team(team_id));
create policy "team managers can update responsibilities" on public.team_responsibilities
for update to authenticated using (public.can_manage_team(team_id)) with check (public.can_manage_team(team_id));
create policy "team managers can delete responsibilities" on public.team_responsibilities
for delete to authenticated using (public.can_manage_team(team_id));

grant select, insert, update, delete on public.activity_types, public.activity_series, public.activity_type_documents, public.responsibility_types, public.team_responsibilities to authenticated;

create index activity_types_organization_idx on public.activity_types(organization_id);
create index activity_series_team_idx on public.activity_series(team_id, organization_id);
create index activity_series_type_idx on public.activity_series(activity_type_id, organization_id);
create index activity_type_documents_type_idx on public.activity_type_documents(activity_type_id, organization_id);
create index activity_type_documents_document_idx on public.activity_type_documents(document_id, organization_id);
create index responsibility_types_organization_idx on public.responsibility_types(organization_id);
create index team_responsibilities_team_idx on public.team_responsibilities(team_id, organization_id);
create index team_responsibilities_user_idx on public.team_responsibilities(user_id);
create index team_responsibilities_type_idx on public.team_responsibilities(responsibility_type_id, organization_id);

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

revoke all on function public.get_team_briefing_context(uuid) from public;
revoke all on function public.get_team_briefing_context(uuid) from anon;
grant execute on function public.get_team_briefing_context(uuid) to authenticated;
