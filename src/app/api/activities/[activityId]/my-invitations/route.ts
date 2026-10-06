import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Logga in för att svara." }, { status:401 });
  const { activityId } = await params;
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
