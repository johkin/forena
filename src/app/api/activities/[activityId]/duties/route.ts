import { NextResponse } from "next/server";
import { z } from "zod";
import { activityManagementContext } from "@/lib/activity-management-context";

type Props = { params: Promise<{ activityId: string }> };
export async function GET(request: Request, { params }: Props) {
  const context = await activityManagementContext((await params).activityId);
  if ("error" in context) return context.error;
  const { supabase, activity } = context;
  const personId = new URL(request.url).searchParams.get("personId");
  if (personId) {
    if (!z.uuid().safeParse(personId).success) return NextResponse.json({ error: "Ogiltig person" }, { status: 400 });
    const { data, error } = await supabase.rpc("activity_duty_history", { target_team_id: activity.team_id, target_person_id: personId });
    if (error) return NextResponse.json({ error: "Historiken kunde inte hämtas" }, { status: 500 });
    return NextResponse.json({ history: data });
  }
  const [{ data: type, error: typeError }, { data: duties, error }] = await Promise.all([
    supabase.from("activity_types").select("system_category").eq("id", activity.activity_type_id).single(),
    supabase.from("activity_duty_types").select("id, name").eq("team_id", activity.team_id).eq("active", true).order("name"),
  ]);
  if (error || typeError) return NextResponse.json({ error: "Uppgifterna kunde inte hämtas" }, { status: 500 });
  return NextResponse.json({ isWork: type?.system_category === "work", duties });
}
export async function POST(request: Request, { params }: Props) {
  const context = await activityManagementContext((await params).activityId);
  if ("error" in context) return context.error;
  const body = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ange ett namn på 1–80 tecken" }, { status: 400 });
  const { data, error } = await context.supabase.from("activity_duty_types").insert({ organization_id: context.activity.organization_id, team_id: context.activity.team_id, name: body.data.name }).select("id, name").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Uppgiften finns redan" : "Uppgiften kunde inte skapas" }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ duty: data });
}
export async function PUT() {
  return NextResponse.json({ error: "Arbetsuppgifter hanteras nu i bemanningsschemat. Uppdatera sidan." }, { status: 410 });
}
