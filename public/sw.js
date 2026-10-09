const CACHE = "forena-v3";
const OFFLINE_PAGE = "/offline.html";
// Only session-independent static resources may enter Cache Storage.
const APP_SHELL = [OFFLINE_PAGE, "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("forena-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === "navigate") {
      return await cache.match(OFFLINE_PAGE) ?? Response.error();
    }
    // Never fall back to a cached document, API response or RSC payload.
    const url = new URL(event.request.url);
    if (APP_SHELL.includes(url.pathname) && !url.search) return await cache.match(url.pathname) ?? Response.error();
    return Response.error();
  }));
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() };
  }
  event.waitUntil(
    Promise.all([self.clients.matchAll({ type: "window" }).then(clients => clients.forEach(client => client.postMessage({ type: "activity-notification" }))), self.registration.showNotification(message.title ?? "Förena", {
      body: message.body ?? "Du har en ny händelse i föreningen.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: message.tag,
      data: { url: message.url ?? "/" },
    })]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url ?? "/", self.location.origin);
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

