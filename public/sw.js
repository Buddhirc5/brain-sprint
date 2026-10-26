/* Ant Arena service worker.
   It makes the app installable on phones and shows push notifications.
   It caches nothing on purpose: every launch loads the latest release from the network. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Ant Arena", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/#/app" },
    }),
  );
});

// tap a notification: bring the app forward on that page, or open it
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/#/app", self.location.origin);
  if (url.origin !== self.location.origin) return; // only ever open our own pages
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((c) => new URL(c.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        win.postMessage({ type: "open", url: url.href });
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
