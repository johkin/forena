"use client";

import type { SectionTeamStructure } from "@/lib/section-team-administration";
import { ConfirmSubmit } from "./confirm-submit";

type Props = {
  teamHref?: (teamId: string) => string;
  structure: SectionTeamStructure;
  saveAction: (form: FormData) => void | Promise<void>;
  deleteAction: (form: FormData) => void | Promise<void>;
};
/** Same forms in production and the synthetic component gallery. */
export function SectionTeamAdministration({ structure, saveAction, deleteAction, teamHref }: Props) {
  const { organization, section, teams } = structure;
  const identity = <><input type="hidden" name="organizationId" value={organization.id}/><input type="hidden" name="sectionId" value={section.id}/></>;
  return <div className="club-administration section-team-administration">
    <p>Disciplin: {section.disciplineName ?? "Ingen disciplin vald"}. Alla lag följer sektionens disciplin. Lagets adress behålls när namnet eller säsongen ändras.</p>
    <section className="club-admin-section"><h2>Lag i {section.name}</h2>
      {teams.length ? <div className="section-team-list">{teams.map(team => <article className="section-team-row" key={team.id}>
        <h3>{team.name}</h3><a className="secondary" href={teamHref ? teamHref(team.id) : `/o/${organization.slug}/t/${team.slug}`}>Öppna laget</a>
        <form className="application-form" action={saveAction}>{identity}<input type="hidden" name="teamId" value={team.id}/>
          <label>Lagets namn<input name="name" defaultValue={team.name} required maxLength={120}/></label>
          <label>Säsong (valfritt)<input name="season" defaultValue={team.season} maxLength={40} placeholder="2026/2027"/></label>
          <button className="primary" type="submit">Spara lag</button>
        </form>
        <form action={deleteAction}>{identity}<input type="hidden" name="teamId" value={team.id}/><ConfirmSubmit label="Ta bort lag" message={`Ta bort ${team.name}? Bara tomma lag utan sparat underlag kan tas bort.`} disabled={!team.canDelete}/></form>
        {!team.canDelete ? <small>Laget har medlemmar eller sparat underlag och kan inte tas bort.</small> : null}
      </article>)}</div> : <p>Det finns inga lag i sektionen ännu. Lägg till det första laget nedan.</p>}
    </section>
    <section className="club-admin-section"><h2>Lägg till lag</h2>
      <form className="application-form" action={saveAction}>{identity}
        <label>Lagets namn<input name="name" required maxLength={120} placeholder="F2016"/></label>
        <label>Säsong (valfritt)<input name="season" maxLength={40} placeholder="2026/2027"/></label>
        <p>Lagets adress skapas från namnet och behöver vara unik inom klubben.</p>
        <button className="primary" type="submit">Lägg till lag</button>
      </form>
    </section>
  </div>;
}
