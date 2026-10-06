"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Activity, Organization, Team } from "@/domain/club";
import { ActivityDetailModal } from "./activity-detail-modal";
import type { ActivityHistoryResult } from "@/lib/ai/activity-history-result";

export function AssistantHistoryCard({ result, answer }: { result: ActivityHistoryResult; answer?: string }) {
  const [detail, setDetail] = useState<{ activity: Activity; organization: Organization; team: Team; permissions?: { canManageAttendance: boolean } }>();
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
  const invitation = result.kind === "invitations";
  const period = `${date.format(new Date(`${result.from}T12:00:00Z`))}–${date.format(new Date(`${result.through}T12:00:00Z`))}`;
  const mentioned = new Set<string>();
  const link = (activity: ActivityHistoryResult["activities"][number], label: string) => <HistoryActivityLink key={`${activity.id}-${content.length}`} activity={activity} label={label} opening={!!opening} onOpen={openActivity} />;
  const content: ReactNode[] = [];
  let remaining = answer ?? "";
  // Only unique titles can identify an activity unambiguously in free text.
  const unique = result.activities.filter(a => a.title && result.activities.filter(other => other.title === a.title).length === 1);
  while (remaining) {
    const next = unique.map(activity => ({ activity, index: remaining.indexOf(activity.title) })).filter(match => match.index >= 0).sort((a, b) => a.index - b.index || b.activity.title.length - a.activity.title.length)[0];
    if (!next) { content.push(remaining); break; }
    content.push(remaining.slice(0, next.index), link(next.activity, next.activity.title));
    mentioned.add(next.activity.id);
    remaining = remaining.slice(next.index + next.activity.title.length);
  }
  const extra = result.activities.filter(activity => !mentioned.has(activity.id)).slice(0, 5);
  return <div className="assistant-history">
    {answer ? <p>{content}</p> : null}
    {extra.length ? <p>Aktiviteter: {extra.map((activity, index) => <span key={activity.id}>{index ? "; " : ""}{link(activity, `${activity.title}, ${when.format(new Date(activity.startsAt))}`)}</span>)}{result.activities.length - mentioned.size > extra.length ? ". Begränsa perioden för fler aktiviteter." : "."}</p> : null}
    <p><strong>{result.summary.uniquePeople} {invitation ? `spelare från ${result.sourceTeam}` : result.summary.uniquePeople === 1 ? "person" : "personer"}</strong> · {result.summary.participationCount} {invitation ? (result.summary.participationCount === 1 ? "kallelsetillfälle" : "kallelsetillfällen") : result.category === "work" ? (result.summary.participationCount === 1 ? "genomfört arbetstillfälle" : "genomförda arbetstillfällen") : (result.summary.participationCount === 1 ? "registrerat deltagartillfälle" : "registrerade deltagartillfällen")}</p>
    <p>{result.team} · {period} · {result.timeZone}</p>
    {result.unreportedActivityCount && result.category !== "work" ? <p>På {result.unreportedActivityCount} aktiviteter saknas närvarorapport. De räknas inte som frånvaro.</p> : null}
    {opening ? <p role="status">Öppnar aktivitet…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {detail ? createPortal(<ActivityDetailModal activity={detail.activity} organization={detail.organization} team={detail.team} canManageActivity={false} canManageInvitations={false} canManageAttendance={detail.permissions?.canManageAttendance === true} rosterMembers={[]} onClose={() => { setDetail(undefined); trigger.current?.focus(); }} onEdit={() => {}} />, document.body) : null}
    {result.truncated ? <small>Personlistan är begränsad. Summeringen omfattar hela perioden.</small> : null}
  </div>;
}

function HistoryActivityLink({ activity, label, opening, onOpen }: { activity: ActivityHistoryResult["activities"][number]; label: string; opening: boolean; onOpen: (id: string, button: HTMLButtonElement) => Promise<void> }) {
  return <button className="assistant-activity-link" type="button" disabled={opening} aria-label={`Öppna ${activity.title}`} onClick={event => void onOpen(activity.id, event.currentTarget)}>{label}</button>;
}
