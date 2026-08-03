/* The seam between the web app and a native shell.
   =================================================================
   One rule holds this file together: **the web app must never know which one
   it is running in.** Everything below answers the same question the same way
   whether the page is a tab in Chrome, a home-screen PWA, or the same HTML
   inside a Capacitor container on the App Store. The capture code calls
   `CMNative.photo()`; what happens underneath is this file's problem.

   That matters more than it sounds. The alternative — `if (isNative)` scattered
   through the capture logic — is how a codebase quietly becomes two codebases,
   with the web half getting the bug fixes and the native half getting the
   attention, until the report a phone prints and the report the office prints
   disagree. The rest of this project already resists that (one report engine,
   one reference table, one severity model); the shell must not be the thing
   that breaks it.

   So: the PWA path is not a fallback in the apologetic sense. It is the
   reference implementation, and it stays shipped and stays tested. The native
   path is an optimisation for four things the web genuinely cannot do well:

     · the camera            — the file input re-encodes, drops EXIF, and on
                               some Android builds silently halves resolution
     · large binaries        — 150 photographs of an undercarriage round is not
                               what IndexedDB blob storage is for, and iOS
                               evicts it under pressure
     · knowing the network   — navigator.onLine reports the interface, not the
                               internet, which is why build 69 needs a retry
                               timer to work around it
     · sharing a PDF         — a native share sheet, not a download that lands
                               in a folder nobody opens

   Everything else — the whole of the capture logic, the wear engine, the
   cascade, the report — is identical in both, because it never asks. */
(function (global) {
  "use strict";

  var Cap = global.Capacitor || null;
  /* isNativePlatform() is the only reliable test. `window.Capacitor` also
     exists on the web when the bridge is bundled, and platform strings have
     changed spelling between major versions. */
  var NATIVE = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  var plug = function (n) { return (Cap && Cap.Plugins && Cap.Plugins[n]) || null; };

  /* ---- 1. a photograph ------------------------------------------------------
     Both paths hand back a Blob, because that is what the record stores, what
     filesForRecord() names, and what the uploader sends. A native path that
     returned a file URI would push the difference into every one of them. */
  function webPhoto() {
    return new Promise(function (resolve) {
      var el = document.getElementById("camera");
      if (!el) return resolve(null);
      var done = false;
      var onChange = function () {
        el.removeEventListener("change", onChange);
        if (done) return; done = true;
        var f = el.files && el.files[0]; el.value = "";
        resolve(f || null);
      };
      el.addEventListener("change", onChange);
      el.click();
    });
  }

  async function nativePhoto(opts) {
    var Camera = plug("Camera");
    if (!Camera) return webPhoto();
    try {
      var shot = await Camera.getPhoto({
        quality: (opts && opts.quality) || 82,
        allowEditing: false,
        // A Blob is what the rest of the app speaks. Base64 costs a copy and a
        // third again in memory; a URI would leak the platform upward.
        resultType: "base64",
        source: "CAMERA",
        saveToGallery: false,
        correctOrientation: true,     // otherwise a portrait plug prints sideways
        width: (opts && opts.width) || 2048,
      });
      if (!shot || !shot.base64String) return null;
      return b64ToBlob(shot.base64String, "image/" + (shot.format || "jpeg"));
    } catch (e) {
      /* A cancelled camera and a broken camera arrive as the same rejection.
         Neither is worth a dialog — the inspector either tries again or does
         not, and a modal in front of a running round is worse than silence. */
      return null;
    }
  }

  /* Photographs the phone already has. Inside the shell this is the platform
     picker, which hands back several at once and keeps the orientation the
     WebView file input drops. Outside it — or with the plugin missing — it
     returns null rather than a substitute, and the caller uses its own file
     input. Two paths that both work beats one path that half works, and a null
     here is the app's cue to take the other one.

     Never resolves to a Blob the caller did not ask for: a cancelled picker and
     an absent plugin both come back empty-handed, and they are told apart by
     [] against null. */
  async function nativePick(opts) {
    var Camera = plug("Camera");
    if (!NATIVE || !Camera || typeof Camera.pickImages !== "function") return null;
    var limit = Math.max(1, (opts && opts.limit) || 10);
    try {
      var res = await Camera.pickImages({ quality: (opts && opts.quality) || 82, limit: limit });
      var picked = (res && res.photos) || [];
      var out = [];
      for (var i = 0; i < picked.length && out.length < limit; i++) {
        var b = await oneToBlob(picked[i]);
        if (b) out.push(b);
      }
      return out;
    } catch (e) {
      return [];                                  // cancelled, or denied — not an error
    }
  }

  /* pickImages hands back a webPath most of the time and base64 when the caller
     asked for it; older builds do one or the other. Read whichever arrived. */
  async function oneToBlob(ph) {
    if (!ph) return null;
    if (ph.base64String) return b64ToBlob(ph.base64String, "image/" + (ph.format || "jpeg"));
    var src = ph.webPath || ph.path;
    if (!src) return null;
    try {
      var r = await fetch(src);
      if (!r.ok) return null;
      var blob = await r.blob();
      return blob.type ? blob : new Blob([blob], { type: "image/" + (ph.format || "jpeg") });
    } catch (e) { return null; }
  }

  function b64ToBlob(b64, type) {
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: type || "image/jpeg" });
  }

  /* ---- 2. where the bytes live ---------------------------------------------
     On the web, photographs live in IndexedDB with the record, which is simple
     and survives everything the browser does. Natively they belong on the
     filesystem, with the record holding a path — a 36-point undercarriage round
     with four photographs a point is over a hundred files and several hundred
     megabytes, and no browser storage is meant to hold that.

     Not switched on yet: doing so changes the record shape, and that has to
     happen in one deliberate migration rather than as a side effect of
     installing a shell. The interface exists now so the capture code is already
     calling through it when that day comes. */
  var Files = {
    supported: function () { return NATIVE && !!plug("Filesystem"); },
    async write(path, blob) {
      var FS = plug("Filesystem");
      if (!FS) throw new Error("no filesystem");
      var b64 = await blobToB64(blob);
      await FS.writeFile({ path: path, data: b64, directory: "DATA", recursive: true });
      return path;
    },
    async read(path) {
      var FS = plug("Filesystem");
      if (!FS) throw new Error("no filesystem");
      var r = await FS.readFile({ path: path, directory: "DATA" });
      return b64ToBlob(r.data, "image/jpeg");
    },
    async remove(path) {
      var FS = plug("Filesystem");
      if (!FS) return;
      try { await FS.deleteFile({ path: path, directory: "DATA" }); } catch (e) {}
    },
  };
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  /* ---- 3. is there actually a network? --------------------------------------
     navigator.onLine answers "is an interface attached", which in a pit is yes
     while every request times out. Capacitor's Network plugin knows the
     connection type and, on both platforms, reports changes that onLine never
     fires — coming back into coverage on the same cellular connection being the
     one that matters. Build 69 works around its absence with a retry timer;
     this makes the timer a backstop rather than the mechanism. */
  var Net = {
    async status() {
      var N = plug("Network");
      if (N) {
        try {
          var s = await N.getStatus();
          return { online: !!s.connected, type: s.connectionType || "unknown", real: true };
        } catch (e) {}
      }
      return { online: !!navigator.onLine, type: "unknown", real: false };
    },
    /* fn(status). Returns an unsubscribe. On the web this is the pair of window
       events, which is the best available and is why the timer stays. */
    onChange(fn) {
      var N = plug("Network");
      if (N && N.addListener) {
        var h = N.addListener("networkStatusChange", function (s) {
          fn({ online: !!s.connected, type: s.connectionType || "unknown", real: true });
        });
        return function () { try { h.remove ? h.remove() : (h.then && h.then(function (x) { x.remove(); })); } catch (e) {} };
      }
      var on = function () { fn({ online: true, type: "unknown", real: false }); };
      var off = function () { fn({ online: false, type: "unknown", real: false }); };
      global.addEventListener("online", on);
      global.addEventListener("offline", off);
      return function () {
        global.removeEventListener("online", on);
        global.removeEventListener("offline", off);
      };
    },
  };

  /* ---- 4. where the machine is ---------------------------------------------- */
  var Geo = {
    async here(timeoutMs) {
      var G = plug("Geolocation");
      if (G) {
        try {
          var pos = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: timeoutMs || 8000 });
          return { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
        } catch (e) { return null; }
      }
      if (!navigator.geolocation) return null;
      return new Promise(function (res) {
        var done = false;
        var t = setTimeout(function () { if (!done) { done = true; res(null); } }, timeoutMs || 8000);
        navigator.geolocation.getCurrentPosition(
          function (p) { if (done) return; done = true; clearTimeout(t);
            res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); },
          function () { if (done) return; done = true; clearTimeout(t); res(null); },
          { enableHighAccuracy: true, timeout: timeoutMs || 8000 });
      });
    },
  };

  /* ---- 5. handing the report to somebody ------------------------------------
     A download in a native shell lands somewhere the inspector cannot find. The
     share sheet is the whole point: the PDF goes straight into the message they
     were going to send anyway. */
  var Share = {
    can: function () { return !!(plug("Share") || (navigator.share && navigator.canShare)); },
    async file(blob, filename, title) {
      var S = plug("Share"), FS = plug("Filesystem");
      if (S && FS) {
        try {
          var b64 = await blobToB64(blob);
          var w = await FS.writeFile({ path: filename, data: b64, directory: "CACHE", recursive: true });
          await S.share({ title: title || filename, files: [w.uri] });
          return true;
        } catch (e) { /* fall through to the web path */ }
      }
      try {
        var f = new File([blob], filename, { type: blob.type || "application/octet-stream" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          await navigator.share({ files: [f], title: title || filename });
          return true;
        }
      } catch (e) {}
      // last resort, and the normal path on a desktop browser
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return false;
    },
  };

  /* ---- 6. what the app is running inside ------------------------------------
     Not for branching behaviour — for saying so on the System page, and for the
     diagnostics an inspector reads out over the radio when something is wrong. */
  function where() {
    var standalone = !!(global.matchMedia && global.matchMedia("(display-mode: standalone)").matches)
      || global.navigator.standalone === true;
    return {
      native: NATIVE,
      platform: NATIVE ? (Cap.getPlatform ? Cap.getPlatform() : "native") : "web",
      installed: standalone,
      label: NATIVE ? ("app · " + (Cap.getPlatform ? Cap.getPlatform() : "native"))
        : standalone ? "home screen" : "browser",
    };
  }

  global.CMNative = {
    get native() { return NATIVE; },
    where: where,
    photo: function (opts) { return NATIVE ? nativePhoto(opts) : webPhoto(); },
    pick: nativePick,
    files: Files,
    net: Net,
    geo: Geo,
    share: Share,
    _b64ToBlob: b64ToBlob,
    _blobToB64: blobToB64,
  };
})(typeof window !== "undefined" ? window : this);
