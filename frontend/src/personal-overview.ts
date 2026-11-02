import type { components } from "../../backend/contract/generated";
import type { Activity } from "../../src/domain/club";
import type { OverviewItem } from "../../src/components/personal-overview-types";

export type Overview = components["schemas"]["PersonalOverview"];
export type PersonalActivity = components["schemas"]["PersonalActivity"];

export function calendarActivity(item: PersonalActivity): Activity {
  return { id:item.id, organizationId:item.organization.id, teamId:item.team.id, title:item.title,
    startsAt:item.starts_at, endsAt:item.ends_at, gatheringAt:item.gathering_at ?? undefined,
    responseDueAt:item.response_due_at ?? undefined, location:item.location, description:item.description,
    status:item.status === "cancelled" ? "cancelled" : "published", maxParticipants:item.max_participants, acceptedParticipants:item.accepted_participants };
}
export function overviewItems(activities: PersonalActivity[]): OverviewItem[] {
  return activities.flatMap<OverviewItem>(item=>item.people.length ? item.people.map(person=>({ activity:calendarActivity(item), canManageActivity:item.can_manage_activities,
    team:{name:item.team.name}, organization:{name:item.organization.name,timeZone:item.organization.time_zone},
    member:{id:person.id,displayName:person.name}, attendance:person.attendance === "present" || person.attendance === "absent" ? person.attendance : "unknown", invitation:person.invitation ?? undefined })) : [{
      activity:calendarActivity(item), canManageActivity:item.can_manage_activities, team:{name:item.team.name},
      organization:{name:item.organization.name,timeZone:item.organization.time_zone},
      member:{id:item.id,displayName:""}, activityOnly:true,
    }]);
}
/** A server-confirmed answer updates both sections from one source, preserving comments. */
export function confirmedAnswer(data: Overview, id:string, response:"accepted"|"declined"):Overview {
  return {...data,activities:data.activities.map(activity=>{
    const previous = activity.people.find(person => person.invitation?.id === id)?.invitation;
    const delta = !previous || previous.consumes_capacity === false ? 0 : Number(response === "accepted") - Number(previous.response === "accepted");
    return {...activity, accepted_participants: (activity.accepted_participants ?? 0) + delta, people:activity.people.map(person=>
      person.invitation?.id===id ? {...person,invitation:{...person.invitation,response}} : person)};
  })};
}
