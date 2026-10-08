import { normalizeActivityTimingRules, type ActivityTimingRules } from "./activity-time-rules";
import { TIMING_FIELDS, normalizeTimingOptions, type TimingOptions, type TimingOptionsPatch } from "./activity-timing-options";
import { commonActivityProfile } from "./disciplines/common-activities";
import { getDisciplinePackage } from "./disciplines";

export type DisciplineDefaultsScope = "section" | "team";
export type CapabilityNotificationSettings = { notificationsEnabled: boolean; notificationHours: number[] };
export type CapabilityDefaultsPatch = Record<string, Partial<{ notificationsEnabled: boolean | null; notificationHours: number[] | null }> | null>;
export type DisciplineDefaultsPatch = { [K in keyof ActivityTimingRules]?: ActivityTimingRules[K] | null } & { options?: TimingOptionsPatch | null; capabilities?: CapabilityDefaultsPatch | null };
export type DisciplineDefaultsRow = {
  id: string; activityTypeId: string; scope: DisciplineDefaultsScope; organizationId: string;
  scopeId: string; disciplineId: string; version: string; revision: number; values: DisciplineDefaultsPatch;
};
export type DisciplineDefaultsContext = {
  activityTypeId: string; organizationId: string; sectionId: string; teamId: string;
  disciplineId?: string | null; disciplineKey?: string | null; activityTypeSlug?: string; activityCategory?: string;
};
export type DefaultsSource = { scope: DisciplineDefaultsScope | "discipline"; id: string | null; revision: number | null };
export type ResolvedDisciplineDefaults = {
  rules: ActivityTimingRules; options: TimingOptions;
  sources: Record<keyof ActivityTimingRules, DefaultsSource>;
  optionSources: Record<keyof ActivityTimingRules, DefaultsSource>;
  capabilities: Record<string, CapabilityNotificationSettings>;
  capabilityDefinitions: import("../../supabase/functions/_shared/capability-types").ActivityCapabilityDefinition[];
  capabilitySources: Record<string,Record<keyof CapabilityNotificationSettings,DefaultsSource>>;
};
export const BASE_DISCIPLINE_DEFAULTS = commonActivityProfile.defaults;

export function supportedCapabilities(context: DisciplineDefaultsContext) {
  return (context.disciplineKey ? getDisciplinePackage(context.disciplineKey)?.capabilities ?? [] : []).filter(rule =>
    rule.appliesTo.activityTypeSlugs.includes(context.activityTypeSlug ?? "") && rule.appliesTo.categories.includes(context.activityCategory ?? ""));
}
export function normalizeDefaultsPatch(value: unknown, context?: DisciplineDefaultsContext): DisciplineDefaultsPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ogiltiga disciplinförval.");
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).some(key => ![...TIMING_FIELDS, "options", "capabilities"].includes(key))) throw new Error("Okänt standardfält.");
  const timing = Object.fromEntries(TIMING_FIELDS.filter(key => patch[key] != null).map(key => [key, patch[key]]));
  normalizeActivityTimingRules({ ...BASE_DISCIPLINE_DEFAULTS, ...timing });
  if (patch.options != null) normalizeTimingOptions(patch.options);
  if (patch.capabilities != null) {
    if (typeof patch.capabilities !== "object" || Array.isArray(patch.capabilities)) throw new Error("Ogiltiga förmågor.");
    for (const [key, settings] of Object.entries(patch.capabilities)) {
      if (!context || !supportedCapabilities(context).some(rule=>rule.id===key)) throw new Error("Förmågan gäller inte denna disciplin och aktivitetstyp.");
      if (settings == null) continue;
      if (typeof settings !== "object" || Array.isArray(settings)) throw new Error("Ogiltiga inställningar för förmågan.");
      for (const [field, input] of Object.entries(settings)) {
        if (field === "notificationsEnabled") {
          if (input != null && typeof input !== "boolean") throw new Error("Ogiltig aktivering.");
        } else if (field === "notificationHours") {
          if (input != null && (!Array.isArray(input) || input.length > 5 || new Set(input).size !== input.length
            || input.some(hour => !Number.isInteger(hour) || hour < 1 || hour > 720))) throw new Error("Välj högst fem unika kontrolltider, 1–720 timmar före start.");
        } else throw new Error("Okänt förmågefält.");
      }
    }
  }
  return patch as DisciplineDefaultsPatch;
}

/** Field-wise inheritance: code-owned discipline → section → team. */
export function resolveDisciplineDefaults(context: DisciplineDefaultsContext, rows: readonly DisciplineDefaultsRow[]): ResolvedDisciplineDefaults {
  const profile = (context.disciplineKey ? getDisciplinePackage(context.disciplineKey)?.activityProfile : null) ?? commonActivityProfile;
  const capabilities = supportedCapabilities(context);
  const source: DefaultsSource = { scope: "discipline", id: context.disciplineId ?? null, revision: null };
  const result: ResolvedDisciplineDefaults = {
    rules: { ...profile.defaults, reminderRules: [...profile.defaults.reminderRules] },
    options: Object.fromEntries(TIMING_FIELDS.map(key => [key, [...profile.options[key]]])) as TimingOptions,
    sources: Object.fromEntries(TIMING_FIELDS.map(key => [key, source])) as ResolvedDisciplineDefaults["sources"],
    optionSources: Object.fromEntries(TIMING_FIELDS.map(key => [key, source])) as ResolvedDisciplineDefaults["optionSources"],
    capabilities: Object.fromEntries(capabilities.map(rule=>[rule.id,{notificationsEnabled:rule.defaults.notificationsEnabled,notificationHours:[...rule.notifications.beforeStartHours]}])),
    capabilityDefinitions: capabilities,
    capabilitySources: Object.fromEntries(capabilities.map(rule=>[rule.id,{notificationsEnabled:source,notificationHours:source}])),
  };
  for (const scope of ["section", "team"] as const) {
    const matches = rows.filter(row => row.activityTypeId === context.activityTypeId && row.scope === scope
      && row.scopeId === (scope === "section" ? context.sectionId : context.teamId)
      && row.organizationId === context.organizationId && row.disciplineId === context.disciplineId);
    if (matches.length > 1) throw new Error(`Duplicate defaults for ${scope}.`);
    const row = matches[0];
    if (!row) continue;
    if (row.version !== (getDisciplinePackage(context.disciplineKey ?? "")?.version ?? profile.version) || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error("Disciplinförvalens version eller revision stöds inte.");
    normalizeDefaultsPatch(row.values, context);
    const origin: DefaultsSource = { scope, id: row.id, revision: row.revision };
    for (const field of TIMING_FIELDS) {
      const value = row.values[field];
      if (value != null) {
        if (field === "reminderRules") result.rules.reminderRules = [...row.values.reminderRules!];
        else if (field === "duration") result.rules.duration = row.values.duration!;
        else result.rules[field] = row.values[field]!;
        result.sources[field] = origin;
      }
      const choices = row.values.options?.[field];
      if (choices != null) { result.options[field] = [...choices]; result.optionSources[field] = origin; }
    }
    for (const capability of capabilities) {
      const settings = row.values.capabilities?.[capability.id];
      if (!settings) continue;
      for (const field of ["notificationsEnabled","notificationHours"] as const) {
        const value=settings[field];
        if (value == null) continue;
        if (field === "notificationHours") result.capabilities[capability.id].notificationHours=[...settings.notificationHours!];
        else result.capabilities[capability.id].notificationsEnabled=settings.notificationsEnabled!;
        result.capabilitySources[capability.id][field]=origin;
      }
    }
  }
  result.rules = normalizeActivityTimingRules(result.rules);
  return result;
}
