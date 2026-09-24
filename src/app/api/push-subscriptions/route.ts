import { NextResponse } from "next/server";
import { parsePushEndpoint, parsePushSubscription } from "@/lib/push-subscription";
import { createClient } from "@/lib/supabase/server";

async function requestBody(request: Request) {
  return request.json().catch(() => null) as Promise<unknown>;
}

export async function POST(request: Request) {
  const subscription = parsePushSubscription(await requestBody(request));
  if (!subscription) return NextResponse.json({ error: "Ogiltig push-prenumeration" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });

  const now = new Date().toISOString();
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: authData.user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    last_used_at: now,
    disabled_at: null,
  }, { onConflict: "endpoint" });

  if (error) return NextResponse.json({ error: "Push-prenumerationen kunde inte sparas" }, { status: 403 });
  return NextResponse.json({ active: true });
}

export async function DELETE(request: Request) {
  const endpoint = parsePushEndpoint(await requestBody(request));
  if (!endpoint) return NextResponse.json({ error: "Ogiltig push-prenumeration" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ disabled_at: new Date().toISOString() })
    .eq("user_id", authData.user.id)
    .eq("endpoint", endpoint);

  if (error) return NextResponse.json({ error: "Push-prenumerationen kunde inte stängas av" }, { status: 403 });
  return NextResponse.json({ active: false });
}
