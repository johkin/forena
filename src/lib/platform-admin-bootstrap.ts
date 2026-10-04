import { createHash, randomBytes } from "node:crypto";
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

  const now = new Date();
  const nowIso = now.toISOString();
  const staleUnsentBefore = new Date(now.getTime() - 5 * 60_000).toISOString();

  await supabase
    .from("platform_admin_invites")
    .update({ status: "expired" })
    .eq("source", "bootstrap")
    .eq("status", "pending")
    .lte("expires_at", nowIso);

  await supabase
    .from("platform_admin_invites")
    .update({ status: "cancelled" })
    .eq("source", "bootstrap")
    .eq("status", "pending")
    .neq("email", email);

  // Recover if a server process died after reserving an invitation but before
  // sending it. A fresh instance may reclaim that unsent reservation after 5 min.
  await supabase
    .from("platform_admin_invites")
    .update({ status: "failed" })
    .eq("source", "bootstrap")
    .eq("email", email)
    .eq("status", "pending")
    .is("sent_at", null)
    .lte("created_at", staleUnsentBefore);

  const { data: existing, error: existingError } = await supabase
    .from("platform_admin_invites")
    .select("id, sent_at, expires_at")
    .eq("email", email)
    .eq("source", "bootstrap")
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return { status: "pending" as const, email };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = await supabase
    .from("platform_admin_invites")
    .insert({ email, token_hash: tokenHash, source: "bootstrap", status: "pending" })
    .select("id")
    .single();

  if (created.error || !created.data) {
    // Another server instance may have reserved the one allowed bootstrap
    // invitation first. It owns the token and therefore also owns the send.
    if (created.error?.code === "23505") return { status: "pending" as const, email };
    throw created.error ?? new Error("Bootstrap-inbjudan kunde inte skapas.");
  }

  const invitationUrl = `${getSiteUrl()}/system-admin-invite/${encodeURIComponent(token)}`;

  try {
    await sendPlatformAdminInvitationEmail({
      to: email,
      invitationUrl,
      invitationId: created.data.id,
      bootstrap: true,
    });
  } catch (error) {
    await supabase
      .from("platform_admin_invites")
      .update({ status: "failed" })
      .eq("id", created.data.id)
      .eq("status", "pending");
    throw error;
  }

  const { error: sentError } = await supabase
    .from("platform_admin_invites")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", created.data.id)
    .eq("status", "pending");

  if (sentError) throw sentError;
  return { status: "invited" as const, email };
}
