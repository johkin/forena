import { vi } from "vitest";
import { createActivityInvitationTools } from "../activity-invitation-tools";
import type { AssistantDependencies } from "../team-assistant-types";
const source = "00000000-0000-4000-8000-000000000001", target = "00000000-0000-4000-8000-000000000002";
export function invitationFixture(allowed = true) {
  const tables: Record<string, Record<string, unknown>[]> = {
    memberships: ["Tilda", "Pending", "Declined"].map(person_id => ({ id: person_id, person_id, role: "participant", team_id: source, organization_id: "org", starts_on: "2026-01-01", ends_on: null })),
    activity_types: [{ id: "training", organization_id: "org", system_category: "session" }, { id: "match", organization_id: "org", system_category: "competition" }],
    activities: ["a", "b", "past", "cancelled", "match", "other"].map(id => ({ id, title: id === "a" ? "Träning Örvallen" : id, organization_id: "org", team_id: id === "other" ? source : target, activity_type_id: id === "match" ? "match" : "training", status: id === "cancelled" ? "cancelled" : "published", starts_at: id === "past" ? "2026-09-01T15:00:00Z" : "2026-10-08T15:00:00Z", ends_at: id === "past" ? "2026-09-01T16:00:00Z" : "2026-10-08T16:00:00Z" })),
    invitations: [
      { id: "1", activity_id: "a", person_id: "Tilda", response: "accepted" },
      { id: "2", activity_id: "b", person_id: "Tilda", response: "accepted" },
      { id: "3", activity_id: "a", person_id: "Pending", response: "pending" },
      { id: "4", activity_id: "a", person_id: "Declined", response: "declined" },
      ...["past", "cancelled", "match", "other"].map(id => ({ id, activity_id: id, person_id: "Tilda", response: "accepted" })),
      { id: "outsider", activity_id: "a", person_id: "OtherPlayer", response: "accepted" },
    ].map(i => ({ ...i, organization_id: "org", activity_role: "participant" })),
  };
  // Dual membership must not exclude someone who is from the source team.
  tables.memberships.push({ ...tables.memberships[0], id: "dual", team_id: target });
  const rpc = vi.fn(async (name: string) => { if (name !== "activity_history_teams") throw new Error("Unexpected history query"); return { data: [{ id: source, name: "F2016", canReadWork: true }, { id: target, name: "F2013", canReadWork: allowed }], error: null }; });
  const queries: { table: string; ranges: [number, number][] }[] = [];
  const from = vi.fn((table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    const query = { table, ranges: [] as [number, number][] }; queries.push(query);
    const builder = {
      select: () => builder, order: () => builder,
      eq: (key: string, value: unknown) => { filters.push(r => r[key] === value); return builder; },
      in: (key: string, values: unknown[]) => { filters.push(r => values.includes(r[key])); return builder; },
      lte: (key: string, value: string) => { filters.push(r => String(r[key]) <= value); return builder; },
      gte: (key: string, value: string) => { filters.push(r => String(r[key]) >= value); return builder; },
      or: (value: string) => { const day = value.split("gte.")[1]; filters.push(r => r.ends_on === null || String(r.ends_on) >= day); return builder; },
      range: async (start: number, end: number) => { query.ranges.push([start, end]); return { data: tables[table].filter(r => filters.every(f => f(r))).slice(start, end + 1), error: null }; },
    };
    return builder;
  });
  const supabase = { rpc, from } as unknown as AssistantDependencies["supabase"];
  const onResult = vi.fn();
  const tools = createActivityInvitationTools(supabase, "org", source, { today: "2026-10-07", now: "2026-10-07T10:00:00Z", timeZone: "Europe/Stockholm", onResult });
  return { tools, rpc, from, tables, queries, onResult, supabase };
}
