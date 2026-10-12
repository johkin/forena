import { getDisciplinePackage } from "@/lib/disciplines";
import { DisciplinePackageSummary } from "@/components/discipline-package-summary";
import { createClient } from "@/lib/supabase/server";
import { createDiscipline, updateDiscipline, deleteDiscipline, createDisciplineCategory, updateDisciplineCategory, deleteDisciplineCategory } from "../actions";
import { ConfirmSubmit } from "@/components/confirm-submit";

export default async function DisciplinesPage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const [catalogue, categoryCatalogue, usageResult] = await Promise.all([
    supabase.from("disciplines").select("id, key, name, category").order("name"),
    supabase.from("discipline_categories").select("key,name").order("name"),
    supabase.rpc("system_discipline_usage"),
  ]);
  if (catalogue.error) throw new Error("Disciplinerna kunde inte hämtas.");
  if (categoryCatalogue.error) throw new Error("Disciplinkategorierna kunde inte hämtas.");
  if (usageResult.error) throw new Error("Disciplinernas användning kunde inte kontrolleras.");
  const disciplines = catalogue.data ?? [];
  const categories = categoryCatalogue.data ?? [];
  const usage = usageResult.data;
  const usedCategories = new Set(disciplines.map(item => item.category));
  function categorySelect(value = "") {
    return <label>Kategori<select name="category" defaultValue={value}><option value="">Ingen kategori</option>{categories.map(category => <option key={category.key} value={category.key}>{category.name}</option>)}</select></label>;
  }
  const inUse = new Set((usage ?? []).filter(item => item.in_use).map(item => item.id));
  return <main className="application-page"><div className="application-card"><div className="application-page-heading"><div><p className="eyebrow">System</p><h1>Discipliner</h1><p>Kodägda disciplinpaket kopplas till sektioner. Äldre discipliner utan paket hanteras fortsatt i katalogen.</p></div></div>
    {query.saved ? <p className="auth-message">Sparat.</p> : null}{query.deleted ? <p className="auth-message">Disciplinen har tagits bort.</p> : null}{query.error ? <p className="auth-error">{query.error}</p> : null}
    <p>Kategori grupperar discipliner, exempelvis Idrott eller Kultur. Den styr inte aktivitetstyper, förmågor eller behörigheter.</p>
    <form action={createDiscipline} className="application-form system-inline-form"><label>Nyckel<input name="key" required placeholder="gymnastics" /></label><label>Namn<input name="name" required placeholder="Gymnastik" /></label>{categorySelect()}<button className="primary" type="submit">Lägg till</button></form>
    <div className="system-admin-list">{(disciplines ?? []).map(item => {
      const discipline = getDisciplinePackage(item.key);
      if (discipline) return <section key={item.id}><strong>{discipline.name}</strong><p>Kodägt paket · {discipline.version} · {categories?.find(category => category.key === discipline.category)?.name ?? discipline.category}</p><DisciplinePackageSummary discipline={discipline}/></section>;
      return <section key={item.id}><form action={updateDiscipline} className="system-admin-row"><input type="hidden" name="id" value={item.id}/><div><strong>{item.name}</strong><small>{item.key}</small></div><label>Namn<input name="name" defaultValue={item.name}/></label>{categorySelect(item.category ?? "")}<button className="secondary">Spara</button></form><form action={deleteDiscipline}><input type="hidden" name="id" value={item.id}/><ConfirmSubmit label="Ta bort disciplin" message={`Ta bort ${item.name} ur katalogen?`} disabled={inUse.has(item.id) || !usage?.some(row => row.id === item.id)}/></form>{inUse.has(item.id) ? <small>Används eller har sparat underlag.</small> : null}</section>;
    })}</div>
    <section className="club-admin-section"><h2>Hantera kategorier</h2><p>Kategorins namn kan ändras. Nyckeln behålls för kopplingarna till discipliner och kodägda paket. En kategori som används kan inte tas bort.</p>
      <form action={createDisciplineCategory} className="application-form system-inline-form"><label>Nyckel<input name="key" required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="culture"/></label><label>Namn<input name="name" required maxLength={120} placeholder="Kultur"/></label><button type="submit" className="primary">Lägg till kategori</button></form>
      <div className="system-admin-list">{(categories ?? []).map(category => <section key={category.key}>
        <form action={updateDisciplineCategory} className="system-admin-row"><input type="hidden" name="key" value={category.key}/><div><strong>{category.name}</strong><small>{category.key}</small></div><label>Namn<input name="name" defaultValue={category.name} required maxLength={120}/></label><button type="submit" className="secondary">Spara kategori</button></form>
        <form action={deleteDisciplineCategory}><input type="hidden" name="key" value={category.key}/><ConfirmSubmit label="Ta bort kategori" message={`Ta bort kategorin ${category.name}?`} disabled={usedCategories.has(category.key)}/></form>{usedCategories.has(category.key) ? <small>Används av discipliner.</small> : null}
      </section>)}</div>
    </section>
  </div></main>;
}
