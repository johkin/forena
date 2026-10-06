import type { ActivityHistoryResult } from "@/lib/ai/activity-history-result";

export function AssistantHistoryCard({ result }: { result: ActivityHistoryResult }) {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: result.timeZone, day: "numeric", month: "short", year: "numeric" });
  const when = new Intl.DateTimeFormat("sv-SE", { timeZone: result.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const period = `${date.format(new Date(`${result.from}T12:00:00Z`))}–${date.format(new Date(`${result.through}T12:00:00Z`))}`;
  return <div className="assistant-history">
    <p><strong>{result.summary.uniquePeople} personer</strong> · {result.summary.participationCount} {result.category === "work" ? "genomförda arbetstillfällen" : "registrerade deltagartillfällen"}</p>
    <p>{result.team} · {period} · {result.timeZone}</p>
    {result.unreportedActivityCount && result.category !== "work" ? <p>På {result.unreportedActivityCount} aktiviteter saknas närvarorapport. De räknas inte som frånvaro.</p> : null}
    <details>
      <summary>Visa aktiviteter ({result.activities.length})</summary>
      {result.activities.length ? <ul>{result.activities.map(activity => <li key={activity.id}>
        <strong>{activity.title}</strong>
        <span>{when.format(new Date(activity.startsAt))} · {result.team}</span>
        <span>{result.category !== "work" && !activity.attendanceReported ? "Närvaro ej rapporterad" : `${activity.participationCount} ${result.category === "work" ? "genomförda arbetstillfällen" : "närvarande"}`}</span>
      </li>)}</ul> : <p>Inga aktiviteter i det valda underlaget.</p>}
    </details>
    {result.truncated ? <small>Personlistan är begränsad. Summeringen och aktivitetslistan omfattar hela perioden.</small> : null}
  </div>;
}
