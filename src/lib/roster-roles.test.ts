import { describe, expect, it } from "vitest";
import {
  primaryRosterRole,
  rosterRoleLabel,
  rosterSections,
} from "./roster-roles";

describe("roster role sections", () => {
  const people = [
    { id: "volunteer", roles: ["volunteer"] },
    { id: "player", roles: ["participant"] },
    { id: "leader", roles: ["leader"] },
    { id: "other", roles: ["funktionär"] },
  ];
  it("lists leaders, players, and then other roles that occur in the roster", () => {
    expect(rosterSections(people).map((section) => section.label)).toEqual([
      "Ledare",
      "Spelare",
      "Funktionär",
      "Volontärer",
    ]);
  });
  it("does not show empty sections when only volunteers match a filter", () => {
    expect(rosterSections([people[0]]).map((section) => section.role)).toEqual([
      "volunteer",
    ]);
    expect(rosterSections([])).toEqual([]);
  });
  it("shows a person in all their roles in the roster, but once in a group selector", () => {
    const member = {
      id: "both",
      roles: ["volunteer", "participant", "leader"],
    };
    expect(rosterSections([member]).map((section) => section.role)).toEqual([
      "leader",
      "participant",
      "volunteer",
    ]);
    expect(rosterSections([member], true)).toEqual([
      { role: "leader", label: "Ledare", people: [member] },
    ]);
    expect(primaryRosterRole(["volunteer", "participant"])).toBe("participant");
  });
  it("labels volunteers correctly and preserves additional role names", () => {
    expect(rosterRoleLabel("volunteer")).toBe("Volontär");
    expect(rosterRoleLabel("volunteer", true)).toBe("Volontärer");
    expect(rosterRoleLabel("materialansvarig")).toBe("Materialansvarig");
  });
});
