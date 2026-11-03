"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DisciplineInformationReport } from "./discipline-follow-up-tools";
import type { NavigationLink } from "./navigation-link";
import type { ParticipationFetch } from "./activity-invitation-response";
const schema = z.array(
  z.object({
    activityId: z.uuid(),
    title: z.string(),
    startsAt: z.string(),
    missing: z.array(z.string()),
  }),
);
export function TeamFollowUp({
  teamId,
  request,
  teamName,
  attentionOnly = false,
  reportOnly = false,
  refreshKey,
  linkComponent: Link = "a",
}: {
  teamId: string;
  request: ParticipationFetch;
  teamName?: string;
  attentionOnly?: boolean;
  reportOnly?: boolean;
  refreshKey?: string;
  linkComponent?: NavigationLink;
}) {
  const [items, setItems] = useState<z.infer<typeof schema>>();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/teams/${teamId}/follow-up`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) {
          if (!controller.signal.aborted) setHidden(true);
          return;
        }
        if (!response.ok) throw new Error();
        const data = schema.parse(await response.json());
        if (!controller.signal.aborted) { setItems(data); setHidden(false); setError(undefined); }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Lagets uppföljning kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request, teamId, refreshKey]);
  if (hidden || (attentionOnly && !error && !items?.length)) return null;
  return (
    <section className="card">
      <h2>{reportOnly ? "Spelarrapporter" : teamName ? `Matchuppföljning · ${teamName}` : "Matchuppföljning"}</h2>
      {error ? <p role="alert">{error}</p> : null}
      {!reportOnly && items?.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.activityId}>
              <Link href={`/activities/${item.activityId}`}>
                {new Date(item.startsAt).toLocaleDateString("sv-SE")} ·{" "}
                {item.title}
              </Link>
              <p>Saknas: {item.missing.join(", ")}</p>
            </li>
          ))}
        </ul>
      ) : !reportOnly && items ? (
        <p>Ingen ofullständig matchuppföljning.</p>
      ) : null}
      {!attentionOnly && items ? (
        <details>
          <summary>Spelarhistorik och rapport</summary>
          <DisciplineInformationReport
            teamId={teamId}
            request={request}
            linkComponent={Link}
          />
        </details>
      ) : null}
    </section>
  );
}
