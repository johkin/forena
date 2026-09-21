type SupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

export function getSupabaseEnvironment(): SupabaseEnvironment {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase saknar konfiguration. Kopiera .env.example till .env.local och använd värdena från `npm run db:status`.",
    );
  }

  return { url, publishableKey };
}
