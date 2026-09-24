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
    });
  });

  it("records a response with its optional comment", () => {
    expect(respondToInvitation(invitations[2], "declined", "  Sjuk  ", "2026-09-20T10:00:00Z")).toMatchObject({
      response: "declined",
      respondedAt: "2026-09-20T10:00:00Z",
      responseComment: "Sjuk",
    });
  });

  it("allows a response to be changed", () => {
    expect(respondToInvitation(invitations[0], "declined", undefined, "2026-09-21T10:00:00Z")).toMatchObject({
      response: "declined",
      respondedAt: "2026-09-21T10:00:00Z",
    });
  });

  it("clears time and comment when a response is removed", () => {
    const answered = { ...invitations[0], respondedAt: "2026-09-20T10:00:00Z", responseComment: "Kommer sent" };
    expect(respondToInvitation(answered, "pending")).toEqual({
      ...invitations[0],
      response: "pending",
      respondedAt: undefined,
      responseComment: undefined,
    });
  });
});
