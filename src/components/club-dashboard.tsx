"use client";

import { useMemo, useState } from "react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LogoutButton } from "@/components/logout-button";
import { TeamBriefingCard } from "@/components/team-briefing-card";
import { TeamAssistantCard } from "@/components/team-assistant-card";
import { ActivityEditorModal } from "@/components/activity-editor-modal";
import { TeamCalendar } from "@/components/team-calendar";
import { PriorityFeed } from "@/components/priority-feed";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import {
  respondToInvitation, summarizeInvitations, type Activity, type DashboardView, type Invitation,
  type FamilyActivity, type Member, type Organization, type Section, type Team, type TeamTask, type Workspace,
} from "@/domain/club";

type Props = {
  organization: Organization; sections: Section[]; team: Team; activity: Activity; members: Member[]; rosterMembers: Member[]; upcomingActivities: Activity[];
  initialInvitations: Invitation[]; initialFamilyActivities: FamilyActivity[]; workspaces: Workspace[]; tasks: TeamTask[];
  canManageTeam: boolean;
  accountEmail?: string;
  respondablePersonIds: string[];
  source: "database" | "demo";
};

const responseLabels = { accepted: "Kommer", declined: "Kan inte", maybe: "Kanske", pending: "Ej svarat" } as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(new Date(value));
}

function timeUntil(value: string) {
  const hours = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 3_600_000));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} dagar och ${hours % 24} timmar`;
  return hours > 0 ? `${hours} timmar` : "Snart dags";
}

export function ClubDashboard({ organization, sections, team, activity, members, rosterMembers, upcomingActivities, initialInvitations, initialFamilyActivities, workspaces, tasks, canManageTeam, accountEmail, respondablePersonIds, source }: Props) {
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
  const summary = useMemo(() => summarizeInvitations(invitations), [invitations]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const gatheringAt = currentActivity.gatheringAt ?? currentActivity.startsAt;
  const missing = invitations.filter((item) => item.response === "pending");
  const familyInvitation = invitations.find((item) => respondablePersonIds.includes(item.memberId));
  const familyMember = familyInvitation ? memberById.get(familyInvitation.memberId) : undefined;

  async function answer(invitation: Invitation, response: "accepted" | "declined" | "maybe") {
    const updated = respondToInvitation(invitation, response);
    if (source === "database") {
      const result = await fetch(`/api/invitations/${invitation.id}/respond`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ response }) });
      if (!result.ok) { setNotice("Svaret kunde inte sparas. Kontrollera din behörighet och försök igen."); return; }
    }
    setInvitations((current) => current.map((item) => (item.id === invitation.id ? updated : item)));
    setNotice(`${memberById.get(invitation.memberId)?.displayName} är registrerad som ”${responseLabels[response]}”.`);
  }

  async function answerFamily(item: FamilyActivity, response: "accepted" | "declined" | "maybe") {
    if (!item.invitation) return;
    const updated = respondToInvitation(item.invitation, response);
    if (source === "database") {
      const result = await fetch(`/api/invitations/${item.invitation.id}/respond`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ response }) });
      if (!result.ok) { setNotice("Svaret kunde inte sparas. Kontrollera din behörighet och försök igen."); return; }
    }
    setFamilyActivities((current) => current.map((candidate) => candidate.invitation?.id === item.invitation?.id ? { ...candidate, invitation: updated } : candidate));
    setNotice(`${item.member.displayName} är registrerad som ”${responseLabels[response]}”.`);
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
        <a className="brand" href="#" aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></a>
        <div className="topbar-actions">
          {accountEmail ? <span className="account-identity" title={accountEmail}>Inloggad som <strong>{accountEmail}</strong></span> : null}
          <WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} />
          <LogoutButton />
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar" aria-label="Huvudmeny">
          <p className="eyebrow">{team.name}</p>
          <nav>
            <button className={activePage === "overview" ? "active" : ""} onClick={() => setActivePage("overview")} type="button">Översikt</button>
            <button className={activePage === "calendar" ? "active" : ""} onClick={() => setActivePage("calendar")} type="button">Kalender</button>
            <a href={canManageTeam ? `/o/${organization.slug}/t/${team.slug}/members` : "#members"}>Spelare och ledare</a>
            <a href="#attendance">Närvaro</a>
          </nav>
          {view === "leader" && <><p className="eyebrow">Publicering</p><nav><a href="#news">Nyheter</a><a href="#pages">Sidor</a></nav></>}
        </aside>
        <section className="content" id={activePage}>
          <div className="welcome"><div><p className="eyebrow">{sections.length > 1 ? `${sections.find((item) => item.id === team.sectionId)?.name ?? "Sektion"} · ` : ""}{organization.name}</p><h1>{team.name}</h1><p>{activePage === "calendar" ? "Alla aktiviteter för laget." : view === "leader" ? "Det laget behöver från dig just nu." : `Det viktigaste för ${familyMember?.displayName ?? "spelaren"} just nu.`}</p></div>{view === "leader" && canManageTeam && <div className="welcome-actions"><button className="secondary" onClick={() => setShowInvitationForm(true)} type="button">Bjud in ledare</button><button className="primary" onClick={() => setActivityEditorMode("create")} type="button">+ Ny aktivitet</button></div>}</div>
          {notice && <div className="toast" role="status">✓ {notice}</div>}
          {source === "demo" && <div className="demo-notice">Demoläge</div>}

          {activePage === "calendar"
            ? <TeamCalendar activities={upcomingActivities} timeZone={organization.timeZone ?? "Europe/Stockholm"} onSelectActivity={setSelectedActivity} />
            : <>
                {familyActivities.length > 0 && <section className="family-overview" aria-labelledby="family-overview-title">
                  <div className="card-heading"><div><p className="eyebrow">För dig</p><h2 id="family-overview-title">Aktuellt just nu</h2></div></div>
                  <div className="family-activity-grid">{familyActivities.map((item) => {
                    const dueAt = item.activity.gatheringAt ?? item.activity.startsAt;
                    return <article className="card family-activity-card" key={`${item.member.id}:${item.activity.id}`}>
                      <p className="eyebrow">{item.member.displayName} · {item.team.name}</p>
                      <h3>{item.activity.title}</h3>
                      <strong>{item.activity.gatheringAt ? `Samling om ${timeUntil(dueAt)}` : `Start om ${timeUntil(dueAt)}`}</strong>
                      <small>{formatDate(dueAt)} · {item.activity.location}</small>
                      {item.invitation ? item.invitation.response === "pending"
                        ? <div className="response-actions"><button onClick={() => void answerFamily(item, "accepted")} type="button">Kommer</button><button onClick={() => void answerFamily(item, "declined")} type="button">Kan inte</button></div>
                        : <span className={`status ${item.invitation.response}`}>{responseLabels[item.invitation.response]}</span>
                        : <small>Ingen kallelse skickad ännu</small>}
                    </article>;
                  })}</div>
                </section>}

                {view === "leader" ? <PriorityFeed activity={currentActivity} pendingInvitations={missing.length} tasks={tasks} onOpenActivity={setSelectedActivity} /> : null}

                <div className="grid">
                  <div className="main-column">
                    <article className="card activity-card">
                      <div className="card-heading"><div><p className="eyebrow">Nästa aktivitet · {team.name}</p><h2>{currentActivity.title}</h2></div><button className="icon-button" aria-label="Visa detaljer" onClick={() => setSelectedActivity(currentActivity)} type="button">•••</button></div>
                      {view === "family" ? <>
                        <div className="countdown"><span>{currentActivity.gatheringAt ? "Samling om" : "Start om"}</span><strong>{timeUntil(gatheringAt)}</strong><small>{formatDate(gatheringAt)} · {currentActivity.location}</small></div>
                        {familyInvitation && <div className="family-response"><div><span className="member-avatar">{familyMember?.displayName.slice(0, 1)}</span><div><strong>{familyMember?.displayName}</strong><small>Kallelse till aktiviteten</small></div></div>{familyInvitation.response === "pending" ? <div className="response-actions"><button onClick={() => answer(familyInvitation, "accepted")} type="button">Kommer</button><button onClick={() => answer(familyInvitation, "declined")} type="button">Kan inte</button></div> : <span className={`status ${familyInvitation.response}`}>{responseLabels[familyInvitation.response]}</span>}</div>}
                      </> : <>
                        <div className="activity-details">{currentActivity.gatheringAt && <p><span>◷</span><strong>Samling {formatDate(currentActivity.gatheringAt)}</strong></p>}<p><span>⚽</span>Start {new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: organization.timeZone ?? "Europe/Stockholm" }).format(new Date(currentActivity.startsAt))}</p><p><span>⌖</span>{currentActivity.location}</p></div>
                        <div className="summary" aria-label="Svar på kallelsen"><div><strong>{summary.accepted}</strong><span>Kommer</span></div><div><strong>{summary.declined}</strong><span>Kan inte</span></div><div><strong>{summary.maybe}</strong><span>Kanske</span></div><div><strong>{summary.pending}</strong><span>Ej svarat</span></div></div>
                        <div className="activity-actions"><button className="primary" type="button">Rapportera närvaro</button><button className="secondary" onClick={() => { setEditingActivity(currentActivity); setActivityEditorMode("edit"); }} type="button">Redigera aktivitet</button></div>
                      </>}
                    </article>
                  </div>
                  <div className="right-column">
                    {view === "leader" ? <TeamBriefingCard teamId={team.id} assistantName={organization.assistantName} demo={source === "demo"} /> : <TeamAssistantCard teamId={team.id} teamName={team.name} assistantName={organization.assistantName} demo={source === "demo"} />}
                  </div>
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
