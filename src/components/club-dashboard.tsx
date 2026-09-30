"use client";

import { useMemo, useState } from "react";
import { TeamAssistantCard } from "@/components/team-assistant-card";
import { ActivityEditorModal } from "@/components/activity-editor-modal";
import { TeamCalendar } from "@/components/team-calendar";
import { PersonalOverview } from "@/components/personal-overview";
import { TeamOverview } from "@/components/team-overview";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import { AttendanceModal } from "@/components/attendance-modal";
import { TeamMenu } from "@/components/team-menu";
import { AppHeader } from "@/components/app-header";
import type { ActivityDraft } from "@/lib/ai/activity-draft";
import {
  respondToInvitation, summarizeInvitations, type Activity, type DashboardView, type Invitation,
  type FamilyActivity, type InvitationResponse, type Member, type Organization, type Section, type Team, type TeamPermission, type TeamTask, type Workspace,
} from "@/domain/club";

type Props = {
  organization: Organization; sections: Section[]; team: Team; activity: Activity; members: Member[]; rosterMembers: Member[]; upcomingActivities: Activity[];
  initialInvitations: Invitation[]; initialFamilyActivities: FamilyActivity[]; workspaces: Workspace[]; tasks: TeamTask[];
  teamPermissions: TeamPermission[];
  canAdministerOrganization: boolean;
  accountEmail?: string;
  respondablePersonIds: string[];
  referenceTime: string;
  missingAttendanceActivities: Activity[];
  source: "database" | "demo";
};

const responseLabels = { accepted: "Kommer", declined: "Kan inte", pending: "Ej svarat" } as const;

export function ClubDashboard({ organization, sections, team, activity, members, rosterMembers, upcomingActivities, initialInvitations, initialFamilyActivities, workspaces, tasks, teamPermissions, canAdministerOrganization, accountEmail, respondablePersonIds, referenceTime, missingAttendanceActivities, source }: Props) {
  const currentActivity = activity;
  const canViewTeam = teamPermissions.includes("team.view");
  const canManageActivities = teamPermissions.includes("activity.manage");
  const canManageInvitations = teamPermissions.includes("invitation.manage");
  const canManageAttendance = teamPermissions.includes("attendance.manage");
  const canManageRoster = teamPermissions.includes("roster.manage");
  const [invitations, setInvitations] = useState(initialInvitations);
  const view: DashboardView = canViewTeam ? "leader" : "family";
  const [familyActivities, setFamilyActivities] = useState(initialFamilyActivities);
  const [notice, setNotice] = useState<string>();
  const [activityEditorMode, setActivityEditorMode] = useState<"create" | "edit" | null>(null);
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>();
  const [activePage, setActivePage] = useState<"overview" | "calendar">("overview");
  const [selectedActivity, setSelectedActivity] = useState<Activity>();
  const [attendanceActivity, setAttendanceActivity] = useState<Activity>();
  const [pendingAttendance, setPendingAttendance] = useState(missingAttendanceActivities);
  const [editingActivity, setEditingActivity] = useState<Activity>();
  const [sendingReminder, setSendingReminder] = useState(false);
  const summary = useMemo(() => summarizeInvitations(invitations), [invitations]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const familyInvitation = invitations.find((item) => respondablePersonIds.includes(item.memberId));
  const familyMember = familyInvitation ? memberById.get(familyInvitation.memberId) : undefined;

  async function answerFamily(item: FamilyActivity, response: InvitationResponse, comment?: string) {
    if (!item.invitation) return;
    const updated = respondToInvitation(item.invitation, response, comment);
    if (source === "database") {
      const result = await fetch(`/api/invitations/${item.invitation.id}/respond`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ response, comment }) });
      if (!result.ok) { setNotice("Svaret kunde inte sparas. Kontrollera din behörighet och försök igen."); return; }
    }
    setFamilyActivities((current) => current.map((candidate) => candidate.invitation?.id === item.invitation?.id ? { ...candidate, invitation: updated } : candidate));
    setInvitations((current) => current.map((candidate) => candidate.id === item.invitation?.id ? updated : candidate));
    setNotice(response === "pending" ? `${item.member.displayName}s svar togs bort.` : `${item.member.displayName} är registrerad som ”${responseLabels[response]}”.`);
  }

  async function sendReminder(activity: Activity) {
    setSendingReminder(true);
    const response = await fetch(`/api/activities/${activity.id}/remind`, { method: "POST" });
    const result = await response.json();
    setSendingReminder(false);
    if (!response.ok) {
      setNotice(result.error ?? "Påminnelsen kunde inte köas.");
      return;
    }
    setNotice(result.queuedRecipients > 0
      ? `Påminnelsen köades till ${result.queuedRecipients} mottagare.`
      : "Det finns inga nåbara mottagare för de obesvarade kallelserna.");
  }

  return (
    <main>
      <AppHeader
        homeHref={`/o/${organization.slug}/t/${team.slug}`}
        navigation={<TeamMenu organizationSlug={organization.slug} teamSlug={team.slug} teamName={team.name} canManageRoster={canManageRoster} leaderView={view === "leader"} activeItem={activePage} onSelectView={setActivePage} navigationOnly />}
        accountEmail={accountEmail}
        organization={organization} team={team} workspaces={workspaces}
        logoutDestination={`/o/${organization.slug}/t/${team.slug}`}
        adminHref={canAdministerOrganization ? `/o/${organization.slug}/admin/roles` : undefined}
      />
      <div className="shell">
        <TeamMenu organizationSlug={organization.slug} teamSlug={team.slug} teamName={team.name} canManageRoster={canManageRoster} leaderView={view === "leader"} activeItem={activePage} onSelectView={setActivePage} hideTrigger />
        <section className="content" id={activePage}>
          <div className="welcome"><div><p className="eyebrow">{sections.length > 1 ? `${sections.find((item) => item.id === team.sectionId)?.name ?? "Sektion"} · ` : ""}{organization.name}</p><h1>{team.name}</h1><p>{activePage === "calendar" ? "Alla aktiviteter för laget." : view === "leader" ? "Det laget behöver från dig just nu." : `Det viktigaste för ${familyMember?.displayName ?? "spelaren"} just nu.`}</p></div>{view === "leader" && canManageActivities && <div className="welcome-actions"><button className="primary" onClick={() => { setActivityDraft(undefined); setActivityEditorMode("create"); }} type="button">+ Ny aktivitet</button></div>}</div>
          {notice && <div className="toast" role="status">✓ {notice}</div>}
          {source === "demo" && <div className="demo-notice">Demoläge</div>}

          {activePage === "calendar"
            ? <TeamCalendar activities={upcomingActivities} timeZone={organization.timeZone ?? "Europe/Stockholm"} onSelectActivity={setSelectedActivity} />
            : <>
                <div className="overview-layout">
                  <div className="overview-main">
                    <PersonalOverview
                      activities={familyActivities}
                      timeZone={organization.timeZone ?? "Europe/Stockholm"}
                      onAnswer={(item, response, comment) => void answerFamily(item, response, comment)}
                      onOpenActivity={(item) => setSelectedActivity(item.activity)}
                    />
                    {view === "leader" ? <TeamOverview
                      teamName={team.name}
                      activity={currentActivity}
                      summary={summary}
                      upcomingActivities={upcomingActivities}
                      tasks={tasks}
                      timeZone={organization.timeZone ?? "Europe/Stockholm"}
                      referenceTime={referenceTime}
                      reminderPending={sendingReminder}
                      onOpenActivity={setSelectedActivity}
                      onOpenAttendance={setAttendanceActivity}
                      onSendReminder={(item) => void sendReminder(item)}
                      canManageInvitations={canManageInvitations}
                      canManageAttendance={canManageAttendance}
                      missingAttendanceActivities={canManageAttendance ? pendingAttendance : []}
                    /> : null}
                  </div>
                  <aside className="overview-assistant">
                    <TeamAssistantCard
                      teamId={team.id}
                      teamName={team.name}
                      assistantName={organization.assistantName}
                      demo={source === "demo"}
                      canCreateActivity={canManageActivities}
                      onActivityDraft={(draft) => { setActivityDraft(draft); setEditingActivity(undefined); setActivityEditorMode("create"); }}
                    />
                  </aside>
                </div>
              </>}
        </section>
      </div>
      {activityEditorMode && canManageActivities ? <ActivityEditorModal mode={activityEditorMode} organization={organization} team={team} members={rosterMembers} activity={activityEditorMode === "edit" ? (editingActivity ?? currentActivity) : undefined} draft={activityEditorMode === "create" ? activityDraft : undefined} source={source} canManageInvitations={canManageInvitations} onClose={() => { setActivityEditorMode(null); setActivityDraft(undefined); }} onNotice={setNotice} /> : null}
      {selectedActivity ? <ActivityDetailModal activity={selectedActivity} organization={organization} team={team} canManageActivity={canManageActivities} canManageInvitations={canManageInvitations} canManageAttendance={canManageAttendance} rosterMembers={rosterMembers} onClose={() => setSelectedActivity(undefined)} onEdit={(item) => { setActivityDraft(undefined); setEditingActivity(item); setSelectedActivity(undefined); setActivityEditorMode("edit"); }} /> : null}
      {attendanceActivity && canManageAttendance ? <AttendanceModal activityId={attendanceActivity.id} onClose={() => setAttendanceActivity(undefined)} onSaved={() => setPendingAttendance((current) => current.filter((item) => item.id !== attendanceActivity.id))} /> : null}
    </main>
  );
}
