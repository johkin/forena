import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { addActivityParticipants, participantsSchema, dutyAssignmentSchema } from "./activity-participation";
const id = "a5000000-0000-4000-8000-000000000001";
describe("activity participation commands", () => {
  it("rejects duplicate people even with different roles", () => {
    expect(participantsSchema.safeParse({ participants: [{ personId: id, role: "participant" }, { personId: id, role: "leader" }] }).success).toBe(false);
  });
  it.each(["admin", "", "team_admin"])("rejects permission-like or missing role %s", role => {
    expect(participantsSchema.safeParse({ participants: [{ personId: id, role }] }).success).toBe(false);
  });
  it("does not mark an unassigned duty complete", () => {
    expect(dutyAssignmentSchema.safeParse({ personId: id, dutyTypeId: null, completed: true }).success).toBe(false);
  });
  it("uses one atomic command and keeps registration explicit", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 0, error: null });
    await addActivityParticipants({ rpc } as unknown as SupabaseClient<Database>, "activity", { participants: [{ personId: id, role: "participant" }], registerAccepted: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("add_activity_participants", { target_activity_id: "activity", participants: [{ personId: id, role: "participant" }], register_accepted: true });
  });
});
