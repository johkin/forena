import { describe, expect, it } from "vitest";
import { parseAudienceSelection } from "./invitation-audience";

describe("combined invitation audience", () => {
  it("combines roles and groups without duplicate selections", () => {
    expect(parseAudienceSelection({ roles: ["participant", "leader", "leader"], groupIds: ["a", "b", "a"] }))
      .toEqual({ roles: ["participant", "leader"], groupIds: ["a", "b"] });
  });

  it("rejects an empty or unknown role selection", () => {
    expect(() => parseAudienceSelection({ roles: [], groupIds: [] })).toThrow("Välj minst en målgrupp");
    expect(() => parseAudienceSelection({ roles: ["admin"], groupIds: [] })).toThrow("Ogiltig målgrupp");
  });
});
