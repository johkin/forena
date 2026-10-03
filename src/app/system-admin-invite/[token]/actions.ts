"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptSystemAdminInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/login?error=Inbjudan+saknar+en+giltig+länk");

  const destination = `/system-admin-invite/${token}`;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: accepted, error } = await supabase.rpc("claim_platform_admin_invite", {
    invitation_token_hash: tokenHash,
  });

  if (error || !accepted) {
    console.error("[system-admin] invitation claim failed", {
      message: error?.message ?? "Invitation did not match the authenticated account",
    });
    redirect(`${destination}?error=${encodeURIComponent("Inbjudan kunde inte accepteras. Kontrollera att du är inloggad med samma verifierade e-postadress som inbjudan skickades till och att länken inte har gått ut.")}`);
  }

  redirect("/system/administrators?joined=1");
}
