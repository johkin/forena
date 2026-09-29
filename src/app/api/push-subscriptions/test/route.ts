import { NextResponse } from "next/server";
import { parsePushEndpoint } from "@/lib/push-subscription";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export async function POST(request: Request) {
  const endpoint = parsePushEndpoint(await request.json().catch(() => null));
  if (!endpoint) return NextResponse.json({ error: "Ogiltig push-prenumeration" }, { status: 400 });

  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });

  const { url, publishableKey } = getSupabaseEnvironment();
  try {
    const response = await fetch(`${url}/functions/v1/notification-worker?action=test-push`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ endpoint }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null) as { error?: string; sent?: boolean } | null;
    return NextResponse.json(response.ok ? { sent: true } : { error: result?.error ?? "Testnotisen kunde inte skickas" }, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Testtjänsten kunde inte nås" }, { status: 502 });
  }
}
