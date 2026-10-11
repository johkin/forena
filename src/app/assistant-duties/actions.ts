"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { activityDutyBatchSchema } from "@/lib/ai/activity-duty-draft";

const confirmationSchema = z.object({ teamId: z.guid(), command: activityDutyBatchSchema, fingerprint: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
export async function confirmAssistantDuties(value: unknown): Promise<{ saved: true; created: number; skipped: number } | { saved: false; error: string }> {
  const parsed = confirmationSchema.safeParse(value);
  if (!parsed.success) return { saved: false, error: "Förslaget är ogiltigt. Be om ett nytt förslag." };
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return { saved: false, error: "Logga in igen innan du sparar uppgifterna." };
  const { teamId, command, fingerprint } = parsed.data;
  const { data, error } = await supabase.rpc("confirm_activity_duty_batch", { target_team_id: teamId, command, expected_fingerprint: fingerprint });
  if (error) return { saved: false, error: error.code === "42501" ? "Du saknar behörighet att hantera uppgifter i laget." : error.code === "40001" ? "Aktiviteterna eller uppgifterna har ändrats. Be om ett nytt förslag. Inget har sparats." : "Uppgifterna kunde inte sparas. Inget har sparats." };
  const result = z.object({ created: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }).safeParse(data);
  if (!result.success) return { saved: false, error: "Sparresultatet kunde inte verifieras. Kontrollera uppgifterna innan du försöker igen." };
  revalidatePath("/o/[organizationSlug]/t/[teamSlug]", "page");
  revalidatePath("/");
  return { saved: true, ...result.data };
}
