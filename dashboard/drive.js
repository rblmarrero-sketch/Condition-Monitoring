/* ============================================================================
   Condition Monitoring — read inspections straight out of Google Drive
   ----------------------------------------------------------------------------
   For a PC where IT will not allow Google Drive for desktop. Everything comes
   over plain HTTPS from the same Apps Script /exec URL the phones upload to —
   nothing to install, no synced folder.

     GET ?action=records[&after=<ms>]  → every inspection in ONE reply, plus an
                                         index of the photo file names
     GET ?action=file&id=…             → one file as base64, fetched on demand

   Why one call and not one per file: the folder holds a sidecar per inspection,
   so the obvious "list, then fetch each" costs a few hundred round trips and a
   few hundred Apps Script invocations against a ~90 min/day quota — every time
   somebody opens the dashboard, re-reading files that never changed. The loop
   now runs inside Apps Script, where Drive is local.

   `after` makes a refresh nearly free: the cursor from the last reply comes
   back with the next request and only genuinely new inspections travel. A
   deleted file cannot be noticed that way, so a full reload is offered too.

   Photos are NOT pulled up front — a month of rounds is hundreds of megabytes.
   Only the names are indexed; bytes are fetched for the unit you open or the
   report you generate.

   Requests are plain GETs with no custom headers, so no CORS preflight — an
   Apps Script web app cannot answer one. The secret rides in the query string.
   ========================================================================== */
(function () {
  "use strict";

  const LS_URL = "cm_drive_url", LS_SEC = "cm_drive_sec", LS_CUR = "cm_drive_cursor";
  const POOL = 5;                       // parallel photo fetches; Apps Script is rate-limited
  const MAX_PAGES = 25;                 // a very large first load still terminates

  let index = {};                       // file name -> {id, size}
  let fetched = {};                     // file name -> objectURL (or null if it failed)
  let legacy = false;                   // deployed script predates ?action=records

  const cfg = () => ({ url: (localStorage.getItem(LS_URL) || "").trim(),
                       sec: localStorage.getItem(LS_SEC) || "" });
  const configured = () => !!cfg().url;
  const cursor = () => Number(localStorage.getItem(LS_CUR) || 0) || 0;

  function api(params) {
    const c = cfg();
    if (!c.url) throw new Error("No Drive URL configured.");
    const q = new URLSearchParams(Object.assign({}, params, c.sec ? { secret: c.sec } : {}));
    return fetch(c.url + (c.url.indexOf("?") < 0 ? "?" : "&") + q.toString(), { method: "GET" })
      .then(async r => {
        const text = await r.text();
        let j = null; try { j = JSON.parse(text); } catch (e) {}
        if (!j) throw (r.ok
          ? new Error("Unexpected reply — check the deployment's “Who has access” is Anyone.")
          : notJSON(r.status, text));
        if (j.ok === false) throw new Error(j.error || "Drive refused the request");
        return j;
      });
  }

  /* run tasks with a small concurrency cap so Apps Script is not hammered */
  async function pool(items, worker, onStep) {
    let i = 0, done = 0;
    const runners = Array.from({ length: Math.min(POOL, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        try { await worker(items[n], n); } catch (e) { /* reported per item */ }
        if (onStep) onStep(++done, items.length);
      }
    });
    await Promise.all(runners);
  }

  const b64ToBlob = (b64, mime) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return new Blob([u], { type: mime || "application/octet-stream" });
  };

  /* ---- 1. pull the inspections ---- */
  async function load(onProgress, opts) {
    opts = opts || {};
    const say = (m) => onProgress && onProgress(m);
    if (opts.full) { index = {}; fetched = {}; localStorage.removeItem(LS_CUR); }

    const resuming = !opts.full && !!cursor();
    let at = opts.full ? 0 : cursor();
    say(resuming ? "Checking Drive for new inspections…" : "Reading inspections from Drive…");

    const recs = [], eds = [], cons = [];
    let pages = 0, failed = 0, files = 0, photos = 0, truncated = false, pending = 0;

    try {
      for (;;) {
        // The photo index only needs to come down once per load, not per page.
        const r = await api({ action: "records", after: at, index: pages === 0 ? 1 : 0 });
        pages++;
        (r.records || []).forEach(x => recs.push(x));
        (r.edits || []).forEach(x => eds.push(x));
        (r.conflicts || []).forEach(x => cons.push(x));
        (r.index || []).forEach(f => { index[f.name] = { id: f.id, size: f.size }; });
        failed += r.failed || 0;
        files = r.files || files;
        photos = r.photos || photos;
        pending = r.pending || 0;
        if (r.cursor) at = r.cursor;
        if (!r.truncated) { pending = 0; break; }
        if (pages >= MAX_PAGES) { truncated = true; break; }
        say(`Reading inspections… ${recs.length} so far, ${pending} to go`);
      }
    } catch (e) {
      // An /exec deployed before the batch action exists says so — fall back
      // rather than leaving the user staring at an error they cannot act on.
      if (/unknown action/i.test(e.message || "")) { legacy = true; return legacyLoad(onProgress); }
      throw e;
    }

    // Commit the cursor only once the records are actually in, or a failure
    // here would silently skip those inspections on every future refresh.
    if (recs.length || opts.full) window.CMDash.setDriveRecords(recs, { replace: !!opts.full });
    if (eds.length || opts.full) window.CMDash.setEdits(eds, { replace: !!opts.full });
    if (cons.length || opts.full) window.CMDash.setConflicts(cons, { replace: !!opts.full });
    try { localStorage.setItem(LS_CUR, String(at)); } catch (e) {}

    const held = window.CMDash.driveCount();
    return { records: recs.length, edits: eds.length, conflicts: cons.length, held, files, photos, failed,
             truncated, pending, pages, incremental: resuming,
             note: recs.length ? "" : (held ? "" : "No inspections (*.json) in that folder yet.") };
  }

  /* ---- 1b. the old path, for an /exec that has not been redeployed ---- */
  async function legacyLoad(onProgress) {
    const say = (m) => onProgress && onProgress(m);
    say("Listing the Drive folder…");
    const all = await api({ action: "list" });

    index = {};
    all.files.forEach(f => { index[f.name] = { id: f.id, size: f.size }; });

    const sidecars = all.files.filter(f => /\.json$/i.test(f.name));
    if (!sidecars.length) {
      return { records: 0, held: window.CMDash.driveCount(), files: all.files.length,
               truncated: !!all.truncated, legacy: true,
               note: "No inspections (*.json) in that folder yet." };
    }

    const recs = [];
    let bad = 0;
    say(`Reading ${sidecars.length} inspection file(s) one at a time…`);
    await pool(sidecars, async (f) => {
      try {
        const r = await api({ action: "file", id: f.id });
        const j = JSON.parse(new TextDecoder().decode(await b64ToBlob(r.data, "application/json").arrayBuffer()));
        (j.records || []).forEach(x => recs.push(x));
      } catch (e) { bad++; }
    }, (d, n) => say(`Reading inspections… ${d}/${n}`));

    window.CMDash.setDriveRecords(recs, { replace: true });
    return { records: recs.length, held: window.CMDash.driveCount(), files: all.files.length,
             failed: bad, legacy: true,
             photos: all.files.filter(f => /\.(jpe?g|png|webp|mp4|mov)$/i.test(f.name)).length,
             truncated: !!all.truncated };
  }

  /* ---- 2. pull the photos a given set of records needs ---- */
  function wanted(recs) {
    const names = [];
    for (const rec of recs) {
      for (const it of (rec.items || [])) {
        const base = window.CMDash.photoBase(it, rec);
        // The same candidate list the history uses, so a record whose photos were
        // kept under "~DEVICE" after a two-phone clash still gets them fetched.
        for (const nm of window.CMDash.photoNames(base, rec, ["", "_1", "_2", "_3", "_4"])) {
          if (index[nm] && !(nm in fetched)) names.push(nm);
        }
      }
      const stem = `${rec.equip}_${(rec.date || "").split("-").reverse().join(".")}_${rec.type}_SIGN`;
      const dev = String(rec.dev || "");
      for (const sig of (dev ? [`${stem}~${dev}.png`, `${stem}.png`] : [`${stem}.png`]))
        if (index[sig] && !(sig in fetched)) names.push(sig);
    }
    return [...new Set(names)];
  }

  async function ensurePhotos(recs, onProgress) {
    if (!configured()) return 0;
    const names = wanted(recs);
    if (!names.length) return 0;
    await pool(names, async (nm) => {
      try {
        const r = await api({ action: "file", id: index[nm].id });
        const url = URL.createObjectURL(b64ToBlob(r.data, r.mime));
        fetched[nm] = url;
        window.CMDash.addPhoto(nm, url);
      } catch (e) { fetched[nm] = null; }          // remember the failure, don't retry forever
    }, onProgress);
    return names.length;
  }

  /* ---- 3. corrections, voids and deletion ----
     POSTed as text/plain so the browser treats it as a "simple" request: an Apps
     Script web app cannot answer a CORS preflight. Same reason the secret rides
     in the body rather than an Authorization header. */
  /* Google answers a POST that its deployed code cannot handle with a Docs error
     page, and pasting 160 characters of that HTML into the panel tells the
     reader nothing they can act on. Name the cause instead. */
  function notJSON(status, text) {
    const html = /^\s*<(!doctype|html)/i.test(text || "");
    if (html && (status === 404 || status === 405)) return new Error(
      "The deployed script is an older version — it has no doPost, so corrections, "
      + "voids and deletions cannot reach it. Reading works because that half is "
      + "deployed. Fix it in the Apps Script editor: Deploy → Manage deployments → "
      + "✏️ Edit → Version: New version → Deploy. The URL does not change.");
    if (html && (status === 401 || status === 403)) return new Error(
      "Google asked this request to sign in. Set the deployment's “Who has access” "
      + "to Anyone, then deploy a new version.");
    if (html) return new Error(
      "The script answered with a web page instead of data (HTTP " + status + "). "
      + "That is Google's error page, not the script's — re-deploy it and check the "
      + "/exec URL in Data sources is the current one.");
    return new Error("HTTP " + status + " — " + String(text || "").slice(0, 160));
  }

  async function post(body) {
    const c = cfg();
    if (!c.url) throw new Error("No Drive URL configured.");
    const r = await fetch(c.url, { method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ secret: c.sec || "" }, body)) });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    if (!j) throw (r.ok
      ? new Error("Unexpected reply — check the deployment's “Who has access” is Anyone.")
      : notJSON(r.status, text));
    if (j.ok === false) {
      // The script's wording does not say WHICH secret, and the only password
      // on screen is the admin one — so this reads as "wrong admin password"
      // when it means the Shared secret box above is empty.
      if (/bad or missing secret/i.test(j.error || "")) throw new Error(
        "The Shared secret in Data sources is empty or wrong. It must match SECRET in "
        + "the Apps Script — this is not the admin password.");
      throw new Error(j.error || "Drive refused the request");
    }
    return j;
  }

  /* A correction is stored as its own file, never written into the inspection's
     sidecar — the phone still holds that record and re-syncing would erase it. */
  const saveEdit = (payload) => post(Object.assign({ op: "edit" }, payload));

  /* Guarded by ADMIN_SECRET in the Apps Script, which is deliberately not the
     secret the phones carry. Files are trashed, not purged, and logged. */
  const remove = (key, admin, by, reason) =>
    post({ op: "delete", key, admin, by, reason });

  /* Two phones sent the same unit, date and type. Both versions are in Drive;
     this records which one the reports should use. Nothing is deleted, so the
     decision is as reversible as a void. */
  const resolve = (key, keep, by) => post({ op: "resolve", key, keep, by });

  /* Health check without pulling anything: the bare /exec URL reports the folder.
     Also reports whether the fast path is deployed, since the usual reason it is
     not is an edit that was saved but never released as a new version. */
  async function ping(){
    const c = cfg();
    if (!c.url) throw new Error("No Drive URL configured.");
    const r = await fetch(c.url, { method: "GET" });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    if (!j) throw new Error("Unexpected reply — check the deployment's “Who has access” is Anyone.");
    if (j.ok === false) throw new Error(j.error || "Drive refused the request");
    let batch = true;
    // after=<now> so this costs a walk and no file reads whatever is deployed
    try { await api({ action: "records", after: Date.now(), index: 0 }); }
    catch (e) { if (/unknown action/i.test(e.message || "")) batch = false; }
    /* Reading and writing are two halves of the deployment and they fail apart:
       a version deployed before doPost existed still answers every GET, so the
       panel says "connected" and the first correction anybody saves comes back
       as one of Google's error pages. Probe the write path here, where the
       person is already looking, instead of leaving them to find it at the
       moment they are trying to delete something.

       The probe is a POST with no file in it. Any JSON reply proves doPost is
       running — even a refusal, which is what a current deployment sends back.
       Nothing is written either way. */
    let write = true, writeErr = "";
    try { await post({ op: "ping" }); }
    catch (e) {
      const m = (e && e.message) || "";
      // a refusal is an answer: the script is there and it spoke
      if (/older version|web page instead of data|sign in/i.test(m)) { write = false; writeErr = m; }
    }
    // A deployment older than this flag reports undefined, which the dashboard
    // reads as "cannot tell" rather than as "off".
    return { folder: j.folder || "(unnamed)", batch, canDelete: j.canDelete, write, writeErr };
  }

  window.CMDrive = {
    load, ensurePhotos, configured, ping, saveEdit, remove, resolve,
    get url() { return cfg().url; },
    get secret() { return cfg().sec; },
    get legacy() { return legacy; },
    save(url, sec) {
      const changed = (url || "").trim() !== cfg().url;
      localStorage.setItem(LS_URL, (url || "").trim());
      localStorage.setItem(LS_SEC, sec || "");
      // A different folder's cursor means nothing — start that one from scratch.
      if (changed) { localStorage.removeItem(LS_CUR); index = {}; fetched = {}; legacy = false; }
    },
    indexed() { return Object.keys(index).length; },
  };
})();
