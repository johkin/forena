import { describe, expect, it } from "vitest";
import { respondToInvitation, summarizeInvitations, type Invitation } from "./club";

const invitations: Invitation[] = [
  { id: "1", organizationId: "org", activityId: "activity", memberId: "a", response: "accepted" },
  { id: "2", organizationId: "org", activityId: "activity", memberId: "b", response: "accepted" },
  { id: "3", organizationId: "org", activityId: "activity", memberId: "c", response: "pending" },
];

describe("invitations", () => {
  it("summarizes responses", () => {
    expect(summarizeInvitations(invitations)).toEqual({
      pending: 1,
      accepted: 2,
      declined: 0,
      maybe: 0,
    });
  });

  it("records the first response", () => {
    expect(respondToInvitation(invitations[2], "declined", "2026-09-20T10:00:00Z")).toMatchObject({
      response: "declined",
      respondedAt: "2026-09-20T10:00:00Z",
    });
  });

  it("does not silently overwrite a response", () => {
    expect(() => respondToInvitation(invitations[0], "declined")).toThrow("redan besvarad");
  });
});
