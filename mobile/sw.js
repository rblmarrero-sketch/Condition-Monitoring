/* Service worker for the Field Capture app.

   ONE RULE, above every other consideration here: **this file must never be the
   reason the app fails to open.** An inspector standing at a machine with no
   signal has no way to clear website data, no way to read a console, and no
   second phone. If the service worker cannot serve the page, the round does not
   get captured.

   That rule was learned the hard way. A previous version of this file could
   leave the app showing Safari's own error page —

       FetchEvent.respondWith received an error: TimeoutError: network too slow

   — which is the app refusing to start, on a phone, in the field. Three
   decisions each defensible on their own combined into it:

     1. install() swallowed every precache failure and called skipWaiting()
        regardless, so a bad link during an update activated a worker whose
        cache was incomplete or empty;
     2. activate() then deleted every other cache, throwing away the PREVIOUS
        build's working copy;
     3. fetch() threw when it found nothing, and a rejected respondWith() is
        exactly what puts that message on the screen.

   So a flaky signal during an update was enough to brick the app until somebody
   cleared website data. Everything below is arranged so that cannot happen:

     · A new build is not allowed to take over until it has actually cached what
       the app needs to run. Until then the old one keeps serving, and the app
       keeps working on the old build — which is the correct outcome, not a
       degraded one.
     · The old cache is not deleted until the new one is proven complete.
     · A page navigation is served from cache FIRST, so a cold start in the pit
       never waits on the network at all, and is revalidated behind the reader.
     · No path in fetch() rejects. Ever. Worst case it answers with a page that
       explains itself and offers a retry — because an honest offline page is
       recoverable and a browser error page is not. */

const BUILD = "276";
const CACHE = "plug-capture-v" + BUILD;

/* Without these the app is not an app: no page, no equipment register, no
   defect reference, no wear limits, no report. If they are not all in the
   cache, this build does not take over. */
const ESSENTIAL = [
  /* "./" is deliberately NOT here. It is an alias for index.html that only
     exists if the host serves directory indexes — GitHub Pages does, plenty of
     hosts do not. Requiring it would mean one entry that can never be
     satisfied, and since an incomplete build is not allowed to take over, that
     is every future update blocked for ever. The page itself is index.html;
     "./" is a convenience, and it is cached below as one. */
  "./index.html",
  "./native.js?v=" + BUILD,
  "./upload-defaults.js?v=" + BUILD,
  "./hme.js?v=" + BUILD,
  "./hme-cascade.js?v=" + BUILD,
  "./mp-fc.js?v=" + BUILD,
  "./assets.js?v=" + BUILD,
  "./temp-limits.js?v=" + BUILD,
  "./normalize.js?v=" + BUILD,
  "./terms.js?v=" + BUILD,
  "./grade.js?v=" + BUILD,
  "./edits.js?v=" + BUILD,
  "./due.js?v=" + BUILD,
  "./wear.js?v=" + BUILD,
  "./wear-figs.js?v=" + BUILD,
  "./wear-map.js?v=" + BUILD,
  "./machine-photos.js?v=" + BUILD,
  "./machine-fig.js?v=" + BUILD,
  "./get.js?v=" + BUILD,
  "./points.js?v=" + BUILD,
  "./uc-points.js?v=" + BUILD,
  "./inspect-guide.js?v=" + BUILD,
  "./get-figs.js?v=" + BUILD,
  "./body-points.js?v=" + BUILD,
  "./body-map.js?v=" + BUILD,
  "./lube.js?v=" + BUILD,
  "./lube-overrides.js?v=" + BUILD,
  "./lube2027.js?v=" + BUILD,
  "./lube-tds.js?v=" + BUILD,
  "./report-core.js?v=" + BUILD,
];

/* Wanted, but the app starts and captures a full round without them. The PDF
   engine is 850 KB and is only needed when somebody prints; the QR libraries
   only when somebody scans. Letting these hold up an update would mean a phone
   on a thin link never getting a fix to the capture code. */
/* Machine artwork, read from the same table the app uses so the two can never
   disagree about which files exist. importScripts is synchronous and runs
   before install, and the table hands back an empty list until its ON switch is
   flipped — so a build with no artwork asks the network for nothing at all.
   Optional by definition: a picture is a nicety, the figure falls back to its
   drawing, and a missing one must never hold up an update to the capture code. */
var PHOTOS = [];
try {
  importScripts("./machine-photos.js?v=" + BUILD);
  PHOTOS = (self.MACHINE_PHOTOS && self.MACHINE_PHOTOS.all()) || [];
  importScripts("./get.js?v=" + BUILD);
  PHOTOS = PHOTOS.concat((self.GET && self.GET.all && self.GET.all()) || []);
} catch (e) { PHOTOS = PHOTOS || []; }

const OPTIONAL = [
  "./",                          // see the note above
  "./manifest.webmanifest?v=" + BUILD,
  "./jsQR.js?v=" + BUILD,
  "./qrcode.js?v=" + BUILD,
  "./jspdf.umd.min.js?v=" + BUILD,
  "./html2canvas.min.js?v=" + BUILD,
  "./icon-192.png",
  "./icon-512.png",
].concat(PHOTOS);

const NET_WAIT = 4000;          // how long a fetch may hold anything up

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const e = new Error("network too slow"); e.name = "TimeoutError"; reject(e);
    }, ms);
    p.then(r => { clearTimeout(t); resolve(r); },
           e => { clearTimeout(t); reject(e); });
  });
}

/* Two attempts per file, then give up on that one. A pit link drops single
   requests constantly; retrying once turns most of those into a success and
   costs nothing when the first try works.

   THE DEADLINE COVERS THE WHOLE FILE, NOT THE FIRST BYTE. Until build 260 the
   15 s timeout raced fetch(), which resolves when the HEADERS arrive; the
   body then streamed into the cache with no limit at all. A phone on 256 with
   signal sat under "Build v259 is downloading itself" for a whole shift: one
   stalled stream held the install open indefinitely, and while an install is
   open every later check does nothing, because update() will not start a
   second one. The signal now aborts headers and body together — a stalled
   stream costs FILE_WAIT and is retried, and an install that cannot finish
   fails (see install) so the next check starts it again. */
const FILE_WAIT = 90000;
async function fetchInto(cache, url, tries) {
  for (let i = 0; i < (tries || 2); i++) {
    const ac = (typeof AbortController === "function") ? new AbortController() : null;
    const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch (_) {} }, FILE_WAIT);
    try {
      const res = await fetch(new Request(url, { cache: "reload" }), ac ? { signal: ac.signal } : {});
      if (res && res.ok) {
        const buf = await res.arrayBuffer();               // the body, under the same deadline
        await cache.put(url, new Response(buf, { status: 200, headers: res.headers }));
        clearTimeout(timer); return true;
      }
    } catch (e) { /* aborted, dropped or refused — try again, then move on */ }
    clearTimeout(timer);
  }
  return false;
}

async function missingEssentials() {
  const c = await caches.open(CACHE);
  const out = [];
  for (const u of ESSENTIAL) if (!(await c.match(u))) out.push(u);
  return out;
}

async function precache() {
  const c = await caches.open(CACHE);
  // Essentials first and in full, before spending the link on 850 KB of PDF engine.
  for (const u of ESSENTIAL) if (!(await c.match(u))) await fetchInto(c, u);
  const missing = await missingEssentials();
  // Optional files only once the app is known to be able to run.
  if (!missing.length) await Promise.all(OPTIONAL.map(u => c.match(u).then(h => h || fetchInto(c, u, 1))));
  return missing;
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    /* Two passes: the second asks only for what the first left short, so a
       single dropped file does not fail the whole download. */
    let missing = await precache();
    if (missing.length) { await new Promise(r => setTimeout(r, 1000)); missing = await precache(); }
    if (missing.length) {
      /* This build cannot run, so it must not take over from one that can —
         and it must not LINGER either. Until build 260 an incomplete install
         returned normally and the worker sat in "waiting" for ever: the old
         page's checks call reg.update(), which installs nothing when the
         bytes on the server have not changed, so a phone that dropped one
         file stayed on the old build until somebody tapped Update. Failing
         the install makes the worker redundant; the next ordinary check —
         from ANY build of the page, every five minutes — installs it afresh,
         and what is already in this build's cache is not fetched again. The
         old worker keeps serving throughout; nothing is deleted. */
      /* Only when there is a build in charge to keep serving. A phone's very
         FIRST install on a bad link has nothing to fall back to: an incomplete
         worker that activates can at least serve the offline page and finish
         itself on the next open (activate → healSoon), where no worker at all
         hands the inspector the browser's own error. */
      if (self.registration && self.registration.active) {
        console.warn("[sw] install incomplete, failing so the next check retries:", missing);
        throw new Error("incomplete: " + missing.join(", "));
      }
      console.warn("[sw] first install incomplete, activating to serve what it has:", missing);
      return;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    /* Only sweep the old caches once this one is proven. If something went
       wrong, the previous build's files are the only working copy on the phone
       and deleting them is unrecoverable — caches.match() searches every cache,
       so keeping them is what makes the fallback below possible. */
    const missing = await missingEssentials();
    if (!missing.length) {
      /* Keep the immediately previous build as well as this one, and sweep only
         what is older. A page loaded from the old build is still running: its
         <script> tags name ?v=<old>, and the PDF engine and QR reader are
         fetched on demand, not at load. Delete that build's cache and an
         inspector who was mid-round when the update landed cannot print, in a
         pit, for no reason they can see. Two builds is a couple of megabytes;
         the page reloads onto the new one soon enough and the next activate
         sweeps it then. */
      const keys = (await caches.keys()).filter(k => k.startsWith("plug-capture-v") && k !== CACHE);
      const n = (k) => Number(String(k).replace("plug-capture-v", "")) || 0;
      keys.sort((a, b) => n(b) - n(a));
      await Promise.all(keys.slice(1).map(k => caches.delete(k)));
    } else {
      console.warn("[sw] keeping older caches, this build is incomplete:", missing);
      healSoon();
    }
    await self.clients.claim();
  })());
});

/* If a build activated incomplete — or a file was evicted under storage
   pressure, which iOS does — quietly finish the job the next time anything
   happens. Guarded so a hundred requests do not start a hundred repairs. */
let healing = false;
function healSoon() {
  if (healing) return;
  healing = true;
  precache()
    .then(m => {
      if (m.length) { console.warn("[sw] still missing:", m); return; }
      /* COMPLETE NOW, SO TAKE OVER NOW. A worker whose install came up one
         file short stays in waiting (see install), and reg.update() will not
         install it again — the bytes have not changed. Until build 257 the
         only thing that ever finished it was the Update button: a phone that
         dropped one fetch on a thin link stayed on the old build until a
         technician tapped, which is the rule this app exists to break. Once
         every essential file is in, this is the same call install makes. On a
         worker that is already in charge it is a no-op. */
      return self.skipWaiting();
    })
    .catch(() => {})
    .then(() => { setTimeout(() => { healing = false; }, 30000); });
}

/* The last thing standing between an inspector and a browser error page. It is
   deliberately a whole page with no dependencies: if this needed a stylesheet
   or a script, it would fail exactly when it is needed. */
function offlinePage() {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Condition Monitoring</title><style>' +
    'body{margin:0;padding:32px 22px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'background:#0d0d0d;color:#e8e8e6;}h1{font-size:19px;margin:0 0 14px;}' +
    'p{margin:0 0 12px;color:#b9bcbe;}b{color:#e8e8e6;}' +
    'button{margin-top:18px;width:100%;min-height:52px;font:600 16px system-ui;' +
    'background:#f0a202;color:#1a1a19;border:0;border-radius:10px;}' +
    '</style></head><body>' +
    '<h1>The app has not finished downloading</h1>' +
    '<p>Nothing you captured has been lost — saved rounds are on this phone and ' +
    'will upload when there is signal.</p>' +
    '<p>This screen means the app was still downloading when the connection ' +
    'dropped. It needs <b>signal once</b> to finish, then works offline again.</p>' +
    '<p>Try somewhere with a bar or two, or on camp wifi.</p>' +
    '<button onclick="location.reload()">Try again</button>' +
    '</body></html>',
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;      // uploads go straight out

  const isDoc = req.mode === "navigate" || req.destination === "document";

  /* THE PAGE ASKING FOR THE PAGE THAT EXPLAINS ITSELF.

     index.html can be in the cache while a script it needs is not — a download
     interrupted between the two. The app then opens and dies on a missing
     module, which on a phone is a white screen and no way to tell whether the
     work on it survived.

     The page detects that and navigates here. The message is written once, in
     offlinePage(), because two copies of one sentence is how two screens come
     to say different things, and healSoon() finishes the download in the
     background so the next attempt is the real app. */
  if (isDoc && /\/__incomplete$/.test(url.pathname)) {
    healSoon();
    return e.respondWith(offlinePage());
  }

  /* ---- a page navigation: cache first, always ------------------------------
     Network-first here was the original mistake. It put a 3.5-second timeout on
     the critical path of every cold start in the field, and when both the
     network and the cache missed it threw — which is the error on the phone.

     Cache-first is also simply better: the app opens instantly, offline or on,
     and the page's own half-hourly build check is what tells somebody a new
     version exists. The service worker does not need to race for it. */
  if (isDoc) {
    e.respondWith((async () => {
      /* THIS build's cache first, by name — not caches.match(), which searches
         every cache and returns whichever it finds first.

         That distinction is the whole update mechanism. Since activate() now
         deliberately keeps the previous build's cache (so a page still running
         on it can still fetch its PDF engine), a cross-cache match can hand
         back the OLD index.html after the new worker has taken over. The phone
         then reloads onto the version it was already running, for ever, and
         looks like it is simply refusing to update — which is exactly what it
         is doing.

         Older caches are still the fallback, and must be: a build whose page
         somehow did not cache is better served by last week's than by nothing. */
      const mine = await caches.open(CACHE);
      const hit = await mine.match("./index.html") || await mine.match("./")
        || await caches.match("./index.html") || await caches.match("./")
        || await caches.match(req, { ignoreSearch: true });
      if (hit) {
        e.waitUntil(revalidate("./index.html"));        // fresher next time
        return hit;
      }
      // Nothing cached at all — a first visit, or a cache that never completed.
      try {
        const res = await withTimeout(fetch(req), NET_WAIT + 4000);
        if (res && res.ok) (await caches.open(CACHE)).put("./index.html", res.clone());
        healSoon();
        return res;
      } catch (err) {
        healSoon();
        return offlinePage();                            // never reject
      }
    })());
    return;
  }

  /* ---- ?v=<build>: an immutable URL --------------------------------------- */
  if (url.searchParams.has("v")) {
    e.respondWith((async () => {
      // Same rule, same reason: this build's copy wins over an older build's.
      const mine = await caches.open(CACHE);
      const hit = await mine.match(req) || await caches.match(req);
      if (hit) return hit;
      try {
        const res = await withTimeout(fetch(req), NET_WAIT + 6000);
        if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch (err) {
        /* This exact build is not cached and the network is gone. A previous
           build's copy of the same file is far better than nothing: the
           equipment list being a week old beats the picker being empty. This is
           why activate() does not delete old caches until it is sure. */
        const any = await caches.match(req, { ignoreSearch: true });
        if (any) { healSoon(); return any; }
        healSoon();
        /* Still nothing. Answer, rather than reject: a 503 lets the page load
           and the app's own checkData() name the missing file and offer the
           one-tap repair. Rejecting takes the whole page down instead. */
        return new Response("/* unavailable offline */", { status: 503,
          headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  /* ---- machine artwork: cache first ---------------------------------------
     The undercarriage and tool photographs carry no ?v=, so without this branch
     they fell into the "do not touch" rule below, went straight to the network,
     and failed in the pit — cached by install(), never served. The measurement
     map would come up with its numbers over a blank space on exactly the shift
     it is needed.

     Cache-first is right for these and not a risk: they are static artwork
     under a known folder, replaced only by a new build, and never a live call.
     A miss falls through to the network and is kept for next time, so a
     photograph added between builds still works. */
  if (/\/machine\//.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await withTimeout(fetch(req), NET_WAIT + 4000);
        if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch (err) {
        /* No picture. The map falls back to its drawn frame, which is the whole
           reason the drawing was kept — so answer rather than reject, and let
           the page decide. */
        return new Response("", { status: 504 });
      }
    })());
    return;
  }

  /* ---- everything else on this origin: DO NOT TOUCH IT -----------------------
     This worker's job is the app shell. Anything else same-origin is almost
     certainly a live call — the team list, a conflict check, a pull from the
     backend — and a cache-first shell strategy applied to those is silent
     poison: the app shows last week's answer and has no way to know.

     It is easy to write by accident, because "cache first, network as fallback"
     reads like a safe default and the shell is the only place it is. This
     branch caught five test suites the moment it existed; in the field it would
     have been an inspector looking at a team list that stopped updating, with
     nothing on screen suggesting why. The Apps Script endpoint is cross-origin
     and returned above, but the Phase 3 backend can be same-origin, so this is
     not hypothetical.

     Returning without calling respondWith() hands the request back to the
     browser, which is exactly right: normal HTTP, normal caching rules, and no
     stale answer this file is responsible for. Static files that matter are
     precached and served by name; nothing else needs us. */
  return;
});

async function revalidate(reqOrUrl) {
  try {
    const res = await withTimeout(fetch(new Request(reqOrUrl, { cache: "reload" })), 10000);
    if (res && res.ok) (await caches.open(CACHE)).put(reqOrUrl, res.clone());
  } catch (_) { /* no network — the cached copy stands, which is the point */ }
}

/* The page asks about its own footing: the System screen shows this, and the
   repair button uses it. A phone that says "12 of 13 files" is diagnosable over
   a radio; one that just fails is not. */
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "sw-health") {
    e.waitUntil((async () => {
      const missing = await missingEssentials();
      const port = e.ports && e.ports[0];
      const msg = { type: "sw-health", build: BUILD, ok: missing.length === 0,
                    have: ESSENTIAL.length - missing.length, need: ESSENTIAL.length, missing };
      if (port) port.postMessage(msg);
      else (await self.clients.matchAll()).forEach(c => c.postMessage(msg));
    })());
  }
  if (d.type === "sw-heal") healSoon();
  if (d.type === "sw-skip") self.skipWaiting();
  /* The page mirrors what the worker needs to act alone — backend URL, read
     secret, cursor, device, language — into the config cache; and the test
     seam: a wake by message runs exactly what a push runs. */
  if (d.type === "sw-config") e.waitUntil(cfgPut("__config", d.cfg || {}));
  if (d.type === "sw-wake") {
    e.waitUntil((async () => {
      const out = await wake("message", d.data || {});
      const port = e.ports && e.ports[0]; if (port) port.postMessage(out);
    })());
  }
  /* THE SECOND PATH TO THE SERVER. The page asks the worker to read the build
     on the server, because the worker runs in its own process with its own
     connection — on iOS a page brought back from the background can have every
     fetch fail until it is loaded again while the worker is fine. If the
     server is ahead the worker starts the update itself, so a page that
     cannot reach anything still gets the build. Answers on the port it was
     handed: {server, updating} or {err}. */
  if (d.type === "sw-check") {
    e.waitUntil((async () => {
      const port = e.ports && e.ports[0];
      const out = { type: "sw-check", build: BUILD };
      const ac = (typeof AbortController === "function") ? new AbortController() : null;
      const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch (_) {} }, 25000);
      try {
        const res = await fetch(new Request("./sw.js?swts=" + Date.now(), { cache: "no-store" }), ac ? { signal: ac.signal } : {});
        if (!res.ok) throw new Error("http " + res.status);
        const m = (await res.text()).match(/const BUILD\s*=\s*"([^"]+)"/);
        if (!m) throw new Error("http unreadable");
        out.server = m[1];
        if (out.server !== BUILD && self.registration && self.registration.update) {
          try { await self.registration.update(); out.updating = true; }
          catch (err) { out.err = "update: " + String((err && err.message) || err); }
        }
      } catch (err) {
        out.err = (err && err.name === "AbortError") ? "timeout" : String((err && err.message) || err);
      }
      clearTimeout(timer);
      if (port) port.postMessage(out);
    })());
  }
});

/* ===================== waking without anybody opening the app =====================
   A closed web app runs nothing. On an iPhone the one thing that can start
   this worker while the app is closed is a push message from the endpoint —
   sent when a build ships, when the folder changes and once a day before
   shift (docs/yandex/server.js) — and the worker must answer every push with
   a notification or iOS stops delivering them. On Android, Periodic
   Background Sync and Background Sync wake it as well. All of them run the
   same routine, and so does a "sw-wake" message from the page or a test:

     1. the build: read sw.js on the server; if it is ahead, install it
        (registration.update — a complete download takes over by itself);
     2. this build's own cache: finish anything short;
     3. the fleet list: ask the backend for what is new since the phone's
        cursor and keep the reply for the page to merge at its next open, so
        the due list is fresh even when that open is in the pit;
     4. the queue: count the rounds on this phone that have not been sent —
        the worker cannot send them (that needs the page), but it can say so;
     5. the verdict: "Ready for the field" or "Not ready", with the build,
        the file count, the fleet list's age and the queue, as a notification.
   Everything is bounded: a push handler on iOS gets seconds, not minutes. */
const CFG_CACHE = "cm_config";
async function cfgGet(k) {
  try { const c = await caches.open(CFG_CACHE); const r = await c.match(k); return r ? await r.json() : null; }
  catch (e) { return null; }
}
async function cfgPut(k, obj) {
  try { const c = await caches.open(CFG_CACHE);
        await c.put(k, new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } })); }
  catch (e) { /* storage full or gone; the page will still ask */ }
}
const WAKE_T = {
  en: { ready: "Ready for the field", notready: "Not ready for the field",
        build: "build {n}", newer: "build {n} downloading", files: "{n} of {of} files on the phone",
        fleet: "fleet list as of {t}", fleetOld: "fleet list not refreshed ({why})",
        queue: "{n} round(s) still to send — open the app" },
  ru: { ready: "Готово к выезду", notready: "К выезду не готово",
        build: "сборка {n}", newer: "загружается сборка {n}", files: "на телефоне {n} из {of} файлов",
        fleet: "список парка на {t}", fleetOld: "список парка не обновлён ({why})",
        queue: "не отправлено обходов: {n} — откройте приложение" },
};
function tr(lang, k, v) {
  let s = (WAKE_T[lang] || WAKE_T.en)[k] || WAKE_T.en[k] || k;
  Object.keys(v || {}).forEach(x => { s = s.split("{" + x + "}").join(String(v[x])); });
  return s;
}
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
function fetchTimed(url, ms) {
  const ac = (typeof AbortController === "function") ? new AbortController() : null;
  const t = setTimeout(() => { try { if (ac) ac.abort(); } catch (_) {} }, ms);
  return fetch(url, ac ? { signal: ac.signal, cache: "no-store" } : { cache: "no-store" }).finally(() => clearTimeout(t));
}
/* The page's queue, read the way the page stores it (plug_capture / inspections):
   a record is waiting when it is not the draft, not a team copy and not up. */
function queuePending() {
  return new Promise(res => {
    const tm = setTimeout(() => res(null), 3000);
    try {
      const rq = indexedDB.open("plug_capture");
      rq.onerror = () => { clearTimeout(tm); res(null); };
      rq.onupgradeneeded = () => { try { rq.transaction.abort(); } catch (_) {} };   // never CREATE the page's database
      rq.onsuccess = () => {
        const db = rq.result;
        try {
          if (!db.objectStoreNames.contains("inspections")) { db.close(); clearTimeout(tm); return res(0); }
          const g = db.transaction("inspections", "readonly").objectStore("inspections").getAll();
          g.onsuccess = () => { clearTimeout(tm);
            const n = (g.result || []).filter(r => r && r.id !== "__draft__" && String(r.id).indexOf("__team__") !== 0 && !r.up).length;
            db.close(); res(n); };
          g.onerror = () => { clearTimeout(tm); db.close(); res(null); };
        } catch (e) { clearTimeout(tm); try { db.close(); } catch (_) {} res(null); }
      };
    } catch (e) { clearTimeout(tm); res(null); }
  });
}
let waking = null;
function wake(reason, data) {
  if (waking) return waking;
  waking = doWake(reason, data).catch(e => ({ reason, error: String((e && e.message) || e) }))
    .then(out => { waking = null; return out; });
  return waking;
}
async function doWake(reason, data) {
  const out = { reason, kind: (data && data.kind) || reason, at: Date.now(), build: BUILD };
  /* 1. the build on the server */
  try {
    const res = await fetchTimed("./sw.js?swts=" + Date.now(), 20000);
    if (!res.ok) throw new Error("http " + res.status);
    const m = (await res.text()).match(/const BUILD\s*=\s*"([^"]+)"/);
    out.server = m ? m[1] : null;
  } catch (e) { out.server = null; out.buildErr = String((e && e.message) || e); }
  if (out.server && out.server !== BUILD && self.registration && self.registration.update) {
    try { await self.registration.update(); } catch (e) { out.updateErr = String((e && e.message) || e); }
    /* Give the new worker's install a bounded moment; a complete one takes over by itself. */
    const until = Date.now() + 25000;
    while (Date.now() < until && self.registration.installing) await new Promise(r => setTimeout(r, 500));
    out.newer = !!(self.registration.waiting || self.registration.installing);
  }
  /* 2. this build's own cache */
  let missing = await missingEssentials();
  if (missing.length) { try { await precache(); } catch (_) {} missing = await missingEssentials(); }
  out.have = ESSENTIAL.length - missing.length; out.need = ESSENTIAL.length;
  /* 3. the fleet list, for the page's next open */
  const cfg = (await cfgGet("__config")) || {};
  const lang = cfg.lang === "ru" ? "ru" : "en"; out.lang = lang;
  if (cfg.url) {
    try {
      /* The same two doors the page uses: the index if the deployment has
         one, the records otherwise — the reply is kept with which door it
         came through, so the page merges it the way it merges its own. */
      const ask = async p => { const q = new URLSearchParams(p); if (cfg.sec) q.set("secret", cfg.sec);
        const res = await fetchTimed(cfg.url + (cfg.url.indexOf("?") < 0 ? "?" : "&") + q.toString(), 20000); return res.json(); };
      let j = await ask({ action: "index", slim: "1", since: String(cfg.cursor || 0) }), via = "index";
      if (!(j && j.ok !== false && j.v)) {
        if (j && j.ok === false && !/unknown action/i.test(j.error || "")) throw new Error(j.error);
        j = await ask({ action: "records", after: String(cfg.cursor || 0), index: "0" }); via = "records";
      }
      if (j && j.ok !== false && (j.v || j.records)) {
        await cfgPut("__team-prefetch", { since: Number(cfg.cursor || 0), at: Date.now(), via, reply: j });
        out.fleetAt = Date.now(); out.fleetRows = ((via === "index" ? j.rows : j.records) || []).length; out.fleetVia = via;
      } else out.fleetErr = (j && j.error) || "no reply";
    } catch (e) { out.fleetErr = String((e && e.message) || e); }
  } else out.fleetErr = "no backend configured";
  /* 4. the queue */
  out.pending = await queuePending();
  /* 5. the verdict — and the notification iOS requires */
  out.ready = !missing.length && !(out.pending > 0);
  const lines = [tr(lang, "build", { n: BUILD }) + (out.server && out.server !== BUILD ? " · " + tr(lang, "newer", { n: out.server }) : ""),
                 tr(lang, "files", { n: out.have, of: out.need }),
                 out.fleetAt ? tr(lang, "fleet", { t: hhmm(out.fleetAt) }) : tr(lang, "fleetOld", { why: out.fleetErr || "?" })];
  if (out.pending > 0) lines.push(tr(lang, "queue", { n: out.pending }));
  out.title = tr(lang, out.ready ? "ready" : "notready"); out.body = lines.join("\n");
  try {
    await self.registration.showNotification(out.title, { body: out.body, tag: "cm-ready", renotify: false,
      icon: "./icon-192.png", badge: "./icon-192.png", data: { kind: out.kind, ready: out.ready, at: out.at } });
    out.notified = true;
  } catch (e) { out.notifyErr = String((e && e.message) || e); }
  await cfgPut("__last-wake", out);
  return out;
}
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  e.waitUntil(wake("push", d));
});
self.addEventListener("periodicsync", e => { if (e.tag === "cm-upkeep") e.waitUntil(wake("periodicsync", { kind: "periodic" })); });
self.addEventListener("sync", e => { if (e.tag === "cm-upkeep") e.waitUntil(wake("sync", { kind: "sync" })); });
/* Tapping the notification opens the app — which then sends its queue and
   merges the prefetched fleet list by itself. */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of cs) { if ("focus" in c) { try { await c.focus(); return; } catch (_) {} } }
    try { await self.clients.openWindow("./"); } catch (_) {}
  })());
});
