"use client";

import { useState } from "react";
import { rosterSections } from "@/lib/roster-roles";
import type { TeamContact } from "@/lib/team-contact-directory";

export function TeamContactDirectory({ people }: { people: TeamContact[] }) {
  const [search, setSearch] = useState("");
  const visible = people.filter(person => [person.name, ...person.guardians.map(g => g.name)]
    .some(name => name.toLocaleLowerCase("sv").includes(search.trim().toLocaleLowerCase("sv"))));
  return <section className="application-card members-admin-card">
    <h1>Truppen</h1>
    <p>Spelare, ledare och målsmän i laget. Kontaktuppgifterna visas för lagets medlemmar och målsmän.</p>
    <label>Sök på namn<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Spelare, ledare eller målsman" /></label>
    {rosterSections(visible, true).map(section => <section key={section.role}>
      <h2>{section.label} ({section.people.length})</h2>
      {section.people.map(person => <details className="duty-row team-contact" key={person.id}>
        <summary>{person.name}{person.leaderTitle ? ` · ${person.leaderTitle}` : ""}</summary>
        <Contact email={person.email} />
        {person.guardians.length > 0 && <><h3>Målsmän</h3>{person.guardians.map((guardian, index) => <div key={index}>
          <strong>{guardian.name}</strong><Contact email={guardian.email} phone={guardian.phone} />
        </div>)}</>}
        {!person.email && !person.guardians.length && <p>Inga kontaktuppgifter registrerade.</p>}
      </details>)}
    </section>)}
    {!visible.length && <p>Inga personer hittades.</p>}
  </section>;
}

function Contact({ email, phone }: { email: string | null; phone?: string | null }) {
  return <p>{email && <a href={`mailto:${email}`}>{email}</a>}{email && phone && <br />}{phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>}</p>;
}
