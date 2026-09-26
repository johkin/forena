import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type OutboxPayload = {
  activityId?: string;
  teamId?: string;
  title?: string;
  startsAt?: string;
  location?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type ChannelResult = {
  status: "sent" | "failed" | "skipped";
  providerMessageId: string | null;
  lastError: string | null;
};

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("supabase_admin_configuration_missing");
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}

function notificationContent(type: string, payload: OutboxPayload) {
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

  const content = notificationContent(type, payload);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: content.subject, text: content.text }),
  });
  const body = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) throw new Error(body?.message || `resend_${response.status}`);
  return body?.id ?? null;
}

function configureWebPush() {
  const subject = Deno.env.get("VAPID_SUBJECT")?.trim();
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  if (!subject || !publicKey || !privateKey) throw new Error("web_push_transport_not_configured");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function deliveryError(error: unknown) {
  const candidate = error as { statusCode?: number; message?: string };
  return {
    statusCode: candidate?.statusCode,
    message: (candidate?.message || "unknown_delivery_error").slice(0, 500),
  };
}

async function sendPushNotifications(
  supabase: ReturnType<typeof adminClient>,
  subscriptions: PushSubscriptionRow[],
  type: string,
  payload: OutboxPayload,
): Promise<ChannelResult> {
  if (!subscriptions.length) {
    return { status: "skipped", providerMessageId: null, lastError: "no_active_push_subscription" };
  }

  try {
    configureWebPush();
  } catch (error) {
    return { status: "failed", providerMessageId: null, lastError: deliveryError(error).message };
  }

  const content = notificationContent(type, payload);
  const message = JSON.stringify({
    title: content.subject,
    body: content.text,
    url: "/",
    tag: `${type}:${payload.activityId ?? "general"}`,
  });
  let delivered = 0;
  const errors: string[] = [];

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, message, { TTL: 60 * 60, urgency: "high" });
      delivered += 1;
      await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", subscription.id);
    } catch (error) {
      const failure = deliveryError(error);
      errors.push(failure.message);
      if (failure.statusCode === 404 || failure.statusCode === 410) {
        await supabase.from("push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("id", subscription.id);
      }
    }
  }));

  if (delivered > 0) {
    return {
      status: "sent",
      providerMessageId: null,
      lastError: errors.length ? `${delivered}/${subscriptions.length} enheter nåddes` : null,
    };
  }
  return { status: "failed", providerMessageId: null, lastError: errors[0] ?? "push_delivery_failed" };
}

Deno.serve(async (request: Request) => {
  const supabase = adminClient();
  const token = request.headers.get("x-forena-cron-token") ?? "";
  const { data: authorized, error: authError } = await supabase.rpc("authorize_notification_worker", { provided_token: token });
  if (authError || authorized !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error: queueError } = await supabase.rpc("queue_due_activity_invitations", { batch_size: 100 });
  if (queueError) {
    console.error("activity_invitation_materialization_failed", queueError);
    return Response.json({ error: "Kunde inte materialisera schemalagda kallelser." }, { status: 500 });
  }

  const { data: rows, error: claimError } = await supabase.rpc("claim_notification_outbox", { batch_size: 25 });
  if (claimError) {
    console.error("notification_claim_failed", claimError);
    return Response.json({ error: "Kunde inte hämta notifieringar." }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const sentGroups = new Map<string, { organizationId: string; activityId: string; type: string; channel: "push" | "email"; count: number }>();

  for (const row of rows ?? []) {
    const payload = (row.payload ?? {}) as OutboxPayload;
    const attemptedAt = new Date().toISOString();
    const { data: subscriptionRows } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", row.user_id)
      .is("disabled_at", null);
    const pushResult = await sendPushNotifications(supabase, (subscriptionRows ?? []) as PushSubscriptionRow[], row.type, payload);

    await supabase.from("notification_deliveries").upsert({
      organization_id: row.organization_id,
      outbox_id: row.id,
      user_id: row.user_id,
      channel: "push",
      status: pushResult.status,
      provider: "web-push",
      provider_message_id: pushResult.providerMessageId,
      attempts: row.attempts,
      last_error: pushResult.lastError,
      attempted_at: attemptedAt,
      sent_at: pushResult.status === "sent" ? new Date().toISOString() : null,
    }, { onConflict: "outbox_id,channel" });

    let emailResult: ChannelResult = { status: "skipped", providerMessageId: null, lastError: null };
    if (pushResult.status !== "sent") {
      try {
        const { data: authUser, error: userError } = await supabase.auth.admin.getUserById(row.user_id);
        if (userError || !authUser.user?.email) throw new Error("recipient_email_missing");
        emailResult = { status: "sent", providerMessageId: await sendEmail(authUser.user.email, row.type, payload), lastError: null };
      } catch (error) {
        emailResult = { status: "failed", providerMessageId: null, lastError: deliveryError(error).message };
      }
    }

    await supabase.from("notification_deliveries").upsert({
      organization_id: row.organization_id,
      outbox_id: row.id,
      user_id: row.user_id,
      channel: "email",
      status: emailResult.status,
      provider: "resend",
      provider_message_id: emailResult.providerMessageId,
      attempts: emailResult.status === "skipped" ? 0 : row.attempts,
      last_error: emailResult.lastError,
      attempted_at: emailResult.status === "skipped" ? null : attemptedAt,
      sent_at: emailResult.status === "sent" ? new Date().toISOString() : null,
    }, { onConflict: "outbox_id,channel" });

    const deliveredChannel = pushResult.status === "sent" ? "push" : emailResult.status === "sent" ? "email" : null;
    if (deliveredChannel) {
      sent += 1;
      await supabase.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      if (payload.activityId) {
        const key = `${payload.activityId}:${row.type}:${deliveredChannel}`;
        const current = sentGroups.get(key);
        sentGroups.set(key, {
          organizationId: row.organization_id,
          activityId: payload.activityId,
          type: row.type,
          channel: deliveredChannel,
          count: (current?.count ?? 0) + 1,
        });
      }
    } else {
      failed += 1;
      const lastError = emailResult.lastError ?? pushResult.lastError ?? "all_delivery_channels_failed";
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
      channel: group.channel,
      recipient_count: group.count,
      metadata: { provider: group.channel === "push" ? "web-push" : "resend" },
    });
  }

  return Response.json({ claimed: rows?.length ?? 0, sent, failed });
});
