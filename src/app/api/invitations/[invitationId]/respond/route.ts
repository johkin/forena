import { invitationAvailable } from "@/lib/invitation-availability";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forwardKotlinParticipation, kotlinParticipationSelected } from "@/lib/kotlin-participation";

const allowedResponses = new Set(["pending", "accepted", "declined"]);

type Props = {
  params: Promise<{ invitationId: string }>;
};

export async function PUT(request: Request, { params }: Props) {
  if (kotlinParticipationSelected()) return forwardKotlinParticipation(request, "respond", (await params).invitationId);
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

  // Give a readable error; the database policy/trigger remains authoritative
  // if the activity changes after this read or a caller bypasses this route.
  const { data: invitation, error: readError } = await supabase
    .from("invitations")
    .select("activity_id")
    .eq("id", invitationId)
    .maybeSingle();
  if (readError || !invitation) {
    return NextResponse.json({ error: "Kallelsen är inte tillgänglig." }, { status:403 });
  }
  const { data: activity, error: activityError } = await supabase
    .from("activities").select("status, ends_at, invitation_send_at").eq("id", invitation.activity_id).maybeSingle();
  if (activityError || !activity) {
    return NextResponse.json({ error: "Kallelsen är inte tillgänglig." }, { status:403 });
  }
  if (activity.status === "cancelled" || Date.parse(activity.ends_at) <= Date.now()) {
    return NextResponse.json({ error: "Aktiviteten är inställd eller avslutad. Svaret kan inte ändras." }, { status:409 });
  }

  if (!invitationAvailable(activity.invitation_send_at)) {
    return NextResponse.json({ error:"Kallelsen har inte skickats ännu. Svaret kan inte ändras." }, { status:409 });
  }

  const isPending = response === "pending";
  const { data: updated, error } = await supabase
    .from("invitations")
    .update({
      response: response as "pending" | "accepted" | "declined",
      responded_at: isPending ? null : new Date().toISOString(),
      // Quick replies omit comment; only explicit comment edits replace it.
      ...(isPending ? { response_comment:null } : rawComment !== undefined ? { response_comment:comment || null } : {}),
    })
    .eq("id", invitationId)
    .select("id")
    .maybeSingle();

  if (error?.code === "23514") {
    return NextResponse.json({ error: "Aktiviteten är inställd eller avslutad. Svaret kan inte ändras." }, { status:409 });
  }
  if (error || !updated) {
    return NextResponse.json({ error: "Kallelsesvaret kunde inte sparas" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
