import { NextResponse } from "next/server";
import { kotlinParticipationEndpoint } from "@/lib/kotlin-participation";

export const dynamic = "force-dynamic";

// Do not log arbitrary exception text: network errors can embed credentials/URLs.
function failureReason(error: unknown): string {
  const codes = new Set([
    "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
    "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
    "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  ]);
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
    if (typeof value.code === "string" && codes.has(value.code)) return value.code;
    if (value.name === "TimeoutError") return "timeout";
    if (value.name === "AbortError") return "aborted";
    if (value.message === "unexpected redirect") return "redirect_rejected";
    if (value.message === "bad port") return "port_rejected";
    current = value.cause;
  }
  return "unknown";
}

/** Read-only deployment check: Next -> bound API -> its JDBC health check. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  let stage = "configuration";
  try {
    const url = kotlinParticipationEndpoint("/actuator/health");
    stage = "upstream";
    const response = await fetch(url, {
      // Release readiness includes a cold JVM start; user commands keep their
      // separate ten-second deadline in the participation adapter.
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000),
    });
    stage = "response";
    if (!response.ok) {
      console.error("migration_health_failed", { stage, status: response.status });
      return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("status" in body) || body.status !== "UP") {
      throw new Error("Unhealthy backend");
    }
    return NextResponse.json({ status: "ok", version: process.env.NEXT_PUBLIC_APP_VERSION }, { headers });
  } catch (error) {
    // Fixed labels only: never log the binding URL, query, token or exception.
    console.error("migration_health_failed", { stage, reason: failureReason(error) });
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
  }
}
