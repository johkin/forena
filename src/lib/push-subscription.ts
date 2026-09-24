export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export function parsePushSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length > 2048) return null;
  if (!candidate.keys || typeof candidate.keys.p256dh !== "string" || typeof candidate.keys.auth !== "string") return null;
  if (candidate.keys.p256dh.length > 512 || candidate.keys.auth.length > 512) return null;
  if (!base64UrlPattern.test(candidate.keys.p256dh) || !base64UrlPattern.test(candidate.keys.auth)) return null;

  try {
    const endpoint = new URL(candidate.endpoint);
    if (endpoint.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return {
    endpoint: candidate.endpoint,
    keys: { p256dh: candidate.keys.p256dh, auth: candidate.keys.auth },
  };
}

export function parsePushEndpoint(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const endpoint = (value as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2048) return null;
  try {
    return new URL(endpoint).protocol === "https:" ? endpoint : null;
  } catch {
    return null;
  }
}
