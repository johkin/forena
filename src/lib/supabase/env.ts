type SupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return Boolean(url && publishableKey && !publishableKey.startsWith("replace-"));
}

export function getSupabaseEnvironment(): SupabaseEnvironment {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!isSupabaseConfigured() || !url || !publishableKey) {
    throw new Error(
      "Supabase saknar konfiguration. Lägg in NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY i miljön.",
    );
  }

  return { url, publishableKey };
}
