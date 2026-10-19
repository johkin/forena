import { NextResponse } from "next/server";
import { kotlinParticipationOrigin } from "@/lib/kotlin-participation";

export const dynamic = "force-dynamic";

/** Read-only deployment check: Next -> bound API -> its JDBC health check. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const response = await fetch(`${kotlinParticipationOrigin()}/actuator/health`, {
      // Release readiness includes a cold JVM start; user commands keep their
      // separate ten-second deadline in the participation adapter.
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000),
    });
    const body: unknown = response.ok ? await response.json() : null;
    if (!body || typeof body !== "object" || !("status" in body) || body.status !== "UP") {
      throw new Error("Unhealthy backend");
    }
    return NextResponse.json({ status: "ok", version: process.env.NEXT_PUBLIC_APP_VERSION }, { headers });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
  }
}
