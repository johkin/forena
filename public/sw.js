const CACHE = "forena-v1";
const APP_SHELL = ["/", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener("push", (event) => {
  const message = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(message.title ?? "Förena", {
      body: message.body ?? "Du har en ny händelse i föreningen.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: message.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? "/"));
});
