import { tool } from "ai";
import { z } from "zod";
import { activityDateKey } from "@/lib/activity-range";
import type { AssistantDependencies } from "./team-assistant-types";
import type { ActivityHistoryResult } from "./activity-history-result";
import type { HistoryPeriod } from "./activity-history-period";

// PostgREST's row limit must not silently turn a partial read into an exact total.
async function allRows<T>(query: { range: (from: number, through: number) => PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error || !result.data) throw new Error("Kallelserna kunde inte hämtas. Det betyder inte att kallelser saknas.");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
  throw new Error("Underlaget är för stort för en säker summering. Ange en snävare period.");
}
const teamsSchema = z.array(z.object({ id: z.string(), name: z.string(), canReadWork: z.boolean() }));

export function createActivityInvitationTools(supabase: AssistantDependencies["supabase"], organizationId: string, currentTeamId: string, options: { today: string; now: string; timeZone: string; period?: HistoryPeriod; periodRequired?: boolean; question?: string; category?: "session" | "competition" | "work"; response?: "all" | "accepted" | "pending" | "declined"; onResult: (result: ActivityHistoryResult) => void }) {
  async function teams() {
    const result = await supabase.rpc("activity_history_teams", { target_organization_id: organizationId });
    const parsed = teamsSchema.safeParse(result.data);
    if (result.error || !parsed.success) throw new Error("Lagbehörigheterna kunde inte kontrolleras.");
    return parsed.data;
  }
  return {
    listInvitationTeams: tool({
      description: "Lista lag i aktuell klubb och om du får läsa deras kallelser. canReadInvitations motsvarar invitation.manage. Aktuellt lag är förval för spelarens lag. Namngivna lag får aldrig ersättas med ett annat lag.",
      inputSchema: z.object({}),
      execute: async () => {
        try { return { currentTeamId, teams: (await teams()).map(t => ({ id: t.id, name: t.name, canReadInvitations: t.canReadWork })) }; }
        catch (error) { return { error: (error as Error).message }; }
      },
    }),
    readActivityInvitations: tool({
      description: "Räkna spelare från sourceTeamId som har kallelser till aktiviteter hos targetTeamId. sourceTeamId kan utelämnas för aktuellt lag. Båda lagens kallelsebehörighet krävs. activityId kan ange en viss aktivitet från verifierad kontext; annars alla matchande aktiviteter. Ingen period i frågan betyder pågående och kommande publicerade aktiviteter, aldrig senaste 366 dagarna. En uttrycklig period tolkas på servern. pending, accepted och declined räknas alla som kallade; response väljer ett visst svar. Spelare med medlemskap i båda lagen ingår. Närvaro används aldrig. Unika spelare och kallelsetillfällen är olika antal. Ingen skrivning eller utskick sker.",
      inputSchema: z.object({ sourceTeamId: z.uuid().optional(), targetTeamId: z.uuid(), activityId: z.uuid().optional(), category: z.enum(["session", "competition", "work"]).default("session"), response: z.enum(["all", "accepted", "pending", "declined"]).default("all") }),
      execute: async ({ sourceTeamId = currentTeamId, targetTeamId, activityId, category: requestedCategory, response: requestedResponse }) => {
        try {
          const allowed = await teams();
          const text = options.question ?? "";
          const named = (prefix: string) => allowed.filter(t => new RegExp(`${prefix}\\s+(?:laget\\s+)?${t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text));
          const namedSource = named("från"), namedTarget = named("(?:med|hos|till)");
          if (namedSource.length === 1) sourceTeamId = namedSource[0].id;
          if (namedTarget.length === 1) targetTeamId = namedTarget[0].id;
          for (const requested of text.matchAll(/(?:från|med|hos|till)\s+(?:laget\s+)?(F\d{4})\b/giu)) {
            if (!allowed.some(t => t.name.toLocaleLowerCase("sv-SE") === requested[1].toLocaleLowerCase("sv-SE"))) return { error: "Det namngivna laget finns inte bland de lag vars kallelser jag kan läsa." };
          }
          const category = options.category ?? requestedCategory;
          const source = allowed.find(t => t.id === sourceTeamId);
          const target = allowed.find(t => t.id === targetTeamId);
          if (!source?.canReadWork || !target?.canReadWork) return { error: "Du saknar behörighet att läsa kallelser för ett av lagen. Jag kan därför inte räkna alla kallade spelare." };
          const period = options.period;
          const response = options.response ?? requestedResponse;
          if (options.periodRequired && !period) return { error: "Vilken period eller vilka datum vill du se kallelser för?" };
          if (period && (period.from > period.through || (Date.parse(period.through) - Date.parse(period.from)) / 86400000 > 365)) return { error: "Välj en giltig period på högst 366 dagar." };
          const [memberships, types] = await Promise.all([
            allRows(supabase.from("memberships").select("id, person_id, starts_on, ends_on").eq("organization_id", organizationId).eq("team_id", sourceTeamId).eq("role", "participant").order("id")),
            allRows(supabase.from("activity_types").select("id").eq("organization_id", organizationId).eq("system_category", category).order("id")),
          ]);
          const byPerson = new Map<string, typeof memberships>();
          for (const membership of memberships) byPerson.set(membership.person_id, [...(byPerson.get(membership.person_id) ?? []), membership]);
          let activities: { id: string; title: string; starts_at: string; ends_at: string }[] = [];
          if (types.length && byPerson.size) {
            let query = supabase.from("activities").select("id, title, starts_at, ends_at").eq("organization_id", organizationId).eq("team_id", targetTeamId).eq("status", "published").in("activity_type_id", types.map(t => t.id)).order("id");
            if (activityId) query = query.eq("id", activityId);
            if (period) {
              query = query.gte("starts_at", new Date(Date.parse(`${period.from}T00:00:00Z`) - 14 * 3600000).toISOString()).lte("starts_at", new Date(Date.parse(`${period.through}T23:59:59Z`) + 14 * 3600000).toISOString());
            } else query = query.gte("ends_at", options.now);
            activities = (await allRows(query)).filter(a => !period || (activityDateKey(a.starts_at, options.timeZone) >= period.from && activityDateKey(a.starts_at, options.timeZone) <= period.through));
          }
          if (activityId && !activities.length) return { error: "Den valda aktiviteten kunde inte verifieras för laget och perioden." };
          const activityDays = new Map(activities.map(a => [a.id, activityDateKey(a.starts_at, options.timeZone)]));
          const people = new Set<string>();
          const perActivity = new Map<string, Set<string>>();
          for (let offset = 0; offset < activities.length; offset += 100) {
            let query = supabase.from("invitations").select("id, activity_id, person_id").eq("organization_id", organizationId).in("activity_id", activities.slice(offset, offset + 100).map(a => a.id)).eq("activity_role", "participant").order("id");
            if (response !== "all") query = query.eq("response", response);
            for (const invite of await allRows(query)) {
              const day = activityDays.get(invite.activity_id);
              if (!day || !byPerson.get(invite.person_id)?.some(m => m.starts_on <= day && (!m.ends_on || m.ends_on >= day))) continue;
              people.add(invite.person_id);
              const invited = perActivity.get(invite.activity_id) ?? new Set<string>();
              invited.add(invite.person_id); perActivity.set(invite.activity_id, invited);
            }
          }
          const matching = activities.filter(a => perActivity.has(a.id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const result: ActivityHistoryResult = {
            kind: "invitations", invitationResponse: response, sourceTeam: source.name, team: target.name, category, timeZone: options.timeZone,
            from: period?.from ?? options.today, through: period?.through ?? matching.reduce((day, a) => day > activityDateKey(a.starts_at, options.timeZone) ? day : activityDateKey(a.starts_at, options.timeZone), options.today),
            summary: { uniquePeople: people.size, participationCount: [...perActivity.values()].reduce((sum, ids) => sum + ids.size, 0) },
            activityCount: matching.length, unreportedActivityCount: null, truncated: false,
            activities: matching.map(a => ({ id: a.id, title: a.title, startsAt: a.starts_at, attendanceReported: false, participationCount: perActivity.get(a.id)!.size })),
          };
          options.onResult(result);
          return { ...result, response, periodMode: period ? "explicit" : "upcoming" };
        } catch (error) { return { error: (error as Error).message }; }
      },
    }),
  };
}
