/* The numbered undercarriage walk, laid over each model's own photograph.

   Eleven numbers, in the order a fitter walks the frame: idler at the front,
   adjuster behind it, carrier above, sprocket at the back, the three roller
   positions along the ground, then the chain, the shoes, the frame and finally
   the sag. Numbering is the client's, from the undercarriage catalog, so a
   number on this screen is the same number on the printed page in the ute.

   Three pieces of geometry, and the middle one is what makes it work:

     LAYOUT  where each number sits, as a fraction of the track frame.
     BOX     where the track frame sits inside THIS model's photograph, as a
             percentage of the picture. A D9R's frame fills a different part of
             its photo than a PC800's does, so one shared layout lands on the
             right part of every machine only once the box is known.
     LABELS  what the number is called, in both languages.

   Without BOX the numbers float somewhere near the machine. With it they sit on
   the idler, on the sprocket, on the rollers — which is the whole reason for
   putting a photograph there rather than a diagram.

   GROUPS is the other half: a number is a place on the machine, and this app
   measures more finely than that. Number 6, "centre track rollers", is six
   separate measurements on an eight-roller frame. So a number resolves to the
   list of measurement keys it covers, and tapping it offers them. */
(function () {
  'use strict';

  /* n, English, Russian, what kind of check it is */
  var LABELS = [
    [1,  'Front idler',              'Направляющее колесо',        'mm'],
    [2,  'Track adjuster / recoil',  'Натяжитель / амортизатор',   'visual'],
    [3,  'Carrier roller',           'Поддерживающий каток',       'mm'],
    [4,  'Drive sprocket',           'Ведущая звёздочка',          'mm'],
    [5,  'Front track roller',       'Передний опорный каток',     'mm'],
    [6,  'Centre track rollers',     'Средние опорные катки',      'mm'],
    [7,  'Rear track roller',        'Задний опорный каток',       'mm'],
    [8,  'Track link / pin / bushing','Звено / палец / втулка',    'mm'],
    [9,  'Track shoe / grouser',     'Башмак / грунтозацеп',       'mm'],
    [10, 'Track frame / guards',     'Рама хода / защита',         'visual'],
    [11, 'Track sag / top chain',    'Провисание гусеницы',        'mm'],
  ];

  /* Fraction of the track-frame box: [n, x, y]. */
  var LAYOUT = [
    [1, 0.08, 0.52], [2, 0.22, 0.38], [3, 0.48, 0.12], [4, 0.91, 0.54],
    [5, 0.28, 0.72], [6, 0.48, 0.72], [7, 0.68, 0.72], [8, 0.45, 0.86],
    [9, 0.57, 0.96], [10, 0.55, 0.46], [11, 0.66, 0.06],
  ];

  /* Where the track frame sits inside the model's photograph:
     [left%, top%, width%, height%]. Keyed on the model as the register writes
     it. A model with no entry falls back to a sensible middle band, which is
     wrong by a little rather than absent. */
  var BOX = {
    'CATERPILLAR 336-07':      [38,66,59,27],
    'CATERPILLAR D9R':         [25,43,68,48],
    'HITACHI EX1200-6BH':      [33,63,63,29],
    'HITACHI EX1200-7BH':      [39,65,57,27],
    'HITACHI ZX280-5G':        [38,66,59,25],
    'HITACHI ZX330-5G RB':     [37,66,58,27],
    'HITACHI ZX470LC-5G':      [40,66,56,26],
    'HITACHI ZX470LCR-5G':     [39,66,57,26],
    'KOMATSU D155A.5':         [31,55,60,37],
    'KOMATSU D275.5D':         [32,55,60,37],
    'KOMATSU D375A.6':         [29,54,64,38],
    'KOMATSU P&H 44XT':        [52,75,37,19],
    'KOMATSU PC2000-8 BH':     [34,64,60,28],
    'KOMATSU PC800-8E0 (SE)':  [47,66,49,27],
    'LiuGong CLG970E':         [39,66,56,25],
    'LiuGong CLG990FHD':       [41,67,55,25],
    'MCCLOSKEY C38':           [18,69,60,20],
    'MCCLOSKEY C44':           [22,67,60,22],
    'MCCLOSKEY J45':           [24,70,55,20],
    'MCCLOSKEY J50V2':         [20,68,52,20],
    'MCCLOSKEY S190-3DT':      [27,74,47,16],
    'NMS MT1150JC':            [24,69,55,20],
    'NMS MT1860SR':            [24,73,43,17],
    'NMS MT300MC':             [22,69,68,20],
    /* The catalog files this one under DZ015_10112024 — a unit number with a
       date welded onto it, which is a fault in the register export rather than
       a machine. The register's own spelling is DZ015 / SHANTUI SD32. */
    'SHANTUI SD32':            [36,53,58,38],
    'SHANTUI SD34-B3':         [31,52,60,39],
    'SHANTUI SD60-C5':         [33,50,61,41],
    'SHANTUI SD90-C5':         [31,55,60,36],
    'SUNWARD SWDE165A':        [19,75,55,20],
  };
  var BOX_DEFAULT = [20, 55, 70, 40];

  function slug(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  var BOX_SLUG = null;
  function boxFor(model) {
    if (!BOX_SLUG) {
      BOX_SLUG = {};
      Object.keys(BOX).forEach(function (k) { BOX_SLUG[slug(k)] = BOX[k]; });
      var A = window.MACHINE_PHOTOS && window.MACHINE_PHOTOS.ALIAS;
      if (A) Object.keys(A).forEach(function (k) {
        var a = slug(k), b = slug(A[k]);
        if (BOX_SLUG[a] && !BOX_SLUG[b]) BOX_SLUG[b] = BOX_SLUG[a];
        if (BOX_SLUG[b] && !BOX_SLUG[a]) BOX_SLUG[a] = BOX_SLUG[b];
      });
    }
    return BOX_SLUG[slug(model)] || BOX_DEFAULT;
  }

  /* Which measurement keys a number covers, for `rollers` rollers on side `s`.
     Numbers 2, 10 and 11 are condition checks the measured walk does not carry
     — they are in the catalog and they are the cheap ones nobody records, so
     they are offered here and stored as graded positions rather than dropped
     from the picture and leaving gaps in the numbering. */
  function keysFor(n, s, rollers) {
    var r = Math.max(3, rollers || 8), out = [], i;
    switch (n) {
      case 1:  return ['IDLER.' + s + '-OUT', 'IDLER.' + s + '-IN'];
      case 2:  return ['ADJUST.' + s];
      case 3:  return ['CARRIER.' + s + '-OUT', 'CARRIER.' + s + '-IN'];
      case 4:  return ['SPROCKET.' + s];
      case 5:  return ['ROLLER.' + s + '1'];
      case 6:  for (i = 2; i <= r - 1; i++) out.push('ROLLER.' + s + i); return out;
      case 7:  return ['ROLLER.' + s + r];
      case 8:  return ['LINKH.' + s, 'BUSH.' + s, 'PITCH4.' + s, 'PITCH1.' + s];
      case 9:  return ['GROUSER.' + s];
      case 10: return ['FRAME.' + s];
      case 11: return ['SAG.' + s];
    }
    return [];
  }

  /* The three the measured table has no reference for. Kept apart so nothing
     downstream mistakes them for a calipered point with a missing limit. */
  var EXTRA = { ADJUST: 'visual', FRAME: 'visual', SAG: 'mm' };

  window.UCPTS = {
    labels: LABELS,
    layout: LAYOUT,
    boxFor: boxFor,
    keysFor: keysFor,
    extra: EXTRA,
    label: function (n, lang) {
      var row = LABELS[n - 1];
      return row ? (lang === 'ru' ? row[2] : row[1]) : String(n);
    },
    kind: function (n) { var row = LABELS[n - 1]; return row ? row[3] : 'mm'; },
    BOX: BOX,
  };
})();
