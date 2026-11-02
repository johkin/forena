import { BASE_DISCIPLINE_DEFAULTS, type ResolvedDisciplineDefaults } from "./discipline-defaults";
import type { ActivityTimingRules } from "./activity-time-rules";
export function applyUntouchedDefaults(current: ActivityTimingRules, defaults: ResolvedDisciplineDefaults, touched: ReadonlySet<keyof ActivityTimingRules>): ActivityTimingRules {
  const next = { ...current };
  for (const field of Object.keys(BASE_DISCIPLINE_DEFAULTS) as (keyof ActivityTimingRules)[]) {
    if (!touched.has(field)) Object.assign(next, { [field]: defaults.rules[field] });
  }
  return next;
}

export function initialActivityType<T extends { id: string; name: string; slug: string; system_category: string; organization_id: string | null }>(
  types: T[], requestedId?: string | null,
): T | undefined {
  if (requestedId) return types.find(type => type.id === requestedId);
  return types.find(type => type.system_category === "session" && type.name.toLocaleLowerCase("sv-SE") === "träning")
    ?? types.find(type => type.system_category === "session")
    ?? types.find(type => type.slug === "ovrigt" && !type.organization_id);
}

export function draftTimingFields(draft?: { durationMinutes?: number; gatheringMinutesBefore?: number; endTime?: string }): Set<keyof ActivityTimingRules> {
  const fields = new Set<keyof ActivityTimingRules>();
  if (draft?.durationMinutes != null || draft?.endTime != null) fields.add("duration");
  if (draft?.gatheringMinutesBefore != null) fields.add("gatheringRule");
  return fields;
}
