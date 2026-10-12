"use client";

import { OverviewInvitationResponse } from "./overview-invitation-response";
import type { FamilyActivity } from "@/domain/club";

type Props = {
  activities: FamilyActivity[];
  timeZone: string;
  onOpenActivity: (item: FamilyActivity) => void;
  title?: string;
  id?: string;
  emptyMessage?: string;
  onAnswered?: () => void;
  demo?: boolean;
  referenceTime?: string;
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

export function PersonalOverview({ activities, timeZone, onOpenActivity, title = "För mig", id = "personal-overview-title", emptyMessage = "Inga personliga aktiviteter kräver din uppmärksamhet just nu.", onAnswered, demo = false, referenceTime }: Props) {

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
        return <div className="personal-activity-row" data-response={people.some(person => person.invitation?.response === "pending") ? "pending" : undefined} key={item.activity.id}>
          <button className="personal-activity-main" type="button" onClick={() => onOpenActivity(item)}>
            <span className="overview-date-badge" aria-hidden="true"><small>{new Intl.DateTimeFormat("sv-SE", { timeZone:item.organization?.timeZone ?? timeZone,weekday:"short" }).format(new Date(dueAt))}</small><strong>{new Intl.DateTimeFormat("sv-SE", { timeZone:item.organization?.timeZone ?? timeZone,day:"numeric" }).format(new Date(dueAt))}</strong></span>
            <span className="personal-activity-copy">
              <small>{[item.organization?.name, item.team.name].filter(Boolean).join(" · ")}</small>
              <strong>{item.activity.title}</strong>

              <span>{when(dueAt, item.organization?.timeZone ?? timeZone)} · {item.activity.location}</span>

            </span>
            <b aria-hidden="true">→</b>
          </button>
          <div className="personal-activity-people">{people.map(person => <OverviewInvitationResponse key={person.member.id} item={person} readOnly={person.activity.status === "cancelled" || Date.parse(person.activity.endsAt) <= Date.parse(referenceTime ?? new Date().toISOString())} demo={demo} onAnswered={onAnswered} />)}</div>
        </div>;
      })}
    </div> : <p className="overview-empty">{emptyMessage}</p>}
    </details>
  </section>;
}
