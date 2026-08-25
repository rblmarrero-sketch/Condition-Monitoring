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

  /* Fraction of the track-frame box: [n, x, y].

     Two rules, and the second is not a nicety. Each number sits on the part it
     names — 1 on the idler at the front of the loop, 4 on the sprocket at the
     back, 5/6/7 along the lower rollers, 3 and 11 up on the top run, 9 on the
     shoes at the floor. And no two of them touch: a puck is 26 units across in
     a 460-wide drawing, so two numbers a tenth of a short box apart print as
     one number with a bite out of it, which is how "centre track rollers"
     disappeared behind "track link" on the D275 sheet. tests/ucbox.cjs
     measures both against every model's own box. */
  var LAYOUT = [
    [1, 0.06, 0.56], [2, 0.21, 0.36], [3, 0.46, 0.13], [4, 0.94, 0.56],
    [5, 0.16, 0.84], [6, 0.50, 0.84], [7, 0.84, 0.84], [8, 0.71, 0.15],
    [9, 0.34, 0.99], [10, 0.36, 0.56], [11, 0.30, 0.14],
  ];

  /* Where the track frame sits inside the model's photograph:
     [left%, top%, width%, height%]. Keyed on the model as the register writes
     it. A model with no entry falls back to a sensible middle band, which is
     wrong by a little rather than absent. */
  var BOX = {
    'CATERPILLAR 336-07':     [38.8,71.1,55.8,26.8],
    'CATERPILLAR D9R':        [29.4,58.8,50.9,37.8],
    'HITACHI EX1200-6BH':     [30.8,58.7,58.9,37.7],
    'HITACHI EX1200-7BH':     [36.5,67.3,56.7,29.5],
    'HITACHI ZX280-5G':       [38.8,67.8,53.7,29.5],
    'HITACHI ZX330-5G RB':    [36.8,73.9,55.2,20.3],
    'HITACHI ZX470LC-5G':     [31.9,72.4,63.2,25.2],
    'HITACHI ZX470LCR-5G':    [36.3,73.9,58.7,23.9],
    'KOMATSU D155A.5':        [29,54.6,53.1,40.4],
    'KOMATSU D275.5D':        [26.7,55.1,51.5,40.1],
    'KOMATSU D375A.6':        [29.1,57.9,49.1,37.6],
    'KOMATSU P&H 44XT':       [19.3,77.3,62.4,21.6],
    'KOMATSU PC2000-8 BH':    [35.9,68.2,55.5,30.2],
    'KOMATSU PC800-8E0 (SE)': [44.1,68.7,45.7,28.6],
    'LiuGong CLG970E':        [40.7,72.6,51.4,24],
    'LiuGong CLG990FHD':      [37.8,66.5,51.6,31.4],
    'MCCLOSKEY C38':          [22.7,55.4,46.5,41.7],
    'MCCLOSKEY C44':          [22.4,54.9,56.9,43],
    'MCCLOSKEY J45':          [18.2,56.4,37,41.8],
    'MCCLOSKEY J50V2':        [18.7,58.1,46,38.5],
    'MCCLOSKEY S190-3DT':     [26.1,67,42.4,30.7],
    'NMS MT1150JC':           [18.2,55.2,41.7,41.8],
    'NMS MT1860SR':           [26.6,58.3,38.9,38.7],
    'NMS MT300MC':            [19.5,54.2,48,42.3],
    /* The catalog files this one under DZ015_10112024 — a unit number with a
       date welded onto it, which is a fault in the register export rather than
       a machine. The register's own spelling is DZ015 / SHANTUI SD32. */
    'SHANTUI SD32':           [27.3,60.5,49,35.6],
    'SHANTUI SD34-B3':        [28.4,57.1,52.5,38.4],
    'SHANTUI SD60-C5':        [32.2,62.4,48.3,35.8],
    'SHANTUI SD90-C5':        [29.5,58.6,47.9,36.4],
    'SUNWARD SWDE165A':       [13.4,69.3,69.8,29.5],
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
