import { z } from "zod";

export function clubSlug(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const slug = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const name = z.string().trim().min(1).max(120);
const timeZone = z.string().refine(value => { try { new Intl.DateTimeFormat("sv-SE", { timeZone: value }); return true; } catch { return false; } });
export const clubSetupSchema = z.object({ organizationName: name, organizationSlug: slug, sectionName: name, sectionSlug: slug, disciplineId: z.guid(), timeZone,
  teamName: name.optional(), teamSlug: slug.optional(), season: z.string().max(40).optional(),
});
export function parseClubSetup(form: FormData) {
  const sectionName = String(form.get("sectionName") ?? "");
  const teamName = String(form.get("teamName") ?? "").trim();
  return clubSetupSchema.parse({ organizationName: form.get("organizationName"), organizationSlug: form.get("organizationSlug"), sectionName, sectionSlug: clubSlug(sectionName), disciplineId: form.get("disciplineId"), timeZone: form.get("timeZone"),
    ...(form.get("addTeam") === "on" ? { teamName, teamSlug: clubSlug(teamName), season: String(form.get("season") ?? "") } : {}),
  });
}
export const clubMetadataSchema = z.object({ name, assistantName: z.string().trim().min(1).max(60), timeZone });
export const clubSectionSchema = z.object({ name, slug, disciplineId: z.guid() });
export const clubStructureSchema = z.object({ organization: z.object({ id: z.guid(), slug, name, assistantName: z.string(), timeZone: z.string() }), sections: z.array(z.object({ id: z.guid(), slug, name, disciplineId: z.string().nullable(), teamCount: z.number().int().nonnegative() })) });
export type ClubStructure = z.infer<typeof clubStructureSchema>;
export type ClubSetupState = { error?: string };
export function clubMutationError(error: { code?: string; message?: string }) {
  if (error.code === "23505") return "Namnet eller adressnamnet är redan upptaget.";
  if (error.code === "42501") return "Du saknar behörighet för ändringen.";
  if (error.code === "55000") {
    if (error.message === "The last section cannot be deleted") return "Klubbens sista sektion kan inte tas bort.";
    if (error.message === "Discipline is in use") return "Disciplinen används eller har sparat underlag och kan inte tas bort.";
    return "Sektionen har lag eller sparat underlag. Den kan inte tas bort eller byta disciplin.";
  }
  if (error.code === "P0002") return "Klubben eller sektionen kunde inte hittas. Uppdatera sidan.";
  if (error.code === "23503") return "Disciplinen eller en koppling har ändrats. Uppdatera sidan och försök igen.";
  return "Ändringen kunde inte sparas. Kontrollera uppgifterna och försök igen.";
}
