import { NextResponse } from "next/server";
import { createClient } from "../supabase/server";

export type AuthenticatedRouteContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

/** Verify the session for each protected API call, even if Proxy is bypassed. */
export function withAuthenticatedRoute(handler: (request: Request, context: AuthenticatedRouteContext) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (error || typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "Du behöver logga in igen." }, { status: 401 });
    }
    return handler(request, { supabase, userId });
  };
}
