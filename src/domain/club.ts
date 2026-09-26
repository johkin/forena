export type EntityId = string;

export type Organization = {
  id: EntityId;
  slug: string;
  name: string;
  assistantName: string;
  timeZone?: string;
};

export type Section = {
  id: EntityId;
  organizationId: EntityId;
  slug: string;
  name: string;
};

export type Team = {
  id: EntityId;
  organizationId: EntityId;
  sectionId: EntityId;
  slug: string;
  name: string;
  season: string;
};

export type Workspace = {
  id: EntityId;
  kind: "organization" | "section" | "team";
  name: string;
  description: string;
  href: string;
  active: boolean;
};

export type Member = {
  id: EntityId;
  organizationId: EntityId;
  displayName: string;
  teamRole?: "participant" | "leader" | "volunteer";
  guardianName?: string;
  guardianPhone?: string;
};

export type Activity = {
  id: EntityId;
  organizationId: EntityId;
  teamId: EntityId;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  gatheringAt?: string;
  seriesId?: string;
  status?: "draft" | "published" | "cancelled";
  invitationSendAt?: string;
  responseDueAt?: string;
  reminderSendAt?: string;
};

export type DashboardView = "leader" | "family";

export type FamilyActivity = {
  member: Member;
  team: Team;
  activity: Activity;
  invitation?: Invitation;
};

export type TeamTask = {
  id: EntityId;
  organizationId: EntityId;
  teamId: EntityId;
  title: string;
  description: string;
  dueAt: string;
  status: "open" | "completed";
  createdByLabel: string;
};

export type InvitationResponse = "pending" | "accepted" | "declined";

export type Invitation = {
  id: EntityId;
  organizationId: EntityId;
  activityId: EntityId;
  memberId: EntityId;
  response: InvitationResponse;
  respondedAt?: string;
  responseComment?: string;
};

export type InvitationSummary = Record<InvitationResponse, number>;

export function summarizeInvitations(invitations: Invitation[]): InvitationSummary {
  return invitations.reduce<InvitationSummary>(
    (summary, invitation) => {
      summary[invitation.response] += 1;
      return summary;
    },
    { pending: 0, accepted: 0, declined: 0 },
  );
}

export function respondToInvitation(
  invitation: Invitation,
  response: InvitationResponse,
  responseComment?: string,
  respondedAt = new Date().toISOString(),
): Invitation {
  if (response === "pending") {
    return { ...invitation, response, respondedAt: undefined, responseComment: undefined };
  }
  const comment = responseComment?.trim();
  return { ...invitation, response, respondedAt, responseComment: comment || undefined };
}
