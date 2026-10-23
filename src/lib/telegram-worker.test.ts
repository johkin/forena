import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { TelegramError } from "../../supabase/functions/_shared/telegram";
import { expect, it, vi } from "vitest";

async function runWorker(options: { recipient?: string | null; prior?: string; failTelegram?: boolean; failPush?: boolean; failEmail?: boolean; savedChild?: boolean; statusCode?: number } = {}) {
  const writes: { table: string; value: Record<string, unknown> }[] = [];
  const send = vi.fn(async () => { if (options.statusCode) throw new TelegramError(options.statusCode, 37); if (options.failTelegram) throw new Error("private provider body"); return "telegram.sent"; });
  const push = vi.fn(async () => { if (options.failPush) throw new Error("push failed"); });
  const rpc = vi.fn(async (name: string) => {
    if (name === "authorize_notification_worker") return { data: true };
    if (name === "claim_notification_outbox") return { data: [{ id: "outbox", organization_id: "org", user_id: "user", type: "activity_invitation", attempts: 2, payload: { activityId: "activity" }, message: { subject: "Training", text: "Details", url: "/activities/abc", tag: "abc" } }] };
    if (name === "telegram_recipient") return { data: options.recipient === undefined ? "111" : options.recipient };
    if (name === "telegram_invitation_messages") return { data: [
      { id: "child-a", message: { person: "Child A", url: "/activities/abc" }, providerMessageId: options.savedChild ? "telegram.already" : null },
      { id: "child-b", message: { person: "Child B", url: "/activities/abc" }, providerMessageId: null },
    ] };
    return { data: null };
  });
  const from = (table: string) => {
    const builder = {
      select: () => builder, eq: () => builder, is: () => builder,
      maybeSingle: async () => ({ data: options.prior ? { status: options.prior, provider_message_id: "telegram.prior" } : null }),
      upsert: async (value: Record<string, unknown>) => { writes.push({ table, value }); return {}; },
      update: (value: Record<string, unknown>) => { writes.push({ table, value }); return builder; },
      insert: async (value: Record<string, unknown>) => { writes.push({ table, value }); return {}; },
      then: (resolve: (result: unknown) => void) => resolve({ data: table === "push_subscriptions" ? [{ id: "subscription", endpoint: "https://push.test", p256dh: "key", auth: "auth" }] : null }),
    };
    return builder;
  };
  let serve: (request: Request) => Promise<Response> = async () => new Response("not registered");
  const source = readFileSync("supabase/functions/notification-worker/index.ts", "utf8").replace(/^import .*\n/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const email = vi.fn(async () => options.failEmail ? new Response("", { status: 500 }) : Response.json({ id: "resend.sent" }));
  vm.runInNewContext(code, {
    Deno: { serve: (handler: typeof serve) => { serve = handler; }, env: { get: (key: string) => key === "TELEGRAM_ENABLED" ? "true" : "configured" } },
    createClient: () => ({ rpc, from, auth: { admin: { getUserById: async () => ({ data: { user: { email: "test@example.test" } } }) } } }),
    webpush: { setVapidDetails: vi.fn(), sendNotification: push }, sendTelegramNotification: send, TelegramError, setTimeout: (fn: () => void) => fn(),
    crypto, Response, fetch: email, console: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  });
  const response = await serve(new Request("https://worker.test", { headers: { "x-forena-cron-token": "test" } }));
  return { result: await response.json(), send, push, email, rpc, writes };
}

it("sends one message per child, records each accepted message and skips reserve channels", async () => {
  const w = await runWorker();
  expect(w.send).toHaveBeenCalledTimes(2);
  expect(w.send.mock.calls.map(call => (call as unknown[])[4])).toMatchObject([{ message: { person: "Child A" } }, { message: { person: "Child B" } }]);
  expect(w.rpc.mock.calls.filter(call => call[0] === "record_telegram_invitation")).toHaveLength(2);
  expect(w.push).not.toHaveBeenCalled(); expect(w.email).not.toHaveBeenCalled();
  expect(w.result).toMatchObject({ sent: 1, failed: 0 });
  expect(w.writes).toContainEqual({ table: "activity_events", value: expect.objectContaining({ channel: "telegram" }) });
});
it("does not resend accepted child messages after a partial transport failure", async () => {
  const w = await runWorker({ savedChild: true });
  expect(w.send).toHaveBeenCalledTimes(1);
  expect(w.result.sent).toBe(1);
});
it("reuses a recorded Telegram success when recovering an outbox claim", async () => {
  const w = await runWorker({ prior: "sent" });
  expect(w.send).not.toHaveBeenCalled(); expect(w.push).not.toHaveBeenCalled(); expect(w.email).not.toHaveBeenCalled();
  expect(w.result.sent).toBe(1);
});
it("uses push for users without an active Telegram connection", async () => {
  const w = await runWorker({ recipient: null });
  expect(w.send).not.toHaveBeenCalled(); expect(w.push).toHaveBeenCalledOnce(); expect(w.email).not.toHaveBeenCalled();
  expect(w.result.sent).toBe(1);
});
it("falls back to push or email on Telegram failures without persisting provider bodies", async () => {
  const w = await runWorker({ failTelegram: true, failPush: true });
  expect(w.email).toHaveBeenCalledOnce(); expect(w.result.sent).toBe(1);
  expect(w.writes).toContainEqual({ table: "notification_deliveries", value: expect.objectContaining({ channel: "telegram", status: "failed", last_error: "telegram_send_failed" }) });
  expect(JSON.stringify(w.writes)).not.toContain("private provider body");
});
it("uses the existing backoff when all transports fail", async () => {
  const w = await runWorker({ failTelegram: true, failPush: true, failEmail: true });
  expect(w.result.failed).toBe(1);
  expect(w.writes).toContainEqual({ table: "notification_outbox", value: expect.objectContaining({ status: "failed", scheduled_at: expect.any(String) }) });
});

it("records Telegram retry_after for subsequent batches while delivering through a reserve channel", async () => {
  const w = await runWorker({ statusCode: 429 });
  expect(w.rpc).toHaveBeenCalledWith("telegram_delivery_failure", { target_chat: "111", retry_seconds: 37, blocked: false });
  expect(w.push).toHaveBeenCalledOnce();
  expect(w.result.sent).toBe(1);
});
it("disconnects a blocked bot and still attempts push", async () => {
  const w = await runWorker({ statusCode: 403 });
  expect(w.rpc).toHaveBeenCalledWith("telegram_delivery_failure", { target_chat: "111", retry_seconds: 0, blocked: true });
  expect(w.push).toHaveBeenCalledOnce();
});
