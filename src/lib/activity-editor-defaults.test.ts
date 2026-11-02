import { expect, it } from "vitest";
import { applyUntouchedDefaults, draftTimingFields, initialActivityType } from "./activity-editor-defaults";
import { BASE_DISCIPLINE_DEFAULTS, resolveDisciplineDefaults } from "./discipline-defaults";

const types = [
  { id: "other", name: "Övrigt", slug: "ovrigt", system_category: "other", organization_id: null },
  { id: "match", name: "Match", slug: "match", system_category: "competition", organization_id: null },
  { id: "training", name: "Träning", slug: "traning", system_category: "session", organization_id: null },
];
it("defaults to training while preserving an explicit different type", () => {
  expect(initialActivityType(types)?.id).toBe("training");
  expect(initialActivityType(types, "match")?.id).toBe("match");
  expect(initialActivityType(types, "unavailable")).toBeUndefined();
  expect(initialActivityType(types.slice(0, 2))?.id).toBe("other");
});
it("inherits defaults for omitted draft timings and preserves only explicit values", () => {
  const defaults = resolveDisciplineDefaults({ activityTypeId: "training", organizationId: "club", sectionId: "section", teamId: "team" }, []);
  defaults.rules = { ...defaults.rules, duration: "PT60M", gatheringRule: "start-15m" };
  const current = { ...BASE_DISCIPLINE_DEFAULTS, duration: "PT90M", gatheringRule: "start" as const };
  expect(applyUntouchedDefaults(current, defaults, draftTimingFields({}))).toMatchObject({ duration: "PT60M", gatheringRule: "start-15m" });
  expect(applyUntouchedDefaults(current, defaults, draftTimingFields({ durationMinutes: 90, gatheringMinutesBefore: 0 })))
    .toMatchObject({ duration: "PT90M", gatheringRule: "start" });
  expect(applyUntouchedDefaults(current, defaults, draftTimingFields({ endTime: "17:15" })))
    .toMatchObject({ duration: "PT90M", gatheringRule: "start-15m" });
});
