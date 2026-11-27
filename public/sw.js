/**
 * BookTrackr service worker — reading-reminder push notifications only.
 *
 * It deliberately has NO fetch handler and caches nothing. The previous
 * next-pwa (Workbox) worker cached pages, App Router navigation payloads
 * (?_rsc=), JS chunks and Clerk responses. After a deploy that could serve a
 * mix of old and new app versions, which left stale server-rendered HTML in
 * the page (e.g. the landing page's footer stacked above the live app in the
 * installed PWA). Every request now goes straight to the network.
 *
 * Registered from the Settings page when reminders are enabled
 * (navigator.serviceWorker.register("/sw.js")).
 */

const DEFAULT_TITLE = "Book-Trackr";
const DEFAULT_BODY =
  "You have reading planned for today. Open the app to log your progress.";
const DEFAULT_URL = "/dashboard";
const DEFAULT_TAG = "book-trackr-reminder";

self.addEventListener("install", function () {
  // Replace the old caching worker right away instead of waiting for every
  // open window to close.
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      // Clear everything the old worker cached (pages, RSC payloads, JS...).
      const cacheNames = await caches.keys();
      const hadOldCaches = cacheNames.length > 0;
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.clients.claim();

      // One-time cleanup when upgrading from the caching worker: reload open
      // app windows so they drop any stale HTML they were showing.
      if (hadOldCaches) {
        const windows = await self.clients.matchAll({ type: "window" });
        await Promise.all(
          windows.map((client) =>
            "navigate" in client ? client.navigate(client.url) : undefined
          )
        );
      }
    })()
  );
});

self.addEventListener("push", function (event) {
  let title = DEFAULT_TITLE;
  let body = DEFAULT_BODY;
  let url = DEFAULT_URL;
  let tag = DEFAULT_TAG;
  if (event.data) {
    try {
      const data = event.data.json();
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.url) url = data.url;
      if (data.tag) tag = data.tag;
    } catch (_) {
      try {
        const text = event.data.text();
        if (text) {
          const data = JSON.parse(text);
          if (data.title) title = data.title;
          if (data.body) body = data.body;
          if (data.url) url = data.url;
          if (data.tag) tag = data.tag;
        }
      } catch (_) {}
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      tag,
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const notificationUrl =
    event.notification &&
    event.notification.data &&
    typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : DEFAULT_URL;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        if (clientList.length > 0) {
          const focused = clientList.find((c) => c.focused);
          if (focused) return focused.focus();
          return clientList[0].focus();
        }
        return self.clients.openWindow(notificationUrl);
      })
  );
});
