import { createHash, randomBytes } from "node:crypto";
import { sendMembershipVerificationEmail } from "@/lib/email/membership-verification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import type { Json } from "@/lib/supabase/database.types";

export function verificationHash(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Länken är ogiltig.");
  return createHash("sha256").update(token).digest("hex");
}

async function deliver(email: string, token: string, hash: string) {
  await sendMembershipVerificationEmail({
    to: email, verificationUrl: `${getSiteUrl()}/application-verify/${token}`,
    idempotencyKey: `membership-verification-${hash}`,
  });
}

export async function startMembershipApplication(payload: Json, email: string, userId?: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = verificationHash(token);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("start_membership_application", {
    payload, verification_token_hash: hash, submitting_user_id: userId ?? null,
  });
  if (error || !data?.[0]) throw new Error("Ansökan kunde inte sparas. Kontrollera uppgifterna eller vänta en minut och försök igen.");
  const application = data[0];
  if (!application.email_verified) {
    try { await deliver(email, token, hash); }
    catch {
      console.error("[membership-verification] delivery failed", { applicationId: application.application_id });
      return { ...application, delivery_failed: true };
    }
  }
  return { ...application, delivery_failed: false };
}

export async function resendMembershipVerification(applicationId: string, email: string) {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const token = randomBytes(32).toString("base64url");
  const hash = verificationHash(token);
  const { data, error } = await createAdminClient().rpc("prepare_membership_application_verification", {
    requested_application_id: applicationId, requested_email: email, verification_token_hash: hash,
  });
  if (error) throw new Error("Utskicket kunde inte förberedas.");
  if (data) await deliver(email, token, hash);
}

export async function verifyMembershipEmail(token: string) {
  const { data, error } = await createAdminClient().rpc("verify_membership_application_email", {
    verification_token_hash: verificationHash(token),
  });
  if (error || !data) throw new Error("Länken är ogiltig, har gått ut eller har ersatts. Begär en ny länk från ansökningssidan.");
  return data;
}

export async function getVerificationContext(token: string) {
  let hash;
  try { hash = verificationHash(token); } catch { return null; }
  const { data, error } = await createAdminClient().rpc("membership_application_verification_context", {
    verification_token_hash: hash,
  });
  if (error) throw new Error("Verifieringssidan kunde inte laddas.");
  return data?.[0] ?? null;
}
