import type { CapabilityContext, CapabilitySignal } from "./capability-types.ts";
import { disciplineRuntimes } from "./disciplines/registry.ts";

export type SignalEvaluationContext = {
  activityId: string;
  revision: number;
  contexts: CapabilityContext[];
};

export function evaluateActivitySignals(input: SignalEvaluationContext) {
  const signals = input.contexts.flatMap(context => {
    const runtime = disciplineRuntimes.find(item => item.definition.key === context.disciplineKey
      && item.definition.version === context.disciplineVersion);
    const registered = runtime?.definition.capabilities.some(item => item.id === context.definition.id
      && item.version === context.definition.version);
    const capability = runtime?.capabilities.find(item => item.id === context.definition.id
      && item.version === context.definition.version);
    // Unsupported code is a failed evaluation, not proof that a problem is solved.
    if (!registered || !capability) throw new Error("Unsupported signal capability");
    const signal: CapabilitySignal | null = capability.evaluateSignal(context);
    return signal ? [{ ...signal, disciplineKey: context.disciplineKey,
      disciplineVersion: context.disciplineVersion }] : [];
  });
  return { activityId: input.activityId, revision: input.revision, keepEvaluating: input.contexts.length > 0, signals };
}

type Result = { data: unknown; error: unknown };
export interface SignalClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<Result> }

/** Bounded claims with durable cooldowns; write failures leave work retryable. */
export async function processCapabilitySignals(client: SignalClient) {
  let processed = 0;
  for (let page = 0; page < 5; page++) {
    const claimed = await client.rpc("claim_signal_contexts", { batch_size: 100 });
    if (claimed.error) throw new Error("Could not claim signal evaluation");
    const contexts = claimed.data as SignalEvaluationContext[];
    if (!contexts?.length) break;
    const evaluations = contexts.map(evaluateActivitySignals);
    const saved = await client.rpc("apply_signal_evaluations", { evaluations });
    if (saved.error) throw new Error("Could not persist signals");
    processed += typeof saved.data === "number" ? saved.data : 0;
  }
  return { processed };
}
