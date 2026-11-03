import { describe, expect, it } from "vitest";
import { extensionRequestAllowed } from "./extension-api";
import { safeDestination } from "./api";

const team = "10000000-0000-4000-8000-000000000001";
const activity = "10000000-0000-4000-8000-000000000002";
describe("evaluation transport", () => {
  it("permits only contract-owned reads, filters and score writes", () => {
    expect(safeDestination(`/teams/${team}/evaluation`)).toBe(
      `/teams/${team}/evaluation`,
    );
    expect(
      extensionRequestAllowed(`/api/teams/${team}/player-evaluation`, "GET"),
    ).toBe(true);
    expect(
      extensionRequestAllowed(
        `/api/teams/${team}/player-evaluation/scores`,
        "PUT",
      ),
    ).toBe(true);
    expect(
      extensionRequestAllowed(
        `/api/teams/${team}/read-views?activityId=${activity}&groupCount=3&mode=ability&personIds=${team},${activity}`,
        "GET",
      ),
    ).toBe(true);
    expect(
      extensionRequestAllowed(
        `/api/teams/${team}/read-views?personIds=`,
        "GET",
      ),
    ).toBe(true);
    for (const query of [
      "groupCount=2.5",
      "mode=code",
      "url=https://example.com",
      "groupCount=2&groupCount=3",
      "personIds=invalid",
    ]) {
      expect(
        extensionRequestAllowed(
          `/api/teams/${team}/read-views?${query}`,
          "GET",
        ),
      ).toBe(false);
    }
    expect(
      extensionRequestAllowed(`/api/teams/${team}/read-views`, "PUT"),
    ).toBe(false);
    expect(
      extensionRequestAllowed(`/api/teams/${team}/player-evaluation`, "DELETE"),
    ).toBe(false);
  });
});
