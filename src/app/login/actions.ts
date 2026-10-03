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

function getSafeNext(formData: FormData) {
  const requestedNext = String(formData.get("next") ?? "");
  return requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/setup";
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getSafeNext(formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[auth] password sign-in failed", { message: error.message });
    redirect(`/login?mode=password&next=${encodeURIComponent(next)}&error=${encodeURIComponent("Fel e-postadress eller lösenord")}`);
  }

  const { error: claimError } = await supabase.rpc("claim_person_account");
  if (claimError) console.error("[auth] player account claim failed", { message: claimError.message });
  redirect(next);
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getSafeNext(formData);
  if (!email.includes("@") || password.length < 8) {
    redirect(`/login?mode=create&next=${encodeURIComponent(next)}&error=${encodeURIComponent("Ange en giltig e-postadress och minst åtta tecken i lösenordet")}`);
  }

  const requestHeaders = await headers();
  const origin = getSiteUrl(requestHeaders.get("origin") ?? undefined);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error) {
    console.error("[auth] password sign-up failed", { message: error.message });
    redirect(`/login?mode=create&next=${encodeURIComponent(next)}&error=${encodeURIComponent("Kontot kunde inte skapas")}`);
  }

  if (data.session) {
    const { error: claimError } = await supabase.rpc("claim_person_account");
    if (claimError) console.error("[auth] player account claim failed", { message: claimError.message });
    redirect(next);
  }

  redirect(`/login?mode=create&sent=signup&next=${encodeURIComponent(next)}`);
}
