import { createHmac, timingSafeEqual } from "node:crypto";

// A bearer proof issued only after Telegram's webhook secret was verified.
// It only routes a confirmation challenge; it never authorizes a connection.
// The final Telegram callback consumes a separate database-backed single-use proof.
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`telegram-enrollment:v1:${payload}`).digest("hex");
}
export function createTelegramEnrollment(sender: string, updateId: string, secret: string, now = Date.now()) {
  const payload = `${sender}.${Math.floor(now / 1000)}.${updateId}`;
  return `${payload}.${signature(payload, secret)}`;
}
export function verifyTelegramEnrollment(proof: unknown, secret: string, now = Date.now()) {
  if (typeof proof !== "string" || secret.length < 32) return null;
  const match = /^([1-9]\d{0,15})\.(\d{10})\.(\d{1,16})\.([a-f0-9]{64})$/.exec(proof);
  if (!match) return null;
  const [, sender, timestamp, updateId, supplied] = match;
  const age = Math.floor(now / 1000) - Number(timestamp);
  if (age < 0 || age >= 600) return null;
  const expected = signature(`${sender}.${timestamp}.${updateId}`, secret);
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) ? sender : null;
}
