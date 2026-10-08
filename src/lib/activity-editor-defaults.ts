import { BASE_DISCIPLINE_DEFAULTS, type ResolvedDisciplineDefaults } from "./discipline-defaults";
import type { ActivityTimingRules } from "./activity-time-rules";
export function applyUntouchedDefaults(current: ActivityTimingRules, defaults: ResolvedDisciplineDefaults, touched: ReadonlySet<keyof ActivityTimingRules>): ActivityTimingRules {
  const next = { ...current };
  for (const field of Object.keys(BASE_DISCIPLINE_DEFAULTS) as (keyof ActivityTimingRules)[]) {
    if (!touched.has(field)) Object.assign(next, { [field]: defaults.rules[field] });
  }
  return next;
}
