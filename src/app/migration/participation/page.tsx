import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ActivityInvitationResponse } from "@/components/activity-invitation-response";
import { createClient } from "@/lib/supabase/server";
import { kotlinParticipationSelected, kotlinTestActivity } from "@/lib/kotlin-participation";

export const dynamic = "force-dynamic";

/** Opt-in test entry. Activity ID comes from the new seed, never the legacy database. */
export default async function ParticipationPage() {
  if (!kotlinParticipationSelected()) notFound();
  let activityId: string;
  try { activityId = kotlinTestActivity(); } catch { notFound(); }
  const { data } = await (await createClient()).auth.getUser();
  const destination = "/login?mode=password&next=%2Fmigration%2Fparticipation";
  if (!data.user) redirect(destination);
  return <AppShell accountEmail={data.user.email} homeHref="/migration/participation" accountMenu="session" logoutDestination={destination}>
    <main className="content">
      <p className="eyebrow">Familjen</p>
      <h1>Familjens kallelser</h1>
      <p>Svara för var och en och lägg till en kommentar om det behövs.</p>
      <ActivityInvitationResponse activityId={activityId} cancelled={false} />
    </main>
  </AppShell>;
}
