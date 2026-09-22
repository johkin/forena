"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const requestedNext = String(formData.get("next") ?? "");
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/passkey/setup";

  if (!email || !email.includes("@")) {
    redirect("/login?error=Ange+en+giltig+e-postadress");
  }

  const requestHeaders = await headers();
  const origin = getSiteUrl(requestHeaders.get("origin") ?? undefined);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] magic link request failed", { message: error.message });
    redirect("/login?error=Inloggningslänken+kunde+inte+skickas");
  }

  redirect("/login?sent=1");
}
