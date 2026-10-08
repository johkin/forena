import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { targetTeamSize } from "./capabilities";
import { footballPackage, footballSchemas } from "@/disciplines/football/definition";
import { disciplineCapabilityProfiles, teamSizeNotificationContent, evaluateDisciplineCapability, targetTeamSizeImplementation, collectCapabilityNotifications, type CapabilityContext } from "../../../supabase/functions/_shared/discipline-capabilities";

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

describe("targetTeamSize runtime", () => {
  const context: CapabilityContext = {
    activityId: "activity", teamId: "team", organizationId: "club", disciplineKey: "football",
    disciplineVersion: "1.0.0", currentDisciplineKey: "football", definition: footballPackage.capabilities[0],
    values: { targetTeamSize: 10 }, evaluatedAt: "2026-10-08T12:00:00Z", title: "Match",
    startsAt: "2026-10-10T12:00:00Z", responseDueAt: "2026-10-09T12:00:00Z",
    status: "published", sourceKind: "manual", activityTypeSlug: "match-tavling", category: "competition",
    acceptedPlayers: 6, pendingPlayers: 5, invitedPlayers: 11, completedCheckpoints: [],
  };
  it("owns shortage evaluation and a complete frozen message", () => {
    const result = evaluateDisciplineCapability(context)!;
    expect(result.beforeStartHours).toBe(72);
    expect(result.payload).toMatchObject({ acceptedPlayers: 6, pendingPlayers: 5, targetTeamSize: 10 });
    expect(result.message).toMatchObject({ url: "/activities/activity", tag: "team_size_shortage:activity" });
    expect(result.message.text).toContain("saknas 4");
    expect(result.message.text).toContain("påminna");
  });
  it.each([
    { status: "cancelled" }, { status: "draft" }, { sourceKind: "imported" },
    { activityTypeSlug: "traning" }, { category: "training" }, { currentDisciplineKey: "swimming" },
    { disciplineKey: "unknown" }, { disciplineVersion: "2.0.0" }, { invitedPlayers: 0 },
    { acceptedPlayers: 10 }, { acceptedPlayers: 11 }, { values: {} },
    { values: { targetTeamSize: 3.5 } }, { values: { targetTeamSize: "10" } },
    { values: { targetTeamSize: 0 } }, { values: { targetTeamSize: 101 } },
    { startsAt: "2026-10-08T12:00:00Z" }, { startsAt: "2026-10-08T11:00:00Z" },
    { startsAt: "2026-10-12T12:00:00Z" }, { startsAt: "invalid" },
  ])("rejects ineligible context %j", overrides => {
    expect(evaluateDisciplineCapability({ ...context, ...overrides })).toBeNull();
  });
  it("uses the saved closest checkpoint and never replays an older one", () => {
    const late = { ...context, startsAt: "2026-10-09T08:00:00Z" };
    expect(evaluateDisciplineCapability(late)?.beforeStartHours).toBe(24);
    expect(evaluateDisciplineCapability({ ...late, completedCheckpoints: [24] })).toBeNull();
    expect(evaluateDisciplineCapability({ ...late, completedCheckpoints: [72] })?.beforeStartHours).toBe(24);
    const custom = { ...context, definition: targetTeamSize({ activityTypeSlugs: ["match-tavling"], categories: ["competition"], beforeStartHours: [48] }) };
    expect(evaluateDisciplineCapability(custom)?.beforeStartHours).toBe(48);
    expect(evaluateDisciplineCapability({ ...custom, startsAt: "2026-10-10T12:00:00.001Z" })).toBeNull();
  });
  it("allows an earlier full team to develop a shortage before the next checkpoint", () => {
    expect(evaluateDisciplineCapability({ ...context, acceptedPlayers: 10 })).toBeNull();
    expect(evaluateDisciplineCapability({ ...context, acceptedPlayers: 9 })?.beforeStartHours).toBe(72);
  });
  it("adapts the proposed action at the deadline", () => {
    for (const overrides of [{ responseDueAt: context.evaluatedAt }, { pendingPlayers: 0 }]) {
      expect(evaluateDisciplineCapability({ ...context, ...overrides })!.message.text).not.toContain("påminna");
    }
  });
  it("can evaluate another discipline's binding with the same implementation", () => {
    const other = { ...context, disciplineKey: "floorball", currentDisciplineKey: "floorball", activityTypeSlug: "floorball-match",
      definition: targetTeamSize({ activityTypeSlugs: ["floorball-match"], categories: ["competition"] }) };
    expect(targetTeamSizeImplementation.evaluate(other)?.payload.targetTeamSize).toBe(10);
    expect(evaluateDisciplineCapability(other)).toBeNull(); // Not registered as a package yet.
  });
  it("paginates past a non-notifying page and preserves its cursor", async () => {
    const calls: unknown[] = [];
    const result = await collectCapabilityNotifications(async (id, capability) => {
      calls.push([id, capability]);
      if (id === null) return [{ ...context, activityId: "a", acceptedPlayers: 10 }];
      if (id === "a") return [{ ...context, activityId: "b" }];
      return [];
    });
    expect(result.map(item => item.activityId)).toEqual(["b"]);
    expect(calls).toEqual([[null, ""], ["a", "targetTeamSize"], ["b", "targetTeamSize"]]);
  });
  it("fails rather than retrying a broken cursor indefinitely", async () => {
    await expect(collectCapabilityNotifications(async () => [context])).rejects.toThrow("cursor did not advance");
  });
});

it("propagates a later context-read failure without returning partial decisions", async () => {
  let calls = 0;
  await expect(collectCapabilityNotifications(async () => {
    calls++;
    if (calls === 1) return [{
      activityId: "a", teamId: "team", organizationId: "club", disciplineKey: "football", disciplineVersion: "1.0.0",
      currentDisciplineKey: "football", definition: footballPackage.capabilities[0], values: { targetTeamSize: 9 },
      evaluatedAt: "2026-10-08T12:00:00Z", startsAt: "2026-10-09T12:00:00Z", responseDueAt: null,
      title: "Match", status: "published", sourceKind: "manual", activityTypeSlug: "match-tavling", category: "competition",
      acceptedPlayers: 4, pendingPlayers: 5, invitedPlayers: 9, completedCheckpoints: [],
    }];
    throw new Error("read failed");
  })).rejects.toThrow("read failed");
});
