import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedResponses = new Set(["pending", "accepted", "declined"]);

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
  const rawComment =
    typeof body === "object" && body !== null && "comment" in body
      ? (body as { comment?: unknown }).comment
      : undefined;
  const comment = typeof rawComment === "string" ? rawComment.trim().slice(0, 500) : "";

  if (typeof response !== "string" || !allowedResponses.has(response)) {
    return NextResponse.json({ error: "Ogiltigt kallelsesvar" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Inloggning krävs" }, { status: 401 });
  }

  const isPending = response === "pending";
  const { error } = await supabase
    .from("invitations")
    .update({
      response: response as "pending" | "accepted" | "declined",
      responded_at: isPending ? null : new Date().toISOString(),
      response_comment: isPending ? null : (comment || null),
    })
    .eq("id", invitationId);

  if (error) {
    return NextResponse.json({ error: "Kallelsesvaret kunde inte sparas" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
