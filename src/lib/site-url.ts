export function getSiteUrl(requestOrigin?: string) {
  const configuredUrl = process.env.SITE_URL?.trim() || undefined;
  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || undefined;
  const siteUrl = configuredUrl
    ?? requestOrigin
    ?? (vercelProductionHost ? `https://${vercelProductionHost}` : undefined)
    ?? "http://localhost:3000";

  return siteUrl.replace(/\/$/, "");
}
