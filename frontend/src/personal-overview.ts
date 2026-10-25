import type { components } from "../../backend/contract/generated";
import type { Activity } from "../../src/domain/club";
import type { OverviewItem } from "../../src/components/personal-overview-types";

export type Overview = components["schemas"]["PersonalOverview"];
export type PersonalActivity = components["schemas"]["PersonalActivity"];

export function calendarActivity(item: PersonalActivity): Activity {
  return { id:item.id, organizationId:item.organization.id, teamId:item.team.id, title:item.title,
    startsAt:item.starts_at, endsAt:item.ends_at, gatheringAt:item.gathering_at ?? undefined,
    responseDueAt:item.response_due_at ?? undefined, location:item.location, description:item.description,
    status:item.status === "cancelled" ? "cancelled" : "published" };
}
export function overviewItems(activities: PersonalActivity[]): OverviewItem[] {
  return activities.flatMap<OverviewItem>(item=>item.people.length ? item.people.map(person=>({ activity:calendarActivity(item),
    team:{name:item.team.name}, organization:{name:item.organization.name,timeZone:item.organization.time_zone},
    member:{id:person.id,displayName:person.name}, invitation:person.invitation ?? undefined })) : [{
      activity:calendarActivity(item), team:{name:item.team.name},
      organization:{name:item.organization.name,timeZone:item.organization.time_zone},
      member:{id:item.id,displayName:""}, activityOnly:true,
    }]);
}
/** A server-confirmed answer updates both sections from one source, preserving comments. */
export function confirmedAnswer(data: Overview, id:string, response:"accepted"|"declined"):Overview {
  return {...data,activities:data.activities.map(activity=>({...activity,people:activity.people.map(person=>
    person.invitation?.id===id ? {...person,invitation:{...person.invitation,response}} : person)}))};
}
