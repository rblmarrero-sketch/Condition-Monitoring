/* Service worker for the Field Capture app.
   The app must work with no signal at all — in the pit there often is none — and
   it must not stall waiting for a network that is not there.

   Two strategies, chosen by URL shape:

   • ?v=<build>  — an immutable URL. A new build asks for a new URL, so a hit can
     be served straight from the cache with no network round trip. This is what
     makes the app instant offline AND online. All the big files (asset register,
     defect taxonomy, component tree, PDF libraries) are versioned this way.

   • everything else (index.html, icons) — network first so a new build lands,
     cache as the fallback.

   A miss must NEVER fall back to index.html for a script or image. Returning HTML
   where JavaScript was expected leaves window.ASSETS / window.TAX2 undefined, and
   the equipment, defect and cause lists come up blank with no error the inspector
   can see. */
const BUILD = "52";
const CACHE = "plug-capture-v" + BUILD;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=" + BUILD,
  "./jsQR.js?v=" + BUILD,
  "./qrcode.js?v=" + BUILD,
  "./upload-defaults.js?v=" + BUILD,
  "./hme.js?v=" + BUILD,
  "./hme-cascade.js?v=" + BUILD,
  "./mp-fc.js?v=" + BUILD,
  "./assets.js?v=" + BUILD,
  "./temp-limits.js?v=" + BUILD,
  "./jspdf.umd.min.js?v=" + BUILD,
  "./html2canvas.min.js?v=" + BUILD,
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Per file, not addAll: addAll rejects as a whole, so one 404 would leave the
    // cache completely empty and the app blank the first time it went offline.
    const missed = [];
    await Promise.all(SHELL.map((u) =>
      c.add(new Request(u, { cache: "reload" })).catch(() => missed.push(u))));
    if (missed.length) console.warn("[sw] not precached:", missed);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;          // uploads etc. go straight out

  const isDoc = req.mode === "navigate" || req.destination === "document";

  if (url.searchParams.has("v") && !isDoc) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;                                  // immutable: no network needed
      try {
        const res = await fetch(req);
        if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch (err) {
        // Offline and this exact build is not cached — a previous build's copy of
        // the same file is far better than a blank list.
        const any = await caches.match(req, { ignoreSearch: true });
        if (any) return any;
        throw err;
      }
    })());
    return;
  }

  e.respondWith((async () => {
    // Network first, but not for ever. "Offline" is the easy case — the fetch
    // fails at once. The pit's normal case is worse: a signal that connects and
    // then delivers nothing, where an untimed fetch leaves the app on a blank
    // screen. Give the network a short window, then serve what we have.
    const cached = () => caches.match(req).then(h => h || caches.match(req, { ignoreSearch: true }));
    try {
      const res = await withTimeout(fetch(req, { cache: isDoc ? "reload" : "default" }), NET_WAIT);
      if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cached();
      if (hit) {
        // Served stale because the network was slow, not absent — refresh the
        // copy in the background so the next start is current.
        if (err && err.name === "TimeoutError") e.waitUntil(revalidate(req, isDoc));
        return hit;
      }
      // Only a page navigation may fall back to the shell.
      if (isDoc) {
        const shell = await caches.match("./index.html") || await caches.match("./");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

/* How long a slow network may hold up a start before the cache wins. Long
   enough that a normal connection always beats it, short enough that a stalled
   one is not felt as a hang. */
const NET_WAIT = 3500;
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const e = new Error("network too slow"); e.name = "TimeoutError"; reject(e);
    }, ms);
    p.then(r => { clearTimeout(t); resolve(r); },
           e => { clearTimeout(t); reject(e); });
  });
}
async function revalidate(req, isDoc) {
  try {
    const res = await fetch(req, { cache: isDoc ? "reload" : "default" });
    if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
  } catch (_) { /* still no network — the cached copy stands */ }
}
