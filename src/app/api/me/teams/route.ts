import { NextResponse } from "next/server";
import { getPersonalDashboard } from "@/data/personal-dashboard";

const headers = { "Cache-Control": "private, no-store" };

/** Reuse the personal overview's caller-session/RLS scope, including represented children. */
export async function GET() {
  try {
    const data = await getPersonalDashboard();
    if (!data) return NextResponse.json({ error: "Du måste logga in." }, { status: 401, headers });
    return NextResponse.json({
      organizations: data.organizations.map(organization => ({
        id: organization.id, name: organization.name, href: `/o/${organization.slug}`,
      })),
      teams: data.teams.map(({ team, organization, roles }) => ({
        id: team.id, organizationId: organization.id, name: team.name, roles,
        href: `/o/${organization.slug}/t/${team.slug}`,
      })),
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Dina lag kunde inte hämtas." }, { status: 503, headers });
  }
}
