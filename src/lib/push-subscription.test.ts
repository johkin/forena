import { describe, expect, it } from "vitest";
import { parsePushEndpoint, parsePushSubscription } from "./push-subscription";

describe("push subscription validation", () => {
  const valid = {
    endpoint: "https://push.example.test/subscription/123",
    keys: { p256dh: "abc_DEF-123", auth: "auth_123" },
  };

  it("accepts a valid browser subscription", () => {
    expect(parsePushSubscription(valid)).toEqual(valid);
  });

  it("rejects insecure endpoints and malformed keys", () => {
    expect(parsePushSubscription({ ...valid, endpoint: "http://push.example.test/123" })).toBeNull();
    expect(parsePushSubscription({ ...valid, keys: { ...valid.keys, auth: "not base64!" } })).toBeNull();
  });

  it("only accepts an HTTPS endpoint when disabling", () => {
    expect(parsePushEndpoint({ endpoint: valid.endpoint })).toBe(valid.endpoint);
    expect(parsePushEndpoint({ endpoint: "javascript:alert(1)" })).toBeNull();
  });
});
