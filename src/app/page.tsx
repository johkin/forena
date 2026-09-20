import { ClubDashboard } from "@/components/club-dashboard";
import { activity, invitations, members, organization, team } from "@/data/demo";

export default function Home() {
  return (
    <ClubDashboard
      activity={activity}
      initialInvitations={invitations}
      members={members}
      organization={organization}
      team={team}
    />
  );
}
