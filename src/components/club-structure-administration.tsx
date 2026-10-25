import type { NavigationLink } from "./navigation-link";
import type { ReactNode } from "react";
import type { ClubStructure } from "../lib/club-administration";
import { TimeZoneSelect } from "./time-zone-select";
import { ConfirmSubmit } from "./confirm-submit";

type FormAction = (form: FormData) => void | Promise<void>;

/** Canonical club/section forms; hosts adapt commands without rebuilding the layout. */
export function ClubStructureAdministration({ structure, disciplines, system = false, slugField,
  saveClub, saveSection, deleteSection, assistantNameAvailable = true, canManage = true,
  pending = false, teamHref, sectionTools, canManageTeams, canDeleteSection, linkComponent: Link = "a",
}: {
  structure: ClubStructure; disciplines: { id: string; name: string }[]; system?: boolean; slugField: ReactNode;
  saveClub: FormAction; saveSection: FormAction; deleteSection: FormAction; assistantNameAvailable?: boolean;
  canManage?: boolean; pending?: boolean; teamHref?: (sectionId: string) => string; sectionTools?: (sectionId: string) => ReactNode; canManageTeams?: (sectionId: string) => boolean; canDeleteSection?: (sectionId: string) => boolean; linkComponent?: NavigationLink;
}) {
  const { organization, sections } = structure;
  const identity = <><input type="hidden" name="organizationId" value={organization.id} /><input type="hidden" name="administrationScope" value={system ? "system" : "club"} /></>;
  return <div className="club-administration">
    {canManage ? <section className="club-admin-section"><h2>Klubbens uppgifter</h2>
      <form className="application-form" action={saveClub}>{identity}
        <label>Namn<input name="name" defaultValue={organization.name} required maxLength={120} disabled={pending} /></label>
        {assistantNameAvailable ? <label>Assistentens namn<input name="assistantName" defaultValue={organization.assistantName} required maxLength={60} disabled={pending} /></label> : null}
        {slugField}<TimeZoneSelect defaultValue={organization.timeZone} />
        <button className="primary" type="submit" disabled={pending}>Spara klubb</button>
      </form>
    </section> : null}
    <section className="club-admin-section"><h2>Sektioner</h2>
      <p>Disciplinen gäller alla lag i sektionen. Sektionens adress behålls när namnet ändras. En sektion med lag eller sparat underlag kan inte byta disciplin.</p>
      <div className="club-section-list">{sections.map(section => <article key={section.id} className="club-section-card" aria-label={`Sektion ${section.name}`}>
        <h3>{section.name}</h3>{!canManageTeams || canManageTeams(section.id) ? <Link className="secondary" href={teamHref ? teamHref(section.id) : `/o/${organization.slug}/s/${section.slug}/admin/teams`}>Hantera lag</Link> : null}
        <p>{section.teamCount} lag · /o/{organization.slug}/s/{section.slug}</p>
        {canManage ? <><form action={saveSection} className="application-form">{identity}
          <input type="hidden" name="sectionId" value={section.id} /><input type="hidden" name="slug" value={section.slug} />
          <label>Sektionens namn<input name="name" defaultValue={section.name} required maxLength={120} disabled={pending} /></label>
          {!section.canChangeDiscipline ? <input type="hidden" name="disciplineId" value={section.disciplineId ?? ""} /> : null}
          <label>Disciplin<select name="disciplineId" defaultValue={section.disciplineId ?? ""} required disabled={pending || !section.canChangeDiscipline}
            aria-describedby={!section.canChangeDiscipline ? `discipline-lock-${section.id}` : undefined}>
            <option value="">Välj disciplin</option>{disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>{!section.canChangeDiscipline ? <small id={`discipline-lock-${section.id}`}>Disciplinen är låst eftersom sektionen har lag eller sparat underlag.</small> : null}</label>
          <button type="submit" className="primary" disabled={pending}>Spara sektion</button>
        </form>
        <form action={deleteSection}>{identity}<input type="hidden" name="sectionId" value={section.id} />
          <ConfirmSubmit label="Ta bort sektion" message={`Ta bort ${section.name}? Detta går bara om sektionen saknar lag och sparat underlag.`} disabled={pending || sections.length <= 1 || section.teamCount > 0 || (canDeleteSection !== undefined && !canDeleteSection(section.id))} />
        </form>{sections.length <= 1 ? <small>Klubben behöver minst en sektion.</small> : section.teamCount > 0 ? <small>Sektionen innehåller lag och kan inte tas bort.</small> : null}</> : null}
        {sectionTools?.(section.id)}
      </article>)}</div>
      {canManage ? <details className="club-admin-add"><summary>Lägg till sektion</summary><form className="application-form" action={saveSection}>{identity}
        <label>Sektionens namn<input name="name" required maxLength={120} placeholder="Innebandy" disabled={pending} /></label>
        <label>Disciplin<select name="disciplineId" required defaultValue="" disabled={pending}><option value="">Välj disciplin</option>{disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button type="submit" className="primary" disabled={pending}>Lägg till sektion</button>
      </form></details> : null}
    </section>
  </div>;
}
