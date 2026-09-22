import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl } from "./site-url";

describe("getSiteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses an explicitly configured canonical URL first", () => {
    vi.stubEnv("SITE_URL", "https://forena.example/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "forena-generated.vercel.app");

    expect(getSiteUrl("https://forena-johkin.vercel.app")).toBe("https://forena.example");
  });

  it("preserves the host used for the current request", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "forena-generated.vercel.app");

    expect(getSiteUrl("https://forena-johkin.vercel.app")).toBe("https://forena-johkin.vercel.app");
  });

  it("uses the Vercel production host when there is no request origin", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "forena-generated.vercel.app");

    expect(getSiteUrl()).toBe("https://forena-generated.vercel.app");
  });
});
