import { z } from "zod";
import type { ParticipationFetch } from "../../src/components/activity-invitation-response";
import { myTeamsSchema, type MyTeams } from "../../src/components/my-teams-panel";
import { teamRoleLabels } from "../../src/components/personal-home";

const overviewTeamsSchema = z.object({
  organizations: z.array(z.object({ id: z.uuid(), name: z.string() })),
  teams: z.array(z.object({ id: z.uuid(), organization_id: z.uuid(), name: z.string(), roles: z.array(z.string()) })),
});

export async function loadMyTeams(request: ParticipationFetch, signal: AbortSignal): Promise<MyTeams> {
  const response = await request("/api/me/overview", { signal });
  if (!response.ok) throw new Error("Dina lag kunde inte hämtas.");
  const data = overviewTeamsSchema.parse(await response.json());
  return myTeamsSchema.parse({
    organizations: data.organizations.map(organization => ({ ...organization, href: `/organizations/${organization.id}` })),
    teams: data.teams.map(team => ({
      id: team.id, organizationId: team.organization_id, name: team.name,
      roles: team.roles.map(role => teamRoleLabels[role] ?? role), href: `/teams/${team.id}`,
    })),
  });
}
