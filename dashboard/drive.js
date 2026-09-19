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
  /* The byte count of what was fetched under each name, so a name the index
     now reports at another length — the phone re-sent the file — is fetched
     again instead of shown from memory. */
  let fetchedSize = {};
  let lastFetch = null;                 // what the last ensurePhotos did — asked, cached, fetched, failed[]
  const stale = nm => !!(fetched[nm] && fetchedSize[nm] != null && index[nm]
                         && Number(index[nm].size) > 0 && fetchedSize[nm] !== Number(index[nm].size));
  const need = nm => !!(nm && index[nm] && (!(nm in fetched) || stale(nm)));
  let legacy = false;                   // deployed script predates ?action=records

  /* ---- THE FOLDER'S OBJECT INDEX IS NOT OPTIONAL ------------------------

     `index` is the complete list of file names the folder holds. Everything
     the office says about evidence is measured against it: how many field
     photographs arrived, which inspections are still waiting, whether a
     Critical finding has the picture its work order rests on.

     It was being loaded by accident. The fast path — loadViaIndex(), which is
     the path every configured dashboard now takes — deliberately skipped it,
     because a unit's pictures are only fetched when somebody opens that unit.
     The slow path asked for it once per load, in memory, and a reload threw it
     away. So on a freshly opened dashboard `index` was EMPTY, and the audit,
     finding nothing, reported 314 field photographs expected, none received
     and hundreds missing — while the same scan said no records were waiting
     and every attachment was accounted for.

     Both halves of that were wrong and both came from here. The index is now
     kept on disk between sessions and refreshed on every load, so the audit
     asks the folder rather than asking what this tab happens to have opened. */
  const LS_MED = "cm_drive_media";
  function saveIndex() {
    try { localStorage.setItem(LS_MED, JSON.stringify(index)); }
    catch (e) { try { localStorage.removeItem(LS_MED); } catch (_) {} }
  }
  function restoreIndex() {
    try { const v = JSON.parse(localStorage.getItem(LS_MED) || "null");
          if (v && typeof v === "object" && !Array.isArray(v)) index = v; } catch (e) {}
  }
  restoreIndex();

  /* One request, whatever else the load did. `after` past every timestamp the
     folder can hold means no sidecar is read and no cursor moves — the reply
     is the file listing and nothing else. It costs one call and it is the only
     thing standing between this dashboard and a confident wrong answer.

     Never clears what it has on a failure: an index that could not be
     refreshed is stale, and stale is a great deal better than absent. */
  /* AND SAYS WHEN IT COULD NOT.

     The number this returned on a failure was the size of the listing it
     already had — the same number, in the same place, as a listing it had
     just fetched. Nothing downstream could tell "the folder holds 434 files"
     from "the folder held 434 files the last time anybody managed to ask",
     so the evidence panel went on saying "missing" against a listing that
     could be a day old, with no word that it was. Stale is still better
     than absent, and the index is still kept; what changes is that the
     staleness is now a fact the panel can read (`mediaIndexState`) rather
     than one it cannot. */
  let mediaState = { at: 0, fresh: false, err: "", n: 0 };
  try {
    const v = JSON.parse(localStorage.getItem(LS_MED + "_at") || "null");
    if (v && typeof v === "object") mediaState = { at: Number(v.at) || 0, fresh: false, err: "", n: Object.keys(index).length };
  } catch (e) {}
  /* WHETHER THIS SESSION HAS ASKED, SEPARATE FROM WHETHER IT LIKED THE ANSWER.
     `fresh` only ever turns true on a genuine success — so a browser that has
     never yet completed one this session, or whose one attempt just failed,
     reads exactly like a browser that has not asked at all. A caller that
     waits for `fresh` before trusting `hasName` therefore waits forever on a
     failing link, which is worse than the stale-but-present answer this
     module already keeps for exactly that case (see the "stale beats absent"
     note above `refreshMediaIndex`). `tried` flips the moment a refresh is
     ATTEMPTED, not once it settles, so a caller can say "we asked; trust
     whatever came back, cache or fresh or failed" without ever blocking on a
     link that never answers. */
  let refreshTried = false;
  function mediaIndexState() {
    return { at: mediaState.at, fresh: !!mediaState.fresh, err: mediaState.err || "", n: Object.keys(index).length, tried: refreshTried };
  }
  async function refreshMediaIndex() {
    refreshTried = true;
    try {
      const r = await api({ action: "records", after: 9e15, index: 1 });
      const list = r.index || [];
      if (!Array.isArray(r.index)) {
        mediaState = { at: mediaState.at, fresh: false, err: "the backend sent no file index", n: Object.keys(index).length };
        return Object.keys(index).length;
      }
      const next = {};
      list.forEach(f => { if (f && f.name) next[f.name] = { id: f.id, size: f.size }; });
      index = next;
      saveIndex();
      mediaState = { at: Date.now(), fresh: true, err: "", n: list.length };
      try { localStorage.setItem(LS_MED + "_at", JSON.stringify({ at: mediaState.at })); } catch (e) {}
      return list.length;
    } catch (e) {
      mediaState = { at: mediaState.at, fresh: false, err: String((e && e.message) || e || "no answer"), n: Object.keys(index).length };
      return Object.keys(index).length;
    }
  }

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
    const recs = [], eds = [], cons = [], defs = [], dels = [];
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
      (r.deleted || []).forEach(x => dels.push(x));
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
    /* A ROUND THE OFFICE DELETED IS DELETED EVERYWHERE.

       The backend has sent these markers for a year and this loader dropped
       them on the floor. Only the browser that pressed Delete removed the
       round locally (dropLocal); a second desk on an incremental cursor kept
       it in every count, every report and the schedule's "done" for as long
       as its cache lived. The phone applies the same markers correctly
       (teamGone), so the pit and the office disagreed about whether a round
       existed. */
    if (dels.length) window.CMDash.setDeleted(dels);
    try { localStorage.setItem(LS_CUR, String(at)); } catch (e) {}
    return { records: recs.length, edits: eds.length, conflicts: cons.length, deleted: dels.length,
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
    /* `fetched` is bytes and may go; `index` is the folder's own listing and
       is refreshed below rather than emptied, so no window exists in which the
       audit is measuring against nothing. */
    if (opts.full) { fetched = {}; localStorage.removeItem(LS_CUR); }

    if (idxCap() !== false && !legacy) {
      try {
        say(cursor() && !opts.full ? "Checking Drive for new inspections…" : "Reading the index…");
        let r = await loadViaIndex(onProgress, opts);
        if (r && r.needsRebuild) {
          await buildIndex(onProgress);
          r = await loadViaIndex(onProgress, opts);
        }
        if (r && !r.needsRebuild) {
          setIdxCap(true);
          /* The index path answers "which rounds" and says nothing about
             files. The evidence audit needs both, so ask for the object
             listing here rather than letting the office measure the folder
             against an empty set. */
          say("Reading the file index…");
          const photos = await refreshMediaIndex();
          return Object.assign({ files: 0, photos }, r);
        }
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

    const recs = [], eds = [], cons = [], defs = [], dels = [];
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
        (r.deleted || []).forEach(x => dels.push(x));
        /* THIS IS ALSO A FRESH ANSWER, NOT ONLY refreshMediaIndex()'S OWN.
           An ordinary records pull carries the same file index on page 0
           (see the comment above) — most sessions never open the Sync tab
           at all, so if only refreshMediaIndex() could mark the index
           trustworthy, `orphanPhotos()` would defer EVERY genuinely-missing
           call to LOADING for the whole session on the common path, not
           just the moment right after boot. An index is answered the
           instant a request that ASKED for one (`index: pages === 0 ? 1 : 0`)
           comes back, wherever it came down. */
        if (Array.isArray(r.index)) { refreshTried = true; mediaState = { at: Date.now(), fresh: true, err: "", n: r.index.length }; }
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
    /* A ROUND THE OFFICE DELETED IS DELETED EVERYWHERE.

       The backend has sent these markers for a year and this loader dropped
       them on the floor. Only the browser that pressed Delete removed the
       round locally (dropLocal); a second desk on an incremental cursor kept
       it in every count, every report and the schedule's "done" for as long
       as its cache lived. The phone applies the same markers correctly
       (teamGone), so the pit and the office disagreed about whether a round
       existed. */
    if (dels.length) window.CMDash.setDeleted(dels);
    try { localStorage.setItem(LS_CUR, String(at)); } catch (e) {}
    /* A page-0 reply carries the whole listing, but an incremental load that
       fetched nothing new carries none — and the audit needs it either way. */
    if (!Object.keys(index).length) await refreshMediaIndex(); else saveIndex();

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
    saveIndex();

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
        /* The manifest names this point's files outright. Without it the list
           below is built from the point KEY, so a photograph on a keyless
           point was never even requested — it could not be displayed, so it
           could not be classified, so it stayed on the correction list. */
        for (const e of (Array.isArray(it && it.att) ? it.att : [])) {
          const key = String((e && e.serverObjectId) || "");
          const nm = key ? key.split("/").pop() : String((e && e.storedName) || "");
          if (need(nm)) names.push(nm);
        }
        /* EVERY name the point could be under, not just the first.
           A machine-level photograph is filed by its category — OVERVIEW,
           PLATE, LEFT — while the point itself is keyed MACHINE, so the first
           candidate is the one name those files are never under. This asked
           for that one and stopped, and the pictures were never fetched: not
           shown, not classifiable, and counted as never having arrived. */
        const bases = window.CMDash.photoBases
          ? window.CMDash.photoBases(it, rec)
          : [window.CMDash.photoBase(it, rec)];
        // The same candidate list the history uses, so a record whose photos were
        // kept under "~DEVICE" after a two-phone clash still gets them fetched.
        // The whole range the phone can produce, not the first five: it stopped
        // at _4 and never asked for the video, so a position with eight photos
        // and a clip had three photos and the clip left behind on Drive. Every
        // candidate is checked against the index before it becomes a request,
        // so a longer list costs lookups, not round trips.
        for (const base of bases) {
          for (const nm of window.CMDash.photoNames(base, rec)) {
            if (need(nm)) names.push(nm);
          }
          for (const nm of window.CMDash.videoNames(base, rec)) {
            if (need(nm)) names.push(nm);
          }
        }
      }
      const stem = `${rec.equip}_${(rec.date || "").split("-").reverse().join(".")}_${rec.type}_SIGN`;
      const dev = String(rec.dev || "");
      for (const sig of (dev ? [`${stem}~${dev}.png`, `${stem}.png`] : [`${stem}.png`]))
        if (need(sig)) names.push(sig);
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
  /* A PATH IS NOT AN IMMUTABLE ID ON THIS BACKEND. The bucket files a photograph
     under its name, and a round the phone re-sends — a retake, a new
     signature — rewrites the same name with different bytes. The cache is
     keyed by that name, so it went on handing back whatever it had first seen
     under it, for the life of the disk. A copy whose length is not the length
     the index reports now is a different file: dropped, and fetched again. */
  async function cacheGet(id, size) {
    try {
      const c = await caches.open(MEDIA_CACHE);
      const r = await c.match("/cm-media/" + id);
      if (!r) return null;
      const blob = await r.blob();
      if (size != null && Number(size) > 0 && blob.size !== Number(size)) {
        try { await c.delete("/cm-media/" + id); } catch (e) {}
        return null;
      }
      return URL.createObjectURL(blob);
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
    /* ONE INDEX, ONE WAY OF GETTING IT.

       This used to fetch its own listing with action=list and merge the result,
       while refreshMediaIndex() above replaced the index from action=records.
       Two functions maintaining one fact, and they did not even agree on the
       rule: merging cannot notice a file that has been DELETED, so a folder
       tidied from another desk would go on being counted here for as long as
       the tab stayed open — which is the exact shape of the audit bug this
       index was fixed to stop.

       Every load now refreshes the index eagerly, so this is only the
       belt-and-braces case: a page that somehow reached "open a unit" without
       one. Same call, same replacement, same saved copy. */
    const have = Object.keys(index).length;
    if (have && !mediaIndexAt) return;                       // came with the load
    if (have && Date.now() - mediaIndexAt < MEDIA_INDEX_TTL) return;
    await refreshMediaIndex();
    mediaIndexAt = Date.now();
  }

  /* ONE FILE, BY NAME, SO SOMEBODY CAN LOOK AT IT BEFORE DECIDING.

     A photograph that never matched an inspection is still in the folder under
     a name nobody predicted. Filing it anywhere is a decision, and a decision
     about a picture nobody has seen is a guess — so the panel that offers to
     file it has to be able to show it first. */
  async function fetchByName(name) {
    await ensureMediaIndex();
    const e = index[name];
    if (!e) return null;
    /* Same rule as ensurePhotos(), and the same bug fixed there for the same
       reason: "already fetched" is not "still current" — a name the phone
       re-sent lands here too (this is the function behind the correction
       panel's "Look" preview, whose whole point is showing what a decision
       is actually about), and a stale return here means a supervisor looks
       at the OLD bytes believing they have verified the current ones. */
    if (fetched[name] && !stale(name)) return fetched[name];
    const want = (!stale(name) && fetchedSize[name] != null) ? fetchedSize[name] : e.size;
    const cached = await cacheGet(e.id, want);
    if (cached) { fetched[name] = cached; fetchedSize[name] = Number(e.size) || null; window.CMDash.addPhoto(name, cached); return cached; }
    const r = await api({ action: "file", id: e.id });
    if (!r || !r.data) { fetched[name] = null; return null; }
    const blob = b64ToBlob(r.data, r.mime);
    const url = URL.createObjectURL(blob);
    await cachePut(e.id, blob);
    fetched[name] = url; fetchedSize[name] = blob.size;
    window.CMDash.addPhoto(name, url);
    return url;
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
    /* WHAT THIS CALL ADDED TO THIS PAGE'S OWN MEMORY, NOT WHAT THE NETWORK
       DID. `fetched` is this module's in-memory map; MEDIA_CACHE is the
       browser's own disk cache and survives long after `fetched` is empty
       again — a fresh page load, a unit opened for the first time this
       session, ties up a name to a picture already sitting on disk from an
       earlier visit. That is still a picture this PAGE has never shown, and
       the card it belongs on was built, moments ago in renderHistory(),
       before this function had asked the disk anything — so a name resolved
       from MEDIA_CACHE needs the exact same repaint a name resolved over the
       network gets. Skipping a name already in `fetched` (set only by a
       PRIOR call, in THIS page's lifetime) is what stops that from becoming
       the loop the comment below already fixed once: the second time this
       function sees a name it has already added, that name adds nothing,
       however many more times it is asked about. */
    let added = 0;
    for (const nm of names) {
      /* `names` already carries only what need() called for — never fetched,
         OR fetched but stale() because the index's size moved (a retake, a
         new signature, landed under the same name). Skipping every name
         already in `fetched` here, with no second look at WHY wanted() still
         asked for it, threw that distinction away: a stale name is also
         "already in fetched", so it never reached cacheGet's own size check
         below it, and the office went on showing the first bytes it ever saw
         under that name for the life of the tab — read live as a signature
         that never updates without a full reload (tests/officesign.cjs). */
      if (fetched[nm] && !stale(nm)) continue;
      /* WHAT LENGTH THE CACHED COPY SHOULD BE — our own measurement once we
         have one, the index's claim until then.

         cacheGet DELETES a cached copy whose length is not the one it is given,
         which is right: a round the phone re-sends lands under the same name
         with other bytes, and the office used to serve whatever it saw first.
         But measured against the INDEX for ever, a name whose index size is
         simply wrong is dropped and refetched on every single pass — and since
         a pass repaints, and a repaint starts a pass, that is an unbounded
         loop with a network request per photograph in it.

         Once these bytes have been fetched here, their length is a fact and the
         index's figure is a claim, so the fact is what the cache is held to —
         UNLESS stale() has already said the index's figure moved, which is
         exactly a genuine re-upload. Held to the old fact in that case, `want`
         asked cacheGet to accept the very stale copy this loop exists to
         replace: a Cache Storage entry still sitting at the OLD length would
         "match" it and be handed back as if it were current, for the same
         reason a name already in `fetched` used to skip this block outright. */
      const want = (!stale(nm) && fetchedSize[nm] != null) ? fetchedSize[nm] : index[nm].size;
      const url = await cacheGet(index[nm].id, want);
      if (url) {
        fetched[nm] = url;
        /* Unconditional, not just-if-null: a hit here for a name stale() just
           flagged means the cache already held bytes at the NEW length (want
           was index[nm].size), and leaving the old fetchedSize in place would
           keep stale() true for ever on a file that is, in fact, current
           again — refetching it on every future pass for no reason. */
        fetchedSize[nm] = Number(index[nm].size) || null;
        window.CMDash.addPhoto(nm, url);
        added++;
      }
      else miss.push(nm);
    }
    /* NOTHING WAS MISSING, SO NOTHING NEW CAME OVER THE NETWORK — and saying
       "truthy, because names.length is truthy" put the office page into a
       permanent re-render loop.

       The original bug answered with names.length (what the unit WANTS) and
       called the progress callback once, both truthy, both meaning "work was
       done". The only caller that reads the answer is pullDrivePhotos, whose
       whole job is "if photographs arrived, repaint" — and its repaint is
       renderHistory, which calls pullDrivePhotos again. Everything already
       cached, so nothing missing, so truthy again: measured at 210 repaints
       of the whole history in three seconds, one every 15 ms, for as long as
       the tab stayed open.

       A human sees THAT as a photograph that cannot be clicked — the card is
       detached and rebuilt under the cursor before the press lands, which is
       exactly how tests/phase3.cjs had been failing, read as a flaky click.

       A DIFFERENT human, on a fresh tab whose disk cache already held every
       picture this unit needed, saw every card stuck on "no photo" until they
       clicked into Report or Edit — because `added` above is genuinely 0 only
       when NOTHING new reached `fetched`, and returning a flat 0 here as
       before threw that count away and answered as if a full cache hit were
       the same as nothing to add. It is `added` now, so a page's first look
       at a unit gets its one repaint whether the pictures came from the
       network moments ago or from a earlier visit's disk cache — and a
       SECOND call for the same unit, everything already in `fetched`, still
       adds and repaints nothing. A caller that wants to know whether the
       unit has photographs at all asks the index, not this. */
    if (!miss.length) return added;

    /* Several photographs to a request where the deployment allows it. Each one
       used to be its own Apps Script invocation — a script start and a round
       trip for a thumbnail — which is why the pool that limits it to five at a
       time exists. Asked for together they cost one of each. */
    const per = mediaBatch();
    let done = names.length - miss.length;
    const groups = [];
    for (let i = 0; i < miss.length; i += per) groups.push(miss.slice(i, i + per));
    /* WHAT THIS FETCH DID, FOR THE MESSAGE AFTER THE REPORT. "Fetching
       photos… then a PDF with none on it" is otherwise a silence: every name
       that came back empty or threw is kept here with its reason, and
       runReport says so beside the page count. */
    lastFetch = { at: Date.now(), asked: names.length, cached: names.length - miss.length, fetched: 0, failed: [] };

    await pool(groups, async (grp) => {
      const ids = grp.map(nm => index[nm].id);
      let got = null, batchErr = "";
      if (per > 1) {
        try {
          const r = await api({ action: "files", ids: ids.join(",") });
          got = {};
          (r.files || []).forEach(f => { if (f.ok) got[f.id] = f; else if (f && f.id) got[f.id] = { error: f.error || "refused" }; });
        } catch (e) { got = null; batchErr = String((e && e.message) || e); setMediaBatch(1); }   // older deployment; stop asking
      }
      for (let k = 0; k < grp.length; k++) {
        const nm = grp[k], id = ids[k];
        try {
          const f = got ? got[id] : await api({ action: "file", id });
          if (!f || !f.data) {
            fetched[nm] = null;
            lastFetch.failed.push({ name: nm, why: (f && f.error) || (got ? "not in the reply" : batchErr || "no data") });
            continue;
          }
          const blob = b64ToBlob(f.data, f.mime);
          cachePut(id, blob);                      // not awaited: the picture goes up now
          const url = URL.createObjectURL(blob);
          fetched[nm] = url; fetchedSize[nm] = blob.size; lastFetch.fetched++;
          window.CMDash.addPhoto(nm, url);
        } catch (e) { fetched[nm] = null; delete fetchedSize[nm];
          lastFetch.failed.push({ name: nm, why: String((e && e.message) || e).slice(0, 120) }); }   // remember the failure, don't retry forever
        if (onProgress) onProgress(++done, names.length);
      }
    });
    /* What this call ADDED, so a caller that repaints on the answer repaints
       once per arrival and not for ever. A pull where every file failed adds
       nothing and is not a reason to redraw either — the failures are on
       lastFetch for whoever wants to say so. Plus `added` from the disk-cache
       pass above, for the batch that mixed a cache hit with a genuine miss —
       the hit needs its repaint exactly as much as a batch that was ALL hits
       does, above. */
    return lastFetch.fetched + added;
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

  /* ONE PHOTOGRAPH, on purpose, with a reason on it. Same gate as remove(),
     because this destroys a file and nothing brings it back — and the server
     refuses without both a reason and a name, so a picture can never disappear
     from the folder with nothing to say who took it out or why. */
  const deleteFile = (p2) => post(Object.assign({ op: "delfile" }, p2));

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
    load, ensurePhotos, fetchByName, configured, ping, saveEdit, remove, deleteFile, resolve, putMedia,
    /* The last fetch's outcome — read by the report message so "fetched" and
       "on the page" are never allowed to disagree in silence. */
    lastFetch: () => lastFetch,
    /* "Is this name already taken on Drive?" — asked before choosing the next
       _N for an added photograph, so one added from another desk yesterday is
       not overwritten by one added from this desk today. */
    hasName: (n) => !!index[n],
    /* THE ONE CALL THAT ANSWERS "IS IT IN STORAGE YET" — exposed so a screen
       that is about to tell somebody a photograph is missing can ask the
       server itself first, rather than trust however old `index` happens to
       be. `load()` already refreshes it on every automatic pull (every
       AUTO_MS), but a panel opened between two of those pulls was reading a
       listing up to that long out of date — long enough that a file which had
       already landed still read as "missing" and put a correction task on
       the sheet for something nobody needs to correct. This is the same
       single cheap `after: 9e15` call `load()` already makes, just callable
       on demand instead of waiting for the next cycle. */
    refreshMediaIndex,
    /* Whether that listing is the folder's answer or a remembered one, and
       when it was last actually fetched — so a screen measuring evidence
       against it can say which. */
    mediaIndexState,
    get url() { return cfg().url; },
    get secret() { return cfg().sec; },
    get legacy() { return legacy; },
    save(url, sec) {
      const changed = (url || "").trim() !== cfg().url;
      localStorage.setItem(LS_URL, (url || "").trim());
      localStorage.setItem(LS_SEC, sec || "");
      // A different folder's cursor means nothing — start that one from scratch.
      if (changed) { localStorage.removeItem(LS_CUR); index = {}; fetched = {}; legacy = false;
                     try { localStorage.removeItem(LS_MED); } catch (e) {} }
    },
    indexed() { return Object.keys(index).length; },
    /* What the synchronisation view is allowed to say. Everything here is
       something this client actually knows: the names the server holds, and
       when it was last asked. Anything it does not know — a durable receipt, a
       delivery hash, a suppressed duplicate count — is not invented here, and
       the view says so rather than printing a zero. */
    names() { return Object.keys(index); },
    /* A small JSON document, written where the phones write theirs. A deferral
       is not a record correction — it is keyed by unit and round, not by
       record — so it goes to its own folder as its own file, exactly as
       syncDefer() on the phone does. Same shape, same place, same reader. */
    async putDoc(name, obj) {
      const data = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
      const j = await post({ op: "batch", files: [{ name, mime: "application/json", data }] });
      if (j && j.failed && j.failed.length) throw new Error(j.failed[0].error || "Refused");
      index[name] = { id: (j && j.saved && j.saved[0] && j.saved[0].id) || "", size: data.length };
      return j;
    },
    cursorAt() { return cursor(); },
  };
})();
