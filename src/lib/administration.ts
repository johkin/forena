import { z } from "zod";

export const administratorSchema = z.object({ subject: z.uuid(), email: z.string(), active: z.boolean(), startsOn: z.string().nullable(), endsOn: z.string().nullable() });
export const teamSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string().nullable(), season: z.string(), canManage: z.boolean(), canDelete: z.boolean(), canAssignAdministrators: z.boolean(), administrators: z.array(administratorSchema) });
export const sectionSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string().nullable(), disciplineKey: z.string(), canManage: z.boolean(), canChangeDiscipline: z.boolean(), canDelete: z.boolean(), administrators: z.array(administratorSchema), teams: z.array(teamSchema) });
export const clubSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string().nullable(), timeZone: z.string(), canManage: z.boolean(), administrators: z.array(administratorSchema), sections: z.array(sectionSchema) });
export const administrationOverviewSchema = z.object({ platformAdmin: z.boolean(), canBootstrap: z.boolean(), platformAdministrators: z.array(administratorSchema), clubs: z.array(clubSchema) });
export type AdministrationOverview = z.infer<typeof administrationOverviewSchema>;
