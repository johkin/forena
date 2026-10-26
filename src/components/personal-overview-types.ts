import type { Activity, Invitation } from "../domain/club";

/** Shared presentation contract; it does not depend on database/provider models. */
export type OverviewPersonItem = {
  member: { id: string; displayName: string };
  invitation?: Pick<Invitation, "id" | "response">;
  hasDutyAssignment?: boolean;
};
export type OverviewItem = OverviewPersonItem & {
  activity: Pick<Activity, "id" | "title" | "startsAt" | "endsAt" | "location" | "gatheringAt" | "status" | "responseDueAt">;
  activityOnly?: boolean;
  canManageActivity?: boolean;
  team: { name: string };
  organization?: { name: string; timeZone?: string };
};
export type OverviewAnswered = (invitationId: string, response: "accepted" | "declined") => void;

export type OverviewRespond = (invitationId:string,response:"accepted"|"declined")=>Promise<boolean>;
