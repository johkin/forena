import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedRoute } from "@/lib/http/authenticated-route";
import { answerWorkspaceAssistant } from "@/lib/ai/workspace-assistant";
import { TeamAssistantError } from "@/lib/ai/team-assistant-types";
import { getTeamDashboard } from "@/data/team-dashboard";

export const runtime = "nodejs";
export const maxDuration = 90;
const schema = z.object({ organizationId: z.uuid(), sectionSlug: z.string().max(100).optional(), teamId: z.uuid().optional(), question: z.string().trim().min(1).max(500), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(800) })).max(6).default([]), timeZone: z.string().max(80).optional(), page: z.object({ path: z.string().startsWith("/o/").max(250), title: z.string().max(100) }).optional() });

export const POST = withAuthenticatedRoute(async (request, authentication) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Skriv en fråga och välj en giltig arbetsyta." }, { status: 400 });
  try {
    const result = await answerWorkspaceAssistant(parsed.data, authentication);
    if (!result.activityDraft || !result.targetTeamId) return NextResponse.json(result);
    // Editor data stays outside the model and is fetched only for a generated draft.
    const { data: team } = await authentication.supabase.from("teams").select("slug, organization_id").eq("id", result.targetTeamId).eq("organization_id", parsed.data.organizationId).maybeSingle();
    const { data: organization } = await authentication.supabase.from("organizations").select("slug").eq("id", parsed.data.organizationId).maybeSingle();
    const dashboard = team && organization ? await getTeamDashboard(organization.slug, team.slug) : null;
    if (!dashboard || !dashboard.teamPermissions.includes("activity.manage")) return NextResponse.json({ error: "Du saknar behörighet att granska aktivitetsutkastet." }, { status: 403 });
    return NextResponse.json({ ...result, draftContext: { organization: dashboard.organization, team: dashboard.team, members: dashboard.rosterMembers, canManageInvitations: dashboard.teamPermissions.includes("invitation.manage") } });
  } catch (error) {
    if (error instanceof TeamAssistantError) return NextResponse.json({ error: error.message }, { status: error.code === "team-forbidden" ? 403 : error.code === "team-not-found" ? 404 : 502 });
    console.warn("workspace_assistant_failed");
    return NextResponse.json({ error: "Assistenten kunde inte svara just nu." }, { status: 502 });
  }
});
