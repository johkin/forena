"use client";

import { useMemo, useState } from "react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LogoutButton } from "@/components/logout-button";
import { TeamBriefingCard } from "@/components/team-briefing-card";
import {
  respondToInvitation, summarizeInvitations, type Activity, type DashboardView, type Invitation,
  type Member, type Organization, type Section, type Team, type TeamTask, type Workspace,
} from "@/domain/club";

type Props = {
  organization: Organization; sections: Section[]; team: Team; activity: Activity; members: Member[];
  initialInvitations: Invitation[]; workspaces: Workspace[]; tasks: TeamTask[]; defaultView: DashboardView;
  canManageTeam: boolean;
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

export function ClubDashboard({ organization, sections, team, activity, members, initialInvitations, workspaces, tasks, defaultView, canManageTeam, source }: Props) {
  const [currentActivity, setCurrentActivity] = useState(activity);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [view, setView] = useState<DashboardView>(defaultView);
  const [notice, setNotice] = useState<string>();
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [showInvitationForm, setShowInvitationForm] = useState(false);
  const [savingInvitation, setSavingInvitation] = useState(false);
  const summary = useMemo(() => summarizeInvitations(invitations), [invitations]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const gatheringAt = currentActivity.gatheringAt ?? currentActivity.startsAt;
  const accepted = invitations.filter((item) => item.response === "accepted");
  const missing = invitations.filter((item) => item.response === "pending");
  const familyInvitation = invitations[0];
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

  async function createActivity(form: HTMLFormElement) {
    setSavingActivity(true);
    const data = new FormData(form);
    const selectedPersonIds = data.getAll("personIds").map(String);
    const startsAt = new Date(String(data.get("startsAt")));
    const gatheringValue = String(data.get("gatheringAt") ?? "").trim();
    const gatheringAt = gatheringValue ? new Date(gatheringValue) : undefined;
    const durationMinutes = Number(data.get("durationMinutes"));
    const nextActivity: Activity = {
      id: `demo-activity-${Date.now()}`,
      organizationId: organization.id,
      teamId: team.id,
      title: String(data.get("title")),
      gatheringAt: gatheringAt?.toISOString(),
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000).toISOString(),
      location: String(data.get("location")),
    };
    let nextInvitations: Invitation[] = selectedPersonIds.map((memberId, index) => ({
      id: `demo-invitation-${Date.now()}-${index}`,
      organizationId: organization.id,
      activityId: nextActivity.id,
      memberId,
      response: "pending",
    }));

    if (source === "database") {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: team.id, title: nextActivity.title, gatheringAt: nextActivity.gatheringAt, startsAt: nextActivity.startsAt, endsAt: nextActivity.endsAt, location: nextActivity.location, personIds: selectedPersonIds }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error ?? "Aktiviteten kunde inte sparas.");
        setSavingActivity(false);
        return;
      }
      nextActivity.id = result.activity.id;
      nextActivity.gatheringAt = result.activity.gathering_at ?? undefined;
      nextInvitations = result.invitations.map((invitation: { id: string; organization_id: string; activity_id: string; person_id: string }) => ({
        id: invitation.id, organizationId: invitation.organization_id, activityId: invitation.activity_id, memberId: invitation.person_id, response: "pending",
      }));
    }

    setCurrentActivity(nextActivity);
    setInvitations(nextInvitations);
    setShowActivityForm(false);
    setSavingActivity(false);
    setNotice(`${nextActivity.title} skapades och ${nextInvitations.length} kallelser förbereddes.`);
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
          <WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} />
          <LogoutButton />
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar" aria-label="Huvudmeny">
          <p className="eyebrow">{team.name}</p>
          <nav><a className="active" href="#overview">Översikt</a><a href="#calendar">Kalender</a><a href="#members">Spelare och ledare</a><a href="#attendance">Närvaro</a><a href="#tasks">Uppgifter <span className="badge">{tasks.length}</span></a></nav>
          {view === "leader" && <><p className="eyebrow">Publicering</p><nav><a href="#news">Nyheter</a><a href="#pages">Sidor</a></nav></>}
        </aside>
        <section className="content" id="overview">
          <div className="welcome"><div><p className="eyebrow">{sections.length > 1 ? `${sections.find((item) => item.id === team.sectionId)?.name ?? "Sektion"} · ` : ""}{organization.name}</p><h1>{team.name}</h1><p>{view === "leader" ? "Det laget behöver från dig just nu." : `Det viktigaste för ${familyMember?.displayName ?? "spelaren"} just nu.`}</p></div>{view === "leader" && canManageTeam && <div className="welcome-actions"><button className="secondary" onClick={() => setShowInvitationForm(true)} type="button">Bjud in ledare</button><button className="primary" onClick={() => setShowActivityForm(true)} type="button">+ Ny aktivitet</button></div>}</div>
          <div className="view-switch" aria-label="Förhandsvisa dashboard som"><span>Visa som</span><button className={view === "leader" ? "selected" : ""} onClick={() => setView("leader")} type="button">Ledare</button><button className={view === "family" ? "selected" : ""} onClick={() => setView("family")} type="button">Spelare / målsman</button></div>
          {notice && <div className="toast" role="status">✓ {notice}</div>}
          {source === "demo" && <div className="demo-notice">Demoläge · växla roll ovan för att jämföra vyerna</div>}
          <div className="grid">
            <div className="main-column">
              <article className="card activity-card">
                <div className="card-heading"><div><p className="eyebrow">Nästa aktivitet · {team.name}</p><h2>{currentActivity.title}</h2></div><button className="icon-button" aria-label="Fler alternativ" type="button">•••</button></div>
                {view === "family" ? <>
                  <div className="countdown"><span>{currentActivity.gatheringAt ? "Samling om" : "Start om"}</span><strong>{timeUntil(gatheringAt)}</strong><small>{formatDate(gatheringAt)} · {currentActivity.location}</small></div>
                  {familyInvitation && <div className="family-response"><div><span className="member-avatar">{familyMember?.displayName.slice(0, 1)}</span><div><strong>{familyMember?.displayName}</strong><small>Kallelse till matchen</small></div></div>{familyInvitation.response === "pending" ? <div className="response-actions"><button onClick={() => answer(familyInvitation, "accepted")} type="button">Kommer</button><button onClick={() => answer(familyInvitation, "declined")} type="button">Kan inte</button></div> : <span className={`status ${familyInvitation.response}`}>{responseLabels[familyInvitation.response]}</span>}</div>}
                  <div className="friends"><p className="eyebrow">Kompisar som kommer · {accepted.length}</p><div className="friend-list">{accepted.map((item) => { const member = memberById.get(item.memberId); return <span key={item.id}><i>{member?.displayName.slice(0, 1)}</i>{member?.displayName}</span>; })}</div></div>
                </> : <>
                  <div className="activity-details">{currentActivity.gatheringAt && <p><span>◷</span><strong>Samling {formatDate(currentActivity.gatheringAt)}</strong></p>}<p><span>⚽</span>{currentActivity.gatheringAt ? "Start" : "Start " + formatDate(currentActivity.startsAt)}{currentActivity.gatheringAt && ` ${new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(new Date(currentActivity.startsAt))}`}</p><p><span>⌖</span>{currentActivity.location}</p></div>
                  <div className="summary" aria-label="Svar på kallelsen"><div><strong>{summary.accepted}</strong><span>Kommer</span></div><div><strong>{summary.declined}</strong><span>Kan inte</span></div><div><strong>{summary.maybe}</strong><span>Kanske</span></div><div><strong>{summary.pending}</strong><span>Ej svarat</span></div></div>
                  <div className="activity-actions"><button className="primary" type="button">Rapportera närvaro</button><button className="secondary" type="button">Redigera match</button></div>
                  {missing.length > 0 && <div className="missing-list"><p className="eyebrow">Saknar svar · kontakta målsman</p>{missing.map((invitation) => { const member = memberById.get(invitation.memberId); return <div className="missing-person" key={invitation.id}><span className="member-avatar">{member?.displayName.slice(0, 1)}</span><span><strong>{member?.displayName}</strong>{member?.guardianName && <small>{member.guardianName}</small>}</span><a href={member?.guardianPhone ? `tel:${member.guardianPhone.replace(/\s/g, "")}` : "#members"}>{member?.guardianPhone ?? "Visa kontakt"}</a></div>; })}</div>}
                </>}
              </article>
              {view === "leader" && <article className="card tasks-card" id="tasks"><div className="card-heading"><div><p className="eyebrow">Från kansliet</p><h2>Uppgifter till {team.name}</h2></div><span className="badge">{tasks.length}</span></div><div className="task-list">{tasks.map((task) => <button className="task" key={task.id} type="button"><span className="task-date"><strong>{new Intl.DateTimeFormat("sv-SE", { day: "numeric" }).format(new Date(task.dueAt))}</strong><small>{new Intl.DateTimeFormat("sv-SE", { month: "short" }).format(new Date(task.dueAt))}</small></span><span><strong>{task.title}</strong><small>{task.description}</small><em>{task.createdByLabel} · klart senast {new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(task.dueAt))}</em></span><b>→</b></button>)}</div></article>}
            </div>
            <div className="right-column">
              {view === "leader" ? <TeamBriefingCard teamId={team.id} assistantName={organization.assistantName} demo={source === "demo"} /> : <article className="card assistant-card"><div className="assistant-header"><span className="assistant-avatar">✦</span><div><p className="eyebrow">{organization.assistantName} · {team.name}</p><h2>Lagassistent</h2></div></div><p>Jag kan svara på praktiska frågor om {team.name} och nästa aktivitet.</p><button className="prompt" type="button">Vad behöver vi ta med till matchen?</button><button className="prompt" type="button">Vilka kompisar kommer på torsdag?</button><label className="assistant-input"><span className="sr-only">Fråga {organization.assistantName}</span><input placeholder={`Fråga ${organization.assistantName}…`} /><button type="button" aria-label="Skicka">↑</button></label></article>}
              {view === "leader" && <article className="card attention-card"><div className="card-heading"><h2>Behöver din uppmärksamhet</h2><span className="badge">3</span></div><ul><li><span className="attention-icon">!</span><div><strong>{missing.length} obesvarade kallelser</strong><small>{team.name} · torsdag</small></div></li><li><span className="attention-icon">↗</span><div><strong>Anmäl lag till seriespel</strong><small>Kansliet · senast 2 oktober</small></div></li><li><span className="attention-icon">✓</span><div><strong>Närvaro behöver registreras</strong><small>Föregående träning</small></div></li></ul></article>}
            </div>
          </div>
        </section>
      </div>
      {showActivityForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowActivityForm(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="activity-form-title"><div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="activity-form-title">Skapa aktivitet och kallelse</h2></div><button className="icon-button" onClick={() => setShowActivityForm(false)} aria-label="Stäng" type="button">✕</button></div><form onSubmit={(event) => { event.preventDefault(); void createActivity(event.currentTarget); }}><label>Titel<input name="title" required placeholder="Träning eller match" /></label><div className="form-row"><label>Samling (valfritt)<input name="gatheringAt" type="datetime-local" /></label><label>Start<input name="startsAt" type="datetime-local" required /></label></div><label>Längd<select name="durationMinutes" defaultValue="90"><option value="60">1 timme</option><option value="90">1,5 timmar</option><option value="120">2 timmar</option><option value="180">3 timmar</option></select></label><label>Plats<input name="location" required placeholder="Plan eller hall" /></label><fieldset><legend>Kalla deltagare</legend><div className="member-options">{members.map((member) => <label key={member.id}><input type="checkbox" name="personIds" value={member.id} defaultChecked /><span className="member-avatar">{member.displayName.slice(0, 1)}</span>{member.displayName}</label>)}</div></fieldset><div className="modal-actions"><button className="secondary" onClick={() => setShowActivityForm(false)} type="button">Avbryt</button><button className="primary" disabled={savingActivity} type="submit">{savingActivity ? "Sparar…" : "Skapa och kalla"}</button></div></form></section></div>}
      {showInvitationForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInvitationForm(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="invitation-form-title"><div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="invitation-form-title">Bjud in ledare</h2></div><button className="icon-button" onClick={() => setShowInvitationForm(false)} aria-label="Stäng" type="button">✕</button></div><form onSubmit={(event) => { event.preventDefault(); void inviteTeamMember(event.currentTarget); }}><label>E-postadress<input name="email" type="email" required autoComplete="email" placeholder="namn@example.se" /></label><p className="form-help">Nya spelare och målsmän kommer in genom föreningens medlemsansökan. Den här länken ger en godkänd ledare åtkomst till laget.</p><div className="modal-actions"><button className="secondary" onClick={() => setShowInvitationForm(false)} type="button">Avbryt</button><button className="primary" disabled={savingInvitation} type="submit">{savingInvitation ? "Skickar…" : "Skicka inbjudan"}</button></div></form></section></div>}
    </main>
  );
}
