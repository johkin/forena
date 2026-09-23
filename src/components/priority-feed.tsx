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
  kind: "activity" | "invitation" | "attendance" | "task";
  title: string;
  meta: string;
  dueAt: number;
  onClick?: () => void;
};

const labels = {
  activity: "Aktivitet",
  invitation: "Kallelse",
  attendance: "Närvaro",
  task: "Uppgift",
} as const;

export function PriorityFeed({ activity, pendingInvitations, tasks, onOpenActivity }: Props) {
  const now = Date.now();
  const items: FeedItem[] = [];

  if (pendingInvitations > 0) {
    const dueAt = activity.responseDueAt ? new Date(activity.responseDueAt).getTime() : new Date(activity.startsAt).getTime();
    items.push({
      id: `invitation:${activity.id}`,
      kind: "invitation",
      title: `${pendingInvitations} obesvarade kallelser till ${activity.title}`,
      meta: activity.responseDueAt
        ? `Svara senast ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.responseDueAt))}`
        : "Svar saknas",
      dueAt,
      onClick: () => onOpenActivity(activity),
    });
  }

  items.push({
    id: `activity:${activity.id}`,
    kind: "activity",
    title: activity.title,
    meta: `${new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.gatheringAt ?? activity.startsAt))} · ${activity.location}`,
    dueAt: new Date(activity.gatheringAt ?? activity.startsAt).getTime(),
    onClick: () => onOpenActivity(activity),
  });

  for (const task of tasks) {
    items.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      meta: `${task.createdByLabel} · senast ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(task.dueAt))}`,
      dueAt: new Date(task.dueAt).getTime(),
    });
  }

  items.push({
    id: "attendance:previous",
    kind: "attendance",
    title: "Kontrollera om närvaro behöver registreras",
    meta: "Efter genomförd aktivitet",
    dueAt: now + 72 * 60 * 60 * 1000,
  });

  items.sort((a, b) => a.dueAt - b.dueAt);

  return <section className="card priority-feed" aria-labelledby="priority-feed-title">
    <div className="card-heading"><div><p className="eyebrow">Prioriterat</p><h2 id="priority-feed-title">Aktuellt för dig</h2></div><span className="badge">{items.length}</span></div>
    <div className="priority-list">
      {items.map((item) => <button className="priority-item" data-kind={item.kind} key={item.id} onClick={item.onClick} type="button">
        <span className="priority-marker" aria-hidden="true" />
        <span className="priority-copy"><small>{labels[item.kind]}</small><strong>{item.title}</strong><span>{item.meta}</span></span>
        {item.onClick ? <b aria-hidden="true">→</b> : null}
      </button>)}
    </div>
  </section>;
}
