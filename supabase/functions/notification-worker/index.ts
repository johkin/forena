import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type OutboxPayload = {
  activityId?: string;
  teamId?: string;
  title?: string;
  startsAt?: string;
  location?: string;
};

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("supabase_admin_configuration_missing");
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}

function emailContent(type: string, payload: OutboxPayload) {
  const title = payload.title || "Aktivitet";
  const when = payload.startsAt
    ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(payload.startsAt))
    : "";
  const location = payload.location ? ` på ${payload.location}` : "";

  if (type === "invitation_reminder") {
    return {
      subject: `Påminnelse: svara på kallelsen till ${title}`,
      text: `Du har en obesvarad kallelse till ${title}${when ? ` ${when}` : ""}${location}. Logga in i Förena för att svara.`,
    };
  }

  return {
    subject: `Kallelse: ${title}`,
    text: `Du är kallad till ${title}${when ? ` ${when}` : ""}${location}. Logga in i Förena för att svara.`,
  };
}

async function sendEmail(to: string, type: string, payload: OutboxPayload) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  if (!apiKey || !from) throw new Error("email_transport_not_configured");

  const content = emailContent(type, payload);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: content.subject, text: content.text }),
  });
  const body = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) throw new Error(body?.message || `resend_${response.status}`);
  return body?.id ?? null;
}

Deno.serve(async (request: Request) => {
  const supabase = adminClient();
  const token = request.headers.get("x-forena-cron-token") ?? "";
  const { data: authorized, error: authError } = await supabase.rpc("authorize_notification_worker", {
    provided_token: token,
  });

  if (authError || authorized !== true) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error: claimError } = await supabase.rpc("claim_notification_outbox", { batch_size: 25 });
  if (claimError) {
    console.error("notification_claim_failed", claimError);
    return Response.json({ error: "Kunde inte hämta notifieringar." }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const sentGroups = new Map<string, { organizationId: string; activityId: string; type: string; count: number }>();

  for (const row of rows ?? []) {
    const payload = (row.payload ?? {}) as OutboxPayload;
    let emailStatus: "sent" | "failed" = "failed";
    let providerMessageId: string | null = null;
    let lastError: string | null = null;

    try {
      const { data: authUser, error: userError } = await supabase.auth.admin.getUserById(row.user_id);
      if (userError || !authUser.user?.email) throw new Error("recipient_email_missing");
      providerMessageId = await sendEmail(authUser.user.email, row.type, payload);
      emailStatus = "sent";
      sent += 1;
    } catch (error) {
      failed += 1;
      lastError = error instanceof Error ? error.message.slice(0, 500) : "unknown_delivery_error";
    }

    await supabase.from("notification_deliveries").upsert({
      organization_id: row.organization_id,
      outbox_id: row.id,
      user_id: row.user_id,
      channel: "email",
      status: emailStatus,
      provider: "resend",
      provider_message_id: providerMessageId,
      attempts: row.attempts,
      last_error: lastError,
      attempted_at: new Date().toISOString(),
      sent_at: emailStatus === "sent" ? new Date().toISOString() : null,
    }, { onConflict: "outbox_id,channel" });

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", row.user_id)
      .is("disabled_at", null)
      .limit(1);

    await supabase.from("notification_deliveries").upsert({
      organization_id: row.organization_id,
      outbox_id: row.id,
      user_id: row.user_id,
      channel: "push",
      status: "skipped",
      provider: "web-push",
      attempts: 0,
      last_error: subscriptions?.length ? "push_transport_not_configured" : "no_active_push_subscription",
      attempted_at: new Date().toISOString(),
      sent_at: null,
    }, { onConflict: "outbox_id,channel" });

    if (emailStatus === "sent") {
      await supabase.from("notification_outbox").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", row.id);

      if (payload.activityId) {
        const key = `${payload.activityId}:${row.type}`;
        const current = sentGroups.get(key);
        sentGroups.set(key, {
          organizationId: row.organization_id,
          activityId: payload.activityId,
          type: row.type,
          count: (current?.count ?? 0) + 1,
        });
      }
    } else {
      const retryMinutes = Math.min(60, Math.pow(2, Math.max(0, row.attempts - 1)) * 5);
      const exhausted = row.attempts >= 5;
      await supabase.from("notification_outbox").update({
        status: "failed",
        scheduled_at: exhausted ? row.scheduled_at : new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        last_error: lastError,
      }).eq("id", row.id);
    }
  }

  for (const group of sentGroups.values()) {
    await supabase.from("activity_events").insert({
      organization_id: group.organizationId,
      activity_id: group.activityId,
      event_type: group.type === "invitation_reminder" ? "reminder_sent" : "invitation_sent",
      channel: "email",
      recipient_count: group.count,
      metadata: { provider: "resend" },
    });
  }

  return Response.json({ claimed: rows?.length ?? 0, sent, failed });
});
