begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
 ('fc000000-0000-4000-8000-000000000001','football-owner@example.test'),
 ('fc000000-0000-4000-8000-000000000002','football-member@example.test');
insert into public.organizations(id,slug,name) values
 ('fc100000-0000-4000-8000-000000000001','football-values-club','Football values'),
 ('fc100000-0000-4000-8000-000000000002','football-values-other','Other');
insert into public.organization_members(organization_id,user_id,role) values
 ('fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','owner'),
 ('fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002','member');
insert into public.sections(id,organization_id,slug,name,discipline_id) values
 ('fc200000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fotboll','Fotboll',(select id from public.disciplines where key='football')),
 ('fc200000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000002','fotboll','Fotboll',(select id from public.disciplines where key='football'));
insert into public.teams(id,organization_id,section_id,slug,name) values
 ('fc300000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001','a','A'),
 ('fc300000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000002','b','B');
insert into public.people(id,organization_id,display_name) values
 ('fc500000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','Spelare'),
 ('fc500000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000001','Ledare'),
 ('fc500000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000002','Annan klubb');
insert into public.memberships(organization_id,team_id,person_id,role) values
 ('fc100000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001','participant'),
 ('fc100000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000002','leader');
set local role authenticated;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team',new_values=>' {"gameFormat":"7v7","targetTeamSize":9,"periods":3,"periodMinutes":20}',expected_revision=>0)$$,'Save native match defaults');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team',new_values=>'{}',expected_revision=>0)$$,'40001',null,'Stale first-insert revision rejected');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team',new_values=>'{"targetTeamSize":2.5}',expected_revision=>1)$$,'22023',null,'DB validates integer');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team',new_values=>'{"unknown":1}',expected_revision=>1)$$,'22023',null,'DB rejects unknown keys');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000002','team')$$,'42501',null,'Other club denied');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','teamMembership',target_person_id=>'fc500000-0000-4000-8000-000000000003')$$,'P0002',null,'Cross-club person denied');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','teamMembership',target_person_id=>'fc500000-0000-4000-8000-000000000002')$$,'22023',null,'Leader is not a player');
select lives_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','teamMembership',target_person_id=>'fc500000-0000-4000-8000-000000000001',new_values=>'{"shirtNumber":7,"positions":["defender"]}',expected_revision=>0)$$,'Save player values');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','teamMembership',target_person_id=>'fc500000-0000-4000-8000-000000000001',new_values=>'{"positions":["defender","defender"]}',expected_revision=>1)$$,'22023',null,'Duplicate positions denied');
reset role;
insert into public.activities(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at) values
 ('fc600000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000001',(select id from public.activity_types where organization_id is null and slug='match-tavling'),'Match',now()+interval '1 day',now()+interval '1 day 1 hour'),
 ('fc600000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000001',(select id from public.activity_types where organization_id is null and slug='traning'),'Träning',now()+interval '1 day',now()+interval '1 day 1 hour');
insert into public.invitations(organization_id,activity_id,person_id,activity_role,response,responded_at) values
 ('fc100000-0000-4000-8000-000000000001','fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001','participant','accepted',now()),
 ('fc100000-0000-4000-8000-000000000001','fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000002','leader','accepted',now());
set local role authenticated;
select is(public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001')->'values'->>'targetTeamSize','9','New match snapshots defaults');
select lives_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team',new_values=>'{"targetTeamSize":12}',expected_revision=>1)$$,'Change future match defaults');
select is(public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001')->'values'->>'targetTeamSize','9','Existing match unchanged');
select is(public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000002')->>'enabled','false','Training has no match fields');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000002',new_values=>'{}',expected_revision=>0)$$,'22023',null,'Cannot write match fields on training');
select is(jsonb_array_length(public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001')->'acceptedPlayers'),1,'Only accepted players, not leaders');
select lives_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001',new_values=>'{"captainPersonId":"fc500000-0000-4000-8000-000000000001"}',expected_revision=>1)$$,'Select captain');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001',new_values=>'{"captainPersonId":"fc500000-0000-4000-8000-000000000002"}',expected_revision=>2)$$,'22023',null,'Leader cannot be captain');
select lives_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','activityParticipation','fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001','{"shirtNumber":12,"position":"goalkeeper"}',0)$$,'Save match-specific player values');
select is(public.football_fields('fc300000-0000-4000-8000-000000000001','teamMembership',target_person_id=>'fc500000-0000-4000-8000-000000000001')->'values'->>'shirtNumber','7','Ordinary shirt number unchanged');
select ok(not has_table_privilege('authenticated','private.football_values','SELECT'),'No direct table access');
reset role;
update public.invitations set response='declined' where activity_id='fc600000-0000-4000-8000-000000000001' and person_id='fc500000-0000-4000-8000-000000000001';
set local role authenticated;
select is(jsonb_array_length(public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001')->'acceptedPlayers'),0,'Empty accepted list does not fall back to team');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001',new_values=>' {"captainPersonId":"fc500000-0000-4000-8000-000000000001"}',expected_revision=>2)$$,'22023',null,'Previously accepted captain is revalidated');
select lives_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001',new_values=>' {"captainPersonId":"fc500000-0000-4000-8000-000000000001"}',expected_revision=>2,selected_source=>'teamPlayers')$$,'Explicit team source accepts current team player');
reset role;
update public.activities set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id='fc600000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001')->>'editable','false','Ended matches are read only');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','activity','fc600000-0000-4000-8000-000000000001',new_values=>'{}',expected_revision=>3)$$,'55000',null,'Cannot save ended match');
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team')$$,'42501',null,'Ordinary member cannot read management data');
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team',new_values=>'{}',expected_revision=>2)$$,'42501',null,'Ordinary member cannot write management data');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.football_fields('fc300000-0000-4000-8000-000000000001','team')$$,'42501',null,'Missing identity denied');
select * from finish();
rollback;
