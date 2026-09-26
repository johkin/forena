"use client";

import { useMemo, useState } from "react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LogoutButton } from "@/components/logout-button";
import { NotificationSettings } from "@/components/notification-settings";
import { TeamAssistantCard } from "@/components/team-assistant-card";
import { ActivityEditorModal } from "@/components/activity-editor-modal";
import { TeamCalendar } from "@/components/team-calendar";
import { PersonalOverview } from "@/components/personal-overview";
import { TeamOverview } from "@/components/team-overview";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import { TeamMenu } from "@/components/team-menu";
import { ProfileButton } from "@/components/profile-button";
import {
  respondToInvitation, summarizeInvitations, type Activity, type DashboardView, type Invitation,
  type FamilyActivity, type InvitationResponse, type Member, type Organization, type Section, type Team, type TeamTask, type Workspace,
} from "@/domain/club";

type Props = {
  organization: Organization; sections: Section[]; team: Team; activity: Activity; members: Member[]; rosterMembers: Member[]; upcomingActivities: Activity[];
  initialInvitations: Invitation[]; initialFamilyActivities: FamilyActivity[]; workspaces: Workspace[]; tasks: TeamTask[];
  canManageTeam: boolean;
  accountEmail?: string;
  respondablePersonIds: string[];
  referenceTime: string;
  source: "database" | "demo";
};

const responseLabels = { accepted: "Kommer", declined: "Kan inte", pending: "Ej svarat" } as const;

export function ClubDashboard({ organization, sections, team, activity, members, rosterMembers, upcomingActivities, initialInvitations, initialFamilyActivities, workspaces, tasks, canManageTeam, accountEmail, respondablePersonIds, referenceTime, source }: Props) {
  const currentActivity = activity;
  const [invitations, setInvitations] = useState(initialInvitations);
  const view: DashboardView = canManageTeam ? "leader" : "family";
  const [familyActivities, setFamilyActivities] = useState(initialFamilyActivities);
  const [notice, setNotice] = useState<string>();
  const [activityEditorMode, setActivityEditorMode] = useState<"create" | "edit" | null>(null);
  const [activePage, setActivePage] = useState<"overview" | "calendar">("overview");
  const [selectedActivity, setSelectedActivity] = useState<Activity>();
  const [editingActivity, setEditingActivity] = useState<Activity>();
  const [showInvitationForm, setShowInvitationForm] = useState(false);
  const [savingInvitation, setSavingInvitation] = useState(false);
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

  async function inviteTeamMember(form: HTMLFormElement) {
    setSavingInvitation(true);
    const data = new FormData(form);
    const response = await fetch("/api/team-invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId: team.id,
        email: String(data.get("email")),
        role: "leader",
      }),
    });
    const result = await response.json();
    setSavingInvitation(false);
    if (!response.ok) {
      setNotice(result.error ?? "Inbjudan kunde inte skickas.");
      return;
    }
    form.reset();
    setShowInvitationForm(false);
    setNotice(`Inbjudan skickades till ${result.email}.`);
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-brand-row"><TeamMenu organizationSlug={organization.slug} teamSlug={team.slug} teamName={team.name} canManageTeam={canManageTeam} leaderView={view === "leader"} activeItem={activePage} onSelectView={setActivePage} /><a className="brand" href="#" aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></a></div>
        <div className="topbar-actions">
          {accountEmail ? <span className="account-identity" title={accountEmail}>Inloggad som <strong>{accountEmail}</strong></span> : null}
          {accountEmail ? <ProfileButton /> : null}
          {accountEmail ? <NotificationSettings /> : null}
          <WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} />
          <LogoutButton destination={`/o/${organization.slug}/t/${team.slug}`} />
        </div>
      </header>
      <div className="shell">
        <section className="content" id={activePage}>
          <div className="welcome"><div><p className="eyebrow">{sections.length > 1 ? `${sections.find((item) => item.id === team.sectionId)?.name ?? "Sektion"} · ` : ""}{organization.name}</p><h1>{team.name}</h1><p>{activePage === "calendar" ? "Alla aktiviteter för laget." : view === "leader" ? "Det laget behöver från dig just nu." : `Det viktigaste för ${familyMember?.displayName ?? "spelaren"} just nu.`}</p></div>{view === "leader" && canManageTeam && <div className="welcome-actions"><button className="secondary" onClick={() => setShowInvitationForm(true)} type="button">Bjud in ledare</button><button className="primary" onClick={() => setActivityEditorMode("create")} type="button">+ Ny aktivitet</button></div>}</div>
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
                      onSendReminder={(item) => void sendReminder(item)}
                    /> : null}
                  </div>
                  <aside className="overview-assistant">
                    <TeamAssistantCard teamId={team.id} teamName={team.name} assistantName={organization.assistantName} demo={source === "demo"} />
                  </aside>
                </div>
              </>}
        </section>
      </div>
      {activityEditorMode ? <ActivityEditorModal mode={activityEditorMode} organization={organization} team={team} members={rosterMembers} activity={activityEditorMode === "edit" ? (editingActivity ?? currentActivity) : undefined} source={source} onClose={() => setActivityEditorMode(null)} onNotice={setNotice} /> : null}
      {selectedActivity ? <ActivityDetailModal activity={selectedActivity} organization={organization} team={team} canEdit={canManageTeam} onClose={() => setSelectedActivity(undefined)} onEdit={(item) => { setEditingActivity(item); setSelectedActivity(undefined); setActivityEditorMode("edit"); }} /> : null}
      {showInvitationForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInvitationForm(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="invitation-form-title"><div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="invitation-form-title">Bjud in ledare</h2></div><button className="icon-button" onClick={() => setShowInvitationForm(false)} aria-label="Stäng" type="button">✕</button></div><form onSubmit={(event) => { event.preventDefault(); void inviteTeamMember(event.currentTarget); }}><label>E-postadress<input name="email" type="email" required autoComplete="email" placeholder="namn@example.se" /></label><p className="form-help">Nya spelare och målsmän kommer in genom föreningens medlemsansökan. Den här länken ger en godkänd ledare åtkomst till laget.</p><div className="modal-actions"><button className="secondary" onClick={() => setShowInvitationForm(false)} type="button">Avbryt</button><button className="primary" disabled={savingInvitation} type="submit">{savingInvitation ? "Skickar…" : "Skicka inbjudan"}</button></div></form></section></div>}
    </main>
  );
}
