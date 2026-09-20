export type EntityId = string;

export type Organization = {
  id: EntityId;
  name: string;
  assistantName: string;
};

export type Team = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  season: string;
};

export type Member = {
  id: EntityId;
  organizationId: EntityId;
  displayName: string;
};

export type Activity = {
  id: EntityId;
  organizationId: EntityId;
  teamId: EntityId;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
};

export type InvitationResponse = "pending" | "accepted" | "declined" | "maybe";

export type Invitation = {
  id: EntityId;
  organizationId: EntityId;
  activityId: EntityId;
  memberId: EntityId;
  response: InvitationResponse;
  respondedAt?: string;
};

export type InvitationSummary = Record<InvitationResponse, number>;

export function summarizeInvitations(invitations: Invitation[]): InvitationSummary {
  return invitations.reduce<InvitationSummary>(
    (summary, invitation) => {
      summary[invitation.response] += 1;
      return summary;
    },
    { pending: 0, accepted: 0, declined: 0, maybe: 0 },
  );
}

export function respondToInvitation(
  invitation: Invitation,
  response: Exclude<InvitationResponse, "pending">,
  respondedAt = new Date().toISOString(),
): Invitation {
  if (invitation.response !== "pending") {
    throw new Error("Kallelsen är redan besvarad");
  }

  return { ...invitation, response, respondedAt };
}
