import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createWorkspace } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SetupPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();

  if (membership) {
    const [{ data: organization }, { data: team }] = await Promise.all([
      supabase
        .from("organizations")
        .select("slug")
        .eq("id", membership.organization_id)
        .single(),
      supabase
        .from("teams")
        .select("slug")
        .eq("organization_id", membership.organization_id)
        .order("created_at")
        .limit(1)
        .maybeSingle(),
    ]);

    if (organization && team) {
      redirect(`/o/${organization.slug}/t/${team.slug}`);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card setup-card">
        <span className="brand-mark">F</span>
        <p className="eyebrow">Första konfigurationen</p>
        <h1>Skapa förening och lag</h1>
        <p>
          Du blir ägare för föreningen. Uppgifterna kan ändras och byggas ut senare.
        </p>

        <form action={createWorkspace} className="auth-form">
          <label htmlFor="organizationName">Föreningens namn</label>
          <input
            id="organizationName"
            name="organizationName"
            defaultValue="Ursvik IK"
            maxLength={120}
            required
          />

          <label htmlFor="organizationSlug">Adressnamn</label>
          <input
            id="organizationSlug"
            name="organizationSlug"
            defaultValue="ursvik-ik"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />

          <label htmlFor="sectionName">Sektion</label>
          <input id="sectionName" name="sectionName" defaultValue="Fotboll" maxLength={120} required />

          <label htmlFor="teamName">Första laget</label>
          <input id="teamName" name="teamName" defaultValue="F2016" maxLength={120} required />

          <label htmlFor="season">Säsong</label>
          <input id="season" name="season" defaultValue="2026/2027" maxLength={40} required />

          {error ? <p className="auth-error">{error}</p> : null}
          <button className="primary" type="submit">Skapa arbetsyta</button>
        </form>
      </section>
    </main>
  );
}
