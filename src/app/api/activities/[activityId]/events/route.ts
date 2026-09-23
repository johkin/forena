import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ activityId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { activityId } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });

  const [{ data: events, error: eventsError }, { data: deliveryStatus }] = await Promise.all([
    supabase
      .from("activity_events")
      .select("id, event_type, channel, recipient_count, metadata, created_at")
      .eq("activity_id", activityId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("get_activity_delivery_status", { target_activity_id: activityId }),
  ]);

  if (eventsError) return NextResponse.json({ error: "Aktivitetshistoriken kunde inte hämtas" }, { status: 403 });
  return NextResponse.json({ events: events ?? [], deliveryStatus: deliveryStatus ?? null });
}
