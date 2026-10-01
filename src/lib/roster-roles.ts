const roleLabels: Record<string, { singular: string; plural: string }> = {
  leader: { singular: "Ledare", plural: "Ledare" },
  participant: { singular: "Spelare", plural: "Spelare" },
  volunteer: { singular: "Volontär", plural: "Volontärer" },
  member: { singular: "Medlem", plural: "Medlemmar" },
};

/** Keep leaders and players first; sort any other roles by their displayed name. */
function compareRoles(left: string, right: string) {
  const priority = (role: string) =>
    role === "leader" ? 0 : role === "participant" ? 1 : 2;
  return (
    priority(left) - priority(right) ||
    rosterRoleLabel(left, true).localeCompare(
      rosterRoleLabel(right, true),
      "sv",
    )
  );
}

/** Label known roles in Swedish while retaining newly introduced role names. */
export function rosterRoleLabel(role: string, plural = false) {
  const label = Object.hasOwn(roleLabels, role) ? roleLabels[role] : undefined;
  return label
    ? plural
      ? label.plural
      : label.singular
    : role.charAt(0).toLocaleUpperCase("sv") + role.slice(1);
}

/** Choose one section for selectors where each person must appear only once. */
export function primaryRosterRole(roles: string[]) {
  return [...roles].sort(compareRoles)[0] ?? "member";
}

/** Build only populated role sections, optionally assigning each person once. */
export function rosterSections<T extends { roles: string[] }>(
  people: T[],
  uniquePeople = false,
) {
  const roles = [
    ...new Set(
      people.flatMap((person) =>
        uniquePeople ? [primaryRosterRole(person.roles)] : person.roles,
      ),
    ),
  ].sort(compareRoles);
  return roles.map((role) => ({
    role,
    label: rosterRoleLabel(role, true),
    people: people.filter((person) =>
      uniquePeople
        ? primaryRosterRole(person.roles) === role
        : person.roles.includes(role),
    ),
  }));
}
