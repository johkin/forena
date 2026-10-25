import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const version = phase === PHASE_DEVELOPMENT_SERVER ? "" :
    (JSON.parse(readFileSync("public/app-version.json", "utf8")) as { version: string }).version;
  return {
    ...(process.env.FORENA_CONTAINER_BUILD === "true" ? { output: "standalone" as const } : {}),
    poweredByHeader: false,
    env: { NEXT_PUBLIC_APP_VERSION: version },
    async headers() {
      return [{
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }
        ],
      }, {
        source: "/app-version.json",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      }, {
        source: "/design/:path*",
        headers: [
          // Sketches may execute demo/CDN scripts, but never gain application-origin authority.
          { key: "Content-Security-Policy", value: "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      }];
    },
  };
}
