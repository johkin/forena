import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
import { TelegramSettings, TelegramSettingsView } from "./telegram-settings";
function render() {
  hooks.cursor = 0; hooks.effects = [];
  return TelegramSettings();
}
beforeEach(() => {
  vi.useFakeTimers();
  hooks.values = [{ active: false, available: true, pairingUrl: "https://t.me/ForenaBot?start=old", pairingExpiresAt: Date.now() + 600000 }, false, ""];
  vi.stubGlobal("window", { setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn(), location: { assign: vi.fn() } });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
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

it("explains consent at an enabled activation button without a checkbox or a manual status step", () => {
  const markup = renderToStaticMarkup(<TelegramSettingsView state={{ active: false, available: true }} pending={false} error="" onStart={vi.fn()} onDisable={vi.fn()} onRefresh={vi.fn()} />);
  expect(markup).toContain("Aktivera Telegram");
  expect(markup).toContain('aria-describedby="telegram-consent"');
  expect(markup).toContain("samtycker du");
  expect(markup).not.toContain('type="checkbox"');
  expect(markup).not.toContain("Uppdatera status");
});
it("opens Telegram automatically only after an explicit activation and a successful request", async () => {
  hooks.values = [{ active: false, available: true }, false, ""];
  const transport = vi.fn(async () => Response.json({ active: false, available: true, pairingUrl: "https://t.me/ForenaBot?start=new" }));
  vi.stubGlobal("fetch", transport);
  const view = render();
  expect(transport).not.toHaveBeenCalled();
  expect(window.location.assign).not.toHaveBeenCalled();
  view.props.onStart();
  await vi.advanceTimersByTimeAsync(0);
  expect(transport.mock.calls[0]).toBeDefined();
  expect(window.location.assign).toHaveBeenCalledWith("https://t.me/ForenaBot?start=new");
});
it("keeps a retryable state and never opens Telegram after a failed activation", async () => {
  hooks.values = [{ active: false, available: true }, false, ""];
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Försök igen senare." }, { status: 503 })));
  render().props.onStart();
  await vi.advanceTimersByTimeAsync(0);
  expect(window.location.assign).not.toHaveBeenCalled();
  expect(hooks.values[2]).toBe("Försök igen senare.");
  expect((hooks.values[0] as TelegramState).pairingUrl).toBeUndefined();
});
it("refreshes the saved connection when returning to the profile and cleans up listeners", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ active: true, available: true })));
  render();
  const cleanup = hooks.effects[1]();
  const listener = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "pageshow")?.[1] as () => Promise<void>;
  await listener();
  expect((hooks.values[0] as TelegramState).active).toBe(true);
  cleanup?.();
  expect(window.removeEventListener).toHaveBeenCalledWith("pageshow", listener);
  expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", listener);
});
