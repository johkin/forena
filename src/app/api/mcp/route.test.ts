import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET, DELETE } from "./route";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TeamAssistantError } from "@/lib/ai/team-assistant-types";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), context: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/mcp/auth", () => ({ authenticateMcp: mocks.authenticate }));
vi.mock("@/lib/ai/team-assistant-context", () => ({ loadTeamAssistantContext: mocks.context }));
const teamId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";

function request(method: string, params?: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost:3000/api/mcp", { method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers,
  }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
}
async function call(name: string, args: Record<string, unknown>) {
  const response = await POST(request("tools/call", { name, arguments: args }));
  expect(response.status).toBe(200);
  return (await response.json()).result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReset();
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  mocks.authenticate.mockResolvedValue({ supabase: { rpc: mocks.rpc, from: mocks.from }, userId: "user" });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.context.mockResolvedValue({ activityIds: [activityId], canManageActivities: false, context: {
    team: "F2016", organization: "Klubb", clock: { organizationTimeZone: "Europe/Stockholm" }, memories: [{ content: "secret" }],
    activities: [{ id: activityId, title: "Träning", ownInvitations: [{ person_id: "child", response: "accepted", response_comment: "private" }],
      teamResponseSummary: { accepted: 3, declined: 1, pending: 2, comments: ["private"] } }],
  } });
});

describe("MCP HTTP protocol and authorization", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("advertises canonical resource metadata on an OAuth authentication challenge", async () => {
    vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "true");
    vi.stubEnv("FORENA_MCP_OAUTH_CLIENT_IDS", "client-1");
    vi.stubEnv("SITE_URL", "https://forena.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    mocks.authenticate.mockResolvedValue(null);
    const response = await POST(request("initialize"));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="forena", resource_metadata="https://forena.example/.well-known/oauth-protected-resource/api/mcp"');
  });
  it("requires authentication even for initialization", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const response = await POST(request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
  });
  it("rejects foreign origins before authentication", async () => {
    expect((await POST(request("tools/list", {}, { Origin: "https://evil.example" }))).status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it("initializes statelessly and advertises all tools", async () => {
    const response = await POST(request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).result.serverInfo.name).toBe("forena");
    const list = await POST(request("tools/list"));
    expect((await list.json()).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "list_teams", "get_team_overview", "get_team_member_names", "get_accepted_participant_names", "prepare_activity_draft",
    ]);
  });
  it("supports the official MCP client across separate HTTP requests", async () => {
    const client = new Client({ name: "test-client", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/api/mcp"), {
      fetch: async (input, init) => {
        const req = new Request(input, init);
        return req.method === "POST" ? POST(req) : req.method === "DELETE" ? DELETE() : GET();
      },
    });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(5);
      const output = await client.callTool({ name: "get_team_overview", arguments: { teamId } });
      expect(output.structuredContent).toMatchObject({ team: "F2016" });
    } finally { await client.close(); }
  });
  it("omits comments and memories from overview", async () => {
    const result = await call("get_team_overview", { teamId });
    expect(result.structuredContent.activities[0].ownInvitations).toEqual([{ personId: "child", response: "accepted" }]);
    expect(JSON.stringify(result)).not.toMatch(/private|secret|memories|response_comment/);
  });
  it("rejects inaccessible teams with a generic tool error", async () => {
    mocks.context.mockRejectedValue(new TeamAssistantError("team-forbidden", "secret detail"));
    const result = await call("get_team_overview", { teamId });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret detail");
  });
  it.each(["get_team_member_names", "get_accepted_participant_names", "prepare_activity_draft"])("denies %s before querying member data", async name => {
    const result = await call(name, { teamId, activityId, title: "Träning", description: "Info", location: "Plan", startsOn: "2026-10-20", startTime: "18:00", durationMinutes: 90, gatheringMinutesBefore: 15 });
    expect(result.isError).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("rejects an activity from another team before querying invitations", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const result = await call("get_accepted_participant_names", { teamId, activityId: "33333333-3333-4333-8333-333333333333" });
    expect(result.isError).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("validates recurring drafts without persisting them", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const result = await call("prepare_activity_draft", { teamId, title: "Träning", description: "Info", location: "Plan", startsOn: "2026-10-20", startTime: "18:00", durationMinutes: 90, gatheringMinutesBefore: 15, recurrence: { weekdays: [4, 2, 2], endsOn: "2026-11-20" } });
    expect(result.structuredContent).toMatchObject({ saved: false, reviewRequired: true, timeZone: "Europe/Stockholm", draft: { recurrence: { weekdays: [2, 4] } } });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects invalid input through the SDK", async () => {
    const result = await call("get_team_overview", { teamId: "not-a-uuid" });
    expect(result.isError).toBe(true);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("enforces the request body limit", async () => {
    const response = await POST(request("tools/list", { oversized: "x".repeat(65536) }));
    expect(response.status).toBe(413);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("lists only explicitly authorized or family teams", async () => {
    const query = (data: unknown) => {
      const builder = { select: vi.fn(), order: vi.fn(), range: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
      for (const method of [builder.select, builder.order, builder.range, builder.eq, builder.in, builder.is]) method.mockReturnValue(builder);
      return builder;
    };
    const teams = ["leader-team", "family-team", "other-team"].map(id => ({ id, name: id, organization_id: "org" }));
    const membershipQuery = query([{ team_id: "family-team" }]);
    mocks.from.mockImplementation((table: string) => table === "teams" ? query(teams) : table === "people" ? query([{ id: "child" }]) : table === "memberships" ? membershipQuery : query([]));
    mocks.rpc.mockImplementation((_name: string, args: { target_team_id: string }) => Promise.resolve({ data: args.target_team_id === "leader-team", error: null }));
    const result = await call("list_teams", {});
    expect(result.structuredContent.teams.map((t: { id: string }) => t.id)).toEqual(["leader-team", "family-team"]);
    expect(membershipQuery.in).toHaveBeenCalledWith("person_id", ["child"]);
    expect(membershipQuery.eq).toHaveBeenCalledWith("role", "participant");
    expect(membershipQuery.is).toHaveBeenCalledWith("ends_on", null);
  });
  it("does not offer persistent SSE or sessions", () => {
    expect(GET().status).toBe(405);
    expect(DELETE().headers.get("allow")).toBe("POST");
  });
});
