import { describe, expect, it } from "vitest";
import { parseAudienceSelection } from "./invitation-audience";

describe("combined invitation audience", () => {
  it("combines roles and groups without duplicate selections", () => {
    expect(parseAudienceSelection({ roles: ["participant", "leader", "leader"], groupIds: ["a", "b", "a"], responsibilityTypeIds: ["r1", "r1"] }))
      .toEqual({ roles: ["participant", "leader"], groupIds: ["a", "b"], responsibilityTypeIds: ["r1"] });
  });

  it("rejects an empty or unknown role selection", () => {
    expect(() => parseAudienceSelection({ roles: [], groupIds: [], responsibilityTypeIds: [] })).toThrow("Välj minst en målgrupp");
    expect(() => parseAudienceSelection({ roles: ["admin"], groupIds: [], responsibilityTypeIds: [] })).toThrow("Ogiltig målgrupp");
  });

  it("does not expose the generic volunteer membership as a scheduled role", () => {
    expect(() => parseAudienceSelection({ roles: ["volunteer"], groupIds: [], responsibilityTypeIds: [] })).toThrow("Ogiltig målgrupp");
  });
});
