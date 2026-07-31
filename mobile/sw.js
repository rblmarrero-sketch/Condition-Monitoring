/* Service worker for the Plug Capture app — makes it open offline once installed.
   Caches the app shell; captured photos live in IndexedDB (not here). */
const CACHE = "plug-capture-v40-2026-07-31";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=40",
  "./jsQR.js?v=40",
  "./qrcode.js?v=40",
  "./upload-defaults.js?v=40",
  "./taxonomy.js?v=40",
  "./taxonomy2.js?v=40",
  "./assets.js?v=40",
  "./components.js?v=40",
  "./temp-limits.js?v=40",
  "./jspdf.umd.min.js?v=40",
  "./html2canvas.min.js?v=40",
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
  // "Network-first" is not enough on its own: plain fetch() still consults the
  // browser's HTTP cache, and GitHub Pages serves assets with max-age=600, so a
  // phone could keep running yesterday's JavaScript. cache:"reload" goes past it.
  const url = new URL(e.request.url);
  const get = url.origin === self.location.origin
    ? fetch(url.href, { cache: "reload", credentials: "same-origin" })
    : fetch(e.request);
  e.respondWith(
    get.then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
    )
  );
});
