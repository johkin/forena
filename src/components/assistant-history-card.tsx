"use client";

import { useRef, useState } from "react";
import type { Activity, Organization, Team } from "@/domain/club";
import { ActivityDetailModal } from "./activity-detail-modal";
import type { ActivityHistoryResult } from "@/lib/ai/activity-history-result";

export function AssistantHistoryCard({ result }: { result: ActivityHistoryResult }) {
  const [detail, setDetail] = useState<{ activity: Activity; organization: Organization; team: Team }>();
  const [opening, setOpening] = useState<string>();
  const [error, setError] = useState<string>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  async function openActivity(id: string, button: HTMLButtonElement) {
    if (opening) return;
    trigger.current = button;
    setOpening(id);
    setError(undefined);
    try {
      const response = await fetch(`/api/activities/${encodeURIComponent(id)}/detail`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Aktiviteten kunde inte öppnas.");
      setDetail(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aktiviteten kunde inte öppnas.");
    } finally { setOpening(undefined); }
  }
  // Period boundaries are calendar dates; UTC preserves their day in every zone.
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const when = new Intl.DateTimeFormat("sv-SE", { timeZone: result.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const period = `${date.format(new Date(`${result.from}T12:00:00Z`))}–${date.format(new Date(`${result.through}T12:00:00Z`))}`;
  return <div className="assistant-history">
    <p><strong>{result.summary.uniquePeople} {result.summary.uniquePeople === 1 ? "person" : "personer"}</strong> · {result.summary.participationCount} {result.category === "work" ? (result.summary.participationCount === 1 ? "genomfört arbetstillfälle" : "genomförda arbetstillfällen") : (result.summary.participationCount === 1 ? "registrerat deltagartillfälle" : "registrerade deltagartillfällen")}</p>
    <p>{result.team} · {period} · {result.timeZone}</p>
    {result.unreportedActivityCount && result.category !== "work" ? <p>På {result.unreportedActivityCount} aktiviteter saknas närvarorapport. De räknas inte som frånvaro.</p> : null}
    <details>
      <summary>Visa aktiviteter ({result.activities.length})</summary>
      {result.activities.length ? <ul>{result.activities.map(activity => <li key={activity.id}>
        <button className="assistant-activity-link" type="button" disabled={!!opening} aria-label={`Öppna ${activity.title}`} onClick={event => void openActivity(activity.id, event.currentTarget)}>{activity.title}</button>
        <span>{when.format(new Date(activity.startsAt))} · {result.team}</span>
        <span>{result.category !== "work" && !activity.attendanceReported ? "Närvaro ej rapporterad" : `${activity.participationCount} ${result.category === "work" ? "genomförda arbetstillfällen" : "närvarande"}`}</span>
      </li>)}</ul> : <p>Inga aktiviteter i det valda underlaget.</p>}
    </details>
    {opening ? <p role="status">Öppnar aktivitet…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {detail ? <ActivityDetailModal activity={detail.activity} organization={detail.organization} team={detail.team} canManageActivity={false} canManageInvitations={false} canManageAttendance={false} rosterMembers={[]} onClose={() => { setDetail(undefined); trigger.current?.focus(); }} onEdit={() => {}} /> : null}
    {result.truncated ? <small>Personlistan är begränsad. Summeringen och aktivitetslistan omfattar hela perioden.</small> : null}
  </div>;
}
