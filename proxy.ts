import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // MCP and the signed Meta webhook authenticate independently of cookies.
  if (request.nextUrl.pathname === "/api/telegram/webhook" || request.nextUrl.pathname === "/api/mcp" || request.nextUrl.pathname === "/.well-known/oauth-protected-resource" || request.nextUrl.pathname === "/.well-known/oauth-protected-resource/api/mcp") return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|app-version\\.json|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
