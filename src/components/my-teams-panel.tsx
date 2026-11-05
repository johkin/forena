"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { NavigationLink } from "./navigation-link";

const localDestination = z.string().startsWith("/").refine(value => !value.startsWith("//") && !value.startsWith("/\\"));
export const myTeamsSchema = z.object({
  organizations: z.array(z.object({ id: z.string(), name: z.string(), href: localDestination })),
  teams: z.array(z.object({
    id: z.string(), organizationId: z.string(), name: z.string(),
    roles: z.array(z.string()), href: localDestination,
  })),
});
export type MyTeams = z.infer<typeof myTeamsSchema>;
export type LoadMyTeams = (signal: AbortSignal) => Promise<MyTeams>;

type TeamsState = { status: "loading" } | { status: "error" } | { status: "ready"; data: MyTeams };

/** Loaded on opening, using the host application's authenticated personal overview. */
export function MyTeamsPanel({ loadTeams, linkComponent: Link = "a", pathname }: {
  loadTeams: LoadMyTeams; linkComponent?: NavigationLink; pathname?: string;
}) {
  const [state, setState] = useState<TeamsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadTeams(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: "ready", data });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: "error" });
    });
    return () => controller.abort();
  }, [loadTeams, attempt]);

  if (state.status === "loading") return <p role="status">Laddar dina lag…</p>;
  if (state.status === "error") return <div role="alert"><p>Dina lag kunde inte hämtas.</p>
    <button type="button" className="secondary" onClick={() => {
      setState({ status: "loading" });
      setAttempt(value => value + 1);
    }}>Försök igen</button>
  </div>;
  if (!state.data.teams.length) return <p>Du och barnen är inte anslutna till något lag ännu. Be din förening om en ansöknings- eller inbjudningslänk.</p>;

  return <nav className="my-teams-panel" aria-label="Dina och barnens lag">
    {state.data.organizations.map(organization => {
      const teams = state.data.teams.filter(team => team.organizationId === organization.id);
      if (!teams.length) return null;
      return <section key={organization.id}>
        <h3><Link href={organization.href}>{organization.name}</Link></h3>
        {teams.map(team => <Link key={team.id} href={team.href} className="my-teams-panel-link" aria-current={pathname === team.href ? "page" : undefined}>
          <span><strong>{team.name}</strong>{team.roles.length ? <small>{team.roles.join(" · ")}</small> : null}</span>
          <span aria-hidden="true">→</span>
        </Link>)}
      </section>;
    })}
  </nav>;
}
