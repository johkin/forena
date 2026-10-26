import { expect, it } from "vitest";
import type { Activity, Invitation } from "../domain/club";
import { needsInvitationResponse } from "./pending-invitations";

const referenceTime = "2026-10-26T12:00:00Z";
const activity: Activity = {
  id: "training", organizationId: "club", teamId: "team", title: "Träning", location: "Örvallen",
  startsAt: "2026-10-26T16:00:00Z", endsAt: "2026-10-26T17:00:00Z",
  responseDueAt: "2026-10-26T10:00:00Z", status: "published",
};
const invitation: Pick<Invitation, "response"> = { response: "pending" };

it("keeps an unanswered invitation after its response deadline", () => {
  expect(needsInvitationResponse({ activity, invitation }, referenceTime)).toBe(true);
});

it("keeps an unanswered invitation during an ongoing activity", () => {
  expect(needsInvitationResponse({ activity, invitation }, activity.startsAt)).toBe(true);
});

it("stops requiring an answer at the activity's end", () => {
  expect(needsInvitationResponse({ activity, invitation }, activity.endsAt)).toBe(false);
});

it("excludes cancelled activities, answered invitations and missing invitations", () => {
  expect(needsInvitationResponse({ activity: { ...activity, status: "cancelled" }, invitation }, referenceTime)).toBe(false);
  for (const response of ["accepted", "declined"] as const) {
    expect(needsInvitationResponse({ activity, invitation: { response } }, referenceTime)).toBe(false);
  }
  expect(needsInvitationResponse({ activity }, referenceTime)).toBe(false);
});
