import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedResponses = new Set(["accepted", "declined", "maybe"]);

type Props = {
  params: Promise<{ invitationId: string }>;
};

export async function PUT(request: Request, { params }: Props) {
  const { invitationId } = await params;
  const body: unknown = await request.json().catch(() => null);
  const response =
    typeof body === "object" && body !== null && "response" in body
      ? (body as { response?: unknown }).response
      : undefined;

  if (typeof response !== "string" || !allowedResponses.has(response)) {
    return NextResponse.json({ error: "Ogiltigt kallelsesvar" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });
  }

  const { error } = await supabase
    .from("invitations")
    .update({ response: response as "accepted" | "declined" | "maybe", responded_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (error) {
    return NextResponse.json({ error: "Kallelsesvaret kunde inte sparas" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
