"use client";

import type { FamilyActivity } from "@/domain/club";

type Props = {
  activities: FamilyActivity[];
  timeZone: string;
  onOpenActivity: (item: FamilyActivity) => void;
  title?: string;
  id?: string;
  emptyMessage?: string;
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

export function PersonalOverview({ activities, timeZone, onOpenActivity, title = "För mig", id = "personal-overview-title", emptyMessage = "Inga personliga aktiviteter kräver din uppmärksamhet just nu." }: Props) {

  const grouped = new Map<string, FamilyActivity[]>();
  for (const item of activities) {
    const group = grouped.get(item.activity.id) ?? [];
    if (!group.some(person => person.member.id === item.member.id)) group.push(item);
    grouped.set(item.activity.id, group);
  }

  return <section className="card personal-overview" aria-labelledby={id}>
    <details className="overview-details" open>
    <summary className="card-heading">
      <div><p className="eyebrow">Personligt</p><h2 id={id}>{title}</h2></div>
      {grouped.size ? <span className="badge">{grouped.size}</span> : null}
    </summary>
    {grouped.size ? <div className="personal-activity-list">
      {[...grouped.values()].map((people) => {
        const item = people[0];
        const dueAt = item.activity.gatheringAt ?? item.activity.startsAt;
        return <div className="personal-activity-row" key={item.activity.id}>
          <button className="personal-activity-main" type="button" onClick={() => onOpenActivity(item)}>
            <span className="member-avatar">{item.team.name.slice(0, 1)}</span>
            <span className="personal-activity-copy">
              <small>{[item.organization?.name, item.team.name].filter(Boolean).join(" · ")}</small>
              <strong>{item.activity.title}</strong>

              <span>{when(dueAt, item.organization?.timeZone ?? timeZone)} · {item.activity.location}</span>
              <span className="personal-activity-people">{people.map(person => <span className="personal-activity-person" key={person.member.id}>
                <span>{person.member.displayName}</span>
                <span>{[person.hasDutyAssignment ? "Bokad arbetsuppgift" : undefined, person.invitation ? ({ accepted:"Kommer", declined:"Kan inte", pending:"Ej svarat" } as const)[person.invitation.response] : undefined].filter(Boolean).join(" · ") || "Ingen kallelse ännu"}</span>
              </span>)}</span>
            </span>
            <b aria-hidden="true">→</b>
          </button>
        </div>;
      })}
    </div> : <p className="overview-empty">{emptyMessage}</p>}
    </details>
  </section>;
}
