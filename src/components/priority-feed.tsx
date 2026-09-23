"use client";

import type { Activity, TeamTask } from "@/domain/club";

type Props = {
  activity: Activity;
  pendingInvitations: number;
  tasks: TeamTask[];
  onOpenActivity: (activity: Activity) => void;
};

type FeedItem = {
  id: string;
  kind: "invitation" | "task";
  title: string;
  meta: string;
  dueAt: number;
  onClick?: () => void;
};

const labels = { invitation: "Kallelse", task: "Uppgift" } as const;

export function PriorityFeed({ activity, pendingInvitations, tasks, onOpenActivity }: Props) {
  const items: FeedItem[] = [];

  if (pendingInvitations > 0) {
    items.push({
      id: `invitation:${activity.id}`,
      kind: "invitation",
      title: `${pendingInvitations} obesvarade kallelser till ${activity.title}`,
      meta: activity.responseDueAt
        ? `Svara senast ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.responseDueAt))}`
        : "Svar saknas",
      dueAt: activity.responseDueAt ? new Date(activity.responseDueAt).getTime() : new Date(activity.startsAt).getTime(),
      onClick: () => onOpenActivity(activity),
    });
  }

  for (const task of tasks) {
    items.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      meta: `${task.createdByLabel} · senast ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(task.dueAt))}`,
      dueAt: new Date(task.dueAt).getTime(),
    });
  }

  items.sort((a, b) => a.dueAt - b.dueAt);

  return <section className="card priority-feed personal-feed" aria-labelledby="personal-feed-title">
    <div className="card-heading">
      <div><p className="eyebrow">Jaget</p><h2 id="personal-feed-title">För mig</h2></div>
      {items.length ? <span className="badge">{items.length}</span> : null}
    </div>
    {items.length
      ? <div className="priority-list">{items.map((item) => <button className="priority-item" data-kind={item.kind} key={item.id} onClick={item.onClick} type="button">
          <span className="priority-marker" aria-hidden="true" />
          <span className="priority-copy"><small>{labels[item.kind]}</small><strong>{item.title}</strong><span>{item.meta}</span></span>
          {item.onClick ? <b aria-hidden="true">→</b> : null}
        </button>)}</div>
      : <p className="overview-empty">Inget kräver din uppmärksamhet just nu.</p>}
  </section>;
}
