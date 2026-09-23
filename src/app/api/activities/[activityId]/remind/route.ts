import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ activityId: string }> };

export async function POST(_request: Request, { params }: Props) {
  const { activityId } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });

  const { data, error } = await supabase.rpc("queue_activity_reminder", { target_activity_id: activityId });
  if (error) {
    return NextResponse.json({ error: "Påminnelsen kunde inte köas" }, { status: 403 });
  }

  return NextResponse.json({ queuedRecipients: data ?? 0 });
}
