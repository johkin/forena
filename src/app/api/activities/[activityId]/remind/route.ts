import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { queueActivityReminder } from "@/lib/activity-reminders";

type Props = { params: Promise<{ activityId: string }> };

export async function POST(_request: Request, { params }: Props) {
  const { activityId } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });

  try {
    return NextResponse.json(await queueActivityReminder(supabase, activityId));
  } catch {
    return NextResponse.json({ error: "Påminnelsen kunde inte köas" }, { status: 403 });
  }
}
