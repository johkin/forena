import { FALLBACK_ACTIVITY_DEFAULTS, type ResolvedActivityDefaults } from "./activity-defaults";
import type { ActivityTimingRules } from "./activity-time-rules";
export function applyUntouchedDefaults(current: ActivityTimingRules, defaults: ResolvedActivityDefaults, touched: ReadonlySet<keyof ActivityTimingRules>): ActivityTimingRules {
  const next = { ...current };
  for (const field of Object.keys(FALLBACK_ACTIVITY_DEFAULTS) as (keyof ActivityTimingRules)[]) {
    if (!touched.has(field)) Object.assign(next, { [field]: defaults.rules[field] });
  }
  return next;
}
