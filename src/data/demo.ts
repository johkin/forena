import type { Activity, Invitation, Member, Organization, Section, Team, Workspace } from "@/domain/club";

export const organization: Organization = {
  id: "ursvik-ik",
  slug: "ursvik-ik",
  name: "Ursvik IK",
  assistantName: "Urre",
};

export const section: Section = {
  id: "football",
  organizationId: organization.id,
  slug: "fotboll",
  name: "Fotboll",
};

export const team: Team = {
  id: "f2016",
  organizationId: organization.id,
  sectionId: section.id,
  slug: "f2016",
  name: "F2016",
  season: "2026/2027",
};

export const workspaces: Workspace[] = [
  {
    id: organization.id,
    kind: "organization",
    name: organization.name,
    description: "Föreningsnivå",
    href: `/o/${organization.slug}`,
    active: false,
  },
  {
    id: team.id,
    kind: "team",
    name: team.name,
    description: "Mitt lag",
    href: `/o/${organization.slug}/t/${team.slug}`,
    active: true,
  },
];

export const activity: Activity = {
  id: "training-2026-09-24",
  organizationId: organization.id,
  teamId: team.id,
  title: "Utomhusträning",
  startsAt: "2026-09-24T16:30:00.000Z",
  endsAt: "2026-09-24T18:00:00.000Z",
  location: "Ursviks IP · Plan 2",
};

export const members: Member[] = [
  { id: "elsa", organizationId: organization.id, displayName: "Elsa" },
  { id: "tilda", organizationId: organization.id, displayName: "Tilda" },
  { id: "amal", organizationId: organization.id, displayName: "Amal" },
  { id: "nora", organizationId: organization.id, displayName: "Nora" },
  { id: "pavit", organizationId: organization.id, displayName: "Pavit" },
];

export const invitations: Invitation[] = members.map((member, index) => ({
  id: `invitation-${member.id}`,
  organizationId: organization.id,
  activityId: activity.id,
  memberId: member.id,
  response: index < 2 ? "accepted" : index === 2 ? "declined" : "pending",
}));
