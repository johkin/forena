"use client";

import type { Activity, InvitationSummary, TeamTask } from "@/domain/club";

type Props = {
  teamName: string;
  activity: Activity;
  summary: InvitationSummary;
  upcomingActivities: Activity[];
  tasks: TeamTask[];
  timeZone: string;
  onOpenActivity: (activity: Activity) => void;
};

type TeamItem = {
  id: string;
  kind: "invitation" | "task";
  title: string;
  meta: string;
  onClick?: () => void;
};

export function TeamOverview({ teamName, activity, summary, upcomingActivities, tasks, timeZone, onOpenActivity }: Props) {
  const start = new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.gatheringAt ?? activity.startsAt));
  const weekLimit = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const nextSevenDays = upcomingActivities.filter((item) => new Date(item.startsAt).getTime() <= weekLimit).length;
  const items: TeamItem[] = [];

  if (summary.pending > 0) {
    items.push({
      id: `invitation:${activity.id}`,
      kind: "invitation",
      title: `${summary.pending} har inte svarat på kallelsen`,
      meta: summary.accepted > 0
        ? `${summary.accepted} kommer hittills${activity.responseDueAt ? ` · svar senast ${new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.responseDueAt))}` : ""}`
        : "Inga ja-svar ännu",
      onClick: () => onOpenActivity(activity),
    });
  }

  for (const task of tasks) {
    items.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      meta: `${task.createdByLabel} · senast ${new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "long" }).format(new Date(task.dueAt))}`,
    });
  }

  return <section className="card team-overview" aria-labelledby="team-overview-title">
    <div className="card-heading">
      <div><p className="eyebrow">Ansvar</p><h2 id="team-overview-title">För laget</h2></div>
      {items.length ? <span className="badge">{items.length}</span> : null}
    </div>

    <button className="team-next-activity" onClick={() => onOpenActivity(activity)} type="button">
      <span><small>Nästa aktivitet · {teamName}</small><strong>{activity.title}</strong><span>{start} · {activity.location}</span></span><b aria-hidden="true">→</b>
    </button>

    <div className="team-status-metrics">
      <div><strong>{summary.accepted}</strong><span>kommer</span></div>
      <div><strong>{summary.declined}</strong><span>kan inte</span></div>
      <div><strong>{summary.pending}</strong><span>ej svarat</span></div>
      <div><strong>{nextSevenDays}</strong><span>aktiviteter / 7 dagar</span></div>
    </div>

    {items.length ? <div className="team-action-list">
      {items.map((item) => <button className="priority-item" data-kind={item.kind} key={item.id} onClick={item.onClick} type="button">
        <span className="priority-marker" aria-hidden="true" />
        <span className="priority-copy"><small>{item.kind === "invitation" ? "Kallelse" : "Uppgift"}</small><strong>{item.title}</strong><span>{item.meta}</span></span>
        {item.onClick ? <b aria-hidden="true">→</b> : null}
      </button>)}
    </div> : <p className="overview-empty">Inget särskilt behöver hanteras för laget just nu.</p>}
  </section>;
}
