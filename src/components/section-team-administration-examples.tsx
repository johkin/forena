"use client";
import { useState } from "react";
import { SectionTeamAdministration } from "./section-team-administration";
import { sectionTeamInputSchema, type SectionTeamStructure } from "@/lib/section-team-administration";
import { clubSlug } from "@/lib/club-administration";

const initial: SectionTeamStructure = {
  organization: { id: "10000000-0000-0000-0000-000000000001", slug: "exempel", name: "Exempelföreningen", assistantName: "Assistent", timeZone: "Europe/Stockholm" },
  section: { id: "20000000-0000-0000-0000-000000000001", slug: "innebandy", name: "Innebandy", disciplineName: "Innebandy" },
  teams: [
    { id: "30000000-0000-0000-0000-000000000001", name: "F2016 med ett längre lagnamn", slug: "f2016", season: "2026/2027", canDelete: false },
    { id: "30000000-0000-0000-0000-000000000002", name: "Nystartat lag", slug: "nystartat", season: "", canDelete: true },
  ],
};
export function SectionTeamAdministrationExamples() {
  const [structure, setStructure] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  function save(form: FormData) {
    const id = String(form.get("teamId") ?? "");
    const existing = structure.teams.find(team => team.id === id);
    const input = sectionTeamInputSchema.safeParse({ name: form.get("name"), slug: existing?.slug ?? clubSlug(String(form.get("name") ?? "")), season: form.get("season") });
    const duplicate = input.success && structure.teams.some(team => team.id !== id && (team.slug === input.data.slug || (team.name === input.data.name && team.season === input.data.season)));
    setError(!input.success || !!duplicate);
    if (!input.success || duplicate) { setMessage("Kontrollera namnet och säsongen. Namn eller adress kan redan vara upptaget."); return; }
    const team = { ...input.data, id: existing?.id ?? crypto.randomUUID(), canDelete: existing?.canDelete ?? true };
    setStructure(current => ({ ...current, teams: existing ? current.teams.map(item => item.id === id ? team : item) : [...current.teams, team] }));
    setMessage("Exempellaget har sparats lokalt.");
  }
  function remove(form: FormData) {
    const id = String(form.get("teamId") ?? "");
    setStructure(current => ({ ...current, teams: current.teams.filter(team => team.id !== id || !team.canDelete) }));
    setError(false); setMessage("Exempellaget har tagits bort lokalt.");
  }
  return <section id="section-team-components"><h2>Lagadministration</h2><p>Syntetiska exempel. Skapa, ändra och ta bort lokalt; inga verksamhetsdata sparas.</p>
    <div className="component-example-actions"><button className="secondary" onClick={() => { setStructure({ ...initial, teams: [] }); setMessage(""); }}>Visa tom sektion</button><button className="secondary" onClick={() => { setStructure(initial); setMessage(""); }}>Återställ exempel</button></div>
    {message ? <p className={error ? "auth-error" : "auth-message"} role={error ? "alert" : "status"}>{message}</p> : null}
    <SectionTeamAdministration key={structure.teams.length} structure={structure} saveAction={save} deleteAction={remove}/>
  </section>;
}
