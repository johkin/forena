import { describe, expect, it } from "vitest";
import { getDisciplinePackage, packageForSection, validateDisciplineData } from "@/lib/disciplines";

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
    expect(validate("team", { gameFormat: "7v7", targetTeamSize: 9 })).toEqual({ gameFormat: "7v7", targetTeamSize: 9 });
    expect(() => validate("team", { gameFormat: "7v7", targetTeamSize: 6 })).toThrow();
    expect(() => validate("team", { targetTeamSize: 9, requiredGoalkeepers: 10 })).toThrow();
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
    expect(validate("activityParticipation", { shirtNumber: 12, position: "goalkeeper" })).toEqual({ shirtNumber: 12, position: "goalkeeper" });
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

import { captainReference, footballFieldsForActivity } from "./definition";
import { validatePlayerReference, type PlayerReferenceContext } from "@/lib/disciplines/field-rules";
const tilda = "e3000000-0000-4000-8000-000000000001";
const other = "e3000000-0000-4000-8000-000000000002";
const match: PlayerReferenceContext = {
  activityTypeSlug: "match-tavling", activityCategory: "competition",
  source: "acceptedActivityPlayers", eligiblePersonIds: [tilda],
};
const captain = (input: unknown, context?: PlayerReferenceContext) => validateDisciplineData("football", "1.0.0", "activity", input, context);
describe("match captain player reference", () => {
  it("exports player selection sources and a UUID schema", () => {
    const schema = JSON.parse(JSON.stringify(getDisciplinePackage("football"))).schemas.activity.properties.captainPersonId;
    expect(schema).toMatchObject({ type: "string", format: "uuid", "x-player-reference": {
      entity: "person", role: "player", defaultSource: "acceptedActivityPlayers",
      allowedSources: ["teamPlayers", "acceptedActivityPlayers"],
    } });
  });
  it("uses one captain on the activity and rejects the old participation flag", () => {
    expect(captain({ captainPersonId: tilda }, match)).toEqual({ captainPersonId: tilda });
    expect(() => validate("activityParticipation", { captain: true })).toThrow();
    expect(() => captain({ captainPersonId: [tilda, other] }, match)).toThrow();
    expect(() => captain({ captainPersonId: "Tilda" }, match)).toThrow();
  });
  it.each(["teamPlayers", "acceptedActivityPlayers"] as const)("accepts only verified candidates from %s", source => {
    expect(captain({ captainPersonId: tilda }, { ...match, source })).toEqual({ captainPersonId: tilda });
    expect(() => captain({ captainPersonId: other }, { ...match, source })).toThrow("valbara");
    expect(() => captain({ captainPersonId: tilda }, { ...match, source, eligiblePersonIds: [] })).toThrow("valbara");
  });
  it("requires match context and rejects training, meetings and other competitions", () => {
    expect(() => captain({ captainPersonId: tilda })).toThrow();
    for (const context of [
      { ...match, activityTypeSlug: "traning", activityCategory: "session" },
      { ...match, activityTypeSlug: "mote", activityCategory: "meeting" },
      { ...match, activityTypeSlug: "cup", activityCategory: "competition" },
      { ...match, activityCategory: "session" },
    ]) {
      expect(() => captain({ captainPersonId: tilda }, context)).toThrow("matchaktiviteter");
      expect(footballFieldsForActivity(context)).not.toContain("captainPersonId");
    }
    expect(footballFieldsForActivity(match)).toContain("captainPersonId");
    expect(captain({})).toEqual({});
  });
  it("validates the selection source even for untyped callers", () => {
    expect(() => validatePlayerReference(tilda, captainReference, { ...match, source: "allClubMembers" } as unknown as PlayerReferenceContext)).toThrow("källa");
  });
  it("uses the renamed team-size field in validation and JSON Schema", () => {
    expect(validate("team", { targetTeamSize: 9 })).toEqual({ targetTeamSize: 9 });
    expect(() => validate("team", { targetSquadSize: 9 })).toThrow();
    const properties = getDisciplinePackage("football")!.schemas.team.properties!;
    expect(properties.targetTeamSize).toBeDefined();
    expect(properties.targetSquadSize).toBeUndefined();
  });
});
