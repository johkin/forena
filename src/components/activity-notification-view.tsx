"use client";
import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import { ActivityDetailModal } from "./activity-detail-modal";
import type { Activity, Organization, Team } from "@/domain/club";

export function ActivityNotificationView({ activity, organization, team, accountEmail }: { activity: Activity; organization: Organization; team: Team; accountEmail?: string }) {
  const router = useRouter();
  const home = `/o/${organization.slug}/t/${team.slug}`;
  return <AppShell homeHref={home} accountEmail={accountEmail} organization={organization} team={team} logoutDestination={home}><main className="auth-page"><a href={home}>Till lagets översikt</a></main><ActivityDetailModal activity={activity} organization={organization} team={team} canManageActivity={false} canManageInvitations={false} canManageAttendance={false} rosterMembers={[]} onClose={() => router.replace(home)} onEdit={() => {}} /></AppShell>;
}
