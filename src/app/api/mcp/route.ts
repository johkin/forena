import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/lib/mcp/auth";
import { createForenaMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const siteOrigin = new URL(process.env.SITE_URL || request.url).origin;
  if (origin && origin !== siteOrigin) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  try {
    const authentication = await authenticateMcp(request);
    if (!authentication) return Response.json({ error: "Authentication required" }, {
      status: 401, headers: { "WWW-Authenticate": 'Bearer realm="forena"', "Cache-Control": "no-store" },
    });
    // No shared state, transport or user identity between serverless invocations.
    const server = createForenaMcpServer(authentication);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 64 * 1024 });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      // Materialize JSON before closing the per-request transport.
      const body = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(body.byteLength ? body : null, { status: response.status, headers });
    } finally { await server.close(); }
  } catch {
    return Response.json({ error: "MCP request failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
