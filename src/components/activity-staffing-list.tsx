import { attendanceNames } from "@/lib/attendance-names";

type Invitee = {
  personId: string;
  displayName: string;
  role: "participant" | "leader";
  response: "pending" | "accepted" | "declined";
};

const responseText = { accepted: "Kommer", declined: "Kan inte", pending: "Ej svarat" } as const;

export function ActivityStaffingList({ invitees }: { invitees: Invitee[] }) {
  const names = attendanceNames(invitees);
  if (!invitees.length) return <p className="overview-empty">Ingen är kallad till aktiviteten.</p>;
  return <div className="staffing-groups">{(["leader", "participant"] as const).map(role => {
    const people = invitees.filter(person => person.role === role);
    if (!people.length) return null;
    return <section key={role} aria-label={role === "leader" ? "Ledare" : "Spelare"}>
      <h4>{role === "leader" ? "Ledare" : "Spelare"} <span>{people.filter(person => person.response === "accepted").length} kommer · {people.length} kallade</span></h4>
      <ul className="staffing-list">{people.map(person => <li key={person.personId}>
        <span title={person.displayName}><span aria-hidden="true">{names.get(person.personId)}</span><span className="sr-only">{person.displayName}</span></span>
        <span data-response={person.response}>{responseText[person.response]}</span>
      </li>)}</ul>
    </section>;
  })}</div>;
}
