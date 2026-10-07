import { filterHistoryRole, type HistoryMemberRole } from "./activity-history-facts";
import { tool } from "ai";
import { z } from "zod";
import type { AssistantDependencies } from "./team-assistant-types";
import { recentHistoryPeriod, type HistoryPeriod } from "./activity-history-period";
import { activityHistoryResultSchema, type ActivityHistoryResult } from "./activity-history-result";

export function createActivityHistoryTools(supabase: AssistantDependencies["supabase"], organizationId: string, currentTeamId: string, options?: { today: string; period?: HistoryPeriod; category?: "session" | "competition" | "work"; memberRole?: HistoryMemberRole; onResult: (result: ActivityHistoryResult) => void }) {
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
      description: "Läs registrerad historik för träning (session), match (competition) eller arbetspass (work). teamId kan utelämnas för aktuellt lag; servern använder då lagets ID. Period på högst 366 dagar: använd relativeDays=21 för de senaste tre veckorna, eller from och through. CONTEXT.historyPeriod är den serverberäknade perioden från aktuell fråga och gäller framför egna datum; utelämna då datum. En namngiven månad, till exempel september, räcker. Fråga inte efter exakta datum när användaren angett en relativ period. summary räknas över hela perioden före detaljbegränsningen; activities är hela aktivitetslistan. guestsOnly hittar deltagare som vid aktiviteten tillhörde andra lag, men inte mottagande lag. present bevisar närvaro; ja-svar eller bokning gör inte det. Högst 200 person/aktivitetsposter; truncated kräver snävare period. Saknad registrering är inte bevisad frånvaro eller att någon aldrig arbetat.",
      inputSchema: z.object({ teamId: z.uuid().optional(), from: z.iso.date().optional(), through: z.iso.date().optional(), relativeDays: z.number().int().min(1).max(366).optional(), category: z.enum(["session", "competition", "work"]), guestsOnly: z.boolean().default(false) }),
      execute: async ({ teamId = currentTeamId, from, through, relativeDays, category: requestedCategory, guestsOnly }) => {
        const category = options?.category ?? requestedCategory;
        if (!options?.period && ((from && !through) || (through && !from) || (relativeDays !== undefined && (from || through)))) return { error: "Ange antingen båda datumen eller relativeDays." };
        let period: HistoryPeriod | undefined;
        try {
          period = options?.period ?? (from && through ? { from, through } : relativeDays !== undefined && options ? recentHistoryPeriod(options.today, relativeDays) : undefined);
        } catch { return { error: "Välj en giltig period på högst 366 dagar." }; }
        if (!period) return { error: "Ange en period, exempelvis relativeDays=21 för de senaste tre veckorna." };
        const span = (Date.parse(period.through) - Date.parse(period.from)) / 86400000;
        if (!Number.isFinite(span) || span < 0 || span > 365) return { error: "Välj en giltig period på högst 366 dagar." };
        // Resolve permissions on every call; model-supplied team IDs are never trusted.
        const { data: teams, error: teamsError } = await supabase.rpc("activity_history_teams", { target_organization_id: organizationId });
        const parsed = z.array(z.object({ id: z.string(), canReadAttendance: z.boolean(), canReadWork: z.boolean() })).safeParse(teams);
        if (teamsError || !parsed.success) return { error: "Historikbehörigheterna kunde inte kontrolleras." };
        const allowed = parsed.data.find(t => t.id === teamId);
        if (!allowed || !(category === "work" ? allowed.canReadWork : allowed.canReadAttendance)) return { error: "Du saknar behörighet till den historiken för laget." };
        const { data, error } = await supabase.rpc("read_activity_history", { target_team_id: teamId, from_date: period.from, through_date: period.through, category, guests_only: guestsOnly });
        if (error) return { error: error.code === "23514" ? "Välj en giltig period på högst 366 dagar." : "Historiken kunde inte hämtas. Det betyder inte att deltagande saknas." };
        const result = activityHistoryResultSchema.safeParse(data);
        if (result.success) {
          const verified = options?.memberRole ? await filterHistoryRole(supabase, organizationId, teamId, result.data, options.memberRole) : result.data;
          if ("error" in verified) return verified;
          options?.onResult(verified);
          return verified;
        }
        return data;
      },
    }),
  };
}
