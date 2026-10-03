import { sendPlatformAdminInvitationEmail } from "@/lib/email/platform-admin-invitation";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizedInitialAdminEmail() {
  const value = process.env.FORENA_INITIAL_SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
  return value && value.includes("@") ? value : null;
}

export async function ensureInitialSystemAdminInvite() {
  const email = normalizedInitialAdminEmail();
  if (!email) return { status: "disabled" as const };

  const supabase = createAdminClient();
  const { count: adminCount, error: adminError } = await supabase
    .from("platform_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "system_admin");

  if (adminError) throw adminError;
  if ((adminCount ?? 0) > 0) return { status: "already-configured" as const };

  const now = new Date().toISOString();
  await supabase
    .from("platform_admin_invites")
    .update({ status: "expired" })
    .eq("source", "bootstrap")
    .eq("status", "pending")
    .lte("expires_at", now);

  await supabase
    .from("platform_admin_invites")
    .update({ status: "cancelled" })
    .eq("source", "bootstrap")
    .eq("status", "pending")
    .neq("email", email);

  let { data: invite, error: inviteError } = await supabase
    .from("platform_admin_invites")
    .select("id, email, sent_at, expires_at")
    .eq("email", email)
    .eq("source", "bootstrap")
    .eq("status", "pending")
    .gt("expires_at", now)
    .maybeSingle();

  if (inviteError) throw inviteError;

  if (!invite) {
    const result = await supabase
      .from("platform_admin_invites")
      .insert({ email, source: "bootstrap", status: "pending" })
      .select("id, email, sent_at, expires_at")
      .single();

    if (result.error) {
      // Another server instance may have won the race. Re-read the canonical row.
      const concurrent = await supabase
        .from("platform_admin_invites")
        .select("id, email, sent_at, expires_at")
        .eq("email", email)
        .eq("status", "pending")
        .gt("expires_at", now)
        .maybeSingle();
      if (concurrent.error || !concurrent.data) throw result.error;
      invite = concurrent.data;
    } else {
      invite = result.data;
    }
  }

  if (invite.sent_at) return { status: "pending" as const, email };

  const invitationUrl = `${getSiteUrl()}/login?next=${encodeURIComponent("/system")}`;
  await sendPlatformAdminInvitationEmail({
    to: email,
    invitationUrl,
    invitationId: invite.id,
    bootstrap: true,
  });

  const { error: sentError } = await supabase
    .from("platform_admin_invites")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending");

  if (sentError) throw sentError;
  return { status: "invited" as const, email };
}
