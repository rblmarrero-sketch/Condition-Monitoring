/* The tray, drawn as an opened box.

   The old map was honest and unreadable: it drew the regions the stations
   occupy and nothing else, so a rectangle of dots gave no clue whether you were
   looking at the floor or a wall. An inspector standing at a truck could not
   match it to the thing in front of them, which is the only job it has.

   So this draws the body the way you would open a cardboard box and press it
   flat: the floor in the middle as the reference plane, the two side walls
   folded up and down off its long edges, the head folded out to the left, and
   the tail open at the right where the load leaves. Three things do the work:

     · each folded panel is a TRAPEZOID, wider at its outer edge than at the
       hinge. That is what a surface tilted toward you looks like, and it is the
       whole 3D cue — no isometric projection, because foreshortening a grid of
       sixty-three dots would cost more in tap targets than it buys in realism.
     · a dashed HINGE sits in the gap where each panel meets the floor, so the
       fold is a thing you can see rather than infer.
     · every surface is NAMED on itself. That is the actual answer to "which one
       is the floor" — no colour scheme substitutes for the word.

   Colour is deliberately restrained. Green, amber and red already mean
   serviceable, watch and past the limit, and they are the only saturated
   colours here: a red dot must be the only red thing on the drawing. The
   surfaces carry a low-chroma tint that RISES with height off the floor —
   floor palest, walls cooler and deeper, canopy deepest — so the tint reinforces
   the fold instead of competing with the condition. Five categorical hues would
   have looked livelier and made the one dot that matters harder to find.

   Landscape, 640x330, because the reading sheet lives at the bottom of a phone.
   A landscape drawing fits the slot above it whole; the old 300x640 portrait one
   never could, which is why tapping a station used to bury the map. */
(function (W) {
  'use strict';
  var VB_W = 640, VB_H = 330;
  /* Drawn back to front: floor, then the panels folded off it, so a panel's
     edge overlaps the floor's rather than the other way round. */
  var ORDER = ['FLR1', 'FLR2', 'FLR3', 'TAIL', 'FRONT', 'LEFT', 'RIGHT'];
  /* Height off the floor, as a class. s0 is the ground plane. */
  var LIFT = { FLR1: 's0', FLR2: 's0', FLR3: 's0', TAIL: 's1', FRONT: 's3', LEFT: 's2', RIGHT: 's2' };
  var NAME = {
    /* Each caption sits in the lane its band keeps clear of stations — see
       LANE in gen.py. The head has no room for a lane across only four columns,
       so its caption goes under them instead, in the flare below the last row. */
    FRONT: { en: 'HEAD',       ru: 'ПЕРЁД',        at: 'bl' },
    /* One word. The caption only has to say WHICH SURFACE; the chip below it
       carries the full name and the count. Keeping it to a word is also what
       makes the lane wide enough in any language — "ПРАВЫЙ БОРТ" ran past the
       first station column where "RIGHT SIDE" just cleared it, and sizing the
       drawing around the longest translation is a bad trade for the grid. */
    LEFT:  { en: 'LEFT',       ru: 'ЛЕВЫЙ',        at: 'tl' },
    RIGHT: { en: 'RIGHT',      ru: 'ПРАВЫЙ',       at: 'bl' },
    FLR1:  { en: 'FLOOR',      ru: 'ПОЛ',          at: 'tl' },
    TAIL:  { en: 'TAIL',       ru: 'ХВОСТ',        at: 'tr' },
  };
  /* Both renderings of every caption on the drawing, so a printed copy can
     resolve its own words without a second drawing. The captions themselves
     stay one word for the reason above — the key goes beside the picture. */
  W.bodyFaces = NAME;

  function px(p) { return [p[0] / 100 * VB_W, p[1] / 100 * VB_H]; }
  function poly(pts) {
    return pts.map(function (p, i) { var q = px(p);
      return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ') + ' Z';
  }
  function bbox(r) {
    var xs = r.map(function (p) { return p[0]; }), ys = r.map(function (p) { return p[1]; });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
             y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  }

  /* o.model      "HM400" | "TR60"
     o.state(k)   "" | done | watch | act | na   for one station
     o.zoneState(z)                              for a zone, from its thinnest station
     o.sel        the station currently open
     o.tag        false to leave even the selected station unnamed
     o.names      false to drop the surface captions (the printed report has a
                  zone table beside it and does not need them twice) */
  W.bodyMap = function (o) {
    o = o || {};
    var G = (typeof self !== 'undefined' ? self : this);
    var B = G.BODY, id = o.model || 'HM400';
    if (!B || !B.of(id)) return '';
    var s = [], lang = o.lang || 'en';

    s.push('<svg class="bodymap" viewBox="0 0 ' + VB_W + ' ' + VB_H +
           '" preserveAspectRatio="xMidYMid meet" role="group" aria-label="' +
           (lang === 'ru' ? 'Кузов и точки замера' : 'Tray and its measurement stations') + '">');

    /* Which way is forward. Without this the drawing is symmetrical enough to
       be read back to front, and every station code is then on the wrong end. */
    s.push('<g class="bm-orient" pointer-events="none">' +
           '<text class="bm-way" x="14" y="20" text-anchor="start">' +
           (lang === 'ru' ? '◀ КАБИНА' : '◀ CAB') + '</text>' +
           '<text class="bm-way" x="' + (VB_W - 14) + '" y="20" text-anchor="end">' +
           (lang === 'ru' ? 'РАЗГРУЗКА ▶' : 'DISCHARGE ▶') + '</text></g>');

    ORDER.forEach(function (z) {
      var r = B.region(id, z);
      if (!r) return;
      var st = (o.zoneState ? o.zoneState(z) : '') || '';
      s.push('<path class="bm-z ' + LIFT[z] + (st ? ' ' + st : '') +
             '" d="' + poly(r) + '" data-band="' + z + '"/>');
    });

    /* The folds. Drawn in the gap between a panel and the floor, which is the
       one place a hinge can be without sitting on top of a station. */
    var fl = B.region(id, 'FLR2') || B.region(id, 'FLR1');
    if (fl) {
      var f = bbox(fl), L = B.region(id, 'LEFT'), R = B.region(id, 'RIGHT'), H = B.region(id, 'FRONT');
      var line = function (a, b) {
        var p = px(a), q = px(b);
        return '<path class="bm-fold" d="M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) +
               ' L' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + '"/>';
      };
      var all = B.zones(id).map(function (z) { return B.region(id, z.k); }).filter(Boolean);
      var fx0 = Math.min.apply(null, all.map(function (r) { return bbox(r).x0; }));
      var fx1 = Math.max.apply(null, all.map(function (r) { return bbox(r).x1; }));
      if (L) s.push(line([f.x0, bbox(L).y1], [fx1, bbox(L).y1]));
      if (R) s.push(line([f.x0, bbox(R).y0], [fx1, bbox(R).y0]));
      if (H) s.push(line([bbox(H).x1, f.y0], [bbox(H).x1, f.y1]));
      /* The floor's own divisions: a hairline, not a border, because front,
         middle, rear and tail are bands OF one plane and not four plates. */
      ['FLR2', 'FLR3', 'TAIL'].forEach(function (z) {
        var r2 = B.region(id, z); if (!r2) return;
        var c2 = bbox(r2), a2 = px([c2.x0, c2.y0]), b2 = px([c2.x0, c2.y1]);
        s.push('<path class="bm-div" d="M' + a2[0].toFixed(1) + ' ' + a2[1].toFixed(1) +
               ' L' + b2[0].toFixed(1) + ' ' + b2[1].toFixed(1) + '"/>');
      });
      /* The tail has no wall — the load leaves over this edge, and the edge is
         the thing that wears through. Draw it as an open lip, not a border. */
      var T = B.region(id, 'TAIL');
      if (T) {
        var t = bbox(T), a = px([t.x1, t.y0]), b = px([t.x1, t.y1]);
        s.push('<path class="bm-lip" d="M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) +
               ' L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + '"/>');
      }
    }

    /* THE MAP PICKS A SURFACE, NOT A BAND. The floor's three bands come out
       around 27 px wide on a phone — better than a 7 px dot and still half what
       a gloved thumb needs, so one hit area covers the whole floor and the chip
       row underneath picks front, middle or rear at 44 px. Three levels, each at
       a size that actually works: map → surface, chips → band, chips → station.
       The tail keeps its own control; it is wide, and it is the one that
       matters. */
    var HIT = { FRONT: ['FRONT'], LEFT: ['LEFT'], RIGHT: ['RIGHT'],
                FLOOR: ['FLR1', 'FLR2', 'FLR3'], TAIL: ['TAIL'] };
    Object.keys(HIT).forEach(function (h) {
      var rs = HIT[h].map(function (z) { return B.region(id, z); }).filter(Boolean);
      if (!rs.length) return;
      var bs = rs.map(bbox);
      var c = { x0: Math.min.apply(null, bs.map(function (b2) { return b2.x0; })),
                x1: Math.max.apply(null, bs.map(function (b2) { return b2.x1; })),
                y0: Math.min.apply(null, bs.map(function (b2) { return b2.y0; })),
                y1: Math.max.apply(null, bs.map(function (b2) { return b2.y1; })) };
      s.push('<path class="bm-hit" data-zone="' + HIT[h][0] + '" role="button" tabindex="0"' +
             ' aria-label="' + (B.zoneLabel(id, HIT[h][0], lang) || h) + '" d="' +
             poly([[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]]) + '"/>');
    });

    B.points(id).forEach(function (p) {
      var st = (o.state ? o.state(p.k) : '') || '';
      var q = px([p.x, p.y]);
      /* A DOT IS NOT A BUTTON HERE, and pretending otherwise was the bug. Sixty-
         three stations across a phone puts them about seven pixels apart — a
         quarter of what a bare fingertip needs, let alone a glove. So the dot
         is an indicator: it says how that station read, from across the yard.
         The tap target is the ZONE behind it, and the zone opens a row of
         station chips at a size a thumb can actually hit. Same division the
         undercarriage round already uses for a number covering two bands. */
      s.push('<g class="bm-p' + (st ? ' ' + st : '') + (p.k === o.sel ? ' sel' : '') +
             '" data-pt="' + p.k + '" pointer-events="none" aria-hidden="true">');
      s.push('<circle class="bm-dot" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="6"/>');
      s.push('</g>');
    });

    /* Painted AFTER the stations, not before. The caption carries a halo so it
       survives over a field of dots — but a halo is no use underneath them, and
       drawn first it was: "LEFT SIDE" came out as "LEFT S(o)E" with a station
       sitting in the middle of the word. */
    if (o.names !== false) {
      /* In a corner of each plane, not its middle — the middle is where the
         stations are, and a caption sitting under a column of dots is a caption
         nobody can read. The halo is for the two that have no corner to spare. */
      Object.keys(NAME).forEach(function (z) {
        var r = B.region(id, z); if (!r) return;
        var c = bbox(r), a = NAME[z].at, q, anc;
        if (a === 'tl')      { q = px([c.x0, c.y0]); q = [q[0] + 3, q[1] + 15];  anc = 'start'; }
        else if (a === 'bl') { q = px([c.x0, c.y1]); q = [q[0] + 3, q[1] - 7];   anc = 'start'; }
        else if (a === 'tr') { q = px([c.x1, c.y0]); q = [q[0] - 3, q[1] + 15];  anc = 'end'; }
        else                 { q = px([(c.x0 + c.x1) / 2, c.y0]); q = [q[0], q[1] + 15]; anc = 'middle'; }
        s.push('<text class="bm-face" pointer-events="none" x="' + q[0].toFixed(1) +
               '" y="' + q[1].toFixed(1) + '" text-anchor="' + anc + '">' +
               (NAME[z][lang] || NAME[z].en) + '</text>');
      });
    }

    /* Name the one station you are on, in a chip rather than bare text — over a
       field of dots, unbacked text is unreadable at exactly the moment it is
       needed. Sixty-three labels is the diagram nobody can read; none at all
       leaves you trusting the app about which dot is which. */
    if (o.sel && o.tag !== false) {
      var sp = B.get(id, o.sel);
      if (sp) {
        /* Put the chip where it covers nothing. Beside the dot is the obvious
           place and it is wrong on the head, where the columns are twenty units
           apart and the chip lands squarely on the next station — hiding what
           that one read for as long as this one is selected. So try right,
           left, above, below in that order and take the first that is clear of
           every other station; if the tray is too tight for any of them, right
           is still better than nothing. */
        var c2 = px([sp.x, sp.y]);
        var w = 20 + String(o.sel).length * 10.5, h = 26;
        var others = B.points(id).filter(function (q) { return q.k !== o.sel; })
                      .map(function (q) { return px([q.x, q.y]); });
        var cand = [[c2[0] + 14, c2[1] - h / 2], [c2[0] - 14 - w, c2[1] - h / 2],
                    [c2[0] - w / 2, c2[1] - 16 - h], [c2[0] - w / 2, c2[1] + 16]];
        var bx = cand[0][0], by = cand[0][1];
        for (var ci = 0; ci < cand.length; ci++) {
          var X = cand[ci][0], Y = cand[ci][1];
          if (X < 2 || X + w > VB_W - 2 || Y < 2 || Y + h > VB_H - 2) continue;
          var clash = others.some(function (q) {
            return q[0] > X - 7 && q[0] < X + w + 7 && q[1] > Y - 7 && q[1] < Y + h + 7; });
          if (!clash) { bx = X; by = Y; break; }
        }
        s.push('<g class="bm-tag" pointer-events="none">' +
               '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) +
               '" width="' + w.toFixed(1) + '" height="' + h + '" rx="7"/>' +
               '<text x="' + (bx + w / 2).toFixed(1) + '" y="' + (by + 18).toFixed(1) +
               '" text-anchor="middle">' + o.sel + '</text></g>');
      }
    }
    s.push('</svg>');
    return s.join('');
  };
})(typeof self !== 'undefined' ? self : this);
