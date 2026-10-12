import { afterEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const hooks = vi.hoisted(() => ({ available: false }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: () => [hooks.available, vi.fn()], useEffect: vi.fn() }));
import { AppUpdateNotice } from "./app-update-notice";

afterEach(() => { hooks.available = false; vi.unstubAllGlobals(); });
it("is hidden before a different build is detected", () => {
  expect(AppUpdateNotice()).toBeNull();
});
it("announces the update and reloads only after an explicit click", () => {
  hooks.available = true;
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  const notice = AppUpdateNotice()!;
  const [message, button] = notice.props.children as ReactElement<Record<string, unknown>>[];
  expect(message.props.role).toBe("status");
  expect(button.props.children).toBe("Ladda om");
  expect(reload).not.toHaveBeenCalled();
  (button.props.onClick as () => void)();
  expect(reload).toHaveBeenCalledOnce();
});
