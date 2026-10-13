begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a1000000-0000-0000-0000-000000000001','team-platform@test.example',now(),'{"display_name":"System"}'),
 ('a1000000-0000-0000-0000-000000000002','team-owner@test.example',now(),'{"display_name":"Owner"}'),
 ('a1000000-0000-0000-0000-000000000003','team-section@test.example',now(),'{"display_name":"Section"}'),
 ('a1000000-0000-0000-0000-000000000004','team-editor@test.example',now(),'{"display_name":"Editor"}'),
 ('a1000000-0000-0000-0000-000000000005','team-member@test.example',now(),'{"display_name":"Member"}');
insert into public.platform_roles(user_id,role) values('a1000000-0000-0000-0000-000000000001','system_admin');
insert into public.organizations(id,slug,name) values('b1000000-0000-0000-0000-000000000001','team-admin-test','Test'),('b1000000-0000-0000-0000-000000000002','team-other-test','Other');
insert into public.organization_members(organization_id,user_id,role) values
 ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','owner'),
 ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','member'),
 ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','member'),
 ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','member');
insert into public.sections(id,organization_id,slug,name) values
 ('c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','first','First'),
 ('c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','second','Second'),
 ('c1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000002','other','Other');
insert into public.section_staff(organization_id,section_id,user_id,role) values
 ('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','section_admin'),
 ('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','editor');
create temporary table section_created_teams(label text primary key,id uuid);
grant select,insert on section_created_teams to authenticated;
set local role anon;
select throws_ok($$select public.section_team_structure('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001')$$,'42501',null,'Anonymous cannot read admin structure');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select ok(public.can_administer_section_teams('c1000000-0000-0000-0000-000000000001'),'Section admin can administer own section');
select ok(not public.can_administer_section_teams('c1000000-0000-0000-0000-000000000002'),'Section admin cannot administer sibling section');
select lives_ok($$insert into section_created_teams values('first',public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',null,'{"name":"F2016","slug":"f2016","season":"2026"}'))$$,'Section admin creates team');
select is((public.section_team_structure('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001')->'teams'->0->>'canDelete')::boolean,true,'Empty team can be deleted');
select is((select section_id::text from public.teams where id=(select id from section_created_teams where label='first')),'c1000000-0000-0000-0000-000000000001','Team anchored in correct section');
select lives_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',(select id from section_created_teams where label='first'),'{"name":"F2016 renamed","slug":"f2016","season":"2027"}')$$,'Section admin edits metadata');
select throws_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',(select id from section_created_teams where label='first'),'{"name":"F2016","slug":"new-url","season":"2027"}')$$,'22023','Team address cannot change','Existing URL stays stable');
select throws_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',null,'{"name":"Forged","slug":"forged","season":""}')$$,'42501','Forbidden','Section admin cannot create in sibling section');
select throws_ok($$select public.section_team_structure('b1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001')$$,'P0002','Section not found','Forged club and own section combination is rejected');
select throws_ok($$select public.delete_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',(select id from section_created_teams where label='first'))$$,'42501','Forbidden','Deletion is section-scoped');
select throws_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',null,'{"name":"Duplicate","slug":"f2016","season":""}')$$,'23505',null,'Duplicate address rejected');
select throws_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',null,'{"name":" ","slug":"bad","season":""}')$$,'22023','Invalid team','Blank name rejected');
select throws_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',null,'{"name":"Missing season","slug":"missing"}')$$,'22023','Invalid team','Malformed input rejected');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.section_team_structure('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001')$$,'42501','Forbidden','Section editor cannot administer structure');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',null,'{"name":"Forged","slug":"forged","season":""}')$$,'42501','Forbidden','Member cannot create team');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$insert into section_created_teams values('second',public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',null,'{"name":"Second team","slug":"second-team","season":""}'))$$,'Club owner administers all sections');
select throws_ok($$select public.save_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',(select id from section_created_teams where label='second'),'{"name":"Forged","slug":"second-team","season":""}')$$,'P0002','Team not found','Even owner cannot mix team and section IDs');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.section_team_structure('b1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000003')$$,'System admin reads without membership');
select lives_ok($$insert into section_created_teams values('system',public.save_section_team('b1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000003',null,'{"name":"System team","slug":"system-team","season":""}'))$$,'System admin creates without membership');
select ok(not public.is_organization_member('b1000000-0000-0000-0000-000000000002'),'System operation grants no membership');
select lives_ok($$select public.delete_section_team('b1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000003',(select id from section_created_teams where label='system'))$$,'Empty team deleted by system admin');
reset role;
insert into public.people(id,organization_id,display_name) values('d1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Player');
insert into public.memberships(organization_id,team_id,person_id,role,starts_on,ends_on) select 'b1000000-0000-0000-0000-000000000001',id,'d1000000-0000-0000-0000-000000000001','participant','2025-01-01','2025-12-31' from section_created_teams where label='first';
insert into public.assistant_memories(organization_id,scope,scope_id,kind,subject,content,created_by) select 'b1000000-0000-0000-0000-000000000001','team',id,'instruction','Saved guide','Keep this','a1000000-0000-0000-0000-000000000002' from section_created_teams where label='second';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((public.section_team_structure('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001')->'teams'->0->>'canDelete')::boolean,false,'Historical membership blocks UI deletion');
select throws_ok($$select public.delete_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',(select id from section_created_teams where label='first'))$$,'55000','Team is in use','RPC preserves historical memberships');
select throws_ok($$delete from public.teams where id=(select id from section_created_teams where label='first')$$,'55000','Team is in use','Direct table deletion cannot bypass guard');
select throws_ok($$select public.delete_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',(select id from section_created_teams where label='second'))$$,'55000','Team is in use','Scope-bound memory blocks deletion');
select ok(not has_function_privilege('anon','public.save_section_team(uuid,uuid,uuid,jsonb)','execute'),'Anonymous write privilege revoked');
select ok(not has_function_privilege('authenticated','administration.team_used(uuid)','execute'),'Internal usage helper private');
select ok(not (select prosecdef from pg_proc where oid='public.save_section_team(uuid,uuid,uuid,jsonb)'::regprocedure),'Exposed wrapper is invoker');
select ok(exists(select 1 from public.audit_log where action='team.metadata_changed' and entity_id=(select id::text from section_created_teams where label='first')),'Metadata mutation auditable');
-- A single structure read must keep independent usage results for multiple teams,
-- including newly introduced FK-backed extension data.
reset role;
insert into public.teams(id,organization_id,section_id,name,slug,season) values
 ('e1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Empty team','empty-team',''),
 ('e1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Extension team','extension-team','');
create table administration.team_usage_test(team_id uuid references public.teams(id) on delete cascade);
insert into administration.team_usage_test values('e1000000-0000-0000-0000-000000000002');
set local role authenticated;
with teams as (select jsonb_array_elements(public.section_team_structure('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001')->'teams') value)
select is((select (value->>'canDelete')::boolean from teams where value->>'slug'='empty-team'),true,'Shared references preserve empty team deletion');
with teams as (select jsonb_array_elements(public.section_team_structure('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001')->'teams') value)
select is((select (value->>'canDelete')::boolean from teams where value->>'slug'='extension-team'),false,'Shared references discover a new extension FK');
select throws_ok($$select public.delete_section_team('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002')$$,'55000','Team is in use','Deletion guard also discovers the new FK');
select ok(not has_function_privilege('authenticated','administration.team_references()','execute'),'Reference catalogue helper remains private');
select ok(not has_function_privilege('authenticated','administration.team_used_with_references(uuid,jsonb)','execute'),'Caller cannot supply forged reference lists');
select * from finish();
rollback;
