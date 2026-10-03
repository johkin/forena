import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/setup";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const [{ error: claimError }, { error: adminClaimError }] = await Promise.all([
        supabase.rpc("claim_person_account"),
        supabase.rpc("claim_platform_admin_invite"),
      ]);
      if (claimError) console.error("[auth] player account claim failed", { message: claimError.message });
      if (adminClaimError) console.error("[auth] platform admin claim failed", { message: adminClaimError.message });
      return NextResponse.redirect(new URL(next, url.origin));
    }

    console.error("[auth] code exchange failed", { message: error.message });
  }

  return NextResponse.redirect(
    new URL("/login?error=Inloggningslänken+är+ogiltig+eller+har+gått+ut", url.origin),
  );
}
