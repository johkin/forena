import { z } from "zod";
import { activityDateKey } from "@/lib/activity-range";
import type { AssistantDependencies } from "./team-assistant-types";
import type { ActivityHistoryResult } from "./activity-history-result";

export type HistoryMemberRole = "leader" | "participant";
export function historyMemberRole(question: string): HistoryMemberRole | undefined {
  if (/\bledare\b/i.test(question)) return "leader";
  if (/\bspelare\b/i.test(question)) return "participant";
}

// A membership must cover the activity date, including former team members.
export async function filterHistoryRole(supabase: AssistantDependencies["supabase"], organizationId: string, teamId: string, history: ActivityHistoryResult, role: HistoryMemberRole): Promise<ActivityHistoryResult | { error: string }> {
  if (history.category === "work") return { error: "Rollfiltrering stöds för registrerad närvaro på träningar och matcher." };
  if (history.truncated || !history.records) return { error: "Begränsa perioden för att verifiera registrerad närvaro för den efterfrågade rollen." };
  const present = history.records.filter(record => record.attendance === "present");
  const ids = [...new Set(present.map(record => record.personId))];
  const membershipSchema = z.array(z.object({ person_id: z.string(), starts_on: z.iso.date(), ends_on: z.iso.date().nullable() }));
  let memberships: z.infer<typeof membershipSchema> = [];
  if (ids.length) {
    const { data, count, error } = await supabase.from("memberships").select("person_id, starts_on, ends_on", { count: "exact" }).eq("organization_id", organizationId).eq("team_id", teamId).eq("role", role).in("person_id", ids);
    const parsed = membershipSchema.safeParse(data);
    if (error || !parsed.success || count !== parsed.data.length) return { error: "Medlemsrollerna kunde inte verifieras. Det betyder inte att registrerad närvaro saknas." };
    memberships = parsed.data;
  }
  const records = present.filter(record => {
    const day = activityDateKey(record.startsAt, history.timeZone);
    return memberships.some(m => m.person_id === record.personId && m.starts_on <= day && (!m.ends_on || m.ends_on >= day));
  });
  const participations = new Set(records.map(record => `${record.personId}:${record.activityId}`));
  return { ...history, memberRole: role, records, summary: { uniquePeople: new Set(records.map(r => r.personId)).size, participationCount: participations.size },
    activities: history.activities.map(activity => ({ ...activity, participationCount: new Set(records.filter(r => r.activityId === activity.id).map(r => r.personId)).size })) };
}

export function verifiedHistoryAnswer(history: ActivityHistoryResult, question: string): string {
  const { uniquePeople, participationCount } = history.summary;
  const role = history.memberRole === "leader" ? " ledare" : history.memberRole === "participant" ? " spelare" : " personer";
  const label = history.category === "work" ? "registrerat genomförande av arbetsuppgifter" : "registrerad närvaro";
  let answer = `${history.team}, ${history.from}–${history.through}: ${uniquePeople}${uniquePeople === 1 ? (history.memberRole ? role : " person") : ` unika${role}`} med ${label} och ${participationCount} ${participationCount === 1 ? "registrerat deltagartillfälle" : "registrerade deltagartillfällen"}.`;
  if (/\bvilka\b/i.test(question) && history.category !== "work") {
    const people = new Map(history.records?.filter(r => r.attendance === "present").map(r => [r.personId, r.name]));
    if (people.size) answer += ` ${history.truncated ? "I den visade delen av historiken: " : "Registrerad närvaro: "}${[...people.values()].sort((a, b) => a.localeCompare(b, "sv")).join(", ")}.`;
    if (!uniquePeople) answer += " Ingen registrerad närvaro hittades; det bevisar inte att ingen var där.";
    if (history.truncated || !history.records) answer += " Begränsa perioden för en fullständig namnlista.";
  }
  if (history.unreportedActivityCount) answer += ` ${history.unreportedActivityCount} aktiviteter saknar närvarorapport.`;
  return answer;
}
