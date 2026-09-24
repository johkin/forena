"use client";

import { useState } from "react";
import type { FamilyActivity, InvitationResponse } from "@/domain/club";

type Props = {
  activities: FamilyActivity[];
  timeZone: string;
  onAnswer: (item: FamilyActivity, response: InvitationResponse, comment?: string) => void;
  onOpenActivity: (item: FamilyActivity) => void;
};

function when(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PersonalOverview({ activities, timeZone, onAnswer, onOpenActivity }: Props) {
  const [comments, setComments] = useState<Record<string, string>>({});

  return <section className="card personal-overview" aria-labelledby="personal-overview-title">
    <div className="card-heading">
      <div><p className="eyebrow">Personligt</p><h2 id="personal-overview-title">För mig</h2></div>
      {activities.length ? <span className="badge">{activities.length}</span> : null}
    </div>
    {activities.length ? <div className="personal-activity-list">
      {activities.map((item) => {
        const dueAt = item.activity.gatheringAt ?? item.activity.startsAt;
        const invitation = item.invitation;
        const comment = invitation ? comments[invitation.id] ?? invitation.responseComment ?? "" : "";
        const commentChanged = Boolean(invitation && invitation.response !== "pending" && comment.trim() !== (invitation.responseComment ?? ""));
        return <div className="personal-activity-row" key={`${item.member.id}:${item.activity.id}`}>
          <button className="personal-activity-main" type="button" onClick={() => onOpenActivity(item)}>
            <span className="member-avatar">{item.member.displayName.slice(0, 1)}</span>
            <span className="personal-activity-copy">
              <small>{item.member.displayName} · {item.team.name}</small>
              <strong>{item.activity.title}</strong>
              <span>{when(dueAt, timeZone)} · {item.activity.location}</span>
            </span>
            <b aria-hidden="true">→</b>
          </button>
          {invitation ? <div className="personal-invitation-response">
            <input
              aria-label={`Kommentar till kallelsen för ${item.member.displayName}`}
              maxLength={500}
              onChange={(event) => setComments((current) => ({ ...current, [invitation.id]: event.target.value }))}
              placeholder="Kommentar (valfritt)"
              type="text"
              value={comment}
            />
            <div className="personal-response" aria-label={`Svar för ${item.member.displayName}`}>
              <button
                className={invitation.response === "accepted" ? "selected" : ""}
                type="button"
                onClick={() => onAnswer(item, "accepted", comment)}
              >Kommer</button>
              <button
                className={invitation.response === "declined" ? "selected" : ""}
                type="button"
                onClick={() => onAnswer(item, "declined", comment)}
              >Kan inte</button>
              {commentChanged ? <button className="secondary" type="button" onClick={() => onAnswer(item, invitation.response, comment)}>Spara kommentar</button> : null}
              {invitation.response !== "pending" ? <button className="link-button" type="button" onClick={() => {
                setComments((current) => ({ ...current, [invitation.id]: "" }));
                onAnswer(item, "pending");
              }}>Ta bort svar</button> : null}
            </div>
          </div> : <span className="personal-no-invitation">Ingen kallelse ännu</span>}
        </div>;
      })}
    </div> : <p className="overview-empty">Inga personliga aktiviteter kräver din uppmärksamhet just nu.</p>}
  </section>;
}
