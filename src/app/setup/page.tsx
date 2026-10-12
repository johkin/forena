import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createWorkspace } from "./actions";
import { AppShell } from "@/components/app-shell";
import { ClubOnboarding } from "@/components/club-onboarding";
export default async function SetupPage() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) redirect("/login?next=/setup");
  const { data: disciplines, error: catalogueError } = await supabase.from("disciplines").select("id,name").order("name");
  if (catalogueError) throw new Error("Disciplinerna kunde inte hämtas.");
  return <AppShell accountEmail={auth.user.email}><main className="application-page"><div className="application-card"><p className="eyebrow">Kom igång med Förena</p><h1>Skapa din klubb</h1><p>Börja med klubben och dess första sektion. Du kan lägga till fler sektioner och lag senare.</p><ClubOnboarding disciplines={disciplines ?? []} action={createWorkspace}/></div></main></AppShell>;
}
