import { describe, expect, it, vi } from "vitest";
import { footballPackage } from "@/disciplines/football/definition";
import type { CapabilityContext } from "../../../supabase/functions/_shared/capability-types";
import { evaluateActivitySignals, processCapabilitySignals } from "../../../supabase/functions/_shared/capability-signals";

const context: CapabilityContext = {
  activityId: "match", activityGeneration: 0, teamId: "team", organizationId: "club",
  disciplineKey: "football", currentDisciplineKey: "football", disciplineVersion: "1.0.0",
  definition: footballPackage.capabilities[0], values: { targetTeamSize: 9 },
  evaluatedAt: "2026-10-08T12:00:00Z", startsAt: "2026-10-10T12:00:00Z", responseDueAt: "2026-10-09T12:00:00Z",
  title: "Match", status: "published", sourceKind: "manual", activityTypeSlug: "match-tavling", category: "competition",
  acceptedPlayers: 6, pendingPlayers: 4, invitedPlayers: 10, completedCheckpoints: [72, 24],
};
const evaluate = (overrides: Partial<CapabilityContext> = {}) => evaluateActivitySignals({ activityId: "match", revision: 7, contexts: [{ ...context, ...overrides }] });

describe("capability signals", () => {
  it("creates an actionable signal despite disabled/default notifications and completed checkpoints", () => {
    expect(evaluate()).toMatchObject({ activityId: "match", revision: 7, signals: [{
      disciplineKey: "football", capabilityId: "targetTeamSize", type: "team_size_shortage", severity: "info",
      facts: { acceptedPlayers: 6, targetTeamSize: 9, pendingPlayers: 4 },
      actions: [{ id: "remind-unanswered" }, { id: "invite-more-players" }],
    }] });
  });
  it("keeps the problem active after a reminder, with a one-hour action cooldown", () => {
    const signal = evaluate({ lastReminderAt: "2026-10-08T11:01:00Z" }).signals[0];
    expect(signal.actions.map(action => action.id)).toEqual(["invite-more-players"]);
    expect(evaluate({ lastReminderAt: "2026-10-08T11:00:00Z" }).signals[0].actions[0].id).toBe("remind-unanswered");
  });
  it("raises urgency near start and adapts actions after the deadline", () => {
    const signal = evaluate({ startsAt: "2026-10-09T12:00:00Z", responseDueAt: context.evaluatedAt }).signals[0];
    expect(signal.severity).toBe("warning");
    expect(signal.actions.map(action => action.id)).toEqual(["invite-more-players"]);
  });
  it.each([{ acceptedPlayers: 9 }, { values: {} }, { invitedPlayers: 0 }, { sourceKind: "imported" },
    { status: "cancelled" }, { startsAt: context.evaluatedAt }, { activityTypeSlug: "traning" }, { currentDisciplineKey: "swimming" }])(
    "clears ineligible or solved signals: %j", overrides => expect(evaluate(overrides).signals).toEqual([]),
  );
  it("does not interpret missing runtime code as a solved problem", () => {
    expect(() => evaluate({ disciplineVersion: "unknown" })).toThrow("Unsupported signal capability");
    expect(evaluateActivitySignals({ activityId: "match", revision: 9, contexts: [] }).signals).toEqual([]);
  });
  it("persists empty decisions too, continues after empty signal pages, and bounds work", async () => {
    const rpc = vi.fn(async (name: string) => name === "claim_signal_contexts"
      ? { data: [{ activityId: "match", revision: 7, contexts: [{ ...context, acceptedPlayers: 9 }] }], error: null }
      : { data: 1, error: null });
    expect(await processCapabilitySignals({ rpc })).toEqual({ processed: 5 });
    expect(rpc).toHaveBeenCalledWith("apply_signal_evaluations", { evaluations: [{ activityId: "match", revision: 7, keepEvaluating: true, signals: [] }] });
    expect(rpc).toHaveBeenCalledTimes(10);
  });
  it("propagates persistence failure so claimed work can retry", async () => {
    const rpc = vi.fn(async (name: string) => name === "claim_signal_contexts"
      ? { data: [{ activityId: "match", revision: 7, contexts: [context] }], error: null }
      : { data: null, error: new Error("unavailable") });
    await expect(processCapabilitySignals({ rpc })).rejects.toThrow("Could not persist signals");
  });
});
