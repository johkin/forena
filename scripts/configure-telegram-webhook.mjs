// Run manually against a test bot first. Only print sanitized diagnostics,
// never raw provider bodies, request URLs, fetch errors or credentials.
const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
const site = process.env.SITE_URL?.trim() ?? "";
const username = process.env.TELEGRAM_BOT_USERNAME?.trim() ?? "";

class SetupError extends Error {}

function redactSecrets(text) {
  for (const value of [token, secret].filter(Boolean)) {
    text = text.replaceAll(value, "[REDACTED]").replaceAll(encodeURIComponent(value), "[REDACTED]");
  }
  return text.replace(/\p{C}/gu, " ");
}

function providerDescription(value) {
  if (typeof value !== "string") return "";
  return redactSecrets(value).replace(/https?:\/\/[^\s<>"']+/gi, "[URL]").slice(0, 300);
}

async function api(method, body) {
  console.info(`Telegram: ${method}…`);
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new SetupError(`${method}: Telegram svarade inte inom 10 sekunder.`);
    }
    // A fetch exception can include the full URL containing the bot token.
    const code = error?.cause?.code;
    const knownCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN"];
    const detail = knownCodes.includes(code) ? ` (${code})` : "";
    throw new SetupError(`${method}: Kunde inte ansluta till Telegram${detail}. Kontrollera nätverk, DNS, proxy och certifikat.`);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new SetupError(`${method}: HTTP ${response.status}. Telegram returnerade inte giltig JSON.`); }
  if (!response.ok || result?.ok !== true) {
    const code = Number.isSafeInteger(result?.error_code) ? `, Telegram ${result.error_code}` : "";
    const description = providerDescription(result?.description);
    const retryAfter = result?.parameters?.retry_after;
    const retry = Number.isSafeInteger(retryAfter) && retryAfter > 0 ? ` Försök igen om ${retryAfter} sekunder.` : "";
    const hint = response.status === 401 ? " Kontrollera TELEGRAM_BOT_TOKEN från BotFather." : "";
    throw new SetupError(`${method}: HTTP ${response.status}${code}.${description ? ` ${description}` : ""}${hint}${retry}`);
  }
  return result.result;
}
try {
  const missing = Object.entries({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_BOT_USERNAME: username, TELEGRAM_WEBHOOK_SECRET: secret, SITE_URL: site })
    .filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new SetupError(`Saknade miljövariabler: ${missing.join(", ")}. Om de finns i en fil, kör node --env-file=.env scripts/configure-telegram-webhook.mjs (eller välj .env.local).`);
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new SetupError("TELEGRAM_BOT_TOKEN har fel format. Använd hela bot-token från BotFather.");
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new SetupError("TELEGRAM_WEBHOOK_SECRET måste vara 32–256 tecken och bara innehålla A–Z, a–z, 0–9, _ eller -.");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new SetupError("TELEGRAM_BOT_USERNAME måste vara botens användarnamn utan @, med 5–32 bokstäver, siffror eller understreck.");
  let origin;
  try { origin = new URL(site); }
  catch { throw new SetupError("SITE_URL är ingen giltig absolut URL. Ange exempelvis https://forena-johkin.vercel.app."); }
  if (origin.protocol !== "https:") throw new SetupError("SITE_URL måste använda https://.");
  if (origin.username || origin.password) throw new SetupError("SITE_URL får inte innehålla användarnamn eller lösenord.");
  if (origin.pathname !== "/") throw new SetupError("SITE_URL ska vara appens basadress utan sökväg. /api/telegram/webhook läggs till automatiskt; avslutande / på basadressen är valfritt.");
  const bot = await api("getMe", {});
  if (bot?.username?.toLowerCase() !== username.toLowerCase()) throw new SetupError("getMe: TELEGRAM_BOT_USERNAME stämmer inte med boten som TELEGRAM_BOT_TOKEN tillhör. Ingen webhook har ändrats.");
  await api("setMyCommands", { commands: [
    { command: "start", description: "Koppla kontot via Min profil i Förena" },
    { command: "help", description: "Visa hjälp" },
    { command: "ask", description: "Fråga privat: /ask klubb/lag din fråga" },
    { command: "stop", description: "Koppla bort privata Telegram-notiser" },
    { command: "forena", description: "Öppna Förena från en kopplad grupp" },
  ] });
  await api("setWebhook", { url: new URL("/api/telegram/webhook", origin).href, secret_token: secret,
    allowed_updates: ["message", "callback_query", "my_chat_member"], max_connections: 4 });
  console.info("Telegram-webhook och kommandon är konfigurerade.");
} catch (error) {
  const message = error instanceof SetupError ? redactSecrets(error.message) : "Ett oväntat fel inträffade. Kontrollera Node.js-versionen och försök igen.";
  console.error(`Telegram kunde inte konfigureras: ${message}`);
  process.exitCode = 1;
}
