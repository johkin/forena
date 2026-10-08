import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { processDisciplineActivityEvents } from "../_shared/discipline-event-worker.ts";
import { collectCapabilityNotifications } from "../_shared/discipline-capabilities.ts";

// Business evaluation is independent of notification delivery and its retries.
Deno.serve(async (request: Request) => {
  const runId = crypto.randomUUID();
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error: "Worker configuration missing" }, { status: 500 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authorized, error: authError } = await supabase.rpc("authorize_notification_worker", {
    provided_token: request.headers.get("x-forena-cron-token") ?? "",
  });
  if (authError || authorized !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let evaluation: { proposals: Awaited<ReturnType<typeof collectCapabilityNotifications>> } | { error: string };
  try {
    await processDisciplineActivityEvents(supabase);
    const proposals = await collectCapabilityNotifications(async () => {
      const { data, error } = await supabase.rpc("claim_capability_contexts", {
        batch_size: 100,
      });
      if (error) throw error;
      return data ?? [];
    });
    evaluation = { proposals };
  } catch {
    // Persist this handler's retry without preventing invitation/reminder work.
    console.error("scheduled_task_worker.capability_evaluation_failed", { runId });
    evaluation = { error: "capability_evaluation_failed" };
  }
  const { data, error } = await supabase.rpc("run_due_scheduled_tasks", {
    profiles: evaluation, batch_size: 10,
  });
  if (error) {
    console.error("scheduled_task_worker.failed", { runId, code: error.code });
    return Response.json({ error: "Could not run scheduled tasks", runId }, { status: 500 });
  }
  console.info("scheduled_task_worker.complete", { runId, result: data });
  return Response.json({ result: data, runId });
});
