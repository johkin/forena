import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateActivitySignals, type SignalEvaluationContext } from "../../../../../supabase/functions/_shared/capability-signals";

type Props = { params: Promise<{ signalId: string }> };
const command = z.object({ action: z.enum(["dismiss", "remind-unanswered"]), revision: z.number().int().positive() });
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function POST(request: Request, { params }: Props) {
  const { signalId } = await params;
  const input = command.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(signalId).success || !input.success) return json({ error: "Ogiltig åtgärd." }, 400);
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (!auth.data.user) return json({ error: "Logga in för att hantera uppgiften." }, 401);
  const rpcError = (code: string) => code === "40001"
    ? json({ error: "Läget har ändrats. Uppdatera översikten och försök igen." }, 409)
    : json({ error: "Åtgärden kunde inte utföras." }, code === "42501" ? 403 : 500);
  if (input.data.action === "dismiss") {
    const result = await supabase.rpc("dismiss_capability_signal", { target_signal_id: signalId, expected_revision: input.data.revision });
    return result.error ? rpcError(result.error.code) : json({ status: "dismissed" });
  }
  const loaded = await supabase.rpc("capability_signal_action_context", { target_signal_id: signalId });
  if (loaded.error) return rpcError(loaded.error.code);
  const context = loaded.data as unknown as SignalEvaluationContext & {
    signalRevision: number; disciplineKey: string; capabilityId: string; type: string;
  };
  try {
    const current = evaluateActivitySignals(context).signals.find(signal => signal.disciplineKey === context.disciplineKey
      && signal.capabilityId === context.capabilityId && signal.type === context.type);
    if (context.signalRevision !== input.data.revision || !current?.actions.some(action => action.id === input.data.action)) {
      return rpcError("40001");
    }
  } catch {
    return json({ error: "Uppgiften kunde inte kontrolleras. Försök igen senare." }, 503);
  }
  const result = await supabase.rpc("remind_capability_signal", { target_signal_id: signalId,
    expected_signal_revision: input.data.revision, expected_input_revision: context.revision });
  return result.error ? rpcError(result.error.code) : json({ queuedRecipients: result.data });
}
