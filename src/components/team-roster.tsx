"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

export type RosterPerson = {
  id: string;
  name: string;
  roles: string[];
  title: string;
  linked: boolean;
};
export type RosterGroup = { id: string; name: string; personIds: string[] };

export function RosterSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? "Sparar…" : children}
    </button>
  );
}

export function TeamRoster({
  people,
  groups,
  href,
}: {
  people: RosterPerson[];
  groups: RosterGroup[];
  href: string;
}) {
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const group = groups.find((item) => item.id === groupId);
  const visible = people.filter(
    (person) =>
      person.name
        .toLocaleLowerCase("sv")
        .includes(search.trim().toLocaleLowerCase("sv")) &&
      (!group || group.personIds.includes(person.id)),
  );
  return (
    <>
      <div className="squad-filters">
        <label>
          Sök i truppen
          <input
            type="search"
            placeholder="Sök på namn"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Undergrupp
          <select
            aria-label="Undergrupp"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            <option value="">Alla i laget</option>
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="squad-count" role="status">
        {visible.length} av {people.length} medlemmar
        {group ? ` · ${group.name}` : ""}
      </p>
      {(["leader", "participant"] as const).map((role) => {
        const members = visible.filter((person) => person.roles.includes(role));
        if (!members.length) return null;
        return (
          <section className="squad-section" key={role}>
            <h2>
              {role === "leader" ? "Ledare" : "Spelare"}{" "}
              <span className="badge">{members.length}</span>
            </h2>
            <div className="squad-list">
              {members.map((person) => (
                <Link
                  className="squad-person"
                  key={person.id}
                  href={`${href}?person=${person.id}`}
                >
                  <span className="member-avatar" aria-hidden="true">
                    {person.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="squad-person-copy">
                    <strong>{person.name}</strong>
                    <small>
                      {role === "leader" ? person.title : "Spelare"}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {!visible.length ? (
        <p className="squad-empty">
          {people.length
            ? "Inga medlemmar matchar din sökning."
            : "Det finns inga medlemmar i truppen ännu."}
        </p>
      ) : null}
    </>
  );
}

export function GroupEditor({
  group,
  people,
  organizationSlug,
  teamSlug,
  action,
  deleteAction,
}: {
  group: RosterGroup;
  people: RosterPerson[];
  organizationSlug: string;
  teamSlug: string;
  action: (data: FormData) => Promise<void>;
  deleteAction: (data: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState(() => new Set(group.personIds));
  const [search, setSearch] = useState("");
  const [mobileList, setMobileList] = useState("available");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <form action={action} className="squad-form">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="teamSlug" value={teamSlug} />
      <input type="hidden" name="groupId" value={group.id} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="personIds" value={id} />
      ))}
      <label>
        Gruppnamn
        <input name="name" defaultValue={group.name} required maxLength={80} />
      </label>
      <label>
        Sök medlemmar
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Sök på namn"
        />
      </label>
      <div className="squad-mobile-switch" aria-label="Visa medlemslista">
        {[
          ["available", "Ej i gruppen", people.length - selected.size],
          ["selected", "I gruppen", selected.size],
        ].map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={mobileList === id ? "selected" : ""}
            aria-pressed={mobileList === id}
            onClick={() => setMobileList(String(id))}
          >
            {label} ({count})
          </button>
        ))}
      </div>
      <div className="squad-picker">
        {[false, true].map((chosen) => {
          const filtered = people.filter(
            (person) =>
              selected.has(person.id) === chosen &&
              person.name
                .toLocaleLowerCase("sv")
                .includes(search.trim().toLocaleLowerCase("sv")),
          );
          return (
            <section
              key={String(chosen)}
              className={`squad-picker-list ${mobileList === (chosen ? "selected" : "available") ? "mobile-active" : ""}`}
            >
              <h2>
                {chosen ? "I gruppen" : "Ej i gruppen"}{" "}
                <span className="badge">
                  {chosen ? selected.size : people.length - selected.size}
                </span>
              </h2>
              {(["leader", "participant"] as const).map((role) => {
                // A person with both roles is shown once in the selector.
                const members = filtered.filter(
                  (person) =>
                    (person.roles.includes("leader")
                      ? "leader"
                      : "participant") === role,
                );
                return members.length ? (
                  <div key={role}>
                    <h3>{role === "leader" ? "Ledare" : "Spelare"}</h3>
                    {members.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        className="squad-person"
                        onClick={() => toggle(person.id)}
                        aria-label={`${chosen ? "Ta bort" : "Lägg till"} ${person.name} ${chosen ? "ur" : "i"} gruppen`}
                      >
                        <span className="squad-person-copy">
                          <strong>{person.name}</strong>
                          <small>{person.title}</small>
                        </span>
                        <span aria-hidden="true">{chosen ? "−" : "+"}</span>
                      </button>
                    ))}
                  </div>
                ) : null;
              })}
              {!filtered.length ? (
                <p className="squad-empty">
                  {search
                    ? "Ingen matchar sökningen."
                    : chosen
                      ? "Välj personer från den andra listan."
                      : "Alla i laget är valda."}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="squad-save-bar">
        <span role="status">
          {selected.size} {selected.size === 1 ? "vald" : "valda"}
        </span>
        <RosterSubmit>Spara grupp</RosterSubmit>
      </div>
      <div className="squad-danger">
        {confirmDelete ? (
          <>
            <p>Ta bort {group.name}? Medlemmarna finns kvar i laget.</p>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Avbryt
            </button>{" "}
            <button
              type="submit"
              className="danger-button"
              formAction={deleteAction}
              formNoValidate
            >
              Ja, ta bort gruppen
            </button>
          </>
        ) : (
          <button
            type="button"
            className="danger-button"
            onClick={() => setConfirmDelete(true)}
          >
            Ta bort grupp
          </button>
        )}
      </div>
    </form>
  );
}
