"use client";

import { useMemo, useState } from "react";
import { createMemory, deleteMemory, updateMemory } from "@/app/o/[organizationSlug]/memories/actions";

type Scope = "personal" | "organization" | "section" | "team";
type Target = { id: string; scope: Scope; name: string; description: string };
type Memory = { id: string; scope: Scope; scope_id: string | null; discipline_id: string | null; kind: string; subject: string; content: string; updated_at: string };

const scopeLabels: Record<Scope, string> = { personal: "Jag", team: "Lag", section: "Sektion", organization: "Klubb" };
const kindLabels: Record<string, string> = { fact: "Fakta", preference: "Preferens", instruction: "Instruktion", convention: "Arbetssätt" };

export function AssistantMemoryManager({ organizationSlug, targets, memories, initialScope, initialScopeId }: {
  organizationSlug: string; targets: Target[]; memories: Memory[]; initialScope: Scope; initialScopeId?: string;
}) {
  const initial = targets.find(target => target.scope === initialScope && (!initialScopeId || target.id === initialScopeId))
    ?? targets.find(target => target.scope === initialScope) ?? targets[0];
  const [targetKey, setTargetKey] = useState(initial ? `${initial.scope}:${initial.id}` : "");
  const target = targets.find(item => `${item.scope}:${item.id}` === targetKey);
  const visible = useMemo(() => memories.filter(memory =>
    memory.scope === target?.scope && memory.scope_id === target?.id
  ), [memories, target]);

  if (!target) return <p className="form-help">Det finns ingen minnesnivå att visa.</p>;
  const summary = visible.length
    ? visible.slice(0, 3).map(memory => memory.content.replace(/\s+/g, " ").trim()).join(" · ")
    : "Assistenten har ännu inget sparat minne på den här nivån.";

  return <div className="memory-manager">
    <div className="memory-scope-tabs" role="tablist" aria-label="Minnesnivåer">
      {targets.map(item => <button key={`${item.scope}:${item.id}`} type="button" role="tab"
        aria-selected={targetKey === `${item.scope}:${item.id}`} className={targetKey === `${item.scope}:${item.id}` ? "selected" : ""}
        onClick={() => setTargetKey(`${item.scope}:${item.id}`)}>
        <span>{scopeLabels[item.scope]}</span><small>{item.name}</small>
      </button>)}
    </div>

    <section className="memory-summary-card">
      <div><p className="eyebrow">Så här minns assistenten</p><h2>{target.name}</h2></div>
      <p>{summary}</p>
      <small>Sammanfattningen ovan är en snabb överblick. Minnena nedan är den faktiska information som används av assistenten.</small>
    </section>

    <details className="memory-add">
      <summary>Lägg till minne</summary>
      <form action={createMemory} className="application-form">
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="scope" value={target.scope} />
        <input type="hidden" name="scopeId" value={target.id} />
        <div className="memory-form-grid">
          <label>Typ<select name="kind" defaultValue="instruction"><option value="instruction">Instruktion</option><option value="convention">Arbetssätt</option><option value="preference">Preferens</option><option value="fact">Fakta</option></select></label>
          <label>Rubrik<input name="subject" required maxLength={80} placeholder="Till exempel Matcher" /></label>
        </div>
        <label>Vad ska assistenten komma ihåg?<textarea name="content" required maxLength={1200} rows={4} placeholder="Skriv det som ska gälla framöver…" /></label>
        <button className="primary" type="submit">Spara minne</button>
      </form>
    </details>

    <div className="memory-list">
      {visible.length ? visible.map(memory => <article className="memory-item" key={memory.id}>
        <div className="memory-item-heading"><div><span className="status accepted">{kindLabels[memory.kind] ?? memory.kind}</span>{memory.discipline_id ? <span className="status">Disciplin</span> : null}<strong>{memory.subject}</strong></div><small>Uppdaterat {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(memory.updated_at))}</small></div>
        <form action={updateMemory}>
          <input type="hidden" name="organizationSlug" value={organizationSlug} /><input type="hidden" name="scope" value={target.scope} /><input type="hidden" name="scopeId" value={target.id} /><input type="hidden" name="id" value={memory.id} />
          <textarea name="content" required maxLength={1200} rows={3} defaultValue={memory.content} /><button className="secondary" type="submit">Spara ändring</button>
        </form>
        <form action={deleteMemory}><input type="hidden" name="organizationSlug" value={organizationSlug} /><input type="hidden" name="scope" value={target.scope} /><input type="hidden" name="scopeId" value={target.id} /><input type="hidden" name="id" value={memory.id} /><button className="memory-delete" type="submit">Ta bort</button></form>
      </article>) : <div className="memory-empty"><strong>Inga minnen ännu</strong><p>När du eller assistenten sparar något på den här nivån visas det här.</p></div>}
    </div>
  </div>;
}
