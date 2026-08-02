/* The machine, in side view, at the top of the screen.

   An inspector standing at a dozer does not need to be told it is a dozer. The
   figure is not decoration and it is not a photograph of their machine — it is
   an orientation cue and a target:

     It says which end is which. "Left" and "Right" mean nothing until you know
     which way the machine is facing in the drawing. The figure faces the same
     way as the track frames drawn below it — idler forward, sprocket back — so
     roller 1 on the screen is roller 1 on the ground.

     It says what this round is about. On an undercarriage round the track is
     lit and the rest of the machine drops back; on a GET round the bucket
     teeth or the blade edge are lit instead. Two rounds on the same machine
     look different from arm's length, which is the point.

   Why drawn and not photographed. Every byte here is in the offline shell, and
   the shell has to install completely on a pit connection or the app will not
   open — five machine photographs is about a megabyte of the thing that must
   never fail. The drawing is a few kilobytes, stays sharp on any screen, and,
   unlike a photograph, can be lit by the state of the round.

   A real photograph is still welcome where one exists. Drop a file in
   mobile/machine/<family>.jpg and list it in window.MACHINE_PHOTOS (see
   photoFor below) and it is used instead, per family, with the drawing as the
   fallback for every family that has none. Nothing else changes. */
(function () {
  'use strict';

  var VB_W = 480, VB_H = 190;

  /* ---- which drawing ------------------------------------------------------
     From the register's class, not from the unit prefix: a prefix is a naming
     habit and classes are what the fleet is actually keyed on. The prefix is
     the fallback for a machine that arrived before the register caught up —
     the same reasoning as componentsForUnit(). */
  var BY_CLASS = [
    [/EXCAVATOR/i,            'ex'],
    [/ROCK ?BREAKER/i,        'ex'],
    [/DOZER/i,                'dz'],
    [/DRILL/i,                'dr'],
    [/LOADER, FRONT|WHEEL ?LOADER/i, 'ld'],
    [/GRADER/i,               'gr'],
    [/TRUCK, (HAUL|DUMP|MINE)/i, 'tk'],
    [/COMPACTOR|ROLLER DRUM/i, 'cd'],
  ];
  var BY_PREFIX = { EX: 'ex', RB: 'ex', DZ: 'dz', DR: 'dr', LD: 'ld', GR: 'gr', TK: 'tk', CD: 'cd' };

  function familyFor(unit, cls) {
    var c = String(cls || '');
    for (var i = 0; i < BY_CLASS.length; i++) if (BY_CLASS[i][0].test(c)) return BY_CLASS[i][1];
    var m = /^([A-Za-z]+)/.exec(String(unit || ''));
    return (m && BY_PREFIX[m[1].toUpperCase()]) || '';
  }

  /* ---- shared pieces ------------------------------------------------------
     A track loop drawn the same way as the one on the measurement map: rails
     either side of a pin line, rollers under it, a sprocket at one end. Small
     here, so it carries the shape and not the detail. */
  function trackLoop(x0, x1, cy, r, rollers, high) {
    var s = [], i;
    if (high) {
      // elevated sprocket: the top run climbs to the drive at the rear
      s.push('<path class="mf-uc" d="M' + x0 + ',' + (cy - r) + ' L' + (x1 - 26) + ',' + (cy - r - 26) +
             ' A' + (r - 4) + ',' + (r - 4) + ' 0 0 1 ' + (x1 - 26) + ',' + (cy - r + 2 * (r - 4) - 26) +
             ' L' + x0 + ',' + (cy + r) +
             ' A' + r + ',' + r + ' 0 0 1 ' + x0 + ',' + (cy - r) + ' Z"/>');
      s.push('<circle class="mf-uc-w" cx="' + (x1 - 26) + '" cy="' + (cy - 26) + '" r="' + (r - 9) + '"/>');
    } else {
      s.push('<path class="mf-uc" d="M' + x0 + ',' + (cy - r) + ' L' + x1 + ',' + (cy - r) +
             ' A' + r + ',' + r + ' 0 0 1 ' + x1 + ',' + (cy + r) +
             ' L' + x0 + ',' + (cy + r) +
             ' A' + r + ',' + r + ' 0 0 1 ' + x0 + ',' + (cy - r) + ' Z"/>');
      s.push('<circle class="mf-uc-w" cx="' + x1 + '" cy="' + cy + '" r="' + (r - 7) + '"/>');
    }
    s.push('<circle class="mf-uc-w" cx="' + x0 + '" cy="' + cy + '" r="' + (r - 7) + '"/>');
    var n = Math.max(3, rollers || 7), step = (x1 - x0 - 22) / (n - 1);
    for (i = 0; i < n; i++)
      s.push('<circle class="mf-uc-r" cx="' + Math.round(x0 + 11 + i * step) + '" cy="' + (cy + r - 3) + '" r="4.5"/>');
    // grousers on the ground run — what makes it read as a track and not a wheel
    for (i = x0; i <= x1; i += 13)
      s.push('<path class="mf-hair" d="M' + i + ',' + (cy + r) + ' l0,5"/>');
    return '<g class="mf-part" data-part="UC">' + s.join('') + '</g>';
  }

  /* Teeth along a bucket lip or a blade edge, evenly spaced on a line. */
  function teeth(x0, y0, x1, y1, n, len) {
    var s = [], dx = (x1 - x0) / n, dy = (y1 - y0) / n;
    var L = Math.sqrt(dx * dx + dy * dy) || 1, nx = dy / L, ny = -dx / L;
    for (var i = 0; i < n; i++) {
      var cx = x0 + dx * (i + 0.5), cy = y0 + dy * (i + 0.5);
      s.push('<path class="mf-tooth" d="M' + (cx - dx * 0.34) + ',' + (cy - dy * 0.34) +
             ' L' + (cx - nx * len) + ',' + (cy - ny * len) +
             ' L' + (cx + dx * 0.34) + ',' + (cy + dy * 0.34) + ' Z"/>');
    }
    return s.join('');
  }

  /* ---- the machines -------------------------------------------------------
     Each returns the body of an SVG. Every group that a round can be about
     carries data-part, so the highlight below can find it without any drawing
     needing to know that highlighting exists. */
  var DRAW = {};

  DRAW.ex = function () {                          // excavator, bucket curled under
    return [
      trackLoop(196, 404, 150, 22, 8, false),
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M214,124 L214,96 Q214,88 222,88 L392,88 Q404,88 404,100 L404,124 Z"/>',
      '<path class="mf-body" d="M300,88 L300,44 Q300,36 310,36 L352,36 Q360,36 360,44 L360,88 Z"/>',
      '<path class="mf-glass" d="M307,44 L353,44 L353,80 L307,80 Z"/>',
      '<path class="mf-hair" d="M368,88 L368,52 L396,52 L396,88"/>',   // engine deck
      '</g>',
      '<g class="mf-part" data-part="BOOM">',
      '<path class="mf-arm" d="M296,74 Q222,6 148,26 L138,44 Q206,34 288,90 Z"/>',
      '<path class="mf-arm" d="M148,26 L104,112 L124,120 L164,38 Z"/>',
      '<path class="mf-hair" d="M262,52 L226,76"/><path class="mf-hair" d="M150,44 L128,96"/>',
      '</g>',
      '<g class="mf-part" data-part="GET">',
      '<path class="mf-body" d="M104,112 Q78,126 76,150 Q96,166 124,158 L134,126 Z"/>',
      teeth(76, 150, 122, 160, 5, 15),
      '</g>',
    ].join('');
  };

  DRAW.dz = function (high) {                      // dozer, blade forward, ripper aft
    return [
      trackLoop(150, 360, 148, 24, 7, high !== false),
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M158,124 L158,84 Q158,76 168,76 L338,76 Q350,76 350,90 L350,124 Z"/>',
      '<path class="mf-body" d="M236,76 L236,34 Q236,26 246,26 L306,26 Q314,26 314,34 L314,76 Z"/>',
      '<path class="mf-glass" d="M243,34 L307,34 L307,68 L243,68 Z"/>',
      '<path class="mf-hair" d="M212,76 L212,44 L224,44 L224,76"/>',   // stack
      '</g>',
      '<g class="mf-part" data-part="GET">',
      '<path class="mf-body" d="M104,66 Q84,104 86,168 L124,168 Q120,108 132,72 Z"/>',
      '<path class="mf-hair" d="M132,96 L246,120"/><path class="mf-hair" d="M128,132 L214,140"/>',
      teeth(86, 168, 124, 168, 3, 12),
      '<path class="mf-body" d="M364,110 L392,110 L406,168 L386,168 Z"/>',   // ripper shank
      '<path class="mf-tooth" d="M386,168 L406,168 L400,184 L390,184 Z"/>',
      '</g>',
    ].join('');
  };

  DRAW.dr = function () {                          // blasthole drill, mast up
    return [
      trackLoop(150, 366, 152, 20, 6, false),
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M156,130 L156,86 Q156,78 166,78 L356,78 Q368,78 368,90 L368,130 Z"/>',
      '<path class="mf-body" d="M290,78 L290,40 Q290,32 300,32 L346,32 Q354,32 354,40 L354,78 Z"/>',
      '<path class="mf-glass" d="M297,40 L347,40 L347,70 L297,70 Z"/>',
      '</g>',
      '<g class="mf-part" data-part="MAST">',
      '<path class="mf-arm" d="M176,78 L176,8 L214,8 L214,78 Z"/>',
      '<path class="mf-hair" d="M176,26 L214,26"/><path class="mf-hair" d="M176,48 L214,48"/>',
      '</g>',
      '<g class="mf-part" data-part="GET">',
      '<path class="mf-arm" d="M191,78 L199,78 L199,172 L191,172 Z"/>',
      '<path class="mf-tooth" d="M186,172 L204,172 L195,188 Z"/>',
      '</g>',
    ].join('');
  };

  DRAW.ld = function () {                          // wheel loader, articulated
    return [
      '<g class="mf-part" data-part="UC">',
      '<circle class="mf-uc" cx="228" cy="146" r="34"/><circle class="mf-uc-w" cx="228" cy="146" r="15"/>',
      '<circle class="mf-uc" cx="368" cy="146" r="34"/><circle class="mf-uc-w" cx="368" cy="146" r="15"/>',
      '</g>',
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M196,146 L196,104 Q196,96 206,96 L400,96 Q412,96 412,110 L412,146 Z"/>',
      '<path class="mf-body" d="M256,96 L256,46 Q256,38 266,38 L322,38 Q330,38 330,46 L330,96 Z"/>',
      '<path class="mf-glass" d="M263,46 L323,46 L323,88 L263,88 Z"/>',
      '<path class="mf-hair" d="M298,96 L298,146"/>',                  // articulation
      '</g>',
      '<g class="mf-part" data-part="BOOM">',
      '<path class="mf-arm" d="M258,92 L150,120 L150,136 L262,112 Z"/>',
      '</g>',
      '<g class="mf-part" data-part="GET">',
      '<path class="mf-body" d="M150,110 Q112,120 96,156 L146,168 Q152,138 158,124 Z"/>',
      teeth(96, 156, 146, 168, 4, 14),
      '</g>',
    ].join('');
  };

  DRAW.gr = function () {                          // motor grader, moldboard mid
    return [
      '<g class="mf-part" data-part="UC">',
      '<circle class="mf-uc" cx="140" cy="152" r="26"/><circle class="mf-uc-w" cx="140" cy="152" r="11"/>',
      '<circle class="mf-uc" cx="356" cy="152" r="28"/><circle class="mf-uc-w" cx="356" cy="152" r="12"/>',
      '<circle class="mf-uc" cx="410" cy="152" r="28"/><circle class="mf-uc-w" cx="410" cy="152" r="12"/>',
      '</g>',
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M140,140 L140,116 L262,116 L262,96 Q262,88 272,88 L420,88 Q432,88 432,102 L432,140 Z"/>',
      '<path class="mf-body" d="M266,88 L266,44 Q266,36 276,36 L326,36 Q334,36 334,44 L334,88 Z"/>',
      '<path class="mf-glass" d="M273,44 L327,44 L327,80 L273,80 Z"/>',
      '</g>',
      '<g class="mf-part" data-part="GET">',
      '<path class="mf-body" d="M206,120 Q198,142 200,168 L232,168 Q230,140 236,122 Z"/>',
      teeth(200, 168, 232, 168, 3, 10),
      '</g>',
    ].join('');
  };

  DRAW.tk = function () {                          // rigid haul truck
    return [
      '<g class="mf-part" data-part="UC">',
      '<circle class="mf-uc" cx="176" cy="146" r="34"/><circle class="mf-uc-w" cx="176" cy="146" r="15"/>',
      '<circle class="mf-uc" cx="374" cy="146" r="34"/><circle class="mf-uc-w" cx="374" cy="146" r="15"/>',
      '</g>',
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M132,146 L132,104 Q132,94 144,94 L410,94 L410,146 Z"/>',
      '<path class="mf-body" d="M138,94 L138,56 Q138,48 148,48 L196,48 Q204,48 204,56 L204,94 Z"/>',
      '<path class="mf-glass" d="M145,56 L197,56 L197,86 L145,86 Z"/>',
      '<path class="mf-arm" d="M126,44 L432,44 L446,14 L112,14 Z"/>',   // dump body
      '</g>',
    ].join('');
  };

  DRAW.cd = function () {                          // drum compactor
    return [
      '<g class="mf-part" data-part="UC">',
      '<circle class="mf-uc" cx="176" cy="140" r="44"/><circle class="mf-uc-w" cx="176" cy="140" r="14"/>',
      '<circle class="mf-uc" cx="378" cy="150" r="32"/><circle class="mf-uc-w" cx="378" cy="150" r="13"/>',
      '</g>',
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M226,150 L226,106 Q226,98 236,98 L406,98 Q418,98 418,112 L418,150 Z"/>',
      '<path class="mf-body" d="M258,98 L258,48 Q258,40 268,40 L324,40 Q332,40 332,48 L332,98 Z"/>',
      '<path class="mf-glass" d="M265,48 L325,48 L325,90 L265,90 Z"/>',
      '<path class="mf-arm" d="M212,112 L232,112 L232,132 L212,132 Z"/>',
      '</g>',
    ].join('');
  };

  DRAW[''] = function () {                         // anything else: a plant box
    return [
      '<g class="mf-part" data-part="BODY">',
      '<path class="mf-body" d="M140,150 L140,72 Q140,62 152,62 L340,62 Q352,62 352,74 L352,150 Z"/>',
      '<path class="mf-glass" d="M162,84 L228,84 L228,124 L162,124 Z"/>',
      '<path class="mf-hair" d="M252,84 L330,84"/><path class="mf-hair" d="M252,104 L330,104"/>',
      '<path class="mf-hair" d="M252,124 L330,124"/>',
      '</g>',
    ].join('');
  };

  /* ---- a real photograph, if one was supplied -----------------------------
     window.MACHINE_PHOTOS = { ex: "machine/excavator.jpg", dz: "..." }. Keys are
     families; a family with no entry keeps the drawing. Kept out of this file so
     that adding a photograph is a data change and never a code change. */
  function photoFor(fam) {
    var reg = window.MACHINE_PHOTOS;
    return (reg && typeof reg === 'object' && reg[fam]) ? String(reg[fam]) : '';
  }

  /* ---- the figure ---------------------------------------------------------
     opts: { part, side, label, cls, alt }
       part  — 'UC' | 'GET' | '' : which group is lit
       side  — 'L' | 'R' | ''    : mirrors the drawing so the side being walked
                                   faces the reader the way the machine does
       label — text in the corner, already translated
       alt   — accessible name */
  function svg(fam, opts) {
    opts = opts || {};
    var draw = DRAW[fam] || DRAW[''];
    var part = String(opts.part || '').toUpperCase();
    var body = draw();
    var photo = photoFor(fam);
    var alt = opts.alt || 'Machine, side view';
    var cls = 'mfig' + (opts.cls ? ' ' + opts.cls : '') + (part ? ' hi-' + part.toLowerCase() : '');

    if (photo) {
      /* A photograph cannot be lit part by part, so the highlight becomes a band
         across the region instead of a change of tone. Same information, drawn
         over the top rather than into it. */
      return '<figure class="' + cls + ' mfig-photo"' + (opts.side ? ' data-side="' + opts.side + '"' : '') + '>' +
             '<img src="' + photo + '" alt="' + alt + '" loading="lazy" decoding="async">' +
             (opts.label ? '<figcaption>' + opts.label + '</figcaption>' : '') +
             '</figure>';
    }
    return '<figure class="' + cls + '"' + (opts.side ? ' data-side="' + opts.side + '"' : '') + '>' +
           '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" role="img" aria-label="' + alt + '">' +
           body + '</svg>' +
           (opts.label ? '<figcaption>' + opts.label + '</figcaption>' : '') +
           '</figure>';
  }

  window.MFIG = {
    familyFor: familyFor,
    svg: svg,
    photoFor: photoFor,
    families: Object.keys(DRAW).filter(Boolean),
    VB: { w: VB_W, h: VB_H },
  };
})();
