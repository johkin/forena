"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity, Member, Organization, Team } from "@/domain/club";
import { ActivityStaffingList } from "@/components/activity-staffing-list";
import { AttendanceModal } from "@/components/attendance-modal";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

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
  role: "participant" | "leader";
  response: "pending" | "accepted" | "declined";
};

type Props = {
  activity: Activity;
  organization: Organization;
  team: Team;
  canManageActivity: boolean;
  canManageInvitations: boolean;
  canManageAttendance: boolean;
  rosterMembers: Member[];
  onClose: () => void;
  onEdit: (activity: Activity) => void;
};

const statusLabels: Record<DeliveryChannel["status"], string> = {
  pending: "Väntar",
  sent: "Skickad",
  failed: "Misslyckad",
  skipped: "Ej använd",
};

export function ActivityDetailModal({ activity, organization, team, canManageActivity, canManageInvitations, canManageAttendance, rosterMembers, onClose, onEdit }: Props) {
  useModalScrollLock();
  const timeZone = organization.timeZone ?? "Europe/Stockholm";
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | null>(null);
  const [invitees, setInvitees] = useState<ActivityInvitee[]>([]);
  const [deliveryError, setDeliveryError] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [invitationPending, setInvitationPending] = useState(false);
  const [invitationNotice, setInvitationNotice] = useState<string>();
  const [openedAt] = useState(() => Date.now());
  const activityStarted = new Date(activity.startsAt).getTime() <= openedAt;
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(activity.startsAt));
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit" });

  const loadDelivery = useCallback(async (activityId: string, shouldApply: () => boolean = () => true) => {
    try {
      const response = await fetch(`/api/activities/${activityId}/events`);
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (shouldApply()) {
        setDeliveryStatus(body.deliveryStatus ?? null);
        setDeliveryError(false);
      }
    } catch {
      if (shouldApply()) setDeliveryError(true);
    }
  }, []);

  useEffect(() => {
    if (!canManageInvitations) return;
    let cancelled = false;
    // The shared loader only updates state after awaiting the fetch response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDelivery(activity.id, () => !cancelled);
    return () => { cancelled = true; };
  }, [activity.id, canManageInvitations, loadDelivery]);

  useEffect(() => {
    if (!canManageInvitations) return;
    let cancelled = false;
    fetch(`/api/activities/${activity.id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body) => { if (!cancelled) setInvitees(body.invitees ?? []); })
      .catch(() => { if (!cancelled) setInvitees([]); });
    return () => { cancelled = true; };
  }, [activity.id, canManageInvitations]);

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
      loadDelivery(activity.id),
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
        {activity.seriesId ? <span className="activity-series-badge">Aktivitetsserie</span> : null}
      </div>

      {canManageInvitations ? <section className="activity-staffing" aria-labelledby="activity-staffing-title">
        <div className="card-heading"><div><p className="eyebrow">Kallelser</p><h3 id="activity-staffing-title">Bemanning</h3></div></div>
        <ActivityStaffingList invitees={invitees} />
      </section> : null}

      {canManageInvitations ? <details className="activity-invitation-add">
        <summary>Lägg till kallelse</summary>
        <div className="activity-invitation-add-body">
          <p className="overview-empty">Välj personer som ska få en kallelse nu. Redan kallade personer visas inte här.</p>
          {availableInvitees.length ? <div className="invitation-person-picker">{availableInvitees.map((member) => <label key={member.id}>
            <input type="checkbox" checked={selectedPeople.has(member.id)} onChange={() => toggleInvitee(member.id)} />
            <span><strong>{member.displayName}</strong><small>{member.teamRelation === "player" ? "Spelare" : "Ledare"}</small></span>
          </label>)}</div> : <p className="overview-empty">Alla i laget är redan kallade.</p>}
          {invitationNotice ? <p className="overview-empty" role="status">{invitationNotice}</p> : null}
          <div className="modal-actions"><button className="primary" disabled={!selectedPeople.size || invitationPending} onClick={() => void sendInvitation()} type="button">{invitationPending ? "Köar…" : "Skicka kallelse"}</button></div>
        </div>
      </details> : null}

      {canManageInvitations && deliveryStatus ? <details className="delivery-status">
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

      {canManageInvitations && deliveryError ? <p className="overview-empty" role="status">Leveransstatus kunde inte hämtas.</p> : null}
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Stäng</button>{canManageAttendance && activityStarted ? <button className="primary" onClick={() => setAttendanceOpen(true)} type="button">Rapportera närvaro</button> : null}{canManageActivity ? <button className="secondary" onClick={() => onEdit(activity)} type="button">Redigera aktivitet</button> : null}</div>
    </section>
    {attendanceOpen && canManageAttendance ? <AttendanceModal activityId={activity.id} onClose={() => setAttendanceOpen(false)} /> : null}
  </div>;
}
