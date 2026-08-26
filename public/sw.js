const SW_VERSION = "2026-08-26-v12-flota-no-patrones";
const CACHE_NAME = `gestion-flota-${SW_VERSION}`;

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-32.png",
  "/logo-gestion-flota-tna.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })),
        ),
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

function shouldBypassCache(request, url) {
  if (request.mode === "navigate") {
    return true;
  }

  if (url.pathname.startsWith("/_next/")) {
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    return true;
  }

  if (url.pathname.startsWith("/agendamientos")) {
    return true;
  }

  if (url.pathname.startsWith("/accesos")) {
    return true;
  }

  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html") || accept.includes("text/x-component")) {
    return true;
  }

  return (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json")
  );
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname === "/sw.js"
  ) {
    event.respondWith(fetch(event.request, { cache: "reload" }));
    return;
  }

  if (shouldBypassCache(event.request, url)) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);

        if (response.ok) {
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
