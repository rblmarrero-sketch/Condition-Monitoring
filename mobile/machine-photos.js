/* Which picture belongs to which machine.

   The figure at the top of an inspection screen is drawn by default — a few
   kilobytes, sharp at any size, and it can be lit by the state of the round.
   This file is how a real illustration takes its place.

   It is deliberately data and not code. Adding artwork should be: put the file
   in mobile/machine/, make sure its name is in the table below, flip ON to
   true. Nothing else in the app changes, and any machine without a file keeps
   its drawing.

   ---------------------------------------------------------------------------
   HOW TO TURN THE PICTURES ON

   1. Put the image files in  mobile/machine/  using exactly the names below.
      PNG or JPG, side view, machine facing LEFT (same way the drawings face,
      so "roller 1" on the frame under it is the one nearest the idler on the
      ground). Transparent or white background. About 1000 px wide is plenty —
      the figure is never rendered taller than 132 px.
   2. Set ON to true.
   3. That is all. The service worker picks them up on the next build and they
      work offline like everything else.

   Until ON is true nothing is fetched, so a half-finished set of files cannot
   put broken-image icons in front of an inspector. And even with ON true, a
   file that is missing or fails to load falls back to the drawing rather than
   leaving a hole — see machine-fig.js.
   ---------------------------------------------------------------------------

   Keys are the model string as the 1C register writes it. Matching is
   punctuation- and case-insensitive, so "KOMATSU D155A.5" in the register and
   komatsu-d155a-5.png on disk find each other without anybody having to keep
   two spellings in step. Where the register and the artwork genuinely disagree
   on a model's name — and they do, once — ALIAS says so out loud.

   Written to `self` rather than `window`: the service worker importScripts()
   this same file to decide what to cache, and a service worker has no window. */
(function (G) {
  'use strict';

  var M = {
    /* Whole-machine artwork: off until the files are in mobile/machine/.
       The undercarriage crops below are shipped, so they are always on. */
    ON: false,

    BASE: 'machine/',

    /* ---- excavators and rock breakers ---- */
    BY_MODEL: {
      'CATERPILLAR 336-07':      'caterpillar-336-07.png',
      'HITACHI EX1200-6BH':      'hitachi-ex1200-6bh.png',
      'HITACHI EX1200-7BH':      'hitachi-ex1200-7bh.png',
      'HITACHI ZX280-5G':        'hitachi-zx280-5g.png',
      'HITACHI ZX330-5G RB':     'hitachi-zx330-5g-rb.png',
      'HITACHI ZX470LC-5G':      'hitachi-zx470lc-5g.png',
      'HITACHI ZX470LCR-5G':     'hitachi-zx470lcr-5g.png',
      'KOMATSU PC800-8E0 (SE)':  'komatsu-pc800-8e0-se.png',
      'KOMATSU PC2000-8 BH':     'komatsu-pc2000-8-bh.png',
      'LiuGong CLG970E':         'liugong-clg970e.png',
      'LiuGong CLG990FHD':       'liugong-clg990fhd.png',

      /* ---- dozers ---- */
      'CATERPILLAR D9R':         'caterpillar-d9r.png',
      'KOMATSU D155A.5':         'komatsu-d155a-5.png',
      'KOMATSU D275.5D':         'komatsu-d275a-5d.png',
      'KOMATSU D375A.6':         'komatsu-d375a-6.png',
      'SHANTUI SD32':            'shantui-sd32.png',
      'SHANTUI SD34-B3':         'shantui-sd34-b3.png',
      'SHANTUI SD60-C5':         'shantui-sd60-c5.png',
      'SHANTUI SD90-C5':         'shantui-sd90-c5.png',

      /* ---- blasthole drills ---- */
      'KOMATSU P&H 44XT':        'komatsu-p-h-44xt.png',
      'SUNWARD SWDE165A':        'sunward-swde165a.png',

      /* ---- mobile crushers and screeners ---- */
      'MCCLOSKEY C38':           'mccloskey-c38.png',
      'MCCLOSKEY C44':           'mccloskey-c44.png',
      'MCCLOSKEY J45':           'mccloskey-j45.png',
      'MCCLOSKEY J50V2':         'mccloskey-j50v2.png',
      'MCCLOSKEY S190-3DT':      'mccloskey-s190-3dt.png',
      'NMS MT1150JC':            'nms-mt1150jc.png',
      'NMS MT300MC':             'nms-mt300mc.png',
      'NMS MT1860SR':            'nms-mt1860sr.png',
    },

    /* Where the artwork is named for a machine the register calls something
       else. Left as a table rather than fixed silently in one place or the
       other, because both names are somebody's source of truth: the register
       is what 1C exports and the file name is what the illustrator delivered.

       KOMATSU D275.5D — the register's name. The artwork is labelled
       "Komatsu D275A-5D", which is the same machine written the way Komatsu
       writes it. Both spellings resolve to the one file. */
    ALIAS: {
      'KOMATSU D275A-5D': 'KOMATSU D275.5D',
      'KOMATSU D275A.5D': 'KOMATSU D275.5D',
    },


    /* ---- undercarriage crops ------------------------------------------------
       A side-on photograph of THIS model's track frame, used as the background
       of the measurement map. Shipped with the app, unlike the whole-machine
       artwork above, because it is the thing the inspector matches against the
       machine in front of them — a drawing of a track frame in general tells
       them nothing about where roller one is on a D9R.

       29 files, about 20 KB each and 600 KB the lot — WebP, which every phone
       that can run this app decodes and which is a third the size of the same
       crop as JPEG. They are optional to the
       service worker: a phone that cannot fetch one falls back to the drawn
       frame rather than showing a hole, and a missing one never holds up an
       update to the capture code.

       Keys are the model as the register writes it; the catalog's own spelling
       resolves through ALIAS and slug() like everything else here. */
    BY_MODEL_UC: {
      'Caterpillar 336-07':       'uc/caterpillar-336-07.webp',
      'Hitachi EX1200-6BH':       'uc/hitachi-ex1200-6bh.webp',
      'Hitachi EX1200-7BH':       'uc/hitachi-ex1200-7bh.webp',
      'Hitachi ZX280-5G':         'uc/hitachi-zx280-5g.webp',
      'Hitachi ZX330-5G RB':      'uc/hitachi-zx330-5g-rb.webp',
      'Hitachi ZX470LC-5G':       'uc/hitachi-zx470lc-5g.webp',
      'Hitachi ZX470LCR-5G':      'uc/hitachi-zx470lcr-5g.webp',
      'Komatsu PC800-8E0 (SE)':   'uc/komatsu-pc800-8e0-se.webp',
      'Komatsu PC2000-8 BH':      'uc/komatsu-pc2000-8-bh.webp',
      'LiuGong CLG970E':          'uc/liugong-clg970e.webp',
      'LiuGong CLG990FHD':        'uc/liugong-clg990fhd.webp',
      'Caterpillar D9R':          'uc/caterpillar-d9r.webp',
      'Komatsu D155A-5':          'uc/komatsu-d155a-5.webp',
      'Komatsu D275A-5D':         'uc/komatsu-d275a-5d.webp',
      'Komatsu D375A-6':          'uc/komatsu-d375a-6.webp',
      'Shantui SD32':             'uc/shantui-sd32.webp',
      'Shantui SD34-B3':          'uc/shantui-sd34-b3.webp',
      'Shantui SD60-C5':          'uc/shantui-sd60-c5.webp',
      'Shantui SD90-C5':          'uc/shantui-sd90-c5.webp',
      'Komatsu P&H 44XT':         'uc/komatsu-p-h-44xt.webp',
      'Sunward SWDE165A':         'uc/sunward-swde165a.webp',
      'McCloskey C38':            'uc/mccloskey-c38.webp',
      'McCloskey C44':            'uc/mccloskey-c44.webp',
      'McCloskey J45':            'uc/mccloskey-j45.webp',
      'McCloskey J50V2':          'uc/mccloskey-j50v2.webp',
      'McCloskey S190-3DT':       'uc/mccloskey-s190-3dt.webp',
      'NMS MT1150JC':             'uc/nms-mt1150jc.webp',
      'NMS MT300MC':              'uc/nms-mt300mc.webp',
      'NMS MT1860SR':             'uc/nms-mt1860sr.webp',
    },
    /* One picture for a whole family, used when no model matched. Empty by
       default: a generic "an excavator" photograph is worse than the drawing,
       because the drawing is honest about being a diagram and can be lit. */
    BY_FAMILY: {},
  };

  /* Punctuation and case are noise. "KOMATSU D155A.5", "Komatsu D155A-5" and
     "komatsu d155a 5" are one machine, and nobody should have to know which
     spelling the register happens to hold. */
  function slug(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* Build the slug → file lookup for a table, resolving aliases BOTH ways.
     A table may be keyed on the register's spelling of a model or on the
     supplier's, and the caller may ask with either — so an alias pair has to
     work whichever side the file happens to be filed under. Getting this
     one-directional is how a machine silently loses its picture. */
  function buildIndex(table) {
    var ix = {};
    Object.keys(table).forEach(function (k) { ix[slug(k)] = table[k]; });
    Object.keys(M.ALIAS).forEach(function (k) {
      var a = slug(k), b = slug(M.ALIAS[k]);
      if (ix[a] && !ix[b]) ix[b] = ix[a];
      if (ix[b] && !ix[a]) ix[a] = ix[b];
    });
    return ix;
  }
  var BY_SLUG = null;
  function index() { return (BY_SLUG || (BY_SLUG = buildIndex(M.BY_MODEL))); }

  /* The URL for a machine, or "" for "use the drawing". Model first, family as
     the fallback, and nothing at all while ON is false. */
  M.urlFor = function (model, family) {
    if (!M.ON) return '';
    var f = index()[slug(model)] || (family ? M.BY_FAMILY[family] : '');
    return f ? M.BASE + f : '';
  };

  var UC_SLUG = null;
  /* The undercarriage crop for a model, or "" for "draw the frame instead". */
  M.ucUrlFor = function (model) {
    if (!UC_SLUG) UC_SLUG = buildIndex(M.BY_MODEL_UC);
    var f = UC_SLUG[slug(model)];
    return f ? M.BASE + f : '';
  };

  /* Everything the service worker should try to cache. Empty while ON is
     false, so a build with no artwork asks the network for nothing. */
  M.all = function () {
    var seen = {}, out = [];
    if (M.ON) {
      Object.keys(M.BY_MODEL).forEach(function (k) { seen[M.BY_MODEL[k]] = 1; });
      Object.keys(M.BY_FAMILY).forEach(function (k) { seen[M.BY_FAMILY[k]] = 1; });
    }
    Object.keys(M.BY_MODEL_UC).forEach(function (k) { seen[M.BY_MODEL_UC[k]] = 1; });
    Object.keys(seen).forEach(function (f) { out.push(M.BASE + f); });
    return out;
  };

  M.slug = slug;
  G.MACHINE_PHOTOS = M;
})(typeof self !== 'undefined' ? self : this);
