import { getDisciplinePackage } from "@/lib/disciplines";
import { DisciplinePackageSummary } from "@/components/discipline-package-summary";
import { createClient } from "@/lib/supabase/server";
import { createDiscipline, updateDiscipline, deleteDiscipline } from "../actions";
import { ConfirmSubmit } from "@/components/confirm-submit";

export default async function DisciplinesPage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: disciplines, error } = await supabase.from("disciplines").select("id, key, name, category").order("name");
  if (error) throw new Error("Disciplinerna kunde inte hämtas.");
  const { data: usage, error: usageError } = await supabase.rpc("system_discipline_usage");
  if (usageError) throw new Error("Disciplinernas användning kunde inte kontrolleras.");
  const inUse = new Set((usage ?? []).filter(item => item.in_use).map(item => item.id));
  return <main className="application-page"><div className="application-card"><div className="application-page-heading"><div><p className="eyebrow">System</p><h1>Discipliner</h1><p>Kodägda disciplinpaket kopplas till sektioner. Äldre discipliner utan paket hanteras fortsatt i katalogen.</p></div></div>
    {query.saved ? <p className="auth-message">Sparat.</p> : null}{query.deleted ? <p className="auth-message">Disciplinen har tagits bort.</p> : null}{query.error ? <p className="auth-error">{query.error}</p> : null}
    <form action={createDiscipline} className="application-form system-inline-form"><label>Nyckel<input name="key" required placeholder="gymnastics" /></label><label>Namn<input name="name" required placeholder="Gymnastik" /></label><label>Kategori<input name="category" placeholder="sport" /></label><button className="primary" type="submit">Lägg till</button></form>
    <div className="system-admin-list">{(disciplines ?? []).map(item => {
      const discipline = getDisciplinePackage(item.key);
      if (discipline) return <section key={item.id}><strong>{discipline.name}</strong><p>Kodägt paket · {discipline.version}</p><DisciplinePackageSummary discipline={discipline}/></section>;
      return <section key={item.id}><form action={updateDiscipline} className="system-admin-row"><input type="hidden" name="id" value={item.id}/><div><strong>{item.name}</strong><small>{item.key}</small></div><label>Namn<input name="name" defaultValue={item.name}/></label><label>Kategori<input name="category" defaultValue={item.category ?? ""}/></label><button className="secondary">Spara</button></form><form action={deleteDiscipline}><input type="hidden" name="id" value={item.id}/><ConfirmSubmit label="Ta bort disciplin" message={`Ta bort ${item.name} ur katalogen?`} disabled={inUse.has(item.id) || !usage?.some(row => row.id === item.id)}/></form>{inUse.has(item.id) ? <small>Används eller har sparat underlag.</small> : null}</section>;
    })}</div>
  </div></main>;
}
