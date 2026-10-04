import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // MCP uses explicit bearer authentication; do not refresh browser cookies.
  if (request.nextUrl.pathname === "/api/mcp" || request.nextUrl.pathname === "/.well-known/oauth-protected-resource" || request.nextUrl.pathname === "/.well-known/oauth-protected-resource/api/mcp") return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
