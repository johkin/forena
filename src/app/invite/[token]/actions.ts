"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptTeamInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/login?error=Inbjudan+saknar+en+giltig+länk");

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase.rpc("accept_team_member_invitation", {
    invitation_token_hash: tokenHash,
  });

  const destination = data?.[0];
  if (error || !destination) {
    const message = error?.message?.includes("annan e-postadress")
      ? "Logga in med den e-postadress som inbjudan skickades till"
      : error?.message?.includes("gått ut")
        ? "Inbjudan har gått ut. Be en ledare skicka en ny"
        : "Inbjudan kunde inte accepteras eller har redan använts";
    redirect(`/invite/${token}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/o/${destination.organization_slug}/t/${destination.team_slug}?joined=1`);
}
