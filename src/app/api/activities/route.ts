import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CreateActivityBody = {
  teamId?: string;
  activityTypeId?: string;
  title?: string;
  description?: string;
  gatheringAt?: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  personIds?: string[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateActivityBody | null;
  const title = body?.title?.trim();
  const location = body?.location?.trim() ?? "";
  const description = body?.description?.trim() ?? "";
  const gatheringAt = body?.gatheringAt ? new Date(body.gatheringAt) : null;
  const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body?.endsAt ? new Date(body.endsAt) : null;
  const personIds = [...new Set(body?.personIds ?? [])];

  if (!body?.teamId || !title || !startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || (gatheringAt && Number.isNaN(gatheringAt.getTime()))) {
    return NextResponse.json({ error: "Ogiltiga aktivitetsuppgifter" }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return NextResponse.json({ error: "Sluttiden måste vara efter starttiden" }, { status: 400 });
  }
  if (gatheringAt && gatheringAt > startsAt) {
    return NextResponse.json({ error: "Samlingstiden måste vara före eller samma som starttiden" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });

  const { data: team } = await supabase
    .from("teams")
    .select("id, organization_id")
    .eq("id", body.teamId)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: "Laget kunde inte hittas" }, { status: 404 });

  const typeQuery = supabase
    .from("activity_types")
    .select("id")
    .eq("organization_id", team.organization_id)
    .eq("active", true);
  const { data: activityType } = body.activityTypeId
    ? await typeQuery.eq("id", body.activityTypeId).maybeSingle()
    : await typeQuery.eq("slug", "ovrigt").maybeSingle();
  if (!activityType) return NextResponse.json({ error: "Aktivitetstypen kunde inte hittas" }, { status: 400 });

  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });

  let invitedPersonIds: string[] = [];
  if (personIds.length) {
    const { data: memberships } = await supabase
      .from("memberships")
      .select("person_id")
      .eq("team_id", team.id)
      .eq("role", "participant")
      .is("ends_on", null)
      .in("person_id", personIds);
    invitedPersonIds = (memberships ?? []).map((membership) => membership.person_id);
    if (invitedPersonIds.length !== personIds.length) {
      return NextResponse.json({ error: "En eller flera valda deltagare tillhör inte laget" }, { status: 400 });
    }
  }

  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .insert({
      organization_id: team.organization_id,
      team_id: team.id,
      activity_type_id: activityType.id,
      title,
      description_markdown: description,
      gathering_at: gatheringAt?.toISOString() ?? null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      location,
      created_by: authData.user.id,
    })
    .select("id, organization_id, team_id, title, gathering_at, starts_at, ends_at, location, series_id, status")
    .single();

  if (activityError || !activity) {
    return NextResponse.json({ error: "Aktiviteten kunde inte sparas" }, { status: 500 });
  }

  const invitationRows = invitedPersonIds.map((personId) => ({
    organization_id: team.organization_id,
    activity_id: activity.id,
    person_id: personId,
  }));
  const { data: invitations, error: invitationError } = invitationRows.length
    ? await supabase.from("invitations").insert(invitationRows).select("id, organization_id, activity_id, person_id, response, responded_at")
    : { data: [], error: null };

  if (invitationError) {
    await supabase.from("activities").delete().eq("id", activity.id);
    return NextResponse.json({ error: "Kallelserna kunde inte sparas" }, { status: 500 });
  }

  return NextResponse.json({ activity, invitations }, { status: 201 });
}
