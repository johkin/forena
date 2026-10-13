"use client";

export type SelectionPerson = { id: string; name: string; role: string; detail?: string };
type Props = {
  people: readonly SelectionPerson[];
  groups: readonly { role: string; label: string }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  quickGroups?: readonly { id: string; label: string; personIds: readonly string[] }[];
  onSelectionChange?: (selected: Set<string>) => void;
  disabled?: boolean;
  emptyMessage?: string;
};

/** Shared checked-person rows for invitation recipients and actual attendance. */
export function PersonSelectionList({ people, groups, selected, onToggle, quickGroups = [], onSelectionChange, disabled = false, emptyMessage = "Inga personer att visa." }: Props) {
  if (!people.length) return <p className="overview-empty" role="status">{emptyMessage}</p>;
  const visibleIds = new Set(people.filter(person => groups.some(group => group.role === person.role)).map(person => person.id));
  const shortcuts = [
    { id: "all", label: "Alla", personIds: [...visibleIds] },
    ...groups.map(group => ({ id: `role-${group.role}`, label: group.label, personIds: people.filter(person => person.role === group.role).map(person => person.id) })),
    ...quickGroups,
  ];
  return <div className="person-selection-list">
    {onSelectionChange ? <div className="person-selection-shortcuts" role="group" aria-label="Snabbval av personer">
      <span>Välj grupper bland visade personer</span>
      <div>{shortcuts.map(group => {
        const ids = [...new Set(group.personIds)].filter(id => visibleIds.has(id));
        if (!ids.length) return null;
        const count = ids.filter(id => selected.has(id)).length;
        const all = count === ids.length;
        return <button key={group.id} type="button" disabled={disabled} aria-pressed={all ? true : count ? "mixed" : false} onClick={() => {
          const next = new Set(selected);
          ids.forEach(id => { if (all) next.delete(id); else next.add(id); });
          onSelectionChange(next);
        }}><span>{group.label}</span><small>{count}/{ids.length}</small></button>;
      })}</div>
    </div> : null}
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
