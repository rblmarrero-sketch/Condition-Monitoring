/* Ground Engaging Tools — the parts that touch the rock.

   GET is the fastest-wearing thing on a mine site and the least well recorded.
   It is bought by the pallet, changed on backshift, and the only number anyone
   can usually produce afterwards is how many teeth were ordered. Meanwhile a
   tooth lost into a crusher is a day, and an adapter run past its nose is a
   lip repair instead of a five-minute change.

   The round is the client's own, eleven numbered points per tool, taken from
   their inspection catalog so a number on this screen is the number on the
   printed page in the ute. Two tools, because two shapes of machine:

     bucket — excavators, shovels and loaders: teeth, adapters, retainers, lip,
              side cutters, corner shrouds, floor and sidewall wear plates.
     blade  — dozers: end bits, three cutting-edge segments, blade corner, wear
              strips, and the ripper behind it.

   Every position is graded — A/B/C/X with a defect and an action, the same
   judgement the walk-around already uses — and a round is COMPLETE ON GRADES
   ALONE. Where a fitter has a tape, a remaining measurement goes in as well and
   the app works out how far through its life that part is, in the same bands
   and the same words as the undercarriage round. Where nobody has a tape,
   nothing is blocked and nothing is invented.

   x and y are percentages of the tool's photograph, so the numbers sit on the
   parts they name rather than in a list beside them.

   The limits are generic and say so wherever a reading appears. They are honest
   starting points so a trend exists from day one; the real figures come off the
   supplier's wear charts and replace these, at which point the label stops
   appearing. A generic limit is better than no trend. A generic limit presented
   as measured fact is not. */
(function (G) {
  'use strict';

  /* [n, code, English, Russian, kind, x%, y%] */
  var TOOLS = {
    bucket: {
      en: 'Bucket', ru: 'Ковш',
      pts: [
        [1,  'TOOTH',   'Tooth points',              'Зубья',                        'mm',     50, 90],
        [2,  'ADAPTER', 'Adapters',                  'Адаптеры',                     'mm',     50, 80],
        [3,  'PIN',     'Retainers / locking pins',  'Фиксаторы / пальцы',           'visual', 39, 80],
        [4,  'LIP',     'Bucket lip / base edge',    'Кромка ковша',                 'mm',     50, 72],
        [5,  'CUTL',    'Left side cutter',          'Левый боковой нож',            'mm',      9, 74],
        [6,  'CUTR',    'Right side cutter',         'Правый боковой нож',           'mm',     91, 74],
        [7,  'SHROUD',  'Corner shrouds',            'Угловые защиты',               'mm',     14, 54],
        [8,  'FLOOR',   'Floor wear plates',         'Защита днища',                 'mm',     50, 52],
        [9,  'WALLL',   'Left sidewall wear plates', 'Защита левой стенки',          'mm',     20, 43],
        [10, 'WALLR',   'Right sidewall wear plates','Защита правой стенки',         'mm',     80, 43],
        [11, 'CRACK',   'Cracks / missing GET',      'Трещины / утраченные элементы','visual', 50, 30],
      ],
      lim: { TOOTH:{n:320,c:130}, ADAPTER:{n:250,c:190}, LIP:{n:90,c:60}, CUTL:{n:60,c:25},
             CUTR:{n:60,c:25}, SHROUD:{n:60,c:25}, FLOOR:{n:25,c:10}, WALLL:{n:20,c:8}, WALLR:{n:20,c:8} },
    },
    blade: {
      en: 'Blade & ripper', ru: 'Отвал и рыхлитель',
      pts: [
        [1,  'ENDL',    'Left end bit',          'Левый боковой нож',      'mm',      5, 80],
        [2,  'EDGEL',   'Left cutting edge',     'Левая режущая кромка',   'mm',     28, 82],
        [3,  'EDGEC',   'Centre cutting edge',   'Центральная кромка',     'mm',     50, 82],
        [4,  'EDGER',   'Right cutting edge',    'Правая режущая кромка',  'mm',     72, 82],
        [5,  'ENDR',    'Right end bit',         'Правый боковой нож',     'mm',     95, 80],
        [6,  'CORNER',  'Blade corner / skin',   'Угол отвала / обшивка',  'mm',     10, 52],
        [7,  'STRIP',   'Wear strips / liners',  'Износные накладки',      'mm',     50, 64],
        [8,  'RTIP',    'Ripper point',          'Наконечник рыхлителя',   'mm',     93, 35],
        [9,  'RSHANK',  'Ripper adapter / shank','Адаптер / стойка',       'mm',     93, 18],
        [10, 'BOLT',    'Bolts / retainers',     'Болты / фиксаторы',      'visual', 50, 76],
        [11, 'CRACK',   'Cracks / deformation',  'Трещины / деформация',   'visual', 50, 41],
      ],
      lim: { ENDL:{n:60,c:25}, EDGEL:{n:60,c:25}, EDGEC:{n:60,c:25}, EDGER:{n:60,c:25},
             ENDR:{n:60,c:25}, CORNER:{n:30,c:12}, STRIP:{n:25,c:10},
             RTIP:{n:300,c:150}, RSHANK:{n:110,c:80} },
    },
  };

  /* Which tool a model carries, and the photograph of it. Both from the
     client's catalog, keyed on the model as the register writes it. */
  var TOOL_BY_MODEL = {
      'CATERPILLAR 336-07':        'bucket',
      'CATERPILLAR D9R':           'blade',
      'HITACHI EX1200-6BH':        'bucket',
      'HITACHI EX1200-7BH':        'bucket',
      'HITACHI ZX280-5G':          'bucket',
      'HITACHI ZX470LC-5G':        'bucket',
      'HITACHI ZX470LCR-5G':       'bucket',
      'KOMATSU D155A.5':           'blade',
      'KOMATSU D275.5D':           'blade',
      'KOMATSU D375A.6':           'blade',
      'KOMATSU PC2000-8 BH':       'bucket',
      'KOMATSU PC800-8E0 (SE)':    'bucket',
      'LiuGong CLG970E':           'bucket',
      'LiuGong CLG990FHD':         'bucket',
      'SHANTUI SD32':              'blade',
      'SHANTUI SD34-B3':           'blade',
      'SHANTUI SD60-C5':           'blade',
      'SHANTUI SD90-C5':           'blade',
  };
  var PHOTO_BY_MODEL = {
      'CATERPILLAR 336-07':          'get/caterpillar-336-07.webp',
      'CATERPILLAR D9R':             'get/caterpillar-d9r.webp',
      'HITACHI EX1200-6BH':          'get/hitachi-ex1200-6bh.webp',
      'HITACHI EX1200-7BH':          'get/hitachi-ex1200-7bh.webp',
      'HITACHI ZX280-5G':            'get/hitachi-zx280-5g.webp',
      'HITACHI ZX470LC-5G':          'get/hitachi-zx470lc-5g.webp',
      'HITACHI ZX470LCR-5G':         'get/hitachi-zx470lcr-5g.webp',
      'KOMATSU D155A.5':             'get/komatsu-d155a-5.webp',
      'KOMATSU D275.5D':             'get/komatsu-d275-5d.webp',
      'KOMATSU D375A.6':             'get/komatsu-d375a-6.webp',
      'KOMATSU PC2000-8 BH':         'get/komatsu-pc2000-8-bh.webp',
      'KOMATSU PC800-8E0 (SE)':      'get/komatsu-pc800-8e0-se.webp',
      'LiuGong CLG970E':             'get/liugong-clg970e.webp',
      'LiuGong CLG990FHD':           'get/liugong-clg990fhd.webp',
      'SHANTUI SD32':                'get/shantui-sd32.webp',
      'SHANTUI SD34-B3':             'get/shantui-sd34-b3.webp',
      'SHANTUI SD60-C5':             'get/shantui-sd60-c5.webp',
      'SHANTUI SD90-C5':             'get/shantui-sd90-c5.webp',
  };
  /* Width divided by height of each tool photograph. The picker sizes its
     drawing area to this so a point given as "93% across, 18% down" lands on
     the ripper shank rather than in the empty margin beside the picture. */
  var ASPECT = {
      'get/caterpillar-336-07.webp':       1.501,
      'get/caterpillar-d9r.webp':          1.501,
      'get/hitachi-ex1200-6bh.webp':       1.501,
      'get/hitachi-ex1200-7bh.webp':       1.501,
      'get/hitachi-zx280-5g.webp':         1.501,
      'get/hitachi-zx470lc-5g.webp':       1.501,
      'get/hitachi-zx470lcr-5g.webp':      1.501,
      'get/komatsu-d155a-5.webp':          1.501,
      'get/komatsu-d275-5d.webp':          1.501,
      'get/komatsu-d375a-6.webp':          1.501,
      'get/komatsu-pc2000-8-bh.webp':      1.501,
      'get/komatsu-pc800-8e0-se.webp':     1.501,
      'get/liugong-clg970e.webp':          1.501,
      'get/liugong-clg990fhd.webp':        1.501,
      'get/shantui-sd32.webp':             1.501,
      'get/shantui-sd34-b3.webp':          1.501,
      'get/shantui-sd60-c5.webp':          1.501,
      'get/shantui-sd90-c5.webp':          1.501,
  };

  /* A machine with no entry above still gets a round if its family has an
     obvious tool — an excavator has a bucket whether or not anyone has
     photographed this particular one — and the picker falls back to a drawing. */
  var TOOL_BY_FAMILY = { ex: 'bucket', ld: 'bucket', dz: 'blade' };

  function slug(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  var IX = null;
  function index() {
    if (IX) return IX;
    IX = { tool: {}, photo: {} };
    Object.keys(TOOL_BY_MODEL).forEach(function (k) { IX.tool[slug(k)] = TOOL_BY_MODEL[k]; });
    Object.keys(PHOTO_BY_MODEL).forEach(function (k) { IX.photo[slug(k)] = PHOTO_BY_MODEL[k]; });
    var A = G.MACHINE_PHOTOS && G.MACHINE_PHOTOS.ALIAS;
    if (A) Object.keys(A).forEach(function (k) {
      var a = slug(k), b = slug(A[k]);
      ['tool', 'photo'].forEach(function (w) {
        if (IX[w][a] && !IX[w][b]) IX[w][b] = IX[w][a];
        if (IX[w][b] && !IX[w][a]) IX[w][a] = IX[w][b];
      });
    });
    return IX;
  }

  function familyFor(unit, cls) { return (G.MFIG ? G.MFIG.familyFor(unit, cls) : ''); }

  /* Is there a GET round to do on this machine at all? A haul truck, a light
     vehicle and a generator have none, and offering an empty round is worse
     than not offering one. */
  function profileFor(unit, cls, model) {
    var ix = index(), s = slug(model);
    var tool = ix.tool[s] || TOOL_BY_FAMILY[familyFor(unit, cls)] || '';
    var T = TOOLS[tool];
    if (!T) return null;
    var base = (G.MACHINE_PHOTOS ? G.MACHINE_PHOTOS.BASE : 'machine/');
    var f = ix.photo[s] || '';
    return { tool: tool, en: T.en, ru: T.ru, pts: T.pts, lim: T.lim,
             photo: f ? base + f : '', aspect: (f && ASPECT[f]) || 0 };
  }
  function has(unit, cls, model) { return !!profileFor(unit, cls, model); }

  /* Every position of the round, in the catalog's order. k is the code, one per
     numbered point — no left/right split the way the undercarriage has, because
     a bucket is one bucket. */
  function walk(unit, cls, model) {
    var p = profileFor(unit, cls, model);
    if (!p) return [];
    return p.pts.map(function (r) {
      return { n: r[0], k: r[1], point: r[1], en: r[2], ru: r[3], kind: r[4], x: r[5], y: r[6] };
    });
  }

  /* The reference for one position, or null where it is a visual check with
     nothing to measure against. Shaped exactly like WEAR.refFor's result so the
     millimetre field, the bands and the arithmetic are shared rather than
     reimplemented. GET always wears down. */
  function refFor(unit, cls, model, code) {
    var p = profileFor(unit, cls, model);
    var L = p && p.lim && p.lim[code];
    if (!L) return null;
    return { n: L.n, c: L.c, d: 'shrink', src: L.src || 'generic' };
  }

  function rowFor(unit, cls, model, code) {
    var p = profileFor(unit, cls, model);
    if (p) for (var i = 0; i < p.pts.length; i++) if (p.pts[i][1] === code) return p.pts[i];
    return null;
  }
  function label(unit, cls, model, code, lang) {
    var r = rowFor(unit, cls, model, code);
    if (r) return lang === 'ru' ? r[3] : r[2];
    /* A record captured against a tool this machine no longer carries still has
       to read as words rather than as a code. */
    var keys = Object.keys(TOOLS), i, j;
    for (i = 0; i < keys.length; i++) {
      var pts = TOOLS[keys[i]].pts;
      for (j = 0; j < pts.length; j++)
        if (pts[j][1] === code) return lang === 'ru' ? pts[j][3] : pts[j][2];
    }
    return code;
  }

  /* Everything the service worker should cache. */
  function all() {
    var base = (G.MACHINE_PHOTOS ? G.MACHINE_PHOTOS.BASE : 'machine/'), seen = {}, out = [];
    Object.keys(PHOTO_BY_MODEL).forEach(function (k) { seen[PHOTO_BY_MODEL[k]] = 1; });
    Object.keys(seen).forEach(function (f) { out.push(base + f); });
    return out;
  }

  G.GET = {
    tools: TOOLS, familyFor: familyFor, profileFor: profileFor, has: has,
    walk: walk, refFor: refFor, label: label, rowFor: rowFor, all: all, slug: slug,
    photos: PHOTO_BY_MODEL, toolByModel: TOOL_BY_MODEL,
  };
/* `self`, not `window`. The service worker importScripts() this file to learn
   which bucket and blade photographs to cache, and a service worker has no
   window — so writing to `window` left GET undefined there and the worker
   cached none of them. Every phone would have gone to the pit with no picture
   on a GET round and no way to know why. */
})(typeof self !== 'undefined' ? self : this);
