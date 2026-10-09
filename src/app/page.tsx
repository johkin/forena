import { redirect } from "next/navigation";
import Link from "next/link";
import { getPersonalDashboard } from "@/data/personal-dashboard";
import { PersonalDashboard } from "@/components/personal-dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) return <AppShell><main className="content">
    <div className="welcome"><div><p className="eyebrow">Förena</p><h1>Min översikt</h1><p>Logga in för att samla familjens aktiviteter från alla föreningar.</p></div></div>
    <Link href="/o/ursvik-ik/t/f2016">Visa demolaget</Link>
  </main></AppShell>;
  const data = await getPersonalDashboard();
  if (!data) redirect("/login?next=%2F");
  return <PersonalDashboard data={data} />;
}
