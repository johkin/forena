import { NextResponse } from "next/server";
import { getPersonalDashboard } from "@/data/personal-dashboard";
import { calendarMonthBounds } from "@/lib/personal-calendar";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  try { calendarMonthBounds(month); } catch { return NextResponse.json({ error: "Ogiltig kalendermånad." }, { status: 400 }); }
  try {
    const data = await getPersonalDashboard(month);
    if (!data) return NextResponse.json({ error: "Du måste logga in." }, { status: 401 });
    return NextResponse.json({ accountId: data.accountId, ...data.calendarScope, items: data.activities,
      activities: [...new Map(data.activities.map(item => [item.activity.id, item.activity])).values()] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Aktiviteterna kunde inte hämtas." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
