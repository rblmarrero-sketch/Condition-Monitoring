/* The tray, in plan, with its 63 stations on it.

   The client's own diagram prints 63 labels on one outline. That works at A4 on
   a clipboard and does not work at 412 px in a glove — the labels are the first
   thing to become unreadable, and they are also the least useful thing on the
   map. So this draws the same tray and the same stations, and moves the naming
   into the chip row beneath: the map answers WHERE and HOW BAD, the chips
   answer WHICH. Same division as the undercarriage and GET rounds, so an
   inspector who can read one can read this.

   Zones are drawn as regions rather than implied by the numbering, because the
   thing being judged is a zone — a body does not fail as an average of
   sixty-three numbers, it fails at the thinnest station in one area. */
(function (W) {
  'use strict';
  var VB_W = 300, VB_H = 640;

  /* The tray outline, traced from the same diagram the stations came from: a
     long box, the front wall canted in at the top, the floor narrowing to the
     discharge end. Coordinates are percentages so the station table and the
     outline cannot drift apart. */
  function pathOf(pts) {
    return pts.map(function (p, i) {
      return (i ? 'L' : 'M') + (p[0] / 100 * VB_W).toFixed(1) + ' ' + (p[1] / 100 * VB_H).toFixed(1);
    }).join(' ') + ' Z';
  }
  /* The regions are derived from where the stations actually are, not sketched
     to look like a tray. Every station must land inside the zone it belongs to
     — a front-wall reading sitting in the floor region is a map that lies —
     and bodychk.cjs holds all sixty-three to that. Measured extents:

       front  x 18.0-83.8  y  3.1-17.8      floor 1  y 22.6
       left   x  8.0-18.9  y  7.1-90.7      floor 2  y 43.5
       right  x 81.8-93.3  y  7.1-90.7      floor 3  y 68.2
       tail   x 21.9-79.8  y 75.8-93.6

     The floor narrows toward the discharge end, which is why the side bands are
     not parallel and the floor bands are trapezoids. */
  var TOP = 1.5, BOT = 98.5, SIDE_L = 4.0, SIDE_R = 96.0;
  var FRONT_BOT = 20.0;                  // the front wall face, down to F21/F22
  var IN_TOP = 21.5, IN_BOT = 78.5;      // floor edge at the front of the tray
  var OUT_TOP = 21.0, OUT_BOT = 79.0;    // and at the discharge end
  function floorEdge(y) {                // where the floor's two sides are at y
    var t = Math.max(0, Math.min(1, (y - FRONT_BOT) / (BOT - FRONT_BOT)));
    return [IN_TOP + t * (OUT_TOP - IN_TOP - 3.0), IN_BOT + t * (OUT_BOT - IN_BOT + 3.0)];
  }
  var SHELL = [[SIDE_L, TOP], [SIDE_R, TOP], [SIDE_R, BOT], [SIDE_L, BOT]];
  var FRONT = [[SIDE_L + 10, TOP], [SIDE_R - 10, TOP],
               [floorEdge(FRONT_BOT)[1], FRONT_BOT], [floorEdge(FRONT_BOT)[0], FRONT_BOT]];
  var LEFT  = [[SIDE_L, TOP], [SIDE_L + 10, TOP], [floorEdge(FRONT_BOT)[0], FRONT_BOT],
               [floorEdge(BOT)[0], BOT], [SIDE_L, BOT]];
  var RIGHT = [[SIDE_R, TOP], [SIDE_R - 10, TOP], [floorEdge(FRONT_BOT)[1], FRONT_BOT],
               [floorEdge(BOT)[1], BOT], [SIDE_R, BOT]];
  var FLOOR = [[floorEdge(FRONT_BOT)[0], FRONT_BOT], [floorEdge(FRONT_BOT)[1], FRONT_BOT],
               [floorEdge(BOT)[1], BOT], [floorEdge(BOT)[0], BOT]];
  /* Band edges sit between the station rows, so each band holds exactly its own. */
  var BANDS = [
    ['FLR1', FRONT_BOT, 33.0], ['FLR2', 33.0, 56.0], ['FLR3', 56.0, 72.5], ['TAIL', 72.5, BOT],
  ];
  function bandPath(y0, y1) {
    var a = floorEdge(y0), b = floorEdge(y1);
    return pathOf([[a[0], y0], [a[1], y0], [b[1], y1], [b[0], y1]]);
  }
  W.bodyRegions = function () {
    return { FRONT: FRONT, LEFT: LEFT, RIGHT: RIGHT,
             FLR1: null, FLR2: null, FLR3: null, TAIL: null,
             band: function (k) { for (var i = 0; i < BANDS.length; i++) if (BANDS[i][0] === k) {
               var a = floorEdge(BANDS[i][1]), b = floorEdge(BANDS[i][2]);
               return [[a[0], BANDS[i][1]], [a[1], BANDS[i][1]], [b[1], BANDS[i][2]], [b[0], BANDS[i][2]]];
             } return null; } };
  };
  var ZFILL = { FRONT: 'z1', LEFT: 'z2', RIGHT: 'z2', FLR1: 'z3', FLR2: 'z4', FLR3: 'z3', TAIL: 'z5' };

  /* o.state(code)  -> "" | done | watch | act   the band for one station
     o.zoneState(z) -> the same, for the zone as a whole
     o.sel          -> the station or zone currently open */
  W.bodyMap = function (o) {
    o = o || {};
    var B = (typeof self !== 'undefined' ? self : this).BODY;
    if (!B) return '';
    var s = [], lang = o.lang || 'en';
    s.push('<svg class="bodymap" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" role="group" aria-label="' +
           (lang === 'ru' ? 'Кузов, вид сверху' : 'Tray, plan view') + '">');
    s.push('<path class="bm-shell" d="' + pathOf(SHELL) + '"/>');
    /* the regions, each carrying its own state so a zone reads before any
       single station does */
    [['FRONT', FRONT], ['LEFT', LEFT], ['RIGHT', RIGHT]].forEach(function (r) {
      var st = (o.zoneState ? o.zoneState(r[0]) : '') || '';
      s.push('<path class="bm-z ' + ZFILL[r[0]] + (st ? ' ' + st : '') +
             (r[0] === o.sel ? ' sel' : '') + '" data-zone="' + r[0] + '" d="' + pathOf(r[1]) + '"/>');
    });
    s.push('<path class="bm-floor" d="' + pathOf(FLOOR) + '"/>');
    BANDS.forEach(function (b) {
      var st = (o.zoneState ? o.zoneState(b[0]) : '') || '';
      s.push('<path class="bm-z ' + ZFILL[b[0]] + (st ? ' ' + st : '') +
             (b[0] === o.sel ? ' sel' : '') + '" data-zone="' + b[0] + '" d="' + bandPath(b[1], b[2]) + '"/>');
    });
    /* the stations. Small, because there are sixty-three of them and their job
       here is coverage and colour, not identification. */
    B.points.forEach(function (p) {
      var st = (o.state ? o.state(p.k) : '') || '';
      var x = (p.x / 100 * VB_W).toFixed(1), y = (p.y / 100 * VB_H).toFixed(1);
      s.push('<g class="bm-p' + (st ? ' ' + st : '') + (p.k === o.sel ? ' sel' : '') +
             '" data-pt="' + p.k + '" role="button" tabindex="0" aria-label="' + p.k + '">');
      /* the target is bigger than the mark, the same trick the machine map uses */
      s.push('<circle class="bm-hit" cx="' + x + '" cy="' + y + '" r="14"/>');
      s.push('<circle class="bm-dot" cx="' + x + '" cy="' + y + '" r="5.4"/>');
      s.push('</g>');
    });
    s.push('</svg>');
    return s.join('');
  };
})(typeof self !== 'undefined' ? self : this);
