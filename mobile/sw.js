/* Service worker for the Plug Capture app — makes it open offline once installed.
   Caches the app shell; captured photos live in IndexedDB (not here). */
const CACHE = "plug-capture-v21-2026-07-31";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./jsQR.js",
  "./taxonomy.js",
  "./assets.js",
  "./components.js",
  "./jspdf.umd.min.js",
  "./html2canvas.min.js",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: always get the latest when online, fall back to cache offline.
// (Cache-first previously left phones stuck on an old version.)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
    )
  );
});
