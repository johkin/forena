import { NextResponse } from "next/server";
import { kotlinParticipationEndpoint } from "@/lib/kotlin-participation";

export const dynamic = "force-dynamic";

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
  } catch {
    // Fixed labels only: never log the binding URL, query, token or exception.
    console.error("migration_health_failed", { stage });
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
  }
}
