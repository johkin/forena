"use client";

import { useState } from "react";
import { confirmAssistantDuties } from "@/app/assistant-duties/actions";
import type { ActivityDutyDraft } from "@/lib/ai/activity-duty-draft";

export function AssistantDutyDraftCard({ draft }: { draft: ActivityDutyDraft }) {
  const [status, setStatus] = useState<"proposed" | "saving" | "saved" | "dismissed">("proposed");
  const [message, setMessage] = useState("");
  const count = draft.preview.activities.filter(a => !a.exists).length;
  async function confirm() {
    if (status !== "proposed") return;
    setStatus("saving"); setMessage("");
    try {
      const result = await confirmAssistantDuties({ teamId: draft.teamId, command: draft.command, fingerprint: draft.preview.fingerprint });
      if (!result.saved) { setMessage(result.error); setStatus("proposed"); return; }
      setMessage(`${result.created} uppgifter sparade. ${result.skipped} befintliga uppgifter hoppades över.`);
      setStatus("saved");
    } catch { setMessage("Sparresultatet är okänt. Kontrollera schemat eller be om ett nytt förslag."); setStatus("proposed"); }
  }
  const format = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: draft.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <section className="memory-item" aria-label="Uppgiftsförslag" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <strong>{draft.command.name} · {draft.command.places} platser per aktivitet</strong>
    <p>{count} nya uppgifter. {draft.preview.activities.length - count} befintliga uppgifter hoppas över.</p>
    {draft.unknownMatchVenueCount ? <p>{draft.unknownMatchVenueCount} matcher i det lästa underlaget saknar hemma/borta och kan inte identifieras som hemmamatcher. Kontrollera urvalet nedan.</p> : null}
    {draft.command.instructions ? <p>{draft.command.instructions}</p> : null}
    <ul>{draft.preview.activities.map(a => <li key={a.id}>{a.title} · {format(a.startsAt)}–{format(a.endsAt)}{a.exists ? " · Finns redan" : ""}{a.sourceKind === "imported" ? " · Importerad" : ""}{a.venue === "home" ? " · Hemma" : ""}{a.seriesTitle ? ` · ${a.seriesTitle}` : ""}</li>)}</ul>
    <small>Tomma bokningsbara platser skapas för hela aktivitetens tid. Tiderna följer aktiviteten. Ingen tilldelas eller kallas. Endast listade aktiviteter påverkas; ingen regel för framtida importer sparas.</small>
    {status === "proposed" || status === "saving" ? <div className="modal-actions">
      <button type="button" className="primary" disabled={status === "saving" || !count} onClick={() => void confirm()}>{status === "saving" ? "Sparar…" : "Spara uppgifter"}</button>
      <button type="button" className="secondary" disabled={status === "saving"} onClick={() => setStatus("dismissed")}>Avvisa</button>
    </div> : null}
    {status === "dismissed" ? <p role="status">Avvisat. Inget har sparats.</p> : message ? <p role={status === "saved" ? "status" : "alert"}>{message}</p> : null}
  </section>;
}
