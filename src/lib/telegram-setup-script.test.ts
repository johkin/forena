import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

const source = readFileSync("scripts/configure-telegram-webhook.mjs", "utf8");
const config = {
  TELEGRAM_BOT_TOKEN: "123456:synthetic_bot_token",
  TELEGRAM_BOT_USERNAME: "ForenaBot",
  TELEGRAM_WEBHOOK_SECRET: "synthetic_webhook_secret_1234567890",
  SITE_URL: "https://forena.test",
};
type Transport = (url: string, init: RequestInit) => Promise<Response>;

async function run(env: Record<string, string | undefined> = {}, transport?: Transport) {
  const process = { env: { ...config, ...env }, exitCode: 0 };
  const console = { info: vi.fn(), error: vi.fn() };
  const fetch = vi.fn<Transport>(transport ?? (async url => Response.json({ ok: true,
    result: url.endsWith("/getMe") ? { username: "ForenaBot" } : true,
  })));
  await vm.runInNewContext(`(async () => {${source}\n})()`, { process, console, fetch, URL, AbortSignal });
  return { exitCode: process.exitCode, fetch, output: [...console.info.mock.calls, ...console.error.mock.calls].flat().join("\n") };
}

it("reports every missing variable and explains loading an env file without making API calls", async () => {
  const result = await run(Object.fromEntries(Object.keys(config).map(key => [key, undefined])));
  expect(result.exitCode).toBe(1);
  for (const key of Object.keys(config)) expect(result.output).toContain(key);
  expect(result.output).toContain("--env-file=.env");
  expect(result.fetch).not.toHaveBeenCalled();
});

it.each([
  ["TELEGRAM_BOT_TOKEN", "bad-token", "TELEGRAM_BOT_TOKEN har fel format"],
  ["TELEGRAM_WEBHOOK_SECRET", "short", "TELEGRAM_WEBHOOK_SECRET måste vara 32–256"],
  ["TELEGRAM_BOT_USERNAME", "@ForenaBot", "TELEGRAM_BOT_USERNAME måste vara"],
  ["SITE_URL", "not-a-url", "SITE_URL är ingen giltig absolut URL"],
  ["SITE_URL", "http://forena.test", "SITE_URL måste använda https://"],
  ["SITE_URL", "https://user:password@forena.test", "SITE_URL får inte innehålla användarnamn"],
  ["SITE_URL", "https://forena.test/api/telegram/webhook", "SITE_URL ska vara appens basadress"],
])("identifies invalid %s before contacting Telegram", async (key, value, message) => {
  const result = await run({ [key]: value });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(message);
  expect(result.fetch).not.toHaveBeenCalled();
});

it.each(["https://forena.test", "https://forena.test/"])("registers the correct webhook for base URL %s", async site => {
  const result = await run({ SITE_URL: site, TELEGRAM_BOT_USERNAME: " forenabot " });
  expect(result.exitCode).toBe(0);
  expect(result.fetch.mock.calls.map(([url]) => url.split("/").pop())).toEqual(["getMe", "setMyCommands", "setWebhook"]);
  expect(JSON.parse(result.fetch.mock.calls[2][1].body as string)).toMatchObject({
    url: "https://forena.test/api/telegram/webhook", secret_token: config.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query", "my_chat_member"], max_connections: 4,
  });
  expect(result.output).toContain("Telegram-webhook och kommandon är konfigurerade");
  expect(result.output).not.toContain(config.TELEGRAM_BOT_TOKEN);
  expect(result.output).not.toContain(config.TELEGRAM_WEBHOOK_SECRET);
});

it("identifies the failing API method and reports Telegram's reason without exposing credentials or raw bodies", async () => {
  const result = await run({}, async url => url.endsWith("/getMe")
    ? Response.json({ ok: true, result: { username: "ForenaBot" } })
    : url.endsWith("/setMyCommands") ? Response.json({ ok: true, result: true })
    : Response.json({ ok: false, error_code: 400,
      description: `Bad Request: bad webhook: Failed to resolve host ${config.TELEGRAM_BOT_TOKEN} ${encodeURIComponent(config.TELEGRAM_BOT_TOKEN)} ${config.TELEGRAM_WEBHOOK_SECRET} https://internal.test/private`,
      debug: "raw provider body must never appear",
    }, { status: 400 }));
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("setWebhook: HTTP 400, Telegram 400");
  expect(result.output).toContain("Failed to resolve host");
  for (const sensitive of [config.TELEGRAM_BOT_TOKEN, encodeURIComponent(config.TELEGRAM_BOT_TOKEN), config.TELEGRAM_WEBHOOK_SECRET, "internal.test", "raw provider body"]) expect(result.output).not.toContain(sensitive);
});

it("explains authentication failure and stops before changing commands or the webhook", async () => {
  const result = await run({}, async () => Response.json({ ok: false, error_code: 401, description: "Unauthorized" }, { status: 401 }));
  expect(result.output).toContain("getMe: HTTP 401, Telegram 401");
  expect(result.output).toContain("Kontrollera TELEGRAM_BOT_TOKEN från BotFather");
  expect(result.fetch).toHaveBeenCalledTimes(1);
  expect(result.exitCode).toBe(1);
});

it("identifies a mismatched bot username without changing configuration", async () => {
  const result = await run({}, async () => Response.json({ ok: true, result: { username: "DifferentBot" } }));
  expect(result.output).toContain("getMe: TELEGRAM_BOT_USERNAME stämmer inte");
  expect(result.output).toContain("Ingen webhook har ändrats");
  expect(result.fetch).toHaveBeenCalledTimes(1);
  expect(result.exitCode).toBe(1);
});

it("reports rate limits at the failing step and stops subsequent API calls", async () => {
  const result = await run({}, async url => url.endsWith("/getMe")
    ? Response.json({ ok: true, result: { username: "ForenaBot" } })
    : Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 37 } }, { status: 429 }));
  expect(result.output).toContain("setMyCommands: HTTP 429, Telegram 429");
  expect(result.output).toContain("Försök igen om 37 sekunder");
  expect(result.fetch).toHaveBeenCalledTimes(2);
  expect(result.exitCode).toBe(1);
});

it.each([200, 502])("identifies non-JSON HTTP %i responses without printing their body", async status => {
  const result = await run({}, async () => new Response(config.TELEGRAM_BOT_TOKEN, { status }));
  expect(result.output).toContain(`getMe: HTTP ${status}. Telegram returnerade inte giltig JSON`);
  expect(result.output).not.toContain(config.TELEGRAM_BOT_TOKEN);
  expect(result.exitCode).toBe(1);
});

it("reports a network cause without printing fetch errors that contain secret URLs", async () => {
  const result = await run({}, async () => { throw new Error(`fetch https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getMe ${config.TELEGRAM_WEBHOOK_SECRET}`, { cause: { code: "ENOTFOUND" } }); });
  expect(result.output).toContain("getMe: Kunde inte ansluta till Telegram (ENOTFOUND)");
  expect(result.output).not.toContain(config.TELEGRAM_BOT_TOKEN);
  expect(result.output).not.toContain(config.TELEGRAM_WEBHOOK_SECRET);
  expect(result.exitCode).toBe(1);
});

it("reports a timeout without printing the original exception", async () => {
  const result = await run({}, async () => { throw { name: "TimeoutError", message: config.TELEGRAM_BOT_TOKEN }; });
  expect(result.output).toContain("getMe: Telegram svarade inte inom 10 sekunder");
  expect(result.output).not.toContain(config.TELEGRAM_BOT_TOKEN);
  expect(result.exitCode).toBe(1);
});
