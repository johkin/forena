import { z } from "zod";

export const publicConfig = z.object({
  supabaseUrl: z.literal("https://ckzrtxqjskosqzoitymc.supabase.co"),
  publishableKey: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
  activityId: z.uuid().optional(),
  version: z.uuid(),
}).strict();
export type PublicConfig = z.infer<typeof publicConfig>;

export async function loadConfig(): Promise<PublicConfig> {
  const response = await fetch("/config.json", { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error("Configuration unavailable");
  return publicConfig.parse(await response.json());
}
