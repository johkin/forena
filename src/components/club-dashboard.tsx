"use client";

import { useMemo, useState } from "react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import {
  respondToInvitation, summarizeInvitations, type Activity, type DashboardView, type Invitation,
  type Member, type Organization, type Section, type Team, type TeamTask, type Workspace,
} from "@/domain/club";

type Props = {
  organization: Organization; sections: Section[]; team: Team; activity: Activity; members: Member[];
  initialInvitations: Invitation[]; workspaces: Workspace[]; tasks: TeamTask[]; defaultView: DashboardView;
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

export function ClubDashboard({ organization, sections, team, activity, members, initialInvitations, workspaces, tasks, defaultView, source }: Props) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [view, setView] = useState<DashboardView>(defaultView);
  const [notice, setNotice] = useState<string>();
  const summary = useMemo(() => summarizeInvitations(invitations), [invitations]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const gatheringAt = activity.gatheringAt ?? activity.startsAt;
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

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></a>
        <WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} />
      </header>
      <div className="shell">
        <aside className="sidebar" aria-label="Huvudmeny">
          <p className="eyebrow">{team.name}</p>
          <nav><a className="active" href="#overview">Översikt</a><a href="#calendar">Kalender</a><a href="#members">Spelare och ledare</a><a href="#attendance">Närvaro</a><a href="#tasks">Uppgifter <span className="badge">{tasks.length}</span></a></nav>
          {view === "leader" && <><p className="eyebrow">Publicering</p><nav><a href="#news">Nyheter</a><a href="#pages">Sidor</a></nav></>}
        </aside>
        <section className="content" id="overview">
          <div className="welcome"><div><p className="eyebrow">{sections.length > 1 ? `${sections.find((item) => item.id === team.sectionId)?.name ?? "Sektion"} · ` : ""}{organization.name}</p><h1>{team.name}</h1><p>{view === "leader" ? "Det laget behöver från dig just nu." : `Det viktigaste för ${familyMember?.displayName ?? "spelaren"} just nu.`}</p></div>{view === "leader" && <button className="primary" type="button">+ Ny aktivitet</button>}</div>
          <div className="view-switch" aria-label="Förhandsvisa dashboard som"><span>Visa som</span><button className={view === "leader" ? "selected" : ""} onClick={() => setView("leader")} type="button">Ledare</button><button className={view === "family" ? "selected" : ""} onClick={() => setView("family")} type="button">Spelare / målsman</button></div>
          {notice && <div className="toast" role="status">✓ {notice}</div>}
          {source === "demo" && <div className="demo-notice">Demoläge · växla roll ovan för att jämföra vyerna</div>}
          <div className="grid">
            <div className="main-column">
              <article className="card activity-card">
                <div className="card-heading"><div><p className="eyebrow">Nästa aktivitet · {team.name}</p><h2>{activity.title}</h2></div><button className="icon-button" aria-label="Fler alternativ" type="button">•••</button></div>
                {view === "family" ? <>
                  <div className="countdown"><span>Samling om</span><strong>{timeUntil(gatheringAt)}</strong><small>{formatDate(gatheringAt)} · {activity.location}</small></div>
                  {familyInvitation && <div className="family-response"><div><span className="member-avatar">{familyMember?.displayName.slice(0, 1)}</span><div><strong>{familyMember?.displayName}</strong><small>Kallelse till matchen</small></div></div>{familyInvitation.response === "pending" ? <div className="response-actions"><button onClick={() => answer(familyInvitation, "accepted")} type="button">Kommer</button><button onClick={() => answer(familyInvitation, "declined")} type="button">Kan inte</button></div> : <span className={`status ${familyInvitation.response}`}>{responseLabels[familyInvitation.response]}</span>}</div>}
                  <div className="friends"><p className="eyebrow">Kompisar som kommer · {accepted.length}</p><div className="friend-list">{accepted.map((item) => { const member = memberById.get(item.memberId); return <span key={item.id}><i>{member?.displayName.slice(0, 1)}</i>{member?.displayName}</span>; })}</div></div>
                </> : <>
                  <div className="activity-details"><p><span>◷</span><strong>Samling {formatDate(gatheringAt)}</strong></p><p><span>⚽</span>Matchstart {new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(new Date(activity.startsAt))}</p><p><span>⌖</span>{activity.location}</p></div>
                  <div className="summary" aria-label="Svar på kallelsen"><div><strong>{summary.accepted}</strong><span>Kommer</span></div><div><strong>{summary.declined}</strong><span>Kan inte</span></div><div><strong>{summary.maybe}</strong><span>Kanske</span></div><div><strong>{summary.pending}</strong><span>Ej svarat</span></div></div>
                  <div className="activity-actions"><button className="primary" type="button">Rapportera närvaro</button><button className="secondary" type="button">Redigera match</button></div>
                  {missing.length > 0 && <div className="missing-list"><p className="eyebrow">Saknar svar · kontakta målsman</p>{missing.map((invitation) => { const member = memberById.get(invitation.memberId); return <div className="missing-person" key={invitation.id}><span className="member-avatar">{member?.displayName.slice(0, 1)}</span><span><strong>{member?.displayName}</strong>{member?.guardianName && <small>{member.guardianName}</small>}</span><a href={member?.guardianPhone ? `tel:${member.guardianPhone.replace(/\s/g, "")}` : "#members"}>{member?.guardianPhone ?? "Visa kontakt"}</a></div>; })}</div>}
                </>}
              </article>
              {view === "leader" && <article className="card tasks-card" id="tasks"><div className="card-heading"><div><p className="eyebrow">Från kansliet</p><h2>Uppgifter till {team.name}</h2></div><span className="badge">{tasks.length}</span></div><div className="task-list">{tasks.map((task) => <button className="task" key={task.id} type="button"><span className="task-date"><strong>{new Intl.DateTimeFormat("sv-SE", { day: "numeric" }).format(new Date(task.dueAt))}</strong><small>{new Intl.DateTimeFormat("sv-SE", { month: "short" }).format(new Date(task.dueAt))}</small></span><span><strong>{task.title}</strong><small>{task.description}</small><em>{task.createdByLabel} · klart senast {new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(task.dueAt))}</em></span><b>→</b></button>)}</div></article>}
            </div>
            <div className="right-column">
              <article className="card assistant-card"><div className="assistant-header"><span className="assistant-avatar">✦</span><div><p className="eyebrow">{organization.assistantName} · {team.name}</p><h2>Lagassistent</h2></div></div><p>{view === "leader" ? `Jag kan hjälpa till med kallelser, närvaro och uppgifter för ${team.name}.` : `Jag kan svara på praktiska frågor om ${team.name} och nästa aktivitet.`}</p><button className="prompt" type="button">{view === "leader" ? "Vilka saknar svar och kontaktuppgifter?" : "Vad behöver vi ta med till matchen?"}</button><button className="prompt" type="button">{view === "leader" ? "Sammanfatta uppgifter från kansliet" : "Vilka kompisar kommer på torsdag?"}</button><label className="assistant-input"><span className="sr-only">Fråga {organization.assistantName}</span><input placeholder={`Fråga ${organization.assistantName}…`} /><button type="button" aria-label="Skicka">↑</button></label></article>
              {view === "leader" && <article className="card attention-card"><div className="card-heading"><h2>Behöver din uppmärksamhet</h2><span className="badge">3</span></div><ul><li><span className="attention-icon">!</span><div><strong>{missing.length} obesvarade kallelser</strong><small>{team.name} · torsdag</small></div></li><li><span className="attention-icon">↗</span><div><strong>Anmäl lag till seriespel</strong><small>Kansliet · senast 2 oktober</small></div></li><li><span className="attention-icon">✓</span><div><strong>Närvaro behöver registreras</strong><small>Föregående träning</small></div></li></ul></article>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
