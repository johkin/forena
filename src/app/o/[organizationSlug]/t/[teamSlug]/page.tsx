import { notFound } from "next/navigation";
import { ClubDashboard } from "@/components/club-dashboard";
import { GeneralWorkspace } from "@/components/general-workspace";
import { getGeneralWorkspace } from "@/data/general-workspace";
import { getTeamDashboard } from "@/data/team-dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
  searchParams: Promise<{ view?: string }>;
};

export default async function TeamWorkspacePage({ params, searchParams }: Props) {
  const { organizationSlug, teamSlug } = await params;
  const initialPage = (await searchParams).view === "calendar" ? "calendar" : "overview";
  const databaseConfigured = isSupabaseConfigured();

  let signedIn = false;
  if (databaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  }

  const data = signedIn || !databaseConfigured ? await getTeamDashboard(organizationSlug, teamSlug) : null;

  if (!data && databaseConfigured) {
    const generalData = await getGeneralWorkspace(organizationSlug);
    const publicTeam = generalData?.teams.find((team) => team.slug === teamSlug);
    if (generalData && publicTeam) {
      return <GeneralWorkspace data={{ ...generalData, workspaces: generalData.workspaces.map((workspace) => ({ ...workspace, active: workspace.kind === "team" && workspace.id === publicTeam.id })) }} focusTeam={publicTeam} />;
    }
    notFound();
  }

  if (!data) notFound();

  return (
    <ClubDashboard
      initialPage={initialPage}
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
      signals={data.signals}
      initialFamilyActivities={data.familyActivities}
      teamPermissions={data.teamPermissions}
      canAdministerOrganization={data.canAdministerOrganization}
      accountEmail={data.accountEmail}
      respondablePersonIds={data.respondablePersonIds}
      referenceTime={data.referenceTime}
      missingAttendanceActivities={data.missingAttendanceActivities}
      workspaces={data.workspaces}
    />
  );
}
