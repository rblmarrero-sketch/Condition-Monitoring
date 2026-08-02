/* The seam between "where the data lives" and everything that reads it.
   ===========================================================================
   One interface, two implementations, and the rest of the dashboard cannot
   tell which it is talking to:

       pull(cursor)  → { records, edits, conflicts, cursor, more }
       push(batch)   → { accepted, stale, errors }        (rest only, for now)
       live(onChange)→ unsubscribe, or null if the source cannot push
       label()       → what to show a person in Data sources

   Why this exists before it is needed:

   Google Drive was the right call for a pilot — no server, no IT approval, no
   hosting bill — and it is the wrong call for a product: one shared secret
   instead of per-user identity, a daily Apps Script quota, no server-side
   conflict resolution, no way to push, and a folder listing that is O(files).
   All of that is fine at twenty phones and none of it is fine at two hundred.

   The mistake would be to swap it later by editing every caller. Every place
   that says "Drive" today is a place that has to be found and changed, and the
   ones that get missed are the ones that break quietly. So: the seam goes in
   while Drive is still the only adapter, Drive keeps working exactly as it
   does, and the day a real backend appears it is one line of configuration.

   Drive is not being deprecated, either. A site whose IT blocks everything but
   a browser can still run the whole system out of a shared folder, and keeping
   that working is a feature. */
(function (global) {
  "use strict";

  /* ---- adapter 1: Google Drive via Apps Script ------------------------------
     A thin wrapper over the CMDrive module that already exists. Deliberately
     thin — the point is to change nothing about how Drive behaves, only to give
     it the same shape as everything else. */
  function driveAdapter() {
    var D = global.CMDrive;
    if (!D || !D.configured || !D.configured()) return null;
    return {
      id: "drive",
      label: function () { return "Google Drive"; },
      canPush: false,          // the phones write to Drive; the dashboard reads
      async pull(onProgress, opts) {
        var r = await D.load(onProgress, opts || {});
        return {
          note: r.note || "",
          records: r.records || 0, held: r.held || 0, photos: r.photos || 0,
          failed: r.failed || 0, truncated: !!r.truncated, legacy: !!r.legacy,
          applied: true,       // CMDrive writes straight into the stores
        };
      },
      async push() { throw new Error("Drive is read-only from the dashboard"); },
      /* Nothing can push a browser page over Drive: it has no channel, and
         Apps Script cannot hold a socket open. Returning null is how the
         dashboard knows to keep polling. */
      live() { return null; },
      async ping() { return D.ping(); },
    };
  }

  /* ---- adapter 2: the REST backend ------------------------------------------
     Cursor pull, idempotent push, and a live stream so the three-minute poll
     becomes a backstop rather than the mechanism. */
  function restAdapter(cfg) {
    if (!cfg || !cfg.url || !cfg.token) return null;
    var base = String(cfg.url).replace(/\/+$/, "");
    var CUR = "cm_rest_cursor";
    var hdr = function (extra) {
      return Object.assign({ authorization: "Bearer " + cfg.token }, extra || {});
    };
    var cursor = function () { return Number(localStorage.getItem(CUR) || 0) || 0; };

    async function jsonOr(res) {
      var text = await res.text(), j = null;
      try { j = JSON.parse(text); } catch (e) {}
      if (!j) throw new Error("HTTP " + res.status + " — the server did not answer with data");
      if (j.ok === false) throw new Error(j.error || "refused");
      return j;
    }

    return {
      id: "rest",
      label: function () { return "Server"; },
      canPush: true,

      async pull(onProgress, opts) {
        if (opts && opts.full) localStorage.removeItem(CUR);
        var at = cursor(), got = 0, rounds = [], markers = [], photos = [], pages = 0;
        if (onProgress) onProgress(at ? "Checking for new inspections…" : "Reading inspections…");
        /* Paged, because "everything since zero" on a first load is a year of
           rounds and the client should not hold the whole thing in one reply. */
        for (;;) {
          var r = await jsonOr(await fetch(base + "/v1/pull?cursor=" + at + "&limit=500", { headers: hdr() }));
          rounds = rounds.concat(r.rounds || []);
          markers = markers.concat(r.markers || []);
          photos = photos.concat(r.photos || []);
          got += (r.rounds || []).length;
          at = r.cursor;
          if (!r.more || ++pages >= 40) break;
          if (onProgress) onProgress("Reading… " + got);
        }
        try { localStorage.setItem(CUR, String(at)); } catch (e) {}

        /* Translate into what the dashboard's stores already hold. The server's
           shape is deliberately close to the sidecar's, so this is a rename and
           not a transformation — a transformation here would be a third shape
           to keep in step with the report engine. */
        var live = rounds.filter(function (r) { return !r.superseded; });
        var edits = markers.filter(function (m) { return m.kind !== "resolve"; })
          .map(function (m) {
            return Object.assign({ key: m.roundId, by: m.by, at: m.at, reason: m.reason },
              m.kind === "void" ? { void: true } : m.kind === "unvoid" ? { void: false } : {},
              m.payload || {});
          });
        var conflicts = markers.filter(function (m) { return m.kind === "resolve"; })
          .map(function (m) { return Object.assign({ key: m.roundId, by: m.by, resolved: true }, m.payload || {}); });

        return { records: live, edits: edits, conflicts: conflicts, photos: photos,
                 cursor: at, applied: false };
      },

      /* The dashboard can write here, which it never could to Drive: a
         correction goes to the server rather than into a marker file, and the
         phones see it on their next pull. */
      async push(batch) {
        return jsonOr(await fetch(base + "/v1/push", {
          method: "POST",
          headers: hdr({ "content-type": "application/json" }),
          body: JSON.stringify(batch),
        }));
      },

      /* The whole reason for the backend, from a reader's point of view: the
         page is told, in seconds, instead of asking every three minutes. The
         poll stays armed underneath — a corporate proxy that buffers the stream
         would otherwise leave the dashboard silently frozen and looking live. */
      live(onChange) {
        if (typeof EventSource === "undefined") return null;
        var url = base + "/v1/events?token=" + encodeURIComponent(cfg.token);
        var es;
        try { es = new EventSource(url); } catch (e) { return null; }
        es.onmessage = function (ev) {
          var d = null; try { d = JSON.parse(ev.data); } catch (e) {}
          if (d && d.type) onChange(d);
        };
        /* EventSource reconnects on its own. Do not "fix" that with a manual
           retry — two reconnect loops racing is worse than one. */
        return function () { try { es.close(); } catch (e) {} };
      },

      async ping() {
        var r = await fetch(base + "/v1/health");
        var j = await r.json().catch(function () { return null; });
        if (!j || !j.ok) throw new Error("the server is not answering");
        return { folder: "server", batch: true, write: true, canDelete: true };
      },
    };
  }

  /* ---- picking one ----------------------------------------------------------
     Server if it is configured, Drive otherwise. Not a preference — the server
     is the only one that can push, resolve or authenticate per device, so a
     site that has one should never be on the other by accident. */
  function pick() {
    var cfg = null;
    try {
      cfg = { url: localStorage.getItem("cm_api_url") || "",
              token: localStorage.getItem("cm_api_token") || "" };
    } catch (e) {}
    return restAdapter(cfg) || driveAdapter() || null;
  }

  global.CMSync = { pick: pick, drive: driveAdapter, rest: restAdapter };
})(typeof window !== "undefined" ? window : this);
