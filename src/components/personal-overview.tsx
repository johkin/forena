"use client";

import type { FamilyActivity } from "@/domain/club";

type Props = {
  activities: FamilyActivity[];
  timeZone: string;
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

export function PersonalOverview({ activities, timeZone, onOpenActivity }: Props) {

  return <section className="card personal-overview" aria-labelledby="personal-overview-title">
    <details className="overview-details" open>
    <summary className="card-heading">
      <div><p className="eyebrow">Personligt</p><h2 id="personal-overview-title">För mig</h2></div>
      {activities.length ? <span className="badge">{activities.length}</span> : null}
    </summary>
    {activities.length ? <div className="personal-activity-list">
      {activities.map((item) => {
        const dueAt = item.activity.gatheringAt ?? item.activity.startsAt;
        const invitation = item.invitation;
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
          <span className="personal-no-invitation">{[item.hasDutyAssignment ? "Bokad arbetsuppgift" : undefined, invitation ? ({ accepted:"Kommer", declined:"Kan inte", pending:"Ej svarat" } as const)[invitation.response] : undefined].filter(Boolean).join(" · ") || "Ingen kallelse ännu"}</span>
        </div>;
      })}
    </div> : <p className="overview-empty">Inga personliga aktiviteter kräver din uppmärksamhet just nu.</p>}
    </details>
  </section>;
}
