const SW_VERSION = "2026-08-14-v10";
const CACHE_NAME = `gestion-flota-${SW_VERSION}`;

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/manifest-agendamientos.webmanifest",
  "/pwa-192.png",
  "/pwa-512.png",
  "/favicon-32.png",
  "/logo-gestion-flota-tna.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);

        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE_NAME);
          void cache.put(event.request, response.clone());
        }

        return response;
      } catch {
        const cached = await caches.match(event.request);
        return cached ?? Response.error();
      }
    })(),
  );
});
