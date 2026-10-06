import { AppShell } from "@/components/app-shell";
import { ComponentGallery } from "@/components/component-gallery";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function ComponentsPage() {
  const user = isSupabaseConfigured() ? (await (await createClient()).auth.getUser()).data.user : null;
  return <AppShell accountEmail={user?.email} loginHref="/login?next=%2Fcomponents">
    <main className="content component-gallery">
      <h1>Komponenter</h1>
      <p>Gemensamma element i Förena. Prova knappar, fält och aktivitetsdialoger med exempeldata.</p>
      <ComponentGallery />
    </main>
  </AppShell>;
}
