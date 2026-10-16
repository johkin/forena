// Run manually against a test bot first. Never print tokens or provider bodies.
const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
const site = process.env.SITE_URL?.trim() ?? "";
async function api(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error("telegram_configuration_failed");
  return result.result;
}
try {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error();
  const origin = new URL(site);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error();
  const bot = await api("getMe", {});
  if (bot.username?.toLowerCase() !== process.env.TELEGRAM_BOT_USERNAME?.toLowerCase()) throw new Error();
  await api("setMyCommands", { commands: [
    { command: "start", description: "Koppla kontot via Min profil i Förena" },
    { command: "help", description: "Visa hjälp" },
    { command: "stop", description: "Koppla bort privata Telegram-notiser" },
    { command: "forena", description: "Öppna Förena från en kopplad grupp" },
  ] });
  await api("setWebhook", { url: new URL("/api/telegram/webhook", origin).href, secret_token: secret,
    allowed_updates: ["message", "callback_query", "my_chat_member"], max_connections: 4 });
  console.info("Telegram-webhook och kommandon är konfigurerade.");
} catch {
  console.error("Telegram kunde inte konfigureras. Kontrollera servervariabler, botens användarnamn och HTTPS-adressen.");
  process.exitCode = 1;
}
