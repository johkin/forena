"use client";

import { OverviewInvitationResponse } from "./overview-invitation-response";
import type { ParticipationFetch } from "./activity-invitation-response";
import type { NavigationLink } from "./navigation-link";
import type { components } from "../../backend/contract/generated";

export type MyActivity = components["schemas"]["MyActivity"];

const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric" });
const monthFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", month: "short" });

export function MyActivityList({ activities, loading = false, error, retry, loadMore, request, linkComponent: Link = "a" }: {
  activities: MyActivity[]; loading?: boolean; error?: string; retry?: () => void; loadMore?: () => void; linkComponent?: NavigationLink; request?: ParticipationFetch;
}) {
  const when = (value: string) => dateFormat.format(new Date(value));
  return <section className="personal-overview" aria-label="Aktivitetsöversikt" aria-busy={loading}>
    <p>Pågående och kommande aktiviteter de närmaste 90 dagarna. Tider visas i svensk tid.</p>
    {activities.length > 0 ? <div className="personal-activity-list">{activities.map(activity =>
      <article className="personal-activity-row" key={activity.id}>
        <Link className="personal-activity-main" href={`/activities/${activity.id}`}>
          <span className="overview-date-badge" aria-hidden="true"><small>{monthFormat.format(new Date(activity.starts_at))}</small><strong>{dayFormat.format(new Date(activity.starts_at))}</strong></span>
          <span className="personal-activity-copy">
            <small>{activity.organization_name} · {activity.team_name}</small>
            <strong>{activity.title}</strong>
            <span><time dateTime={activity.starts_at}>{when(activity.starts_at)}</time> – <time dateTime={activity.ends_at}>{when(activity.ends_at)}</time></span>
          </span><b aria-hidden="true">→</b>
        </Link>
        {activity.invitations.length ? <div className="personal-activity-people" aria-label={`Kallelser till ${activity.title}`}>
          {activity.invitations.map(invitation => <OverviewInvitationResponse key={invitation.id}
            invitation={invitation} readOnly={Date.parse(activity.ends_at) <= Date.now()} request={request} />)}
        </div> : <p className="overview-empty">Ingen kallelse ännu.</p>}
      </article>
    )}</div> : !loading && !error ? <p>Inga aktiviteter att visa ännu. Här visas dina aktiviteter och aktiviteter för personer du har behörighet att företräda.</p> : null}
    {loading ? <p role="status">Laddar aktiviteter…</p> : null}
    {error ? <div role="alert"><p>{error}</p>{retry ? <button type="button" disabled={loading} onClick={retry}>Försök igen</button> : null}</div> : null}
    {loadMore && !error ? <button type="button" className="secondary" disabled={loading} onClick={loadMore}>Visa fler aktiviteter</button> : null}
  </section>;
}
