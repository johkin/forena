"use client";

import type { Activity, InvitationSummary } from "@/domain/club";

type Props = {
  teamName: string;
  activity: Activity;
  summary: InvitationSummary;
  upcomingActivities: Activity[];
  openTasks: number;
  timeZone: string;
  referenceTime: string;
  onOpenActivity: (activity: Activity) => void;
};

export function TeamStatusCard({ teamName, activity, summary, upcomingActivities, openTasks, timeZone, referenceTime, onOpenActivity }: Props) {
  const start = new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.gatheringAt ?? activity.startsAt));
  const weekLimit = new Date(referenceTime).getTime() + 7 * 24 * 60 * 60 * 1000;
  const nextSevenDays = upcomingActivities.filter((item) => new Date(item.startsAt).getTime() <= weekLimit).length;

  return <section className="card team-status-card" aria-labelledby="team-status-title">
    <div className="card-heading"><div><p className="eyebrow">Laget</p><h2 id="team-status-title">{teamName}</h2></div></div>
    <button className="team-next-activity" onClick={() => onOpenActivity(activity)} type="button">
      <span><small>Nästa aktivitet</small><strong>{activity.title}</strong><span>{start} · {activity.location}</span></span><b aria-hidden="true">→</b>
    </button>
    <div className="team-status-metrics">
      <div><strong>{summary.accepted}</strong><span>kommer</span></div>
      <div><strong>{summary.declined}</strong><span>kan inte</span></div>
      <div><strong>{summary.pending}</strong><span>ej svarat</span></div>
    </div>
    <div className="team-status-footer">
      <span><strong>{nextSevenDays}</strong> aktiviteter kommande 7 dagar</span>
      {openTasks > 0 ? <span><strong>{openTasks}</strong> öppna laguppgifter</span> : <span>Inga öppna laguppgifter</span>}
    </div>
  </section>;
}
