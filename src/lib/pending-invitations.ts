import type { Activity, Invitation } from "../domain/club";

type ResponseContext = {
  activity: Pick<Activity, "status" | "endsAt" | "responseDueAt">;
  canManageActivity?: boolean;
};

/** Management permission bypasses the deadline, never cancellation or the activity's end. */
export function invitationResponseOpen(item: ResponseContext, referenceTime: string): boolean {
  const now = Date.parse(referenceTime);
  return item.activity.status !== "cancelled"
    && Date.parse(item.activity.endsAt) > now
    && (!item.activity.responseDueAt || Date.parse(item.activity.responseDueAt) > now || item.canManageActivity === true);
}

export function needsInvitationResponse(item: ResponseContext & {
  invitation?: Pick<Invitation, "response">;
}, referenceTime: string): boolean {
  return item.invitation?.response === "pending"
    && invitationResponseOpen(item, referenceTime);
}
