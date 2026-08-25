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

  /* ---- where a browser that has never been set up gets its settings ----

     Opening the dashboard on a new machine used to mean somebody pasting an
     /exec URL before a single inspection appeared — a step nobody remembers,
     on a link handed round a mine site, and the reason "have you set it up?"
     was the first question about every new laptop.

     The phones have never had that problem: they read mobile/upload-defaults.js
     on first open. The dashboard now reads the same file, so one place
     configures both and a link is all anybody needs.

     Two ways in, in order of precedence:

       1. Settings already saved in THIS browser — always win, so a machine
          pointed at a different folder stays pointed there.
       2. ?src= / ?k= on the link — a one-time hand-off, stored and then wiped
          from the address bar. This is the route that works when the site is
          NOT public, because the credential travels in the link rather than in
          a served file.
       3. mobile/upload-defaults.js — whatever the phones are using.

     Worth being plain about what (3) costs: that file is served to anyone who
     opens the site, so the write credential in it is public — which is already
     true today, because every phone fetches it. Reading it here adds no new
     exposure, and the file says so at the top. If the site is ever put behind
     an access gate, route (2) is the one to switch to. */
  function builtIn() {
    try {
      /* A changeover in progress outranks the built-in list. `swap` names an
         endpoint being retired and the one replacing it, and the phones act on
         it themselves — so a dashboard reading `dests` would be the last thing
         in the system still pointed at the old backend, which on the
         measurements that prompted the move is a 72-second read against 315 ms.
         Nobody would call that a misconfiguration; they would call the
         dashboard slow. */
      const sw = (window.UPLOAD_DEFAULTS || {}).swap;
      if (sw && sw.to && sw.id) return { url: String(sw.to).trim(), sec: String(sw.sec || "") };
      const d = ((window.UPLOAD_DEFAULTS || {}).dests || [])
        .find(x => x && x.id === "gas" && String(x.url || "").trim());
      return d ? { url: String(d.url).trim(), sec: String(d.sec || "") } : null;
    } catch (e) { return null; }
  }

  /* And a dashboard somebody already pointed at the old endpoint moves too,
     once, exactly as a phone does — same `from` so it only touches a browser
     actually on the retired URL, same "remember only once it happened", so a
     machine deliberately left on the old backend during the changeover still
     moves when it is put back.

     Without this the browsers that were configured are the ones left behind:
     the office machines somebody set up carefully, which are precisely the
     ones people judge the system by. */
  (function swapSaved() {
    try {
      const sw = (window.UPLOAD_DEFAULTS || {}).swap;
      if (!sw || !sw.to || !sw.id) return;
      if (localStorage.getItem("cm_swap_off") || localStorage.getItem("cm_swap_" + sw.id)) return;
      const saved = localStorage.getItem(LS_URL);
      if (saved === null) return;                       // never set — builtIn() covers it
      const cur = String(saved).trim();
      if (!cur || cur === String(sw.to).trim()) return; // cleared on purpose, or already there
      if (sw.from && cur.indexOf(String(sw.from)) !== 0) return;
      localStorage.setItem(LS_URL, String(sw.to).trim());
      localStorage.setItem(LS_SEC, String(sw.sec || ""));
      /* The cursor counts from the OLD folder's clock. Carrying it across means
         the first read asks for "everything since a moment that never happened
         here" and quietly returns nothing — an empty dashboard on a backend
         holding every round. */
      localStorage.removeItem(LS_CUR);
      localStorage.setItem("cm_swap_" + sw.id, "1");
    } catch (e) {}
  })();
  /* "Never set" and "deliberately turned off" are different answers and the
     difference is load-bearing. The dashboard is usable with no Drive at all —
     an entries.json imported from a phone, records held in this browser only —
     and the first version of this could not express that: clearing the URL just
     let the shared default reassert itself, so a machine that had been told to
     work offline silently went back to talking to the live folder.

     null  = nothing has ever been set here     → take the shared default
     ""    = somebody cleared it on purpose     → no Drive, and it stays that way
     a URL = this browser's own setting         → use it */
  const cfg = () => {
    const saved = localStorage.getItem(LS_URL);
    if (saved !== null) return { url: saved.trim(), sec: localStorage.getItem(LS_SEC) || "" };
    return builtIn() || { url: "", sec: "" };
  };
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

  /* ---- 1. pull the inspections ----

     Two ways in. The fast one asks the script for its index — a file it keeps
     up to date as rounds arrive — and gets every inspection back in one reply.
     Measured against a season of Baimskaya (900 rounds, 2700 photographs): the
     old read cost 1236 Drive round trips for the first page alone, was
     truncated at 600 records, and needed a second page for 634 more. The index
     answers the whole thing in 11, and answers "nothing new" in none at all.

     The slow one is exactly what shipped before, kept because a deployment
     that has not been redeployed must keep working. */
  const LS_IDX = "cm_drive_index";     // "1" / "0": does this /exec have an index?
  const idxCap = () => { const v = localStorage.getItem(LS_IDX); return v === null ? null : v === "1"; };
  const setIdxCap = v => { try { v === null ? localStorage.removeItem(LS_IDX)
                                            : localStorage.setItem(LS_IDX, v ? "1" : "0"); } catch (e) {} };

  async function loadViaIndex(onProgress, opts) {
    const say = (m) => onProgress && onProgress(m);
    let at = opts.full ? 0 : cursor();
    const recs = [], eds = [], cons = [], defs = [];
    let pages = 0, shards = 0;
    for (;;) {
      const r = await api({ action: "index", since: at });
      if (!r.v) return null;                       // not an index reply — older deployment
      if (r.needsRebuild) return { needsRebuild: true };
      pages++;
      (r.records || []).forEach(x => recs.push(x));
      (r.edits || []).forEach(x => eds.push(x));
      (r.conflicts || []).forEach(x => cons.push(x));
      (r.deferrals || []).forEach(x => defs.push(x));
      shards = r.shards || shards;
      if (r.upToDate) { at = r.at || at; break; }
      if (!r.truncated) { at = r.at || at; break; }
      at = r.cursor;
      if (pages >= MAX_PAGES) break;
      say(`Reading inspections… ${recs.length} so far`);
    }
    /* The index carries the file ids, so the photo index no longer needs its own
       download: a record knows which file it is, and its pictures are found by
       name against the folder listing only when a unit is actually opened. */
    if (recs.length || opts.full) window.CMDash.setDriveRecords(recs, { replace: !!opts.full });
    if (eds.length || opts.full) window.CMDash.setEdits(eds, { replace: !!opts.full });
    if (cons.length || opts.full) window.CMDash.setConflicts(cons, { replace: !!opts.full });
    /* Rounds nobody walked, and why. They arrive on the same read as the
       corrections because they are the same kind of thing: something somebody
       said ABOUT a round, filed beside it rather than inside it. */
    if (defs.length || opts.full) window.CMDash.setDeferrals(defs, { replace: !!opts.full });
    try { localStorage.setItem(LS_CUR, String(at)); } catch (e) {}
    return { records: recs.length, edits: eds.length, conflicts: cons.length,
             held: window.CMDash.driveCount(), shards, pages, viaIndex: true,
             incremental: !opts.full && pages > 0 };
  }

  /* Build the index for a folder that predates it. This is the expensive read
     the index abolishes, run once — and run HERE, on a desk with mains power
     and a real link, never on a phone in the pit. Resumable because 900 rounds
     is more Drive work than one Apps Script execution is allowed. */
  async function buildIndex(onProgress) {
    const say = (m) => onProgress && onProgress(m);
    let after = 0, done = 0, calls = 0;
    for (;;) {
      const r = await api({ action: "index", rebuild: 1, after });
      calls++; done += r.done || 0; after = r.cursor || after;
      say(`Indexing the folder… ${done} rounds` + (r.pending ? `, ${r.pending} to go` : ""));
      if (!r.building) break;
      if (calls >= 60) break;                      // a folder this size is a different problem
    }
    setIdxCap(true);
    return { indexed: done, calls };
  }

  async function load(onProgress, opts) {
    opts = opts || {};
    const say = (m) => onProgress && onProgress(m);
    if (opts.full) { index = {}; fetched = {}; localStorage.removeItem(LS_CUR); }

    if (idxCap() !== false && !legacy) {
      try {
        say(cursor() && !opts.full ? "Checking Drive for new inspections…" : "Reading the index…");
        let r = await loadViaIndex(onProgress, opts);
        if (r && r.needsRebuild) {
          await buildIndex(onProgress);
          r = await loadViaIndex(onProgress, opts);
        }
        if (r && !r.needsRebuild) { setIdxCap(true); return Object.assign({ files: 0, photos: 0 }, r); }
        setIdxCap(false);
      } catch (e) {
        // An /exec without the index says "Unknown action". Anything else is a
        // real failure and must not be hidden behind a slower path that will
        // hit it too — but the slow path is strictly more compatible, so try it.
        setIdxCap(false);
      }
    }

    const resuming = !opts.full && !!cursor();
    let at = opts.full ? 0 : cursor();
    say(resuming ? "Checking Drive for new inspections…" : "Reading inspections from Drive…");

    const recs = [], eds = [], cons = [], defs = [];
    let pages = 0, failed = 0, files = 0, photos = 0, truncated = false, pending = 0;

    try {
      for (;;) {
        // The photo index only needs to come down once per load, not per page.
        const r = await api({ action: "records", after: at, index: pages === 0 ? 1 : 0 });
        pages++;
        (r.records || []).forEach(x => recs.push(x));
        (r.edits || []).forEach(x => eds.push(x));
        (r.conflicts || []).forEach(x => cons.push(x));
        (r.deferrals || []).forEach(x => defs.push(x));
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
    /* Rounds nobody walked, and why. They arrive on the same read as the
       corrections because they are the same kind of thing: something somebody
       said ABOUT a round, filed beside it rather than inside it. */
    if (defs.length || opts.full) window.CMDash.setDeferrals(defs, { replace: !!opts.full });
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
        // The whole range the phone can produce, not the first five: it stopped
        // at _4 and never asked for the video, so a position with eight photos
        // and a clip had three photos and the clip left behind on Drive. Every
        // candidate is checked against the index before it becomes a request,
        // so a longer list costs lookups, not round trips.
        for (const nm of window.CMDash.photoNames(base, rec)) {
          if (index[nm] && !(nm in fetched)) names.push(nm);
        }
        for (const nm of window.CMDash.videoNames(base, rec)) {
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

  /* ---- the media cache ----
     A Drive file id names one immutable file, so anything fetched once never
     needs fetching again — but `fetched` lived in memory and died with the tab.
     Every reload re-pulled every photograph, base64-encoded through Apps
     Script at a third over its real size, five at a time. Opening the same
     unit twice in a morning cost the same minute twice.

     Cache Storage survives the reload, so the second visit is disk-speed. It
     is best-effort throughout: no secure context, no quota, a browser that
     refuses — every path falls back to the network rather than failing. */
  /* How many files this deployment will hand over in one request, learned by
     asking and remembered. 1 means "one at a time", which is what every /exec
     did before this. */
  const LS_MB = "cm_drive_media_batch";
  const mediaBatch = () => Math.max(1, Number(localStorage.getItem(LS_MB) || 8) || 1);
  const setMediaBatch = n => { try { localStorage.setItem(LS_MB, String(n)); } catch (e) {} };

  const MEDIA_CACHE = "cm-media-v1";
  const MEDIA_CAP = 1500;                 // files; ~immutable, so FIFO is enough
  async function cacheGet(id) {
    try {
      const c = await caches.open(MEDIA_CACHE);
      const r = await c.match("/cm-media/" + id);
      return r ? URL.createObjectURL(await r.blob()) : null;
    } catch (e) { return null; }
  }
  async function cachePut(id, blob) {
    try {
      const c = await caches.open(MEDIA_CACHE);
      await c.put("/cm-media/" + id, new Response(blob));
      /* Bounded, or a year of rounds fills the disk quietly. Keys come back in
         insertion order, so dropping from the front is oldest-first. */
      const keys = await c.keys();
      if (keys.length > MEDIA_CAP)
        for (const k of keys.slice(0, keys.length - MEDIA_CAP)) await c.delete(k);
    } catch (e) { /* a full disk must not stop the picture being shown */ }
  }

  /* Which file is which photograph.

     The old read shipped this with every load — 2700 names and ids for a season,
     downloaded to a browser that will open four units. The index path leaves it
     out and fetches it here instead: once, the first time somebody actually
     opens a unit, and never on a visit that only reads the charts. */
  let mediaIndexAt = 0;
  const MEDIA_INDEX_TTL = 5 * 60 * 1000;
  async function ensureMediaIndex() {
    /* The records path brings its own index down with the first page, and has
       always done. Only the index path arrives without one — so this must not
       re-fetch what a load already provided, or every dashboard pays a folder
       listing it does not need. */
    const have = Object.keys(index).length;
    if (have && !mediaIndexAt) return;                       // came with the records
    if (have && Date.now() - mediaIndexAt < MEDIA_INDEX_TTL) return;
    try {
      const all = await api({ action: "list" });
      (all.files || []).forEach(f => { index[f.name] = { id: f.id, size: f.size }; });
      mediaIndexAt = Date.now();
    } catch (e) { /* no index means no pictures, not a broken page */ }
  }

  async function ensurePhotos(recs, onProgress) {
    if (!configured()) return 0;
    await ensureMediaIndex();
    const names = wanted(recs);
    if (!names.length) return 0;
    /* Lead frames first. A position's first photograph is the one on the card;
       the other nine are behind a thumbnail nobody has clicked yet. Fetching
       them in name order meant eight photographs of position one arrived before
       the first photograph of position two, so the page filled top-down at one
       card a second instead of showing every card at once. */
    const lead = n => /(_1)?\.[A-Za-z0-9]+$/.test(n) && !/_(?:[2-9]|10)\./.test(n);
    names.sort((a, b) => (lead(a) ? 0 : 1) - (lead(b) ? 0 : 1));

    /* What is already on this disk costs nothing and should not be queued
       behind what is not. Separating them also means the batch below carries
       only real misses, so a unit opened twice in a morning makes no requests
       at all the second time. */
    const miss = [];
    for (const nm of names) {
      const url = await cacheGet(index[nm].id);
      if (url) { fetched[nm] = url; window.CMDash.addPhoto(nm, url); }
      else miss.push(nm);
    }
    if (!miss.length) { if (onProgress) onProgress(names.length, names.length); return names.length; }

    /* Several photographs to a request where the deployment allows it. Each one
       used to be its own Apps Script invocation — a script start and a round
       trip for a thumbnail — which is why the pool that limits it to five at a
       time exists. Asked for together they cost one of each. */
    const per = mediaBatch();
    let done = names.length - miss.length;
    const groups = [];
    for (let i = 0; i < miss.length; i += per) groups.push(miss.slice(i, i + per));

    await pool(groups, async (grp) => {
      const ids = grp.map(nm => index[nm].id);
      let got = null;
      if (per > 1) {
        try {
          const r = await api({ action: "files", ids: ids.join(",") });
          got = {};
          (r.files || []).forEach(f => { if (f.ok) got[f.id] = f; });
        } catch (e) { got = null; setMediaBatch(1); }   // older deployment; stop asking
      }
      for (let k = 0; k < grp.length; k++) {
        const nm = grp[k], id = ids[k];
        try {
          const f = got ? got[id] : await api({ action: "file", id });
          if (!f || !f.data) { fetched[nm] = null; continue; }
          const blob = b64ToBlob(f.data, f.mime);
          cachePut(id, blob);                      // not awaited: the picture goes up now
          const url = URL.createObjectURL(blob);
          fetched[nm] = url;
          window.CMDash.addPhoto(nm, url);
        } catch (e) { fetched[nm] = null; }        // remember the failure, don't retry forever
        if (onProgress) onProgress(++done, names.length);
      }
    });
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

  /* Put one picture into Drive under a name the dashboard will find again.
     The same `batch` op the phones use, so nothing new has to be deployed to
     the Apps Script for a photograph added from a desk. */
  async function putMedia(name, file) {
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = () => rej(new Error("Could not read the file"));
      r.readAsDataURL(file);
    });
    const j = await post({ op: "batch", files: [{ name, mime: file.type || "image/jpeg", data }] });
    if (j && j.failed && j.failed.length) throw new Error(j.failed[0].error || "Upload refused");
    /* Into the index and the cache at once, so it is on screen before the next
       refresh rather than after it. */
    /* Drive may hand back a different name than the one asked for — another
       phone can already own it, and placeUpload_ renames rather than
       overwriting somebody else's photograph. Index what actually landed. */
    const rec = (j && j.saved && j.saved[0]) || {};
    const real = rec.name || name;
    const url = URL.createObjectURL(file);
    if (rec.id) { index[real] = { id: rec.id, size: file.size }; cachePut(rec.id, file); }
    fetched[real] = url;
    window.CMDash.addPhoto(real, url);
    return { name: real, url, id: rec.id || null };
  }

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
    /* And whether the fast read is there at all.

       Somebody who has just pasted a new version of the script has no way to
       see whether the deploy took — "Version: New version" is easy to miss in
       that dialog, and a save alone changes nothing. Ask the deployment
       directly, here, where they are already looking. `built` is the second
       half of the answer: the actions exist, but the folder has not been walked
       into an index yet, which the next load does by itself. */
    let index = false, built = false;
    try {
      const r2 = await api({ action: "index", slim: 1, since: 1 });
      index = !!r2.v;
      built = index && !r2.needsRebuild;
    } catch (e) { index = false; }

    // A deployment older than this flag reports undefined, which the dashboard
    // reads as "cannot tell" rather than as "off".
    return { folder: j.folder || "(unnamed)", batch, canDelete: j.canDelete, write, writeErr,
             index, built };
  }

  window.CMDrive = {
    load, ensurePhotos, configured, ping, saveEdit, remove, resolve, putMedia,
    /* "Is this name already taken on Drive?" — asked before choosing the next
       _N for an added photograph, so one added from another desk yesterday is
       not overwritten by one added from this desk today. */
    hasName: (n) => !!index[n],
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
