import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

type WorkerEvent = { request?: { url: string; method: string; mode: string }; waitUntil: (promise: Promise<unknown>) => void; respondWith: (promise: Promise<Response>) => void };

/** Run the production worker against an isolated browser-cache model. */
function worker() {
  const origin = "https://forena.test";
  const stores = new Map<string, Map<string, string>>();
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const fetch = vi.fn(async () => new Response("online family data"));
  const claim = vi.fn(async () => {});
  const cachedUrls: string[] = [];
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (key: string) => stores.delete(key),
    open: async (key: string) => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key)!;
      return {
        addAll: async (urls: string[]) => { for (const url of urls) { cachedUrls.push(url); store.set(url, url === "/offline.html" ? "generic offline page" : "static icon"); } },
        match: async (url: string) => store.has(url) ? new Response(store.get(url)) : undefined,
      };
    },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    caches, fetch, URL, Response,
    self: { location: { origin }, clients: { claim }, skipWaiting: vi.fn(), addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler) },
  });
  async function dispatch(name: string, path = "/", mode = "navigate") {
    let completion: Promise<unknown> = Promise.resolve();
    let response: Promise<Response> | undefined;
    handlers.get(name)!({ request: { url: `${origin}${path}`, method: "GET", mode }, waitUntil: promise => { completion = promise; }, respondWith: promise => { response = promise; } });
    await completion;
    return response;
  }
  return { stores, cachedUrls, fetch, claim, dispatch };
}

it("never precaches the authenticated root and deletes legacy family data before claiming clients", async () => {
  const w = worker();
  w.stores.set("forena-v2", new Map([["/", "previous family's activities"]]));
  w.stores.set("unrelated-app", new Map([["/", "unrelated data"]]));
  w.claim.mockImplementation(async () => { expect(w.stores.has("forena-v2")).toBe(false); });
  await w.dispatch("install");
  expect(w.cachedUrls).toEqual(["/offline.html", "/icon.svg"]);
  await w.dispatch("activate");
  expect([...w.stores.keys()]).toEqual(["unrelated-app", "forena-v3"]);
  expect(w.claim).toHaveBeenCalledOnce();
});

it.each(["/", "/o/uik/t/f2016", "/profile"])("shows only the public offline page after logout or account change at %s", async path => {
  const w = worker();
  await w.dispatch("install");
  w.stores.set("forena-v2", new Map([[path, "old account's private data"]]));
  // Even an unexpected private entry in the current cache must never be returned.
  w.stores.get("forena-v3")!.set(path, "another account's private data");
  w.fetch.mockRejectedValue(new Error("offline"));
  expect(await (await w.dispatch("fetch", path))!.text()).toBe("generic offline page");
});

it.each(["/api/activities/a/my-invitations", "/?_rsc=payload", "/profile"])("does not return stored private responses for offline fetch %s", async path => {
  const w = worker();
  await w.dispatch("install");
  w.stores.get("forena-v3")!.set(path, "private response");
  w.fetch.mockRejectedValue(new Error("offline"));
  expect((await w.dispatch("fetch", path, "cors"))!.type).toBe("error");
});

it("returns live account data online without writing it to Cache Storage", async () => {
  const w = worker();
  await w.dispatch("install");
  expect(await (await w.dispatch("fetch"))!.text()).toBe("online family data");
  expect([...w.stores.get("forena-v3")!.keys()]).toEqual(["/offline.html", "/icon.svg"]);
});

it("still serves the allowlisted static icon offline", async () => {
  const w = worker();
  await w.dispatch("install");
  w.fetch.mockRejectedValue(new Error("offline"));
  expect(await (await w.dispatch("fetch", "/icon.svg", "cors"))!.text()).toBe("static icon");
});
