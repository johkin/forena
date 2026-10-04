import { describe, it } from "vitest";
import { timingCases } from "../../tests/activity-timing-cases";

describe("activity date math, defaults and legacy compatibility", () => {
  for (const test of timingCases) it(test.name, test.run);
});
