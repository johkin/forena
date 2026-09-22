import { createHash, randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ applicationId: string }> };
type RequestBody = { decision?: "approved" | "rejected"; rejectionReason?: string };

export async function POST(request: Request, { params }: Props) {
  const { applicationId } = await params;
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.decision) return NextResponse.json({ error: "Beslut saknas." }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du behöver logga in igen." }, { status: 401 });

  const { data: application } = await supabase.from("membership_applications")
    .select("id, organization_id, review_status, activation_status, player_first_name, player_last_name")
    .eq("id", applicationId).maybeSingle();
  if (!application) return NextResponse.json({ error: "Ansökan kunde inte hittas eller så saknar du behörighet." }, { status: 403 });
  if (application.activation_status === "activated") return NextResponse.json({ error: "Medlemskapet är redan aktiverat." }, { status: 409 });
  if (application.review_status === "rejected") return NextResponse.json({ error: "En avslagen ansökan kan inte ändras utan ny granskning." }, { status: 409 });

  const reviewedAt = new Date().toISOString();
  if (body.decision === "rejected") {
    if (application.review_status !== "submitted") return NextResponse.json({ error: "Endast väntande ansökningar kan avslås." }, { status: 409 });
    const { error } = await supabase.from("membership_applications").update({
      review_status: "rejected", reviewed_by: authData.user.id, reviewed_at: reviewedAt,
      rejection_reason: body.rejectionReason?.trim() || null,
    }).eq("id", applicationId);
    return error ? NextResponse.json({ error: "Ansökan kunde inte avslås." }, { status: 400 }) : NextResponse.json({ status: "rejected" });
  }

  const { data: guardians } = await supabase.from("membership_application_guardians")
    .select("id, organization_id, email, position").eq("application_id", applicationId).order("position");
  if (!guardians?.length) return NextResponse.json({ error: "Ansökan saknar målsman." }, { status: 400 });

  const { error: approvalError } = await supabase.from("membership_applications").update({
    review_status: "approved", reviewed_by: authData.user.id, reviewed_at: reviewedAt, rejection_reason: null,
  }).eq("id", applicationId);
  if (approvalError) return NextResponse.json({ error: "Ansökan kunde inte godkännas." }, { status: 400 });

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  for (const guardian of guardians) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { error: tokenError } = await supabase.from("membership_application_tokens").upsert({
      id: randomUUID(), application_id: applicationId, guardian_id: guardian.id,
      organization_id: guardian.organization_id, token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), accepted_at: null, accepted_by: null,
    }, { onConflict: "application_id,guardian_id" });
    if (tokenError) return NextResponse.json({ error: "Aktiveringslänken kunde inte skapas." }, { status: 400 });

    const next = `/application-invite/${token}`;
    const { error: emailError } = await supabase.auth.signInWithOtp({
      email: guardian.email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
    });
    if (emailError) {
      console.error("[membership-application] activation email failed", { guardian: guardian.position, message: emailError.message });
      return NextResponse.json({ error: "Ansökan godkändes, men alla aktiveringslänkar kunde inte skickas. Försök godkänna igen." }, { status: 502 });
    }
  }

  await supabase.from("membership_applications").update({ activation_status: "invitation_sent" }).eq("id", applicationId);
  return NextResponse.json({ status: "approved", invitations: guardians.length });
}
