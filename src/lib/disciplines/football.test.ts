import { describe, expect, it } from "vitest";
import { getDisciplinePackage, packageForSection, validateDisciplineData } from "./index";

const validate = (scope: Parameters<typeof validateDisciplineData>[2], input: unknown) => validateDisciplineData("football", "1.0.0", scope, input);
describe("football discipline package", () => {
  it("resolves by stable catalogue key, independently of installation UUIDs", () => {
    expect(packageForSection("section-football", "section-football", [{ id: "section-football", key: "football" }])?.key).toBe("football");
    expect(packageForSection(null, "section-football", [{ id: "section-football", key: "football" }])).toBeNull();
    expect(packageForSection("section-football", "team-floorball", [{ id: "section-football", key: "football" }])).toBeNull();
    expect(packageForSection("missing", "missing", [])).toBeNull();
  });
  it("does not guess another package or version", () => {
    expect(getDisciplinePackage("floorball")).toBeNull();
    expect(getDisciplinePackage("football", "2.0.0")).toBeNull();
    expect(() => validateDisciplineData("football", "2.0.0", "team", {})).toThrow();
  });
  it("keeps absent values unknown and pitch size separate from squad size", () => {
    expect(validate("team", {})).toEqual({});
    expect(validate("activity", {})).toEqual({});
    expect(validate("team", { gameFormat: "7v7", targetSquadSize: 9 })).toEqual({ gameFormat: "7v7", targetSquadSize: 9 });
    expect(() => validate("team", { gameFormat: "7v7", targetSquadSize: 6 })).toThrow();
    expect(() => validate("team", { targetSquadSize: 9, requiredGoalkeepers: 10 })).toThrow();
  });
  it("rejects wrong types, arbitrary keys and invalid field placement", () => {
    for (const values of [{ shirtNumber: "7" }, { shirtNumber: -1 }, { shirtNumber: 2.5 }, { shirtNumber: 1000 }, { positions: ["unknown"] }, { positions: ["goalkeeper", "goalkeeper"] }, { suspendedUntil: "2026-12-31" }]) expect(() => validate("teamMembership", values)).toThrow();
    expect(() => validate("team", { shirtNumber: 7 })).toThrow();
    expect(() => validate("activity", { gameFormat: "6v6" })).toThrow();
    expect(validate("teamMembership", { shirtNumber: 7, positions: ["defender", "midfielder"] })).toEqual({ shirtNumber: 7, positions: ["defender", "midfielder"] });
  });
  it("allows match-specific values without mutating membership data", () => {
    const member = { shirtNumber: 7, positions: ["defender"] };
    validate("teamMembership", member);
    expect(validate("activityParticipation", { shirtNumber: 12, position: "goalkeeper", captain: true })).toEqual({ shirtNumber: 12, position: "goalkeeper", captain: true });
    expect(member).toEqual({ shirtNumber: 7, positions: ["defender"] });
  });
  it("exports serializable closed JSON schemas with matching UI fields", () => {
    const pkg = JSON.parse(JSON.stringify(getDisciplinePackage("football")));
    for (const [scope, ui] of Object.entries(pkg.ui) as [string, { fields: string[] }][]) {
      expect(pkg.schemas[scope].additionalProperties).toBe(false);
      for (const field of ui.fields) expect(pkg.schemas[scope].properties[field]).toBeDefined();
    }
    expect(pkg.schemas.team.properties.gameFormat.enum).toContain("7v7");
    expect(pkg.schemas.teamMembership.properties.shirtNumber.type).toBe("integer");
  });
});
