/** Use the shortest recognizable name that is unique in this roster. */
export function attendanceNames(people: { personId: string; displayName: string }[]): Map<string, string> {
  const parts = people.map(({ personId, displayName }) => {
    const words = displayName.trim().split(/\s+/).filter(Boolean);
    return { personId, full: displayName.trim(), first: words[0] ?? displayName.trim(), surname: words.slice(1).join(" ") };
  });
  const firstCounts = new Map<string, number>();
  for (const person of parts) {
    const key = person.first.toLocaleLowerCase("sv");
    firstCounts.set(key, (firstCounts.get(key) ?? 0) + 1);
  }

  const labels = new Map(parts.map((person) => [person.personId,
    firstCounts.get(person.first.toLocaleLowerCase("sv")) === 1 || !person.surname
      ? person.first : `${person.first} ${Array.from(person.surname)[0]}`,
  ]));
  const labelCounts = new Map<string, number>();
  for (const label of labels.values()) {
    const key = label.toLocaleLowerCase("sv");
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }
  for (const person of parts) {
    if ((labelCounts.get(labels.get(person.personId)!.toLocaleLowerCase("sv")) ?? 0) > 1) {
      labels.set(person.personId, person.full);
    }
  }
  return labels;
}
