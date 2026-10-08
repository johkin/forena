import type { ActivityTimingRules } from "../activity-time-rules";
import { FALLBACK_TIMING_OPTIONS, TIMING_FIELDS } from "../activity-timing-options";

/** Code-owned base profile composed by all disciplines, including generic activities. */
export const commonActivityProfile = {
  key: "common-activities", version: "1.0.0",
  fields: TIMING_FIELDS,
  defaults: {
    duration: "PT1H30M", gatheringRule: "start", invitationRule: "start-6d",
    responseDueRule: "start-6h", reminderRules: ["deadline-1d", "deadline-2h"],
  } satisfies ActivityTimingRules,
  options: FALLBACK_TIMING_OPTIONS,
};
