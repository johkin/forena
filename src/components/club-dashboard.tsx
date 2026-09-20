"use client";

import { useMemo, useState } from "react";
import {
  respondToInvitation,
  summarizeInvitations,
  type Activity,
  type Invitation,
  type Member,
  type Organization,
  type Team,
} from "@/domain/club";

type Props = {
  organization: Organization;
  team: Team;
  activity: Activity;
  members: Member[];
  initialInvitations: Invitation[];
};

const responseLabels = {
  accepted: "Kommer",
  declined: "Kan inte",
  maybe: "Kanske",
  pending: "Ej svarat",
} as const;

export function ClubDashboard({ organization, team, activity, members, initialInvitations }: Props) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [notice, setNotice] = useState<string>();
  const summary = useMemo(() => summarizeInvitations(invitations), [invitations]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const startsAt = new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(activity.startsAt));

  function answer(invitation: Invitation, response: "accepted" | "declined" | "maybe") {
    setInvitations((current) =>
      current.map((item) => (item.id === invitation.id ? respondToInvitation(item, response) : item)),
    );
    setNotice(`${memberById.get(invitation.memberId)?.displayName} är registrerad som ”${responseLabels[response]}”.`);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Förena startsida">
          <span className="brand-mark">F</span>
          <span>Förena</span>
        </a>
        <button className="organization-switcher" type="button">
          <span className="organization-avatar">UI</span>
          <span><strong>{organization.name}</strong><small>{team.name}</small></span>
          <span aria-hidden>⌄</span>
        </button>
      </header>

      <div className="shell">
        <aside className="sidebar" aria-label="Huvudmeny">
          <p className="eyebrow">Föreningen</p>
          <nav>
            <a className="active" href="#overview">Översikt</a>
            <a href="#calendar">Kalender</a>
            <a href="#members">Medlemmar</a>
            <a href="#teams">Lag och grupper</a>
            <a href="#tasks">Uppgifter <span className="badge">2</span></a>
          </nav>
          <p className="eyebrow">Publicering</p>
          <nav>
            <a href="#news">Nyheter</a>
            <a href="#pages">Sidor</a>
          </nav>
        </aside>

        <section className="content" id="overview">
          <div className="welcome">
            <div>
              <p className="eyebrow">Söndag 20 september</p>
              <h1>God kväll, Johan</h1>
              <p>Här är det viktigaste i {organization.name} just nu.</p>
            </div>
            <button className="primary" type="button">+ Ny aktivitet</button>
          </div>

          {notice && <div className="toast" role="status">✓ {notice}</div>}

          <div className="grid">
            <article className="card activity-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Nästa aktivitet · {team.name}</p>
                  <h2>{activity.title}</h2>
                </div>
                <button className="icon-button" aria-label="Fler alternativ" type="button">•••</button>
              </div>
              <div className="activity-details">
                <p><span>◷</span><strong>{startsAt}</strong></p>
                <p><span>⌖</span>{activity.location}</p>
              </div>
              <div className="summary" aria-label="Svar på kallelsen">
                <div><strong>{summary.accepted}</strong><span>Kommer</span></div>
                <div><strong>{summary.declined}</strong><span>Kan inte</span></div>
                <div><strong>{summary.maybe}</strong><span>Kanske</span></div>
                <div><strong>{summary.pending}</strong><span>Ej svarat</span></div>
              </div>
              <div className="invitation-list">
                {invitations.map((invitation) => {
                  const member = memberById.get(invitation.memberId);
                  return (
                    <div className="invitation" key={invitation.id}>
                      <span className="member-avatar">{member?.displayName.slice(0, 1)}</span>
                      <strong>{member?.displayName}</strong>
                      {invitation.response === "pending" ? (
                        <div className="response-actions">
                          <button onClick={() => answer(invitation, "accepted")} type="button">Kommer</button>
                          <button onClick={() => answer(invitation, "declined")} type="button">Kan inte</button>
                        </div>
                      ) : (
                        <span className={`status ${invitation.response}`}>{responseLabels[invitation.response]}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>

            <div className="right-column">
              <article className="card assistant-card">
                <div className="assistant-header">
                  <span className="assistant-avatar">✦</span>
                  <div><p className="eyebrow">Föreningsassistent</p><h2>{organization.assistantName}</h2></div>
                </div>
                <p>Jag kan hjälpa dig med aktiviteter, kallelser och föreningens vardag.</p>
                <button className="prompt" type="button">Vilka har inte svarat på torsdagens kallelse?</button>
                <button className="prompt" type="button">Skapa ett utkast till nästa träning</button>
                <label className="assistant-input">
                  <span className="sr-only">Fråga {organization.assistantName}</span>
                  <input placeholder={`Fråga ${organization.assistantName}…`} />
                  <button type="button" aria-label="Skicka">↑</button>
                </label>
              </article>

              <article className="card attention-card">
                <div className="card-heading"><h2>Behöver din uppmärksamhet</h2><span className="badge">2</span></div>
                <ul>
                  <li><span className="attention-icon">!</span><div><strong>Två obesvarade kallelser</strong><small>{team.name} · torsdag</small></div></li>
                  <li><span className="attention-icon">✓</span><div><strong>Närvaro behöver registreras</strong><small>{team.name} · föregående träning</small></div></li>
                </ul>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
