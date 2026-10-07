import type { DutyCommand, DutySchedule } from "@/lib/activity-duty-schedule";
import { dutyDate, dutyDateLabel, formatDutyTiming } from "@/lib/duty-presentation";

type Assignment = Extract<DutyCommand, { op: "assign_batch" }>["assignments"][number];

export function DutyAssignmentPreview({ assignments, schedule, timeZone }: {
  assignments: Assignment[];
  schedule: DutySchedule;
  timeZone: string;
}) {
  // Resolve the exact reviewed command, not the suggestion's prose or all available slots.
  const rows = schedule.duties.flatMap(duty => {
    const people = assignments.flatMap(assignment => {
      const index = duty.slots.findIndex(slot => slot.id === assignment.slotId);
      if (index < 0) return [];
      return [{ slotId: assignment.slotId, place: index + 1, name: schedule.people.find(person => person.id === assignment.personId)?.name ?? "Okänd spelare" }];
    });
    const at = duty.startsAt ?? duty.dueAt;
    return people.length ? [{ duty, people, at, date: at ? dutyDate(at, timeZone) : "" }] : [];
  }).sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity));
  const dates = [...new Set(rows.map(row => row.date))];

  return <div className="duty-assignment-preview">{dates.map(date => {
    const datedRows = rows.filter(row => row.date === date);
    return <table className="duty-assignment-table" key={date}>
      <caption>{datedRows[0].at ? dutyDateLabel(datedRows[0].at, timeZone) : "Utan särskild tid"}</caption>
      <colgroup><col className="duty-assignment-time" /><col className="duty-assignment-task" /><col /></colgroup>
      <thead><tr><th scope="col">Tid</th><th scope="col">Uppgift</th><th scope="col">Spelare</th></tr></thead>
      <tbody>{datedRows.map(({ duty, people }) => <tr key={duty.id}>
        <td>{formatDutyTiming(duty, timeZone, date)}</td>
        <th scope="row">{duty.name}</th>
        <td><ul>{people.map(person => <li key={person.slotId}>{person.name}<small>Plats {person.place}</small></li>)}</ul></td>
      </tr>)}</tbody>
    </table>;
  })}</div>;
}
