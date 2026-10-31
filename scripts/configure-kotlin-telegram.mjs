// Separate, explicit setup for the Kotlin deployment. Reuse the validated, redacting setup client.
// Never run this with the legacy production bot: Telegram supports one webhook per bot.
for (const name of ["BOT_TOKEN", "BOT_USERNAME", "WEBHOOK_SECRET"]) {
  process.env[`TELEGRAM_${name}`] = process.env[`FORENA_TELEGRAM_${name}`] ?? "";
}
process.env.SITE_URL = process.env.FORENA_WEB_ORIGIN ?? process.env.SITE_URL ?? "";
process.env.TELEGRAM_NEW_CONVERSATION = "true";
await import("./configure-telegram-webhook.mjs");
