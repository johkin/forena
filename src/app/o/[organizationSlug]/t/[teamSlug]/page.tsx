import { notFound, redirect } from "next/navigation";
import { ClubDashboard } from "@/components/club-dashboard";
import { getTeamDashboard } from "@/data/team-dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
};

export default async function TeamWorkspacePage({ params }: Props) {
  const { organizationSlug, teamSlug } = await params;
  const databaseConfigured = isSupabaseConfigured();

  if (databaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect("/login");
    }
  }

  const data = await getTeamDashboard(organizationSlug, teamSlug);

  if (!data && databaseConfigured) {
    redirect("/setup");
  }

  if (!data) notFound();

  return (
    <ClubDashboard
      activity={data.activity}
      initialInvitations={data.invitations}
      members={data.members}
      rosterMembers={data.rosterMembers}
      upcomingActivities={data.upcomingActivities}
      organization={data.organization}
      sections={data.sections}
      source={data.source}
      team={data.team}
      tasks={data.tasks}
      initialFamilyActivities={data.familyActivities}
      canManageTeam={data.canManageTeam}
      accountEmail={data.accountEmail}
      respondablePersonIds={data.respondablePersonIds}
      workspaces={data.workspaces}
    />
  );
}
