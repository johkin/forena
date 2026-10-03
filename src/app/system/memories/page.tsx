import { createClient } from "@/lib/supabase/server";
import { createSystemMemory, deleteSystemMemory, updateSystemMemory } from "../actions";

export default async function SystemMemoriesPage({ searchParams }: { searchParams: Promise<{ discipline?: string; saved?: string; deleted?: string; error?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data: disciplines }, { data: memories }] = await Promise.all([
    supabase.from("disciplines").select("id, key, name").order("name"),
    supabase.from("assistant_memories").select("id, discipline_id, kind, subject, content, updated_at").eq("scope", "system").order("updated_at", { ascending: false }),
  ]);
  const selected = query.discipline ?? "general";
  const visible = (memories ?? []).filter(item => selected === "general" ? item.discipline_id === null : item.discipline_id === selected);
  const disciplineName = selected === "general" ? "Generellt" : disciplines?.find(item => item.id === selected)?.name ?? "Disciplin";
  return <main className="application-page"><div className="application-card"><div className="application-page-heading"><div><p className="eyebrow">System · Assistent</p><h1>Minnen</h1><p>Systemminnen används av assistenten men administreras endast här. Disciplinspecifika minnen kompletterar den generella systemkontexten.</p></div></div>
    {query.saved ? <p className="auth-message">Minnet har sparats.</p> : null}{query.deleted ? <p className="auth-message">Minnet har tagits bort.</p> : null}{query.error ? <p className="auth-error">{query.error}</p> : null}
    <div className="memory-scope-tabs"><a className={selected === "general" ? "selected" : ""} href="/system/memories?discipline=general"><span>Generellt</span><small>Alla discipliner</small></a>{(disciplines ?? []).map(item => <a key={item.id} className={selected === item.id ? "selected" : ""} href={`/system/memories?discipline=${item.id}`}><span>{item.name}</span><small>{item.key}</small></a>)}</div>
    <section className="memory-summary-card"><p className="eyebrow">Systemkontext</p><h2>{disciplineName}</h2><p>{visible.length ? visible.slice(0, 3).map(item => item.content).join(" · ") : "Inga systemminnen på den här nivån ännu."}</p></section>
    <details className="memory-add"><summary>Lägg till systemminne</summary><form action={createSystemMemory} className="application-form"><input type="hidden" name="disciplineId" value={selected === "general" ? "" : selected}/><div className="memory-form-grid"><label>Typ<select name="kind" defaultValue="instruction"><option value="instruction">Instruktion</option><option value="convention">Arbetssätt</option><option value="preference">Preferens</option><option value="fact">Fakta</option></select></label><label>Rubrik<input name="subject" required maxLength={80}/></label></div><label>Minne<textarea name="content" required maxLength={1200} rows={4}/></label><button className="primary">Spara</button></form></details>
    <div className="memory-list">{visible.map(item => <article className="memory-item" key={item.id}><div className="memory-item-heading"><div><span className="status accepted">{item.kind}</span><strong>{item.subject}</strong></div></div><form action={updateSystemMemory}><input type="hidden" name="id" value={item.id}/><textarea name="content" defaultValue={item.content} rows={3} required/><button className="secondary">Spara ändring</button></form><form action={deleteSystemMemory}><input type="hidden" name="id" value={item.id}/><button className="memory-delete">Ta bort</button></form></article>)}</div>
  </div></main>;
}
