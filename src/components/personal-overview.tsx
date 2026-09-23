"use client";

import type { FamilyActivity } from "@/domain/club";

const responseLabels = { accepted: "Kommer", declined: "Kan inte", maybe: "Kanske", pending: "Ej svarat" } as const;

type Props = {
  activities: FamilyActivity[];
  timeZone: string;
  onAnswer: (item: FamilyActivity, response: "accepted" | "declined" | "maybe") => void;
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
  return <section className="card personal-overview" aria-labelledby="personal-overview-title">
    <div className="card-heading">
      <div><p className="eyebrow">Personligt</p><h2 id="personal-overview-title">För mig</h2></div>
      {activities.length ? <span className="badge">{activities.length}</span> : null}
    </div>
    {activities.length ? <div className="personal-activity-list">
      {activities.map((item) => {
        const dueAt = item.activity.gatheringAt ?? item.activity.startsAt;
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
          {item.invitation ? <div className="personal-response">
            {item.invitation.response === "pending"
              ? <><button type="button" onClick={() => onAnswer(item, "accepted")}>Kommer</button><button type="button" onClick={() => onAnswer(item, "declined")}>Kan inte</button></>
              : <span className={`status ${item.invitation.response}`}>{responseLabels[item.invitation.response]}</span>}
          </div> : <span className="personal-no-invitation">Ingen kallelse ännu</span>}
        </div>;
      })}
    </div> : <p className="overview-empty">Inga personliga aktiviteter kräver din uppmärksamhet just nu.</p>}
  </section>;
}
