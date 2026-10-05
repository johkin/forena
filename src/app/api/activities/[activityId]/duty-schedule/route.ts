import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dutyCommandSchema } from "@/lib/activity-duty-schedule";
type Props = { params: Promise<{ activityId: string }> };
async function context(activityId: string) {
 const supabase = await createClient();
 const { data, error } = await supabase.auth.getUser();
 if (error || !data.user) return { error: NextResponse.json({ error: "Du måste logga in" }, { status: 401 }) };
 return { supabase, activityId };
}
function failure(code: string) {
 return NextResponse.json({ error: code === "42501" ? "Du saknar behörighet" : code === "40001" ? "Platsen eller förslaget har ändrats. Uppdatera schemat och försök igen." : "Ändringen kunde inte genomföras. Kontrollera tider, tilldelning och om självservice fortfarande är öppen." }, { status: code === "42501" ? 403 : code === "P0002" ? 404 : ["23514", "40001", "23505"].includes(code) ? 409 : 500 });
}
export async function GET(request: Request, { params }: Props) {
 const ctx = await context((await params).activityId);
 if (!ctx.supabase) return ctx.error;
 const from = new URL(request.url).searchParams.get("fairnessFrom");
 if (from !== null) {
   if (!z.iso.date().safeParse(from).success) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
   const { data, error } = await ctx.supabase.rpc("activity_duty_fairness", { target_activity_id: ctx.activityId, from_date: from });
   if (error) return failure(error.code);
   return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
 }
 const { data, error } = await ctx.supabase.rpc("get_activity_duty_schedule", { target_activity_id: ctx.activityId });
 if (error) return failure(error.code);
 return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, { params }: Props) {
 const ctx = await context((await params).activityId);
 if (!ctx.supabase) return ctx.error;
 const parsed = dutyCommandSchema.safeParse(await request.json().catch(() => null));
 if (!parsed.success) return NextResponse.json({ error: "Ogiltigt förslag. Kontrollera tider och platser." }, { status: 400 });
 const { data, error } = await ctx.supabase.rpc("command_activity_duty", { target_activity_id: ctx.activityId, command: parsed.data });
 if (error) { console.error("activity_duty.command_failed", { activityId: ctx.activityId, op: parsed.data.op, code: error.code }); return failure(error.code); }
 return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
