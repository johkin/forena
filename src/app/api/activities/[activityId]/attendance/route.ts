import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ activityId: string }> };

async function managedActivity(activityId: string) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: NextResponse.json({ error: "Du måste logga in" }, { status: 401 }) };
  const { data: activity } = await supabase.from("activities").select("id, organization_id, team_id, starts_at").eq("id", activityId).maybeSingle();
  if (!activity?.team_id || !activity.organization_id) return { error: NextResponse.json({ error: "Aktiviteten kunde inte hittas" }, { status: 404 }) };
  const { data: allowed } = await supabase.rpc("has_team_permission", { target_team_id: activity.team_id, target_permission: "attendance.manage" });
  if (!allowed) return { error: NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 }) };
  return { supabase, authData, activity: { ...activity, team_id: activity.team_id, organization_id: activity.organization_id } };
}

export async function GET(_request: Request, { params }: Props) {
  const { activityId } = await params;
  const context = await managedActivity(activityId);
  if ("error" in context) return context.error;
  const { supabase, activity } = context;

  const [{ data: membershipRows }, { data: invitationRows }, { data: report }] = await Promise.all([
    supabase.from("memberships").select("person_id, role").eq("team_id", activity.team_id).in("role", ["participant", "leader"]).is("ends_on", null),
    supabase.from("invitations").select("person_id, response, activity_role").eq("activity_id", activityId),
    supabase.from("activity_attendance_reports").select("id, reported_at").eq("activity_id", activityId).maybeSingle(),
  ]);
  const personIds = [...new Set([...(membershipRows ?? []).map((item) => item.person_id), ...(invitationRows ?? []).map((item) => item.person_id)])];
  const [{ data: peopleRows }, { data: attendanceRows }] = await Promise.all([
    personIds.length ? supabase.from("people").select("id, display_name").in("id", personIds) : Promise.resolve({ data: [] }),
    report ? supabase.from("activity_attendance_records").select("person_id").eq("report_id", report.id) : Promise.resolve({ data: [] }),
  ]);
  const invitationByPerson = new Map((invitationRows ?? []).map((item) => [item.person_id, item.response]));
  const present = new Set((attendanceRows ?? []).map((item) => item.person_id));
  const roleByPerson = new Map((membershipRows ?? []).map((item) => [item.person_id, item.role]));
  return NextResponse.json({
    started: new Date(activity.starts_at).getTime() <= Date.now(),
    reportedAt: report?.reported_at ?? null,
    roster: (peopleRows ?? []).map((person) => ({
      personId: person.id,
      displayName: person.display_name,
      role: (invitationRows ?? []).find(item => item.person_id === person.id)?.activity_role ?? roleByPerson.get(person.id) ?? "participant",
      response: invitationByPerson.get(person.id) ?? null,
      present: present.has(person.id),
    })).sort((a,b) => a.displayName.localeCompare(b.displayName, "sv")),
  });
}

export async function PUT(request: Request, { params }: Props) {
  const { activityId } = await params;
  const context = await managedActivity(activityId);
  if ("error" in context) return context.error;
  const { supabase, authData, activity } = context;
  if (new Date(activity.starts_at).getTime() > Date.now()) return NextResponse.json({ error: "Närvaro kan rapporteras först när aktiviteten har startat" }, { status: 409 });

  const body = await request.json().catch(() => null) as { personIds?: string[] } | null;
  const requested = [...new Set((body?.personIds ?? []).filter((id) => typeof id === "string"))];
  const { data: membershipRows } = await supabase.from("memberships").select("person_id").eq("team_id", activity.team_id).in("role", ["participant", "leader"]).is("ends_on", null);
  const { data: invitationRows, error: invitationsError } = await supabase.from("invitations").select("person_id").eq("activity_id", activity.id);
  if (invitationsError) return NextResponse.json({ error: "Deltagarna kunde inte hämtas" }, { status: 500 });
  const allowedPeople = new Set([...(membershipRows ?? []).map((item) => item.person_id), ...(invitationRows ?? []).map((item) => item.person_id)]);
  if (requested.some((id) => !allowedPeople.has(id))) return NextResponse.json({ error: "Närvaro innehåller en person som inte tillhör laget" }, { status: 400 });

  const { data: report, error: reportError } = await supabase.from("activity_attendance_reports").upsert({
    organization_id: activity.organization_id,
    activity_id: activity.id,
    reported_by: authData.user.id,
    reported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "activity_id" }).select("id, reported_at").single();
  if (reportError || !report) return NextResponse.json({ error: "Närvarorapporten kunde inte sparas" }, { status: 500 });

  const { error: deleteError } = await supabase.from("activity_attendance_records").delete().eq("report_id", report.id);
  if (deleteError) return NextResponse.json({ error: "Närvaron kunde inte uppdateras" }, { status: 500 });
  if (requested.length) {
    const { error: insertError } = await supabase.from("activity_attendance_records").insert(requested.map((personId) => ({
      organization_id: activity.organization_id, report_id: report.id, person_id: personId,
    })));
    if (insertError) return NextResponse.json({ error: "Närvaron kunde inte sparas" }, { status: 500 });
  }
  return NextResponse.json({ reportedAt: report.reported_at, count: requested.length });
}

