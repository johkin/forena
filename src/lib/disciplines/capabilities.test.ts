import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { targetTeamSize } from "./capabilities";
import { footballPackage, footballSchemas } from "./football";
import { disciplineCapabilityProfiles, teamSizeNotificationContent } from "../../../supabase/functions/_shared/discipline-capabilities";

describe("discipline capabilities", () => {
  it("shares the actual football definition with the worker", () => {
    expect(disciplineCapabilityProfiles[0]).toMatchObject({ key: footballPackage.key, version: footballPackage.version });
    expect(footballPackage.capabilities).toBe(disciplineCapabilityProfiles[0].capabilities);
    expect(JSON.parse(JSON.stringify(footballPackage.capabilities[0]))).toMatchObject({
      id: "targetTeamSize", appliesTo: { activityTypeSlugs: ["match-tavling"], categories: ["competition"] },
      notifications: { beforeStartHours: [72, 24], recipients: "teamInvitationManagers" },
    });
  });
  it("uses the same profile in the database regression tests", () => {
    const sql = readFileSync("supabase/tests/discipline_capability_notifications_test.sql", "utf8");
    const fixture = sql.match(/insert into capability_test_config values \('([^']+)'\)/)?.[1];
    expect(fixture).toBeDefined();
    expect(JSON.parse(fixture!)).toEqual(disciplineCapabilityProfiles);
  });
  it("keeps the database creation snapshot aligned with the code definition", () => {
    const sql = readFileSync("supabase/migrations/20261008062459_section_team_discipline_defaults.sql", "utf8");
    const definition = sql.match(/definition jsonb := '([^']+)'::jsonb/)?.[1];
    expect(definition).toBeDefined();
    expect(JSON.parse(definition!)).toEqual(footballPackage.capabilities[0]);
  });
  it("can be composed by another discipline without a team-sport base class", () => {
    const floorball = { key: "floorball", capabilities: [targetTeamSize({ activityTypeSlugs: ["floorball-match"], categories: ["competition"] })] };
    expect(floorball.capabilities[0].notifications).toEqual(footballPackage.capabilities[0].notifications);
    expect(floorball.capabilities[0].appliesTo.activityTypeSlugs).toEqual(["floorball-match"]);
  });
  it("defines the same optional field constraints for team and activity", () => {
    for (const schema of [footballSchemas.team, footballSchemas.activity]) {
      expect(schema.parse({})).toEqual({});
      expect(schema.parse({ targetTeamSize: 9 })).toEqual({ targetTeamSize: 9 });
      for (const value of [0, 101, 3.5, "9"]) expect(() => schema.parse({ targetTeamSize: value })).toThrow();
    }
  });
  it("validates checkpoint settings and copies caller-owned arrays", () => {
    for (const hours of [[], [0], [-1], [1.5], [721], [24, 24]]) {
      expect(() => targetTeamSize({ activityTypeSlugs: ["match"], categories: ["competition"], beforeStartHours: hours })).toThrow();
    }
    const hours = [24, 72];
    const result = targetTeamSize({ activityTypeSlugs: ["match"], categories: ["competition"], beforeStartHours: hours });
    hours.push(12);
    expect(result.notifications.beforeStartHours).toEqual([72, 24]);
  });
});

describe("team-size notification content", () => {
  it("suggests reminding unanswered players before the deadline", () => {
    const content = teamSizeNotificationContent({ title: "F2016 – match", acceptedPlayers: 6, targetTeamSize: 10, pendingPlayers: 5 });
    expect(content.text).toContain("6 av önskade 10");
    expect(content.text).toContain("saknas 4");
    expect(content.text).toContain("5 spelare har inte svarat");
    expect(content.text).toContain("påminna");
  });
  it("suggests inviting more after the deadline or when everyone answered", () => {
    for (const payload of [{ pendingPlayers: 0 }, { pendingPlayers: 5, responseDeadlinePassed: true }]) {
      const content = teamSizeNotificationContent({ acceptedPlayers: 6, targetTeamSize: 10, ...payload });
      expect(content.text).toContain("kalla fler");
      expect(content.text).not.toContain("påminna");
    }
  });
});
