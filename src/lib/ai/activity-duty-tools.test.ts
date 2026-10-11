import { describe, expect, it, vi } from "vitest";
import type { AssistantDependencies } from "./team-assistant-types";
import { createActivityDutyTools } from "./activity-duty-tools";
import { activityDutyBatchSchema } from "./activity-duty-draft";

const id = "a6000000-0000-0000-0000-000000000001";
const target = { id, title: "Hemmamatch", startsAt: "2030-10-10T10:00:00Z", endsAt: "2030-10-10T11:00:00Z", category: "competition", sourceKind: "imported", seriesId: null, seriesTitle: null, externalSource: "league", venue: "home" };
const command = { activityIds: [id], name: "Sekretariat", places: 2, instructions: "Matchklocka och protokoll" };
const options = { toolCallId: "test", messages: [], context: {} };
function setup() {
  const rpc = vi.fn().mockResolvedValueOnce({ data: [target], error: null }).mockResolvedValueOnce({ data: { activities: [{ ...target, exists: false }], fingerprint: "a".repeat(32) }, error: null });
  const onDraft = vi.fn();
  const tools = createActivityDutyTools({ supabase: { rpc } as unknown as AssistantDependencies["supabase"], teamId: "team", timeZone: "Europe/Stockholm", onDraft });
  return { tools, rpc, onDraft };
}
describe("activity duty proposals", () => {
  it("cannot propose before an authenticated read and never writes", async () => {
    const { tools, rpc, onDraft } = setup();
    expect(await tools.proposeActivityDuties.execute!(command, options)).toHaveProperty("error");
    expect(rpc).not.toHaveBeenCalled(); expect(onDraft).not.toHaveBeenCalled();
  });
  it("reads beyond the five-activity context and proposes a separately confirmed snapshot", async () => {
    const { tools, rpc, onDraft } = setup();
    const list = await tools.listDutyActivities.execute!({ from: null, through: null }, options);
    expect(list).toHaveProperty("activities", [target]);
    expect(await tools.proposeActivityDuties.execute!(command, options)).toMatchObject({ proposed: true, requiresButtonConfirmation: true, createCount: 1 });
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ command, teamId: "team" }));
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["list_activity_duty_targets", "preview_activity_duty_batch"]);
  });
  it("rejects foreign or unlisted activity IDs", async () => {
    const { tools, rpc } = setup();
    await tools.listDutyActivities.execute!({ from: null, through: null }, options);
    expect(await tools.proposeActivityDuties.execute!({ ...command, activityIds: ["b6000000-0000-0000-0000-000000000001"] }, options)).toHaveProperty("error");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("reports unknown venue and does not turn read failures into empty results", async () => {
    const { tools, rpc } = setup();
    rpc.mockReset().mockResolvedValueOnce({ data: [{ ...target, venue: null }], error: null }).mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(await tools.listDutyActivities.execute!({ from: null, through: null }, options)).toHaveProperty("unknownMatchVenueCount", 1);
    expect(await tools.listDutyActivities.execute!({ from: null, through: null }, options)).toHaveProperty("error");
    expect(await tools.proposeActivityDuties.execute!(command, options)).toHaveProperty("error");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("rejects duplicates, unknown fields, excessive size and invalid capacity", () => {
    expect(activityDutyBatchSchema.safeParse({ ...command, activityIds: [id, id] }).success).toBe(false);
    expect(activityDutyBatchSchema.safeParse({ ...command, places: 0 }).success).toBe(false);
    expect(activityDutyBatchSchema.safeParse({ ...command, instructions: "x".repeat(2001) }).success).toBe(false);
    expect(activityDutyBatchSchema.safeParse({ ...command, assignEveryone: true }).success).toBe(false);
  });
});
