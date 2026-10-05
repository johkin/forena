import { NextResponse } from "next/server";
import { activityManagementContext } from "@/lib/activity-management-context";
import { addActivityParticipants, participantsSchema } from "@/lib/activity-participation";

type Props = { params: Promise<{ activityId: string }> };
export async function GET(request: Request, { params }: Props) {
  const context = await activityManagementContext((await params).activityId);
  if ("error" in context) return context.error;
  const { supabase, activity } = context;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80) return NextResponse.json({ error: "Skriv 2–80 tecken av namnet" }, { status: 400 });
  const literal = query.replace(/[\\%_]/g, "\\$&");
  const { data: people, error } = await supabase.from("people").select("id, display_name").eq("organization_id", activity.organization_id).ilike("display_name", `%${literal}%`).order("display_name").limit(30);
  if (error) return NextResponse.json({ error: "Sökningen misslyckades" }, { status: 500 });
  const ids = (people ?? []).map(p => p.id);
  const today = new Date().toISOString().slice(0, 10);
  const { data: memberships, error: membershipError } = ids.length ? await supabase.from("memberships").select("person_id, team_id, role").eq("organization_id", activity.organization_id).in("person_id", ids).lte("starts_on", today).or(`ends_on.is.null,ends_on.gte.${today}`) : { data: [], error: null };
  const teamIds = [...new Set((memberships ?? []).flatMap(m => m.team_id ? [m.team_id] : []))];
  const { data: teams, error: teamError } = teamIds.length ? await supabase.from("teams").select("id, name").in("id", teamIds) : { data: [], error: null };
  if (membershipError || teamError) return NextResponse.json({ error: "Sökningen misslyckades" }, { status: 500 });
  console.info("activity_participants.search", { activityId: activity.id, count: ids.length });
  return NextResponse.json({ people: (people ?? []).map(p => {
    const links = (memberships ?? []).filter(m => m.person_id === p.id);
    return { personId: p.id, displayName: p.display_name, teamNames: [...new Set(links.flatMap(m => teams?.find(t => t.id === m.team_id)?.name ?? []))], suggestedRole: links.some(m => m.role === "participant") ? "participant" : null };
  }), limited: ids.length === 30 });
}
export async function POST(request: Request, { params }: Props) {
  const activityId = (await params).activityId;
  const context = await activityManagementContext(activityId);
  if ("error" in context) return context.error;
  const parsed = participantsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Välj personer och deras roll i aktiviteten" }, { status: 400 });
  const { data, error } = await addActivityParticipants(context.supabase, activityId, parsed.data);
  if (error) {
    console.error("activity_participants.add_failed", { activityId, code: error.code });
    return NextResponse.json({ error: "Deltagarna kunde inte läggas till. Uppdatera aktiviteten och kontrollera urvalet." }, { status: error.code === "42501" ? 403 : error.code === "23514" || error.code === "23505" ? 409 : 500 });
  }
  console.info("activity_participants.added", { activityId, count: parsed.data.participants.length, registeredAccepted: parsed.data.registerAccepted });
  return NextResponse.json({ queuedRecipients: data, registeredAccepted: parsed.data.registerAccepted });
}
