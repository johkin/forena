import { getDisciplinePackage } from "@/lib/disciplines";
import { DisciplinePackageSummary } from "@/components/discipline-package-summary";
import { createClient } from "@/lib/supabase/server";
import { createDiscipline, updateDiscipline } from "../actions";

export default async function DisciplinesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: disciplines, error } = await supabase.from("disciplines").select("id, key, name, category").order("name");
  if (error) throw new Error("Disciplinerna kunde inte hämtas.");
  return <main className="application-page"><div className="application-card"><div className="application-page-heading"><div><p className="eyebrow">System</p><h1>Discipliner</h1><p>Kodägda disciplinpaket kopplas till sektioner. Äldre discipliner utan paket hanteras fortsatt i katalogen.</p></div></div>
    {query.saved ? <p className="auth-message">Sparat.</p> : null}{query.error ? <p className="auth-error">{query.error}</p> : null}
    <form action={createDiscipline} className="application-form system-inline-form"><label>Nyckel<input name="key" required placeholder="gymnastics" /></label><label>Namn<input name="name" required placeholder="Gymnastik" /></label><label>Kategori<input name="category" placeholder="sport" /></label><button className="primary" type="submit">Lägg till</button></form>
    <div className="system-admin-list">{(disciplines ?? []).map(item => {
      const discipline = getDisciplinePackage(item.key);
      if (discipline) return <section key={item.id}><strong>{discipline.name}</strong><p>Kodägt paket · {discipline.version}</p><DisciplinePackageSummary discipline={discipline}/></section>;
      return <form action={updateDiscipline} key={item.id} className="system-admin-row"><input type="hidden" name="id" value={item.id}/><div><strong>{item.name}</strong><small>{item.key}</small></div><label>Namn<input name="name" defaultValue={item.name}/></label><label>Kategori<input name="category" defaultValue={item.category ?? ""}/></label><button className="secondary">Spara</button></form>;
    })}</div>
  </div></main>;
}
