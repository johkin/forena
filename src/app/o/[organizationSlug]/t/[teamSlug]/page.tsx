import { notFound } from "next/navigation";
import { ClubDashboard } from "@/components/club-dashboard";
import { getTeamDashboard } from "@/data/team-dashboard";

type Props = {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
};

export default async function TeamWorkspacePage({ params }: Props) {
  const { organizationSlug, teamSlug } = await params;
  const data = await getTeamDashboard(organizationSlug, teamSlug);

  if (!data) notFound();

  return (
    <ClubDashboard
      activity={data.activity}
      initialInvitations={data.invitations}
      members={data.members}
      organization={data.organization}
      sections={data.sections}
      source={data.source}
      team={data.team}
      tasks={data.tasks}
      defaultView={data.defaultView}
      workspaces={data.workspaces}
    />
  );
}
