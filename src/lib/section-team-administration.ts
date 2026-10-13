import { z } from "zod";
import { clubAddressSchema, clubStructureSchema } from "./club-administration";

export const sectionTeamInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: clubAddressSchema,
  season: z.string().trim().max(40),
});
export const sectionTeamStructureSchema = z.object({
  organization: clubStructureSchema.shape.organization,
  section: z.object({ id: z.guid(), slug: clubAddressSchema, name: z.string(), disciplineName: z.string().nullable() }),
  teams: z.array(sectionTeamInputSchema.extend({ id: z.guid(), canDelete: z.boolean() })),
});
export type SectionTeamStructure = z.infer<typeof sectionTeamStructureSchema>;
export function sectionTeamMutationError(error: { code?: string; message?: string }) {
  if (error.code === "23505") return "Lagets namn och säsong eller adressnamn används redan i klubben. Välj ett annat.";
  if (error.code === "42501") return "Du saknar behörighet att hantera lag i sektionen.";
  if (error.code === "55000" || error.code === "23503") return "Laget har medlemmar eller sparat underlag och kan inte tas bort.";
  if (error.code === "P0002") return "Sektionen eller laget kunde inte hittas. Uppdatera sidan.";
  return "Ändringen kunde inte sparas. Kontrollera lagets namn och säsong och försök igen.";
}
