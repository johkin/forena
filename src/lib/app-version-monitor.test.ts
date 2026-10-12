import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { monitorAppVersion } from "./app-version-monitor";

let page: EventTarget & { visibilityState: string };
let browser: EventTarget;
let network: { onLine: boolean };
let fetchVersion: ReturnType<typeof vi.fn>;
let cleanup: (() => void) | undefined;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  browser = Object.assign(new EventTarget(), { setTimeout, clearTimeout, setInterval, clearInterval });
  network = { onLine: true };
  fetchVersion = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "old" }) });
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", browser);
  vi.stubGlobal("navigator", network);
  vi.stubGlobal("fetch", fetchVersion);
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

it("compares against the embedded version on the first check, without caching or credentials", async () => {
  fetchVersion.mockResolvedValue({ ok: true, json: async () => ({ version: "new" }) });
  const changed = vi.fn();
  cleanup = monitorAppVersion("old", changed);
  await flush();
  expect(changed).toHaveBeenCalledOnce();
  expect(fetchVersion).toHaveBeenCalledWith("/app-version.json", expect.objectContaining({ cache: "no-store", credentials: "omit" }));
  await vi.advanceTimersByTimeAsync(600_000);
  browser.dispatchEvent(new Event("online"));
  expect(fetchVersion).toHaveBeenCalledOnce();
});

it("checks again after five minutes and detects rollback IDs too", async () => {
  const changed = vi.fn();
  cleanup = monitorAppVersion("old", changed);
  await flush();
  expect(changed).not.toHaveBeenCalled();
  fetchVersion.mockResolvedValue({ ok: true, json: async () => ({ version: "earlier-build" }) });
  await vi.advanceTimersByTimeAsync(300_000);
  expect(changed).toHaveBeenCalledOnce();
});

it("skips hidden and offline pages, then checks on resume and reconnection", async () => {
  page.visibilityState = "hidden";
  cleanup = monitorAppVersion("old", vi.fn());
  await vi.advanceTimersByTimeAsync(300_000);
  expect(fetchVersion).not.toHaveBeenCalled();
  page.visibilityState = "visible";
  page.dispatchEvent(new Event("visibilitychange"));
  await flush();
  expect(fetchVersion).toHaveBeenCalledOnce();
  network.onLine = false;
  await vi.advanceTimersByTimeAsync(300_000);
  expect(fetchVersion).toHaveBeenCalledOnce();
  network.onLine = true;
  browser.dispatchEvent(new Event("online"));
  await flush();
  expect(fetchVersion).toHaveBeenCalledTimes(2);
});

it.each([
  { ok: false, json: async () => ({ version: "new" }) },
  { ok: true, json: async () => ({ version: "" }) },
  { ok: true, json: async () => ({ version: 42 }) },
  { ok: true, json: async () => null },
  { ok: true, json: async () => { throw new Error("invalid JSON"); } },
])("ignores invalid responses and retries", async response => {
  fetchVersion.mockResolvedValueOnce(response);
  const changed = vi.fn();
  cleanup = monitorAppVersion("old", changed);
  await flush();
  expect(changed).not.toHaveBeenCalled();
  fetchVersion.mockResolvedValue({ ok: true, json: async () => ({ version: "new" }) });
  await vi.advanceTimersByTimeAsync(300_000);
  expect(changed).toHaveBeenCalledOnce();
});

it("retries network errors", async () => {
  fetchVersion.mockRejectedValueOnce(new Error("offline"));
  cleanup = monitorAppVersion("old", vi.fn());
  await flush();
  await vi.advanceTimersByTimeAsync(300_000);
  expect(fetchVersion).toHaveBeenCalledTimes(2);
});

it("deduplicates requests and ignores late responses after cleanup", async () => {
  let resolve!: (value: unknown) => void;
  fetchVersion.mockReturnValue(new Promise(value => { resolve = value; }));
  const changed = vi.fn();
  cleanup = monitorAppVersion("old", changed);
  browser.dispatchEvent(new Event("online"));
  expect(fetchVersion).toHaveBeenCalledOnce();
  const signal = fetchVersion.mock.calls[0][1].signal as AbortSignal;
  cleanup();
  expect(signal.aborted).toBe(true);
  resolve({ ok: true, json: async () => ({ version: "new" }) });
  await flush();
  page.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(600_000);
  expect(fetchVersion).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
});

it("does not check development builds", () => {
  cleanup = monitorAppVersion("", vi.fn());
  expect(fetchVersion).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
