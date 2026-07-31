/* ============================================================================
   Condition Monitoring — read inspections straight out of Google Drive
   ----------------------------------------------------------------------------
   For a PC where IT will not allow Google Drive for desktop. Everything comes
   over plain HTTPS from the same Apps Script /exec URL the phones upload to —
   nothing to install, no synced folder.

     1. GET ?action=list&ext=.json   → the sidecars, which carry the records
     2. GET ?action=file&id=…        → one file as base64, fetched on demand

   Photos are NOT pulled up front: a month of rounds is hundreds of megabytes.
   The index of names is loaded, and the bytes are fetched only for the unit you
   open or the report you generate.

   Requests are plain GETs with no custom headers, so no CORS preflight — an
   Apps Script web app cannot answer one. The secret rides in the query string.
   ========================================================================== */
(function () {
  "use strict";

  const LS_URL = "cm_drive_url", LS_SEC = "cm_drive_sec";
  const POOL = 5;                       // parallel fetches; Apps Script is rate-limited

  let index = {};                       // file name -> {id, size}
  let fetched = {};                     // file name -> objectURL (or null if it failed)

  const cfg = () => ({ url: (localStorage.getItem(LS_URL) || "").trim(),
                       sec: localStorage.getItem(LS_SEC) || "" });
  const configured = () => !!cfg().url;

  function api(params) {
    const c = cfg();
    if (!c.url) throw new Error("No Drive URL configured.");
    const q = new URLSearchParams(Object.assign({}, params, c.sec ? { secret: c.sec } : {}));
    return fetch(c.url + (c.url.indexOf("?") < 0 ? "?" : "&") + q.toString(), { method: "GET" })
      .then(async r => {
        const text = await r.text();
        let j = null; try { j = JSON.parse(text); } catch (e) {}
        if (!j) throw new Error(r.ok
          ? "Unexpected reply — check the deployment's “Who has access” is Anyone."
          : "HTTP " + r.status + " — " + text.slice(0, 160));
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

  /* ---- 1. index the folder and pull the record sidecars ---- */
  async function load(onProgress) {
    const say = (m) => onProgress && onProgress(m);
    say("Listing the Drive folder…");
    const all = await api({ action: "list" });

    index = {};
    all.files.forEach(f => { index[f.name] = { id: f.id, size: f.size }; });

    const sidecars = all.files.filter(f => /\.json$/i.test(f.name));
    if (!sidecars.length) {
      return { files: all.files.length, records: 0, truncated: !!all.truncated,
               note: "No inspection sidecars (*.json) in that folder yet." };
    }

    const recs = [];
    let bad = 0;
    say(`Reading ${sidecars.length} inspection file(s)…`);
    await pool(sidecars, async (f) => {
      try {
        const r = await api({ action: "file", id: f.id });
        const j = JSON.parse(new TextDecoder().decode(await b64ToBlob(r.data, "application/json").arrayBuffer()));
        (j.records || []).forEach(x => recs.push(x));
      } catch (e) { bad++; }
    }, (d, n) => say(`Reading inspections… ${d}/${n}`));

    if (recs.length) window.CMDash.importRecords(recs);
    return { files: all.files.length, records: recs.length, failed: bad,
             photos: all.files.filter(f => /\.(jpe?g|png|webp|mp4|mov)$/i.test(f.name)).length,
             truncated: !!all.truncated };
  }

  /* ---- 2. pull the photos a given set of records needs ---- */
  function wanted(recs) {
    const names = [];
    for (const rec of recs) {
      for (const it of (rec.items || [])) {
        const base = window.CMDash.photoBase(it, rec);
        for (const ext of ["jpg", "jpeg", "png", "JPG", "webp"]) {
          for (const nm of [`${base}.${ext}`, `${base}_1.${ext}`, `${base}_2.${ext}`,
                            `${base}_3.${ext}`, `${base}_4.${ext}`]) {
            if (index[nm] && !(nm in fetched)) names.push(nm);
          }
        }
      }
      const sig = `${rec.equip}_${(rec.date || "").split("-").reverse().join(".")}_${rec.type}_SIGN.png`;
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

  /* Health check without pulling anything: the bare /exec URL reports the folder. */
  async function ping(){
    const c = cfg();
    const r = await fetch(c.url, { method: "GET" });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    if (!j) throw new Error("Unexpected reply — check the deployment's “Who has access” is Anyone.");
    if (j.ok === false) throw new Error(j.error || "Drive refused the request");
    return j.folder || "(unnamed)";
  }

  window.CMDrive = {
    load, ensurePhotos, configured, ping,
    get url() { return cfg().url; },
    get secret() { return cfg().sec; },
    save(url, sec) { localStorage.setItem(LS_URL, (url || "").trim()); localStorage.setItem(LS_SEC, sec || ""); },
    indexed() { return Object.keys(index).length; },
  };
})();
