import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RequestBody = {
  teamId?: string;
  email?: string;
  role?: "leader" | "guardian";
  personDisplayName?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const teamId = body?.teamId?.trim();
  const email = body?.email?.trim().toLowerCase();
  const role = body?.role;
  const personDisplayName = body?.personDisplayName?.trim();

  if (!teamId || !email || !email.includes("@") || !role || (role === "guardian" && !personDisplayName)) {
    return NextResponse.json({ error: "Kontrollera e-postadress, roll och spelarens namn." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du behöver logga in igen." }, { status: 401 });

  const { data: team } = await supabase
    .from("teams")
    .select("organization_id")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: "Laget kunde inte hittas eller så saknar du behörighet." }, { status: 403 });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: invitation, error: insertError } = await supabase
    .from("team_member_invitations")
    .insert({
      organization_id: team.organization_id,
      team_id: teamId,
      email,
      role,
      person_display_name: role === "guardian" ? personDisplayName : null,
      token_hash: tokenHash,
      invited_by: authData.user.id,
    })
    .select("id")
    .single();

  if (insertError || !invitation) {
    const duplicate = insertError?.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "Det finns redan en aktiv inbjudan till den adressen." : "Inbjudan kunde inte skapas." },
      { status: duplicate ? 409 : 403 },
    );
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const next = `/invite/${token}`;
  const { error: emailError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (emailError) {
    await supabase.from("team_member_invitations").delete().eq("id", invitation.id);
    console.error("[team-invitation] email failed", { message: emailError.message });
    return NextResponse.json({ error: "Inbjudan skapades, men e-postmeddelandet kunde inte skickas." }, { status: 502 });
  }

  return NextResponse.json({ email });
}
