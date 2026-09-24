insert into public.organizations (id, slug, name, assistant_name)
values ('10000000-0000-0000-0000-000000000001', 'ursvik-ik', 'Ursvik IK', 'Urre');

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'ledare@forena.test',
    extensions.crypt('Forena-test-2026!', extensions.gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Testledare"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'malsman@forena.test',
    extensions.crypt('Forena-test-2026!', extensions.gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Testmålsman"}',
    now(),
    now()
  );

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '{"sub":"50000000-0000-0000-0000-000000000001","email":"ledare@forena.test","email_verified":true,"phone_verified":false}',
    'email',
    now(),
    now(),
    now()
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000002',
    '{"sub":"50000000-0000-0000-0000-000000000002","email":"malsman@forena.test","email_verified":true,"phone_verified":false}',
    'email',
    now(),
    now(),
    now()
  );

insert into public.organization_members (organization_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'member'),
  ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'member');

insert into public.activity_types (organization_id, name, slug, system_category)
values
  ('10000000-0000-0000-0000-000000000001', 'Träning', 'traning', 'session'),
  ('10000000-0000-0000-0000-000000000001', 'Match eller tävling', 'match-tavling', 'competition'),
  ('10000000-0000-0000-0000-000000000001', 'Arbetspass', 'arbetspass', 'work'),
  ('10000000-0000-0000-0000-000000000001', 'Möte', 'mote', 'meeting'),
  ('10000000-0000-0000-0000-000000000001', 'Utbildning', 'utbildning', 'education'),
  ('10000000-0000-0000-0000-000000000001', 'Övrigt', 'ovrigt', 'other');

insert into public.responsibility_types (organization_id, name, slug, capabilities)
values
  ('10000000-0000-0000-0000-000000000001', 'Lagledare', 'lagledare', array['manage_team', 'manage_activities', 'manage_members']),
  ('10000000-0000-0000-0000-000000000001', 'Tränare', 'tranare', array['manage_activities']),
  ('10000000-0000-0000-0000-000000000001', 'Redaktör', 'redaktor', array['edit_content']);

insert into public.sections (id, organization_id, slug, name)
values (
  '15000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'fotboll',
  'Fotboll'
);

insert into public.teams (id, organization_id, section_id, slug, name, season)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  'f2016',
  'F2016',
  '2026/2027'
);

insert into public.team_staff (organization_id, team_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'team_manager'
);

insert into public.team_responsibilities (organization_id, team_id, user_id, responsibility_type_id)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  responsibility_type.id
from public.responsibility_types responsibility_type
where responsibility_type.organization_id = '10000000-0000-0000-0000-000000000001'
  and responsibility_type.slug = 'lagledare';

insert into public.people (id, organization_id, display_name)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Elsa'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Tilda'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Amal'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Nora'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Pavit');

insert into public.memberships (organization_id, person_id, team_id, role)
select
  '10000000-0000-0000-0000-000000000001',
  id,
  '20000000-0000-0000-0000-000000000001',
  'participant'
from public.people
where organization_id = '10000000-0000-0000-0000-000000000001';

insert into public.person_guardians (organization_id, person_id, guardian_user_id, contact_name, contact_phone)
values (
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  'Testmålsman',
  '070 000 00 00'
);

insert into public.activities (
  id,
  organization_id,
  team_id,
  activity_type_id,
  title,
  gathering_at,
  starts_at,
  ends_at,
  location
)
select
  '40000000-0000-0000-0000-000000000001',
  team.organization_id,
  team.id,
  activity_type.id,
  'Utomhusträning',
  now() + interval '1 day',
  now() + interval '1 day 30 minutes',
  now() + interval '1 day 2 hours',
  'Ursviks IP · Plan 2'
from public.teams team
join public.activity_types activity_type
  on activity_type.organization_id = team.organization_id
 and activity_type.slug = 'traning'
where team.id = '20000000-0000-0000-0000-000000000001';

insert into public.invitations (organization_id, activity_id, person_id, response, responded_at)
select
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  id,
  case display_name
    when 'Elsa' then 'accepted'
    when 'Tilda' then 'accepted'
    when 'Amal' then 'declined'
    else 'pending'
  end,
  case when display_name in ('Elsa', 'Tilda', 'Amal') then now() else null end
from public.people
where organization_id = '10000000-0000-0000-0000-000000000001';
