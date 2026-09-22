export function getSiteUrl(requestOrigin?: string) {
  const configuredUrl = process.env.SITE_URL;
  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = configuredUrl
    ?? (vercelProductionHost ? `https://${vercelProductionHost}` : undefined)
    ?? requestOrigin
    ?? "http://localhost:3000";

  return siteUrl.replace(/\/$/, "");
}
