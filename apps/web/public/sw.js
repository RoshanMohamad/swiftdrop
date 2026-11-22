/* SwiftDrop courier service worker: caches the app shell so the PWA opens offline.
   API calls are never cached (private data); the page keeps its own offline queue. */
const SHELL = "swiftdrop-shell-v3";
const STATIC = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

// The page's main bundle loads before this worker is installed, so precache the hashed
// assets that index.html references; otherwise the first offline launch is a blank page.
async function precacheShell() {
  const cache = await caches.open(SHELL);
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) throw new Error(`shell fetch failed: ${response.status}`);
  const html = await response.clone().text();
  const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])];
  await cache.addAll([...STATIC, ...assets]);
  await cache.put("/", response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Network first so a deployed update is picked up, and refresh the cached shell with it
    // (every SPA route serves the same index.html). The cached shell is the offline fallback.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const type = response.headers.get("content-type") ?? "";
          if (response.ok && type.includes("text/html")) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(SHELL).then((cache) => cache.put("/", copy)),
            );
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  // Built assets are content-hashed, so cache-first is safe.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && url.pathname.startsWith("/assets/")) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
