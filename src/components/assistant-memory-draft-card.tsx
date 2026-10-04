"use client";

import { useState } from "react";
import { confirmAssistantMemory } from "@/app/assistant-memory/actions";
import { memoryScopeLabels, type AssistantMemoryDraft } from "@/lib/ai/assistant-memory-draft";

export function AssistantMemoryDraftCard({ draft }: { draft: AssistantMemoryDraft }) {
  const [status, setStatus] = useState<"proposed" | "saving" | "saved" | "dismissed">("proposed");
  const [error, setError] = useState<string>();
  async function confirm() {
    if (status !== "proposed") return;
    setStatus("saving");
    setError(undefined);
    try {
      const result = await confirmAssistantMemory(draft);
      if (!result.saved) { setError(result.error); setStatus("proposed"); return; }
      setStatus("saved");
    } catch {
      setError("Minnet kunde inte sparas. Försök igen.");
      setStatus("proposed");
    }
  }
  return <section className="memory-item" aria-label="Minnesförslag" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <div className="memory-item-heading"><div><strong>{memoryScopeLabels[draft.scope]} · {draft.scopeName}</strong></div></div>
    <strong>{draft.subject}</strong>
    <p style={{ whiteSpace: "pre-wrap" }}>{draft.content}</p>
    {draft.disciplineId ? <small>Gäller lagets aktuella disciplin.</small> : null}
    {status === "proposed" || status === "saving" ? <>
      <small>Inte sparat. Granska text och nivå innan du bekräftar.{draft.key ? " Ett befintligt minne med samma nyckel på denna nivå uppdateras." : ""}</small>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="primary" disabled={status === "saving"} onClick={() => void confirm()}>{status === "saving" ? "Sparar…" : "Spara minne"}</button>
        <button type="button" className="secondary" disabled={status === "saving"} onClick={() => setStatus("dismissed")}>Avvisa</button>
      </div>
    </> : <p role="status">{status === "saved" ? "Minnet har sparats." : "Förslaget har avvisats och sparades inte."}</p>}
    {error ? <p role="alert" className="auth-error">{error}</p> : null}
  </section>;
}
