"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName || displayName.length > 120) {
    redirect(`/profile?error=${encodeURIComponent("Ange ett giltigt namn")}`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=%2Fprofile");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("id", authData.user.id);
  if (profileError) redirect(`/profile?error=${encodeURIComponent("Profilen kunde inte sparas")}`);

  const { error: peopleError } = await supabase
    .from("people")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("user_id", authData.user.id);
  if (peopleError) redirect(`/profile?error=${encodeURIComponent("Profilen sparades, men namnet kunde inte uppdateras i föreningen")}`);

  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}
