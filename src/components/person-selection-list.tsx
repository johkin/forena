"use client";

export type SelectionPerson = { id: string; name: string; role: string; detail?: string };
type Props = {
  people: readonly SelectionPerson[];
  groups: readonly { role: string; label: string }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
};

/** Shared checked-person rows for invitation recipients and actual attendance. */
export function PersonSelectionList({ people, groups, selected, onToggle, disabled = false, emptyMessage = "Inga personer att visa." }: Props) {
  if (!people.length) return <p className="overview-empty" role="status">{emptyMessage}</p>;
  return <div className="person-selection-list">
    {groups.map(({ role, label }) => {
      const matching = people.filter(person => person.role === role);
      if (!matching.length) return null;
      return <section key={role} className="person-selection-group" aria-label={label}>
        <h4>{label} <span>{matching.length}</span></h4>
        {matching.map(person => <label key={person.id} className="person-selection-row" data-selected={selected.has(person.id)}>
          <span className="person-selection-avatar" aria-hidden="true">{person.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("")}</span>
          <span className="person-selection-copy"><strong>{person.name}</strong>{person.detail ? <small>{person.detail}</small> : null}</span>
          <input type="checkbox" checked={selected.has(person.id)} disabled={disabled} onChange={() => onToggle(person.id)} />
        </label>)}
      </section>;
    })}
  </div>;
}
