import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActivityNotificationView } from "@/components/activity-notification-view";

export default async function Page({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(activityId)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/activities/${activityId}`)}`);
  const { data: a } = await supabase.from("activities").select("*").eq("id", activityId).maybeSingle();
  if (!a?.team_id) notFound();
  const [{ data: o }, { data: t }] = await Promise.all([
    supabase.from("organizations").select("id, slug, name, time_zone, assistant_name").eq("id", a.organization_id).single(),
    supabase.from("teams").select("id, slug, name, organization_id, section_id, season").eq("id", a.team_id).single(),
  ]);
  if (!o || !t) notFound();
  return <ActivityNotificationView organization={{ id:o.id, slug:o.slug, name:o.name, assistantName:o.assistant_name, timeZone:o.time_zone }} team={{ id:t.id, slug:t.slug, name:t.name, organizationId:t.organization_id, sectionId:t.section_id, season:t.season }} activity={{ id:a.id, organizationId:a.organization_id, teamId:t.id, activityTypeId:a.activity_type_id, title:a.title, description:a.description_markdown, startsAt:a.starts_at, endsAt:a.ends_at, gatheringAt:a.gathering_at ?? undefined, location:a.location, status:a.status, seriesId:a.series_id ?? undefined, responseDueAt:a.response_due_at ?? undefined }} accountEmail={auth.user.email} />;
}
