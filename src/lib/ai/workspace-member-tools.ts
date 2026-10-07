import { tool } from "ai";
import { z } from "zod";
import type { AssistantDependencies } from "./team-assistant-types";

type Team = { id: string; name: string };
type Scope = { organizationId: string; organizationName: string; sectionName?: string; teams: Team[]; today: string };
const roleNames = { participant: "spelare", leader: "ledare" };

// Small, ordered pages also work with a lowered PostgREST maximum row count.
async function allRows<T>(query: { range: (from: number, through: number) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }> }) {
  const rows: T[] = [];
  for (let offset = 0; offset < 20000;) {
    const { data, error, count } = await query.range(offset, offset + 199);
    if (error || !data || count === null) throw new Error("Incomplete read");
    rows.push(...data);
    offset += data.length;
    if (rows.length === count) return rows;
    if (!data.length || rows.length > count) throw new Error("Incomplete read");
  }
  throw new Error("Read limit exceeded");
}

export function createWorkspaceMemberTools({ supabase, userId }: AssistantDependencies, scope: Scope, onAnswer: (answer: string) => void, onFailure?: (error: string) => void) {
  const scopeName = scope.sectionName ? `${scope.sectionName} i ${scope.organizationName}` : scope.organizationName;
  async function allowedTeams(teamId?: string) {
    const member = await supabase.rpc("is_organization_member", { target_organization_id: scope.organizationId });
    if (member.error || member.data !== true) throw new Error("Membership denied");
    if (teamId && !scope.teams.some(t => t.id === teamId)) throw new Error("Outside workspace");
    const requested = teamId ? scope.teams.filter(t => t.id === teamId) : scope.teams;
    const checks = await Promise.all(requested.map(async team => {
      const result = await supabase.rpc("has_team_permission", { target_team_id: team.id, target_permission: "roster.manage" });
      if (result.error) throw new Error("Permission read failed");
      return result.data === true ? team : null;
    }));
    const teams = checks.filter((t): t is Team => t !== null);
    if (requested.length && !teams.length) throw new Error("No roster access");
    return { teams, complete: teams.length === requested.length, requestedCount: requested.length };
  }
  function coverage(teams: Team[], complete: boolean, requestedCount: number) {
    return { scope: scopeName, asOf: scope.today, teams: teams.map(t => t.name), complete, includedTeamCount: teams.length, requestedTeamCount: requestedCount };
  }
  function heading(teams: Team[], complete: boolean, requestedCount: number, teamId?: string) {
    const label = teamId ? teams[0]?.name : scopeName;
    return complete ? `${label} (laganknutna personer, ${scope.today})` : `${label}: endast ${teams.length} av ${requestedCount} lag med truppbehörighet (${scope.today}). Detta är inte en total för hela arbetsytan`;
  }
  function audit(toolName: string, count: number, complete: boolean) {
    console.info("workspace-assistant.members.read", { tool: toolName, userId, organizationId: scope.organizationId, teamCount: scope.teams.length, count, complete });
  }
  const failure = () => {
    const error = "Medlemsuppgifterna kunde inte läsas med din behörighet. Det betyder inte att medlemmar eller uppdrag saknas.";
    onFailure?.(error);
    return { error };
  };
  return {
    listWorkspaceResponsibilityTypes: tool({
      description: "Lista klubbens uppdragstyper med ID och namn, även egna typer såsom kassör. Använd rätt ID i readWorkspaceMembers; gissa inte roller från namn eller behörighetsprofiler.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          await allowedTeams();
          const types = await allRows(supabase.from("responsibility_types").select("id, name, slug", { count: "exact" }).eq("organization_id", scope.organizationId).order("id"));
          return { types };
        } catch { return failure(); }
      },
    }),
    readWorkspaceMembers: tool({
      description: "Läs aktiva lagmedlemmar och uppdrag i aktuell klubb eller sektion. Utelämna teamId för hela arbetsytan. summary räknar unika personer per medlemsroll utan namn; list visar namn, medlemsroller och uppdrag per lag. role=participant betyder spelare; leader betyder ledare. responsibilityTypeId filtrerar ett faktiskt uppdrag, exempelvis kassör, oberoende av medlemsrollen. Varje person räknas en gång per roll över lagen. complete=false betyder endast behöriga lag, aldrig en klubbtotal. Omfattningen är laganknutna personer, inte konto- eller målsmansroller.",
      inputSchema: z.object({ teamId: z.uuid().optional(), mode: z.enum(["summary", "list"]).default("summary"), role: z.enum(["participant", "leader"]).optional(), responsibilityTypeId: z.uuid().optional() }),
      execute: async ({ teamId, mode, role, responsibilityTypeId }) => {
        try {
          const { teams, complete, requestedCount } = await allowedTeams(teamId);
          const ids = teams.map(t => t.id);
          const [memberships, assignments, types] = ids.length ? await Promise.all([
            allRows(supabase.from("memberships").select("id, person_id, team_id, role", { count: "exact" }).eq("organization_id", scope.organizationId).in("team_id", ids).lte("starts_on", scope.today).or(`ends_on.is.null,ends_on.gte.${scope.today}`).order("id")),
            allRows(supabase.from("team_responsibilities").select("id, person_id, team_id, responsibility_type_id", { count: "exact" }).eq("organization_id", scope.organizationId).in("team_id", ids).lte("starts_on", scope.today).or(`ends_on.is.null,ends_on.gte.${scope.today}`).order("id")),
            allRows(supabase.from("responsibility_types").select("id, name, slug", { count: "exact" }).eq("organization_id", scope.organizationId).order("id")),
          ]) : [[], [], []];
          if (responsibilityTypeId && !types.some(t => t.id === responsibilityTypeId)) throw new Error("Unknown responsibility");
          const entries = new Map<string, { personId: string; teamId: string; roles: Set<"participant" | "leader">; responsibilities: Set<string> }>();
          function entry(personId: string, teamId: string) {
            const key = `${personId}/${teamId}`;
            if (!entries.has(key)) entries.set(key, { personId, teamId, roles: new Set(), responsibilities: new Set() });
            return entries.get(key)!;
          }
          for (const m of memberships) if (m.team_id) entry(m.person_id, m.team_id).roles.add(m.role);
          for (const a of assignments) {
            if (!types.some(t => t.id === a.responsibility_type_id)) throw new Error("Missing responsibility type");
            entry(a.person_id, a.team_id).responsibilities.add(a.responsibility_type_id);
          }
          const selected = [...entries.values()].filter(e => (!role || e.roles.has(role)) && (!responsibilityTypeId || e.responsibilities.has(responsibilityTypeId)));
          const summary = {
            uniquePeople: new Set(selected.map(e => e.personId)).size,
            players: new Set(selected.filter(e => e.roles.has("participant")).map(e => e.personId)).size,
            leaders: new Set(selected.filter(e => e.roles.has("leader")).map(e => e.personId)).size,
            responsibilities: types.filter(t => !responsibilityTypeId || t.id === responsibilityTypeId).map(t => ({ name: t.name, uniquePeople: new Set(selected.filter(e => e.responsibilities.has(t.id)).map(e => e.personId)).size })),
          };
          const title = heading(teams, complete, requestedCount, teamId);
          const filter = responsibilityTypeId ? ` Uppdrag: ${types.find(t => t.id === responsibilityTypeId)!.name}.` : role ? ` Medlemsroll: ${roleNames[role]}.` : "";
          let answer = responsibilityTypeId
            ? `${title}.${filter}\n${summary.uniquePeople} unika personer med detta uppdrag.`
            : `${title}.${filter}\n${summary.players} spelare och ${summary.leaders} ledare. ${summary.uniquePeople} unika personer i urvalet; samma person kan ha båda rollerna.`;
          // Summary never reads or sends names. Detail output is bounded independently of totals.
          const shown = mode === "list" ? selected.slice(0, 200) : [];
          const people = new Map<string, string>();
          const personIds = [...new Set(shown.map(e => e.personId))];
          for (let offset = 0; offset < personIds.length; offset += 100) {
            const rows = await allRows(supabase.from("people").select("id, display_name", { count: "exact" }).eq("organization_id", scope.organizationId).in("id", personIds.slice(offset, offset + 100)).order("id"));
            for (const p of rows) people.set(p.id, p.display_name);
          }
          if (people.size !== personIds.length) throw new Error("Incomplete person read");
          const members = shown.map(e => ({ name: people.get(e.personId)!, team: teams.find(t => t.id === e.teamId)!.name, roles: [...e.roles].map(r => roleNames[r]), responsibilities: [...e.responsibilities].map(id => types.find(t => t.id === id)!.name) })).sort((a, b) => a.team.localeCompare(b.team, "sv-SE") || a.name.localeCompare(b.name, "sv-SE"));
          const truncated = mode === "list" && selected.length > shown.length;
          if (mode === "list") answer += members.length ? `\n\n${members.map(m => `- ${m.name} – ${m.team}: ${[...m.roles, ...m.responsibilities].join(", ")}`).join("\n")}` : "\nInga aktiva personer matchar urvalet inom de lästa lagen.";
          if (truncated) answer += `\nListan visar de första ${shown.length} av ${selected.length} person/lag-poster. Begränsa till ett lag eller en roll för fler detaljer.`;
          audit("readWorkspaceMembers", summary.uniquePeople, complete);
          onAnswer(answer);
          return { ...coverage(teams, complete, requestedCount), summary, members, truncated, matchingPersonTeamCount: selected.length };
        } catch { return failure(); }
      },
    }),
  };
}
