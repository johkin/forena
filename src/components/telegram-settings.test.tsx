import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TelegramState } from "./telegram-settings";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.values)) hooks.values[slot] = initial;
    return [hooks.values[slot], (next: unknown) => {
      hooks.values[slot] = typeof next === "function" ? next(hooks.values[slot]) : next;
    }];
  },
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
import { TelegramSettings } from "./telegram-settings";
function render() {
  hooks.cursor = 0; hooks.effects = [];
  return TelegramSettings();
}
beforeEach(() => {
  vi.useFakeTimers();
  hooks.values = [{ active: false, available: true, pairingUrl: "https://t.me/ForenaBot?start=old", pairingExpiresAt: Date.now() + 600000 }, false, ""];
  vi.stubGlobal("window", { setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("expires the waiting link and allows a new start without the old proof or a reload", async () => {
  const transport = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "POST"
    ? { active: false, available: true, pairingUrl: "https://t.me/ForenaBot?start=new" }
    : { active: false, available: true }));
  vi.stubGlobal("fetch", transport);
  render();
  const cleanup = hooks.effects[1]();
  await vi.advanceTimersByTimeAsync(600000);
  expect((hooks.values[0] as TelegramState).pairingUrl).toBeUndefined();
  expect(hooks.values[2]).toContain("Kopplingslänken har gått ut");
  const view = render();
  view.props.onStart();
  await vi.advanceTimersByTimeAsync(0);
  expect(transport.mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify({ operation: "start", consent: true }));
  expect((hooks.values[0] as TelegramState).pairingUrl).toContain("start=new");
  expect(hooks.values[2]).toBe("");
  cleanup?.();
});
