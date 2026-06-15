/**
 * Openbentt Chat PWA service worker (root scope).
 */
const CACHE = "openbentt-chat-v2";
const CHAT_SHELL = "/chat";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(CHAT_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isChatPwaAllowedPath(pathname) {
  return (
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/setup" ||
    pathname.startsWith("/share")
  );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate" && !isChatPwaAllowedPath(url.pathname)) {
    event.respondWith(Response.redirect(new URL("/chat", url.origin), 302));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && url.pathname.startsWith("/chat")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((hit) => hit || caches.match(CHAT_SHELL))
      )
  );
});
