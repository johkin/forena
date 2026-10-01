import { jsonSchema, tool } from "ai";
import type { AssistantDependencies } from "./team-assistant-types";

export function createTeamAssistantTools(supabase: AssistantDependencies["supabase"], teamId: string, activityIds: string[]) {
  return {
    getTeamMemberNames: tool({
      description: "Hämta en översiktlig lista med enbart visningsnamnen på aktiva personer i laget. Använd endast när frågan gäller vilka som är med i laget.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {}, additionalProperties: false }),
      execute: async () => {
        const { data: memberships } = await supabase
          .from("memberships")
          .select("person_id")
          .eq("team_id", teamId)
          .in("role", ["participant", "leader"])
          .is("ends_on", null);
        const personIds = [...new Set((memberships ?? []).map((membership) => membership.person_id))];
        const { data: people } = personIds.length
          ? await supabase.from("people").select("display_name").in("id", personIds).order("display_name")
          : { data: [] };
        return { names: (people ?? []).map((person) => person.display_name) };
      },
    }),
    getAcceptedParticipantNames: tool({
      description: "Hämta visningsnamnen på dem som tackat ja till en viss kommande aktivitet i CONTEXT.",
      inputSchema: jsonSchema<{ activityId: string }>({
        type: "object",
        properties: { activityId: { type: "string", description: "Aktivitetens id från CONTEXT" } },
        required: ["activityId"],
        additionalProperties: false,
      }),
      execute: async ({ activityId }) => {
        if (!activityIds.includes(activityId)) return { error: "Aktiviteten finns inte i den tillgängliga listan." };
        const { data: invitations } = await supabase.from("invitations").select("person_id").eq("activity_id", activityId).eq("response", "accepted");
        const personIds = [...new Set((invitations ?? []).map((invitation) => invitation.person_id))];
        const { data: people } = personIds.length
          ? await supabase.from("people").select("display_name").in("id", personIds).order("display_name")
          : { data: [] };
        return { names: (people ?? []).map((person) => person.display_name) };
      },
    }),
  };
}
