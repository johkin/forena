import { durationToMinutes, evaluateTimeRule, parseActivityInstant, parseTimeRule, type ActivityTimingRules } from "./activity-time-rules";

export const TIMING_FIELDS = ["duration", "gatheringRule", "invitationRule", "responseDueRule", "reminderRules"] as const;
export type TimingField = keyof ActivityTimingRules;
export type TimingOptions = Record<TimingField, string[]>;
export type TimingOptionsPatch = Partial<Record<TimingField, string[] | null>>;
export const FALLBACK_TIMING_OPTIONS: TimingOptions = {
  duration: ["PT30M", "PT60M", "PT90M", "PT120M"],
  gatheringRule: ["start", "start-15m", "start-30m", "start-45m", "start-60m"],
  invitationRule: ["start-14d", "start-7d", "start-6d", "start-3d", "start-1d"],
  responseDueRule: ["start", "start-1h", "start-2h", "start-6h", "start-1d", "start-1d/d"],
  reminderRules: ["deadline-2d", "deadline-1d", "deadline-6h", "deadline-2h", "deadline-1h"],
};
export const TIMING_LABELS: Record<TimingField, string> = {
  duration: "Längd", gatheringRule: "Samling", invitationRule: "Skicka kallelsen",
  responseDueRule: "Svara senast", reminderRules: "Påminnelser",
};

/** Validate configuration independently of selected defaults (legacy values remain valid). */
export function normalizeTimingOptions(value: unknown): TimingOptionsPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ogiltiga valbara tider.");
  const patch = value as Record<string, unknown>;
  for (const [key, choices] of Object.entries(patch)) {
    if (!TIMING_FIELDS.includes(key as TimingField)) throw new Error("Okänt tidsfält.");
    if (choices === null) continue;
    if (!Array.isArray(choices) || !choices.length || choices.length > 32 || new Set(choices).size !== choices.length) throw new Error("Välj 1–32 unika tider.");
    for (const choice of choices) {
      if (key === "duration") durationToMinutes(choice);
      else {
        const rule = parseTimeRule(choice, key === "reminderRules" ? "deadline" : "start");
        if ((key === "invitationRule" || key === "reminderRules") && !rule.startOfDay && rule.offsets.every(offset => offset.amount === 0)) {
          throw new Error(key === "invitationRule" ? "Kallelsen måste skickas före sista svarstid." : "Påminnelsen måste skickas före sista svarstid.");
        }
      }
    }
  }
  return patch as TimingOptionsPatch;
}

export function timingLabel(field: TimingField, value: string): string {
  if (field === "duration") return `${durationToMinutes(value)} minuter`;
  const rule = parseTimeRule(value, field === "reminderRules" ? "deadline" : "start");
  const units = { d: ["dag", "dagar"], h: ["timme", "timmar"], m: ["minut", "minuter"] };
  const offsets = rule.offsets.filter(offset => offset.amount !== 0);
  if (!offsets.length && rule.startOfDay) return field === "reminderRules" ? "Vid början av dagen för sista svarstid" : "Vid början av aktivitetsdagen";
  const relative = offsets.length ? `${offsets.map(({amount, unit}) => `${amount} ${units[unit][amount === 1 ? 0 : 1]}`).join(" och ")} innan` : field === "reminderRules" ? "Vid sista svarstid" : "Vid start";
  return rule.startOfDay ? `${relative} · vid dagens början` : relative;
}

/** Never silently replace a current choice when an inherited list changes. */
export function timingChoices(field: TimingField, options: readonly string[], current: readonly string[]) {
  return [...new Set([...options, ...current])].map(value => ({ value, label: timingLabel(field, value) + (options.includes(value) ? "" : " (nuvarande värde)") }));
}

/** Compare real instants for every occurrence, including calendar days across DST.
 * Constraints remain field-specific so an invalid reminder cannot lock the two
 * anchor selectors. Existing values are never changed by this filter.
 */
export function createTimingChoiceFilter(rules: ActivityTimingRules, starts: readonly string[], timeZone: string) {
  const contexts = starts.map(start => {
    const context = {start, timeZone};
    const invitation = evaluateTimeRule(rules.invitationRule, context, "start");
    const deadline = evaluateTimeRule(rules.responseDueRule, context, "start");
    return { ...context, deadline, startMs: parseActivityInstant(start), invitationMs: parseActivityInstant(invitation), deadlineMs: parseActivityInstant(deadline) };
  });
  return (field: TimingField, value: string, otherReminders: readonly string[] = []): boolean => {
    if (field === "duration" || field === "gatheringRule") return true;
    return contexts.every(context => {
      const candidate = parseActivityInstant(evaluateTimeRule(value, context, field === "reminderRules" ? "deadline" : "start"));
      if (field === "invitationRule") return candidate < context.deadlineMs;
      if (field === "responseDueRule") return candidate > context.invitationMs && candidate <= context.startMs;
      return candidate > context.invitationMs && candidate < context.deadlineMs
        && otherReminders.every(rule => candidate !== parseActivityInstant(evaluateTimeRule(rule, context, "deadline")));
    });
  };
}
