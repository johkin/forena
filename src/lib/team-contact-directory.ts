import { z } from "zod";

export const teamContactsSchema = z.array(z.object({
  id: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  leaderTitle: z.string().nullable(),
  email: z.string().nullable(),
  guardians: z.array(z.object({ name: z.string(), phone: z.string().nullable(), email: z.string().nullable() })),
}));
export type TeamContact = z.infer<typeof teamContactsSchema>[number];
