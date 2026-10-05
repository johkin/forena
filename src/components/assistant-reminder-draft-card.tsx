"use client";

import { startTransition, useState } from "react";
import { confirmAssistantReminder } from "@/app/assistant-reminders/actions";
import type { ReminderDraft } from "@/lib/ai/reminder-draft";

const scopeLabels: Record<string, string> = { system: "System", organization: "Klubb", section: "Sektion", team: "Lag" };

export function AssistantReminderDraftCard({ draft, demo = false }: { draft: ReminderDraft; demo?: boolean }) {
  const [status, setStatus] = useState<"proposed" | "sending" | "queued" | "dismissed">("proposed");
  const [error, setError] = useState<string>();
  const [queuedRecipients, setQueuedRecipients] = useState(0);
  const { assessment } = draft;
  const formatTime = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: draft.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  async function confirm() {
    if (status !== "proposed") return;
    if (demo) { setQueuedRecipients(assessment.pending); setStatus("queued"); return; }
    setStatus("sending");
    setError(undefined);
    try {
      const result = await confirmAssistantReminder({ teamId: assessment.teamId, activityId: assessment.activityId, fingerprint: assessment.fingerprint });
      if (!result.queued) { setError(result.error); setStatus("proposed"); return; }
      setQueuedRecipients(result.queuedRecipients);
      setStatus("queued");
    } catch {
      setError("Utskicket kunde inte bekräftas. Be om ett nytt förslag för att kontrollera aktuellt läge.");
      setStatus("proposed");
    }
  }

  return <section className="memory-item" aria-label="Påminnelseförslag" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <strong>Påminnelse · {assessment.title}</strong>
    <small>Start: {formatTime(assessment.startsAt)} · {draft.timeZone}</small>
    {assessment.responseDueAt ? <small>Svara senast: {formatTime(assessment.responseDueAt)}</small> : null}
    <p>{draft.reason}</p>
    <p>{assessment.accepted} kommer · {assessment.declined} kan inte · {assessment.pending} obesvarade</p>
    <small>Spelare: {assessment.acceptedPlayers} kommer · {assessment.pendingPlayers} obesvarade</small>
    <small>{assessment.lastReminderAt ? `Senast köad eller skickad påminnelse: ${formatTime(assessment.lastReminderAt)}` : "Ingen tidigare påminnelse registrerad."}</small>
    <small>Mottagare: konton och målsmän kopplade till de obesvarade kallelserna. Samma person får bara en köad påminnelse.</small>
    {draft.memories.length ? <details><summary>Minnen som ligger till grund för förslaget</summary>{draft.memories.map((memory, index) => <p key={index}><strong>{scopeLabels[memory.scope] ?? memory.scope} · {memory.subject}{memory.disciplineId ? " · Disciplin" : ""}</strong><br />{memory.content}</p>)}</details> : null}
    {status === "proposed" || status === "sending" ? <>
      <small>Inget har skickats. Kallelseläget och din behörighet kontrolleras igen när du bekräftar.</small>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="primary" disabled={status === "sending"} onClick={() => startTransition(() => confirm())}>{status === "sending" ? "Köar…" : "Skicka påminnelse"}</button>
        <button type="button" className="secondary" disabled={status === "sending"} onClick={() => setStatus("dismissed")}>Avvisa</button>
      </div>
    </> : <p role="status">{status === "queued" ? demo ? "Exempel bekräftat. Inget har skickats." : `Påminnelsen har köats till ${queuedRecipients} mottagare.` : "Förslaget har avvisats. Inget har skickats."}</p>}
    {error ? <p role="alert" className="auth-error">{error}</p> : null}
  </section>;
}
