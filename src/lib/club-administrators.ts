import { z } from "zod";
export const clubAdministratorsSchema = z.object({
  administrators: z.array(z.object({ userId: z.guid(), email: z.string().nullable(), role: z.enum(["owner", "admin"]) })),
  invitations: z.array(z.object({ id: z.guid(), email: z.string(), status: z.enum(["pending", "expired", "failed"]), expiresAt: z.string(), sent: z.boolean() })),
});
export function clubAdminInvitationPath(token: unknown) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? `/club-admin-invite/${token}` : null;
}
export function clubAdminError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return "Du saknar behörighet. Systemadministration och en verifierad e-postadress krävs.";
  if (error.message === "Already administrator") return "Adressen tillhör redan en administratör i klubben.";
  if (error.code === "P0002") return "Klubben, administratören eller inbjudan finns inte längre. Uppdatera sidan.";
  return "Ändringen kunde inte sparas. Kontrollera uppgifterna och försök igen.";
}
