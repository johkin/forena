import type { Activity, Invitation } from "../domain/club";

/** A response deadline does not close replies; cancellation or the activity's end does. */
export function needsInvitationResponse(item: {
  activity: Pick<Activity, "status" | "endsAt">;
  invitation?: Pick<Invitation, "response">;
}, referenceTime: string): boolean {
  return item.invitation?.response === "pending"
    && item.activity.status !== "cancelled"
    && Date.parse(item.activity.endsAt) > Date.parse(referenceTime);
}
