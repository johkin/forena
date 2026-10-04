"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveConfirmedMemory, type MemoryConfirmationResult } from "@/lib/ai/assistant-memory-confirmation";

/** A separate authenticated POST initiated by the user's Save memory button. */
export async function confirmAssistantMemory(draft: unknown): Promise<MemoryConfirmationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { saved: false, error: "Logga in igen innan du sparar minnet." };
  try {
    const result = await saveConfirmedMemory(draft, { supabase, userId: data.user.id });
    if (result.saved) revalidatePath("/o/[organizationSlug]/memories", "page");
    return result;
  } catch {
    return { saved: false, error: "Minnet kunde inte sparas. Försök igen." };
  }
}
