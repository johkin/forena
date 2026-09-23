"use client";

import type { Activity, Organization, Team } from "@/domain/club";

type Props = {
  activity: Activity;
  organization: Organization;
  team: Team;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (activity: Activity) => void;
};

export function ActivityDetailModal({ activity, organization, team, canEdit, onClose, onEdit }: Props) {
  const timeZone = organization.timeZone ?? "Europe/Stockholm";
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(activity.startsAt));
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit" });
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal activity-detail-modal" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
      <div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="activity-detail-title">{activity.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Stäng" type="button">✕</button></div>
      <div className="activity-detail-body">
        <p><span>Datum</span><strong>{date}</strong></p>
        {activity.gatheringAt ? <p><span>Samling</span><strong>{time.format(new Date(activity.gatheringAt))}</strong></p> : null}
        <p><span>Tid</span><strong>{time.format(new Date(activity.startsAt))}–{time.format(new Date(activity.endsAt))}</strong></p>
        <p><span>Plats</span><strong>{activity.location || "Ingen plats angiven"}</strong></p>
        {activity.responseDueAt ? <p><span>Svara senast</span><strong>{new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.responseDueAt))}</strong></p> : null}
        {activity.seriesId ? <p><span>Serie</span><strong>Ingår i en aktivitetsserie</strong></p> : null}
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Stäng</button>{canEdit ? <button className="primary" onClick={() => onEdit(activity)} type="button">Redigera aktivitet</button> : null}</div>
    </section>
  </div>;
}
