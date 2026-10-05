-- Activities and invitations keep concrete timestamps, never rules linked to defaults.
-- Dropping calculation metadata does not recalculate or modify any stored time.
alter table public.activities
 drop column timing_rules,
 drop column timing_rule_version;

-- Keep recurrence identity and the generated occurrences; remove copied timing rules.
update public.activity_series
set recurrence_rule = recurrence_rule - 'timingRules' - 'ruleVersion'
where recurrence_rule ? 'timingRules' or recurrence_rule ? 'ruleVersion';
