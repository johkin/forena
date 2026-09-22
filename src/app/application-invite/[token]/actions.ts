"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function activateApprovedMembership(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/login?error=Aktiveringslänken+är+ogiltig");
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(`/application-invite/${token}`)}`);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase.rpc("accept_membership_application_invitation", { invitation_token_hash: tokenHash });
  const destination = data?.[0];
  if (error || !destination) {
    const message = error?.message?.includes("annan e-postadress") ? "Logga in med den e-postadress som länken skickades till" : error?.message?.includes("gått ut") ? "Aktiveringslänken har gått ut. Kontakta kansliet" : "Medlemskapet kunde inte aktiveras eller länken har redan använts";
    redirect(`/application-invite/${token}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/o/${destination.organization_slug}/t/${destination.team_slug}?joined=1`);
}
