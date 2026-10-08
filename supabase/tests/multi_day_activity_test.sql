begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
select ok(public.validate_discipline_timing_patch('{"duration":"PT2940M"}'), 'Weekend duration is valid');
select ok(public.validate_discipline_timing_patch('{"duration":"PT10080M"}'), 'Seven days accepted');
select ok(not public.validate_discipline_timing_patch('{"duration":"PT10081M"}'), 'Bounded at seven days');
select ok(public.validate_discipline_timing_patch('{"options":{"duration":["PT90M","PT2940M"]}}'), 'Multi-day duration options use the same validator');
select * from finish();
rollback;
