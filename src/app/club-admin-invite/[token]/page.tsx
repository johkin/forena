import { createHash } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { clubAdminInvitationPath } from "@/lib/club-administrators";
import { acceptClubAdministratorInvitation } from "./actions";
export default async function ClubAdministratorInvitationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const path = clubAdminInvitationPath(token);
  if (!path) redirect("/login?error=Ogiltig+inbjudan");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const context = await supabase.rpc("club_admin_invite_context", { invitation_token_hash: createHash("sha256").update(token).digest("hex") });
  const invitation = z.object({ clubName: z.string(), expiresAt: z.string() }).safeParse(context.data);
  if (context.error || !invitation.success) return <AppShell accountEmail={auth.user.email}><main className="auth-page"><section className="auth-card"><h1>Inbjudan kan inte visas</h1><p>Kontrollera att du är inloggad med samma verifierade e-postadress som inbjudan skickades till. Länken kan ha gått ut, avbrutits eller redan accepterats.</p></section></main></AppShell>;
  return <AppShell accountEmail={auth.user.email}><main className="auth-page"><section className="auth-card"><p className="eyebrow">Förena · Klubbadministration</p><h1>Klubbadministratör i {invitation.data.clubName}</h1><p>Du är inloggad som {auth.user.email}. Bekräfta inbjudan för att bli klubbadministratör i {invitation.data.clubName}. Du får ingen systemadministration.</p>{error ? <p className="auth-error" role="alert">{error}</p> : null}<form action={acceptClubAdministratorInvitation} className="auth-form"><input type="hidden" name="token" value={token}/><button type="submit" className="primary">Acceptera inbjudan</button></form></section></main></AppShell>;
}
