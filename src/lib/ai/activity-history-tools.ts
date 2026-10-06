import { tool } from "ai";
import { z } from "zod";
import type { AssistantDependencies } from "./team-assistant-types";

export function createActivityHistoryTools(supabase: AssistantDependencies["supabase"], organizationId: string, currentTeamId: string) {
  return {
    listHistoryTeams: tool({
      description: "Lista lag i aktuell klubb vars historik du får läsa. Använd för att hitta ID för ett namngivet lag. Behörigheter till närvaro och arbetspass anges separat.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase.rpc("activity_history_teams", { target_organization_id: organizationId });
        return error ? { error: "Historikbehörigheterna kunde inte hämtas." } : { currentTeamId, teams: data };
      },
    }),
    readActivityHistory: tool({
      description: "Läs registrerad historik för träning (session), match (competition) eller arbetspass (work). Kräver vald period på högst 366 dagar. guestsOnly hittar deltagare som vid aktiviteten tillhörde andra lag, men inte mottagande lag. present bevisar närvaro; ja-svar eller bokning gör inte det. Högst 200 person/aktivitetsposter; truncated kräver snävare period. Saknad registrering är inte bevisad frånvaro eller att någon aldrig arbetat.",
      inputSchema: z.object({ teamId: z.uuid().optional(), from: z.iso.date(), through: z.iso.date(), category: z.enum(["session", "competition", "work"]), guestsOnly: z.boolean().default(false) }),
      execute: async ({ teamId = currentTeamId, from, through, category, guestsOnly }) => {
        // Resolve permissions on every call; model-supplied team IDs are never trusted.
        const { data: teams, error: teamsError } = await supabase.rpc("activity_history_teams", { target_organization_id: organizationId });
        const parsed = z.array(z.object({ id: z.string(), canReadAttendance: z.boolean(), canReadWork: z.boolean() })).safeParse(teams);
        if (teamsError || !parsed.success) return { error: "Historikbehörigheterna kunde inte kontrolleras." };
        const allowed = parsed.data.find(t => t.id === teamId);
        if (!allowed || !(category === "work" ? allowed.canReadWork : allowed.canReadAttendance)) return { error: "Du saknar behörighet till den historiken för laget." };
        const { data, error } = await supabase.rpc("read_activity_history", { target_team_id: teamId, from_date: from, through_date: through, category, guests_only: guestsOnly });
        if (error) return { error: error.code === "23514" ? "Välj en giltig period på högst 366 dagar." : "Historiken kunde inte hämtas. Det betyder inte att deltagande saknas." };
        return data;
      },
    }),
  };
}
