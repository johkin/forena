import { createClient } from "@/lib/supabase/server";
import { clubStructureSchema, type ClubStructure } from "@/lib/club-administration";
import { saveClub, saveSection, deleteSection } from "@/app/club-administration-actions";
import { ClubSlugField } from "./club-slug-field";
import { ClubStructureAdministration } from "./club-structure-administration";

export async function loadClubAdministration(target: string) {
  const supabase = await createClient();
  const [{ data, error }, catalogue] = await Promise.all([supabase.rpc("club_structure", { target }), supabase.from("disciplines").select("id,name").order("name")]);
  if (error || catalogue.error) throw new Error("Klubbens administration kunde inte hämtas.");
  return { structure: clubStructureSchema.parse(data), disciplines: catalogue.data ?? [] };
}
export function ClubAdministration({ structure, disciplines, system = false }: { structure: ClubStructure; disciplines: { id: string; name: string }[]; system?: boolean }) {
  return <ClubStructureAdministration structure={structure} disciplines={disciplines} system={system}
    slugField={<ClubSlugField defaultValue={structure.organization.slug} organizationId={structure.organization.id} />}
    saveClub={saveClub} saveSection={saveSection} deleteSection={deleteSection} />;
}
