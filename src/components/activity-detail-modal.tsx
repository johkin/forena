"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity, Member, Organization, Team } from "@/domain/club";
import { AttendanceModal } from "@/components/attendance-modal";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

type EventRow = {
  id: string;
  event_type: "invitation_scheduled" | "invitation_queued" | "invitation_sent" | "invitation_delivery_failed" | "reminder_scheduled" | "reminder_sent" | "invitation_response_changed" | "activity_updated" | "activity_cancelled";
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
  rosterMembers: Member[];
  onClose: () => void;
  onEdit: (activity: Activity) => void;
};

const eventLabels: Record<EventRow["event_type"], string> = {
  invitation_scheduled: "Kallelse schemalagd",
  invitation_queued: "Kallelse köad",
  invitation_sent: "Kallelse skickad",
  invitation_delivery_failed: "Notifiering kunde inte levereras",
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

export function ActivityDetailModal({ activity, organization, team, canEdit, rosterMembers, onClose, onEdit }: Props) {
  useModalScrollLock();
  const timeZone = organization.timeZone ?? "Europe/Stockholm";
  const [events, setEvents] = useState<EventRow[]>([]);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | null>(null);
  const [invitees, setInvitees] = useState<ActivityInvitee[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [invitationPending, setInvitationPending] = useState(false);
  const [invitationNotice, setInvitationNotice] = useState<string>();
  const [openedAt] = useState(() => Date.now());
  const activityStarted = new Date(activity.startsAt).getTime() <= openedAt;
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(activity.startsAt));
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit" });

  const loadEventsAndDelivery = useCallback(async (activityId: string, shouldApply = () => true) => {
    try {
      const response = await fetch(`/api/activities/${activityId}/events`);
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (shouldApply()) {
        setEvents(body.events ?? []);
        setDeliveryStatus(body.deliveryStatus ?? null);
        setHistoryError(false);
      }
    } catch {
      if (shouldApply()) setHistoryError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadEventsAndDelivery(activity.id, () => !cancelled);
    return () => { cancelled = true; };
  }, [activity.id, loadEventsAndDelivery]);

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
  const volunteers = invitees.filter((item) => item.role === "volunteer");
  const responseText = { accepted: "Kommer", declined: "Kan inte", pending: "Ej svarat" } as const;
  const alreadyInvited = new Set(invitees.map((item) => item.personId));
  const availableInvitees = rosterMembers.filter((member) => !alreadyInvited.has(member.id));

  function toggleInvitee(personId: string) {
    setSelectedPeople((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId); else next.add(personId);
      return next;
    });
  }

  async function sendInvitation() {
    if (!selectedPeople.size) return;
    setInvitationPending(true);
    setInvitationNotice(undefined);
    let response: Response;
    let body: { error?: string; queuedRecipients?: number };
    try {
      response = await fetch(`/api/activities/${activity.id}/invitations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "now", personIds: [...selectedPeople] }),
      });
      body = await response.json();
    } catch {
      setInvitationNotice("Kallelsen kunde inte skickas.");
      return;
    } finally {
      setInvitationPending(false);
    }
    if (!response.ok) {
      setInvitationNotice(body.error ?? "Kallelsen kunde inte skickas.");
      return;
    }
    setInvitationNotice(`Kallelsen köades till ${body.queuedRecipients ?? selectedPeople.size} mottagare.`);
    setSelectedPeople(new Set());
    const [detailResponse] = await Promise.all([
      fetch(`/api/activities/${activity.id}`),
      loadEventsAndDelivery(activity.id),
    ]);
    if (detailResponse.ok) {
      const detail = await detailResponse.json();
      setInvitees(detail.invitees ?? []);
    }
  }

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
        {volunteers.length ? <details className="player-invitations"><summary>Övriga roller · {volunteers.filter((item) => item.response === "accepted").length} kommer av {volunteers.length} kallade</summary><div className="invitee-list">{volunteers.map((person) => <div key={person.personId}><strong>{person.displayName}</strong><span data-response={person.response}>{responseText[person.response]}</span></div>)}</div></details> : null}
      </section> : null}

      {canEdit ? <details className="activity-invitation-add">
        <summary>Lägg till kallelse</summary>
        <div className="activity-invitation-add-body">
          <p className="overview-empty">Välj personer som ska få en kallelse nu. Redan kallade personer visas inte här.</p>
          {availableInvitees.length ? <div className="invitation-person-picker">{availableInvitees.map((member) => <label key={member.id}>
            <input type="checkbox" checked={selectedPeople.has(member.id)} onChange={() => toggleInvitee(member.id)} />
            <span><strong>{member.displayName}</strong><small>{member.teamRole === "participant" ? "Spelare" : member.teamRole === "leader" ? "Ledare" : "Övrig"}</small></span>
          </label>)}</div> : <p className="overview-empty">Alla i laget är redan kallade.</p>}
          {invitationNotice ? <p className="overview-empty" role="status">{invitationNotice}</p> : null}
          <div className="modal-actions"><button className="primary" disabled={!selectedPeople.size || invitationPending} onClick={() => void sendInvitation()} type="button">{invitationPending ? "Köar…" : "Skicka kallelse"}</button></div>
        </div>
      </details> : null}

      {canEdit && deliveryStatus ? <details className="delivery-status">
        <summary><span>Leveransstatus</span><small>{deliveryStatus.sent} skickade · {deliveryStatus.queued} väntar · {deliveryStatus.failed} misslyckade</small></summary>
        <div className="delivery-summary">
          <span><strong>{deliveryStatus.sent}</strong> skickade</span>
          <span><strong>{deliveryStatus.queued}</strong> väntar</span>
          <span><strong>{deliveryStatus.failed}</strong> misslyckade</span>
        </div>
        {deliveryStatus.deliveries.length ? <ol className="delivery-list">{deliveryStatus.deliveries.slice(0, 20).map((delivery) => <li key={delivery.outboxId}>
          <div><strong>{delivery.type === "invitation_reminder" ? "Påminnelse" : "Kallelse"}</strong><small>{new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(delivery.scheduledAt))} · försök {delivery.attempts}</small></div>
          <div className="delivery-channels">{delivery.channels.map((channel) => <span className={`delivery-channel ${channel.status}`} key={channel.channel}>{channel.channel === "email" ? "E-post" : "Push"}: {statusLabels[channel.status]}</span>)}</div>
        </li>)}</ol> : <p className="overview-empty">Inga notifieringar har köats för aktiviteten ännu.</p>}
      </details> : null}

      {(events.length > 0 || historyError) ? <section className="activity-history" aria-labelledby="activity-history-title">
        <div className="card-heading"><div><p className="eyebrow">Historik</p><h3 id="activity-history-title">Kallelser och ändringar</h3></div></div>
        {historyError ? <p className="overview-empty">Historiken kunde inte hämtas.</p> : <ol>{events.map((event) => <li key={event.id}>
          <span className="history-dot" />
          <span><strong>{eventLabels[event.event_type]}</strong><small>{new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(event.created_at))}{event.recipient_count ? ` · ${event.recipient_count} mottagare` : ""}{event.channel ? ` · ${event.channel}` : ""}</small></span>
        </li>)}</ol>}
      </section> : null}
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Stäng</button>{canEdit && activityStarted ? <button className="primary" onClick={() => setAttendanceOpen(true)} type="button">Rapportera närvaro</button> : null}{canEdit ? <button className="secondary" onClick={() => onEdit(activity)} type="button">Redigera aktivitet</button> : null}</div>
    </section>
    {attendanceOpen ? <AttendanceModal activityId={activity.id} onClose={() => setAttendanceOpen(false)} /> : null}
  </div>;
}
