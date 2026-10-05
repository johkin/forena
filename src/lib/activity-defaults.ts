import { normalizeActivityTimingRules, type ActivityTimingRules, type DeadlineTimeRule } from "./activity-time-rules";

import { FALLBACK_TIMING_OPTIONS, TIMING_FIELDS, normalizeTimingOptions, type TimingOptions, type TimingOptionsPatch } from "./activity-timing-options";

export type ActivityDefaultsScope = "system" | "organization" | "section" | "team";
export type ActivityDefaultsPatch = { [K in keyof ActivityTimingRules]?: ActivityTimingRules[K] | null } & { options?: TimingOptionsPatch | null };
export type ActivityDefaultsRow = {
  id: string;
  activityTypeId: string;
  scope: ActivityDefaultsScope;
  organizationId: string | null;
  scopeId: string | null;
  revision: number;
  values: ActivityDefaultsPatch;
};
export type ActivityDefaultsContext = {
  activityTypeId: string;
  organizationId: string;
  sectionId: string;
  teamId: string;
};
export type DefaultsSource = { scope: ActivityDefaultsScope | "fallback"; id: string | null; revision: number | null };
export type ResolvedActivityDefaults = {
  rules: ActivityTimingRules;
  options: TimingOptions;
  optionSources: Record<keyof ActivityTimingRules, DefaultsSource>;
  sources: Record<keyof ActivityTimingRules, DefaultsSource>;
};

/** For planning only; these values never enable a send or select an audience. */
export const FALLBACK_ACTIVITY_DEFAULTS: Readonly<Omit<ActivityTimingRules, "reminderRules">> & { readonly reminderRules: readonly DeadlineTimeRule[] } = Object.freeze({
  duration: "PT1H30M", gatheringRule: "start" as const, invitationRule: "start-6d" as const,
  responseDueRule: "start-6h" as const, reminderRules: Object.freeze<DeadlineTimeRule[]>(["deadline-1d", "deadline-2h"]),
});
const fields = TIMING_FIELDS;

export function normalizeDefaultsPatch(value: unknown): ActivityDefaultsPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ogiltiga standardvärden.");
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).some(key => key !== "options" && !fields.includes(key as typeof fields[number]))) throw new Error("Okänt standardfält.");
  const present = Object.fromEntries(Object.entries(patch).filter(([key, item]) => key !== "options" && item !== null && item !== undefined));
  normalizeActivityTimingRules({ ...FALLBACK_ACTIVITY_DEFAULTS, ...present });
  if (patch.options !== null && patch.options !== undefined) normalizeTimingOptions(patch.options);
  return patch as ActivityDefaultsPatch;
}

/**
 * Caller loads authorised rows; this pure function additionally enforces target
 * matching. NULL inherits, [] disables reminders, a local array replaces its
 * parent, and zero offsets are real overrides. Duplicate scopes are an error.
 */
export function resolveActivityDefaults(context: ActivityDefaultsContext, rows: readonly ActivityDefaultsRow[]): ResolvedActivityDefaults {
  const targets = { system: null, organization: context.organizationId, section: context.sectionId, team: context.teamId };
  const levels: ActivityDefaultsScope[] = ["system", "organization", "section", "team"];
  const rules = { ...FALLBACK_ACTIVITY_DEFAULTS, reminderRules: [...FALLBACK_ACTIVITY_DEFAULTS.reminderRules] };
  const sources = Object.fromEntries(fields.map(key => [key, { scope: "fallback", id: null, revision: null }])) as ResolvedActivityDefaults["sources"];
  const options = Object.fromEntries(fields.map(key => [key, [...FALLBACK_TIMING_OPTIONS[key]]])) as TimingOptions;
  const optionSources = { ...sources };
  for (const scope of levels) {
    const matches = rows.filter(row => row.activityTypeId === context.activityTypeId && row.scope === scope
      && row.scopeId === targets[scope] && row.organizationId === (scope === "system" ? null : context.organizationId));
    if (matches.length > 1) throw new Error(`Duplicate defaults for ${scope}.`);
    const row = matches[0];
    if (!row) continue;
    if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error("Invalid defaults revision.");
    normalizeDefaultsPatch(row.values);
    for (const field of fields) {
      const value = row.values[field];
      if (value === null || value === undefined) continue;
      if (field === "reminderRules") rules.reminderRules = [...row.values.reminderRules!];
      else if (field === "duration") rules.duration = row.values.duration!;
      else rules[field] = row.values[field]!;
      sources[field] = { scope, id: row.id, revision: row.revision };
    }
    for (const field of fields) {
      const choices = row.values.options?.[field];
      if (choices == null) continue;
      options[field] = [...choices];
      optionSources[field] = { scope, id: row.id, revision: row.revision };
    }
  }
  return { rules: normalizeActivityTimingRules(rules), sources, options, optionSources };
}
