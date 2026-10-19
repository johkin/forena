import { NextResponse } from "next/server";
import { invitationAvailable } from "@/lib/invitation-availability";
import { createClient } from "@/lib/supabase/server";
import { forwardKotlinParticipation, kotlinParticipationSelected } from "@/lib/kotlin-participation";

export async function GET(_request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  if (kotlinParticipationSelected()) return forwardKotlinParticipation(_request, "list", (await params).activityId);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Logga in för att svara." }, { status:401 });
  const { activityId } = await params;
  const { data: activity, error: activityError } = await supabase.from("activities").select("invitation_send_at").eq("id", activityId).maybeSingle();
  if (activityError || !activity) return NextResponse.json({ error:"Aktiviteten kunde inte hittas." }, { status:404 });
  if (!invitationAvailable(activity.invitation_send_at)) return NextResponse.json({ invitations:[] }, { headers:{"Cache-Control":"no-store"} });
  const [{ data: own, error: ownError }, { data: wards, error: wardsError }] = await Promise.all([
    supabase.from("people").select("id").eq("user_id", auth.user.id),
    supabase.from("person_guardians").select("person_id").eq("guardian_user_id", auth.user.id),
  ]);
  if (ownError || wardsError) return NextResponse.json({ error:"Kallelserna kunde inte hämtas." }, { status:500 });
  const ids = [...new Set([...(own ?? []).map(p=>p.id), ...(wards ?? []).map(p=>p.person_id)])];
  if (!ids.length) return NextResponse.json({ invitations:[] });
  const { data: invitations, error } = await supabase.from("invitations").select("id, person_id, response, response_comment").eq("activity_id", activityId).in("person_id", ids);
  const { data: people, error: namesError } = await supabase.from("people").select("id, display_name").in("id", ids);
  if (error || namesError) return NextResponse.json({ error:"Kallelserna kunde inte hämtas." }, { status:500 });
  return NextResponse.json({ invitations:(invitations ?? []).map(i=>({ ...i, name:people?.find(p=>p.id===i.person_id)?.display_name ?? "Spelare" })) }, { headers:{"Cache-Control":"no-store"} });
}
