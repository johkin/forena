"use client";
import { useRouter } from "next/navigation";
import { AppHeader } from "./app-header";
import { ActivityDetailModal } from "./activity-detail-modal";
import type { Activity, Organization, Team } from "@/domain/club";

export function ActivityNotificationView({ activity, organization, team, accountEmail }: { activity: Activity; organization: Organization; team: Team; accountEmail?: string }) {
  const router = useRouter();
  const home = `/o/${organization.slug}/t/${team.slug}`;
  return <><AppHeader homeHref={home} accountEmail={accountEmail} /><main className="auth-page"><a href={home}>Till lagets översikt</a></main><ActivityDetailModal activity={activity} organization={organization} team={team} canManageActivity={false} canManageInvitations={false} canManageAttendance={false} rosterMembers={[]} onClose={() => router.replace(home)} onEdit={() => {}} /></>;
}
