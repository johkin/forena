/** Tokens are the base64url encoding of exactly 32 random bytes. */
export function systemAdminInvitationPath(token: unknown): string | null {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? `/system-admin-invite/${encodeURIComponent(token)}`
    : null;
}
