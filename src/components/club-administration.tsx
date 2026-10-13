import { createClient } from "@/lib/supabase/server";
import { clubStructureSchema, type ClubStructure } from "@/lib/club-administration";
import { saveClub, saveSection, deleteSection } from "@/app/club-administration-actions";
import { ClubSlugField } from "./club-slug-field";
import { TimeZoneSelect } from "./time-zone-select";
import { ConfirmSubmit } from "./confirm-submit";

export async function loadClubAdministration(target: string) {
  const supabase = await createClient();
  const [{ data, error }, catalogue] = await Promise.all([supabase.rpc("club_structure", { target }), supabase.from("disciplines").select("id,name").order("name")]);
  if (error || catalogue.error) throw new Error("Klubbens administration kunde inte hämtas.");
  return { structure: clubStructureSchema.parse(data), disciplines: catalogue.data ?? [] };
}
export function ClubAdministration({ structure, disciplines, system = false }: { structure: ClubStructure; disciplines: { id: string; name: string }[]; system?: boolean }) {
  const { organization, sections } = structure;
  const identity = <><input type="hidden" name="organizationId" value={organization.id}/><input type="hidden" name="administrationScope" value={system ? "system" : "club"}/></>;
  return <div className="club-administration">
    <section className="club-admin-section"><h2>Klubbens uppgifter</h2><form className="application-form" action={saveClub}>{identity}<label>Namn<input name="name" defaultValue={organization.name} required maxLength={120}/></label><label>Assistentens namn<input name="assistantName" defaultValue={organization.assistantName} required maxLength={60}/></label><ClubSlugField defaultValue={organization.slug} organizationId={organization.id}/><TimeZoneSelect defaultValue={organization.timeZone}/><button className="primary" type="submit">Spara klubb</button></form></section>
    <section className="club-admin-section"><h2>Sektioner</h2><p>Disciplinen gäller alla lag i sektionen. Sektionens adress behålls när namnet ändras. En sektion med lag eller sparat underlag kan inte byta disciplin.</p>
      <div className="club-section-list">{sections.map(section => <article key={section.id} className="club-section-card"><h3>{section.name}</h3><a className="secondary" href={`/o/${organization.slug}/s/${section.slug}/admin/teams`}>Hantera lag</a><p>{section.teamCount} lag · /o/{organization.slug}/s/{section.slug}</p><form action={saveSection} className="application-form">{identity}<input type="hidden" name="sectionId" value={section.id}/><input type="hidden" name="slug" value={section.slug}/><label>Sektionens namn<input name="name" defaultValue={section.name} required maxLength={120}/></label>{!section.canChangeDiscipline ? <input type="hidden" name="disciplineId" value={section.disciplineId ?? ""}/> : null}<label>Disciplin<select name="disciplineId" defaultValue={section.disciplineId ?? ""} required disabled={!section.canChangeDiscipline} aria-describedby={!section.canChangeDiscipline ? `discipline-lock-${section.id}` : undefined}><option value="">Välj disciplin</option>{disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{!section.canChangeDiscipline ? <small id={`discipline-lock-${section.id}`}>Disciplinen är låst eftersom sektionen har lag eller sparat underlag.</small> : null}</label><button type="submit" className="primary">Spara sektion</button></form>
      <form action={deleteSection}>{identity}<input type="hidden" name="sectionId" value={section.id}/><ConfirmSubmit label="Ta bort sektion" message={`Ta bort ${section.name}? Detta går bara om sektionen saknar lag och sparat underlag.`} disabled={sections.length <= 1 || section.teamCount > 0}/></form>{sections.length <= 1 ? <small>Klubben behöver minst en sektion.</small> : section.teamCount > 0 ? <small>Sektionen innehåller lag och kan inte tas bort.</small> : null}</article>)}</div>
      <details className="club-admin-add"><summary>Lägg till sektion</summary><form className="application-form" action={saveSection}>{identity}<label>Sektionens namn<input name="name" required maxLength={120} placeholder="Innebandy"/></label><label>Disciplin<select name="disciplineId" required defaultValue=""><option value="">Välj disciplin</option>{disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><button type="submit" className="primary">Lägg till sektion</button></form></details>
    </section>
  </div>;
}
