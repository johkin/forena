import { z } from "zod";

export const publicConfig = z.object({ activityId: z.uuid().optional(), version: z.uuid() }).strict();
export type PublicConfig = z.infer<typeof publicConfig>;

export async function loadConfig(): Promise<PublicConfig> {
  const response = await fetch("/config.json", { cache: "no-store", credentials: "same-origin", redirect: "error" });
  if (!response.ok) throw new Error("Configuration unavailable");
  return publicConfig.parse(await response.json());
}
