// App service worker
// Minimal: makes the app installable and caches the shell for faster loads.
// All API/Supabase requests always go to the network (no stale data risk).

const CACHE = "app-shell-v1";
const SHELL = ["/", "/manifest.json", "/brand-logo.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Always hit the network for Supabase, API routes, and navigations
  if (
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/api/") ||
    e.request.mode === "navigate"
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
