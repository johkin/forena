import { NextResponse } from "next/server";
import { checkClubSlug } from "@/app/club-administration-actions";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const status = await checkClubSlug(query.get("slug") ?? "", query.get("organizationId") ?? undefined);
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
