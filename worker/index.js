/**
 * Custom service worker script loaded by next-pwa's generated sw.js.
 * Handles push events so reminder notifications are shown.
 */
const DEFAULT_TITLE = "Book-Trackr";
const DEFAULT_BODY = "You have reading planned for today. Open the app to log your progress.";
const DEFAULT_URL = "/dashboard";
const DEFAULT_TAG = "book-trackr-reminder";

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
    event.notification && event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : DEFAULT_URL;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      if (clientList.length > 0) {
        const focused = clientList.find((c) => c.focused);
        if (focused) return focused.focus();
        return clientList[0].focus();
      }
      return self.clients.openWindow(notificationUrl);
    })
  );
});
