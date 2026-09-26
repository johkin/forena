"use client";

import { useEffect, useState } from "react";
import type { Activity, Organization, Team } from "@/domain/club";

type EventRow = {
  id: string;
  event_type: "invitation_scheduled" | "invitation_sent" | "reminder_scheduled" | "reminder_sent" | "invitation_response_changed" | "activity_updated" | "activity_cancelled";
  channel: "push" | "email" | "sms" | "in_app" | null;
  recipient_count: number | null;
  created_at: string;
};

type DeliveryChannel = {
  channel: "email" | "push";
  status: "pending" | "sent" | "failed" | "skipped";
  provider: string | null;
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
};

type DeliveryItem = {
  outboxId: string;
  type: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  scheduledAt: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  channels: DeliveryChannel[];
};

type DeliveryStatus = {
  queued: number;
  sent: number;
  failed: number;
  deliveries: DeliveryItem[];
};

type ActivityInvitee = {
  personId: string;
  displayName: string;
  role: "participant" | "leader" | "volunteer";
  response: "pending" | "accepted" | "declined";
};

type Props = {
  activity: Activity;
  organization: Organization;
  team: Team;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (activity: Activity) => void;
};

const eventLabels: Record<EventRow["event_type"], string> = {
  invitation_scheduled: "Kallelse schemalagd",
  invitation_sent: "Kallelse skickad",
  reminder_scheduled: "Påminnelse schemalagd",
  reminder_sent: "Påminnelse skickad",
  invitation_response_changed: "Kallelsesvar registrerat",
  activity_updated: "Aktiviteten uppdaterad",
  activity_cancelled: "Aktiviteten inställd",
};

const statusLabels: Record<DeliveryChannel["status"], string> = {
  pending: "Väntar",
  sent: "Skickad",
  failed: "Misslyckad",
  skipped: "Ej använd",
};

export function ActivityDetailModal({ activity, organization, team, canEdit, onClose, onEdit }: Props) {
  const timeZone = organization.timeZone ?? "Europe/Stockholm";
  const [events, setEvents] = useState<EventRow[]>([]);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | null>(null);
  const [invitees, setInvitees] = useState<ActivityInvitee[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(activity.startsAt));
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/activities/${activity.id}/events`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body) => {
        if (!cancelled) {
          setEvents(body.events ?? []);
          setDeliveryStatus(body.deliveryStatus ?? null);
        }
      })
      .catch(() => { if (!cancelled) setHistoryError(true); });
    return () => { cancelled = true; };
  }, [activity.id]);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    fetch(`/api/activities/${activity.id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body) => { if (!cancelled) setInvitees(body.invitees ?? []); })
      .catch(() => { if (!cancelled) setInvitees([]); });
    return () => { cancelled = true; };
  }, [activity.id, canEdit]);

  const leaders = invitees.filter((item) => item.role === "leader");
  const players = invitees.filter((item) => item.role === "participant");
  const responseText = { accepted: "Kommer", declined: "Kan inte", pending: "Ej svarat" } as const;

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

      {canEdit ? <section className="activity-staffing" aria-labelledby="activity-staffing-title">
        <div className="card-heading"><div><p className="eyebrow">Kallelser</p><h3 id="activity-staffing-title">Bemanning</h3></div></div>
        {leaders.length ? <div className="invitee-list">{leaders.map((leader) => <div key={leader.personId}><strong>{leader.displayName}</strong><span data-response={leader.response}>{responseText[leader.response]}</span></div>)}</div> : <p className="overview-empty">Inga ledare är kallade till aktiviteten.</p>}
        {players.length ? <details className="player-invitations"><summary>Spelare · {players.filter((item) => item.response === "accepted").length} kommer av {players.length} kallade</summary><div className="invitee-list">{players.map((player) => <div key={player.personId}><strong>{player.displayName}</strong><span data-response={player.response}>{responseText[player.response]}</span></div>)}</div></details> : null}
      </section> : null}

      {canEdit && deliveryStatus ? <section className="delivery-status" aria-labelledby="delivery-status-title">
        <div className="card-heading"><div><p className="eyebrow">Notifieringar</p><h3 id="delivery-status-title">Leveransstatus</h3></div></div>
        <div className="delivery-summary">
          <span><strong>{deliveryStatus.sent}</strong> skickade</span>
          <span><strong>{deliveryStatus.queued}</strong> väntar</span>
          <span><strong>{deliveryStatus.failed}</strong> misslyckade</span>
        </div>
        {deliveryStatus.deliveries.length ? <ol className="delivery-list">{deliveryStatus.deliveries.slice(0, 20).map((delivery) => <li key={delivery.outboxId}>
          <div><strong>{delivery.type === "invitation_reminder" ? "Påminnelse" : "Kallelse"}</strong><small>{new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(delivery.scheduledAt))} · försök {delivery.attempts}</small></div>
          <div className="delivery-channels">{delivery.channels.map((channel) => <span className={`delivery-channel ${channel.status}`} key={channel.channel}>{channel.channel === "email" ? "E-post" : "Push"}: {statusLabels[channel.status]}</span>)}</div>
        </li>)}</ol> : <p className="overview-empty">Inga notifieringar har köats för aktiviteten ännu.</p>}
      </section> : null}

      {(events.length > 0 || historyError) ? <section className="activity-history" aria-labelledby="activity-history-title">
        <div className="card-heading"><div><p className="eyebrow">Historik</p><h3 id="activity-history-title">Kallelser och ändringar</h3></div></div>
        {historyError ? <p className="overview-empty">Historiken kunde inte hämtas.</p> : <ol>{events.map((event) => <li key={event.id}>
          <span className="history-dot" />
          <span><strong>{eventLabels[event.event_type]}</strong><small>{new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(event.created_at))}{event.recipient_count ? ` · ${event.recipient_count} mottagare` : ""}{event.channel ? ` · ${event.channel}` : ""}</small></span>
        </li>)}</ol>}
      </section> : null}
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Stäng</button>{canEdit ? <button className="primary" onClick={() => onEdit(activity)} type="button">Redigera aktivitet</button> : null}</div>
    </section>
  </div>;
}
