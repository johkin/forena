"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { queueConfirmedActivityReminder } from "@/lib/activity-reminders";

const confirmationSchema = z.object({ teamId: z.uuid(), activityId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

/** A chat reply, memory or model tool call cannot invoke this confirmation. */
export async function confirmAssistantReminder(value: unknown): Promise<{ queued: true; queuedRecipients: number } | { queued: false; error: string }> {
  const parsed = confirmationSchema.safeParse(value);
  if (!parsed.success) return { queued: false, error: "Påminnelseförslaget är ogiltigt. Be om ett nytt förslag." };
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return { queued: false, error: "Logga in igen innan du skickar påminnelsen." };
  try {
    const { teamId, activityId, fingerprint } = parsed.data;
    const result = await queueConfirmedActivityReminder(supabase, teamId, activityId, fingerprint);
    revalidatePath("/o/[organizationSlug]/t/[teamSlug]", "page");
    return { queued: true, ...result };
  } catch (error) {
    return { queued: false, error: error instanceof Error ? error.message : "Påminnelsen kunde inte köas." };
  }
}
