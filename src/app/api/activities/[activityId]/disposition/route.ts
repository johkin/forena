import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Du måste logga in." }, { status: 401 });
  const { activityId } = await params;
  const { data, error } = await supabase.rpc("activity_deletion_options", { target_activity_id: activityId });
  if (error) return NextResponse.json({ error: "Åtgärderna kunde inte hämtas." }, { status: error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 503 });
  return NextResponse.json({ canDelete: data }, { headers: { "Cache-Control": "private, no-store" } });
}
