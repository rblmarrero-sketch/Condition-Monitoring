/* The tray, drawn to its own real shape.

   The old map was honest and unreadable: it drew the regions the stations
   occupy and nothing else, so a rectangle of dots gave no clue whether you were
   looking at the floor or a wall. An inspector standing at a truck could not
   match it to the thing in front of them, which is the only job it has.

   Every panel below is traced from the manufacturer's own plan-view drawing for
   that model — the header's real taper, the side walls running the tray's full
   length, the floor narrowing into the tail the way the actual plate does — not
   a generic evenly-spaced grid standing in for it. HM400 and TR60 do not share
   one shape; each model carries its own outline and its own portrait canvas
   size (BODY.of(id).vb), because the real machines do not share one shape
   either.

   PORTRAIT, because that is how the sheet is drawn and how an inspector holds
   the phone while walking the tray — head at the top, tail at the bottom, the
   two side walls left and right of the floor exactly where they sit on the
   machine. A portrait tray diagram was tried once before and reverted, but for
   a different reason: that one had no bounded canvas, so it rendered at its own
   natural size and pushed the reading sheet below the fold. Every drawing here
   still renders into a viewBox with `preserveAspectRatio`, so the HOST controls
   how tall it appears on screen; `tests/tray.cjs` proves the map still gives
   way above the reading sheet on this shape too.

   Colour is deliberately restrained. Green, amber and red already mean
   serviceable, watch and past the limit, and they are the only saturated
   colours here: a red dot must be the only red thing on the drawing. The
   surfaces carry a low-chroma tint that RISES with height off the floor —
   floor palest, walls cooler and deeper, canopy deepest — so the tint reinforces
   the structure instead of competing with the condition. */
(function (W) {
  'use strict';
  /* Each model's own canvas, read off BODY.of(id).vb — the exact pixel size of
     the manufacturer drawing it was traced from, so the panel's real aspect
     (HM400 tall and narrow, TR60 close to square) survives onto the phone.
     Module-level and reset at the top of every render, same as vbH always was:
     rendering is single-threaded, one drawing at a time. */
  var VB_W = 401, vbH = 879;
  /* Drawn back to front: floor, then the panels folded off it, so a panel's
     edge overlaps the floor's rather than the other way round. */
  var ORDER = ['FLR1', 'FLR2', 'FLR3', 'TAIL', 'FRONT', 'LEFT', 'RIGHT'];
  /* Height off the floor, as a class. s0 is the ground plane. */
  var LIFT = { FLR1: 's0', FLR2: 's0', FLR3: 's0', TAIL: 's1', FRONT: 's3', LEFT: 's2', RIGHT: 's2' };
  var NAME = {
    /* Each anchor names where on ITS OWN panel the caption sits: 'tl'/'tr' the
       top corners, 'ml'/'mr' mid-height on a tall strip — the side walls run
       the full length of the tray now, so a corner anchor would sit right on
       top of the header or the tail instead of on the wall it names. */
    FRONT: { en: 'HEAD',       ru: 'ПЕРЁД',        at: 'tl' },
    /* One word. The caption only has to say WHICH SURFACE; the chip below it
       carries the full name and the count. Keeping it to a word is also what
       makes the lane wide enough in any language — "ПРАВЫЙ БОРТ" ran past the
       first station column where "RIGHT SIDE" just cleared it, and sizing the
       drawing around the longest translation is a bad trade for the grid. */
    LEFT:  { en: 'LEFT',       ru: 'ЛЕВЫЙ',        at: 'ml' },
    RIGHT: { en: 'RIGHT',      ru: 'ПРАВЫЙ',       at: 'mr' },
    FLR1:  { en: 'FLOOR',      ru: 'ПОЛ',          at: 'tl' },
    TAIL:  { en: 'TAIL',       ru: 'ХВОСТ',        at: 'tl' },
  };
  /* Both renderings of every caption on the drawing, so a printed copy can
     resolve its own words without a second drawing. The captions themselves
     stay one word for the reason above — the key goes beside the picture. */
  W.bodyFaces = NAME;

  function px(p) { return [p[0] / 100 * VB_W, p[1] / 100 * vbH]; }
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
    var M = B && B.of(id);
    if (!B || !M) return '';
    var s = [], lang = o.lang || 'en';
    var vb = M.vb || { w: 401, h: 879 };
    VB_W = vb.w; vbH = vb.h;

    /* o.cssH is the report's own call: an explicit height in real CSS pixels,
       width computed from the model's own ratio and stated as its own pixel
       figure — never "auto". A live browser derives an SVG's auto width from
       its viewBox correctly; html2canvas, which is what actually rasterises
       the PDF, does not, the same gap noted elsewhere in this file for
       `aspect-ratio`. On screen "auto" and this figure are the same number,
       so nothing here is guessed — but the file printed a 46 px sliver of
       HM400's tray with every floor and right-side station gone, on a
       drawing that measured 292 px wide in the very DOM html2canvas was
       handed. Both dimensions are now numbers no renderer can decline.
       The report's shared `.bodymap` rule is `width:100%`, right for the old
       shared landscape box and wrong for a tall narrow one — an inline style
       here beats that rule outright rather than fighting it through a class,
       and leaves the phone (which never passes cssH) untouched. */
    var sizeStyle = o.cssH
      ? ' style="width:' + Math.round(o.cssH * vb.w / vb.h) + 'px;height:' + o.cssH
        + 'px;display:block;margin:0 auto;max-height:none;"'
      : '';
    s.push('<svg class="bodymap"' + sizeStyle + ' viewBox="0 0 ' + VB_W.toFixed(1) + ' ' + vbH.toFixed(1) +
           '" preserveAspectRatio="xMidYMid meet" role="group" aria-label="' +
           (lang === 'ru' ? 'Кузов и точки замера' : 'Tray and its measurement stations') + '">');

    /* A label anywhere on this drawing can land on a station now that a panel's
       own shape decides where its points sit, rather than an even grid that
       kept every corner clear by construction. One check serves every label on
       the map: does a candidate box overlap any dot, at the dot's own on-screen
       size — and if it does, try the next position. */
    var allPts = B.points(id).map(function (p) { return px([p.x, p.y]); });
    function fits(x0, x1, y0, y1) {
      return !allPts.some(function (q) {
        return q[0] > x0 - 9 && q[0] < x1 + 9 && q[1] > y0 - 9 && q[1] < y1 + 9;
      });
    }
    /* A floor liner column runs stations every few percent of its own length,
       closer together than one caption is tall — no row directly next to it is
       ever clear, only the columns beside it are. Stepping along the axis the
       caption reads across first, then sliding sideways, finds the gap a
       single-direction search cannot. */
    function place(x0, y0, w, h, mainAxis, mainStep, crossStep) {
      var main = [0, mainStep, 2 * mainStep, 3 * mainStep];
      var cross = [0, crossStep, -crossStep, 2 * crossStep, -2 * crossStep];
      for (var j = 0; j < main.length; j++)
        for (var i = 0; i < cross.length; i++) {
          var x = x0 + (mainAxis === 'x' ? main[j] : cross[i]);
          var y = y0 + (mainAxis === 'x' ? cross[i] : main[j]);
          if (fits(x, x + w, y, y + h)) return { x: x, y: y };
        }
      return { x: x0, y: y0 };
    }

    /* Which way is forward. The header's own taper and the tail's own wedge
       already say this without help on the realistic panels, but the word
       still removes any doubt at a glance, top and bottom rather than the two
       side corners a landscape drawing used. */
    var cabTxt = lang === 'ru' ? '▲ КАБИНА' : '▲ CAB', disTxt = lang === 'ru' ? 'РАЗГРУЗКА ▼' : 'DISCHARGE ▼';
    var cabW = 10 + cabTxt.length * 9.5, disW = 10 + disTxt.length * 9.5;
    var cabPos = place(VB_W / 2 - cabW / 2, 6, cabW, 11, 'y', 14, 20);
    var disPos = place(VB_W / 2 - disW / 2, vbH - 17, disW, 11, 'y', -14, 20);
    s.push('<g class="bm-orient" pointer-events="none">' +
           '<text class="bm-way" x="' + (cabPos.x + cabW / 2).toFixed(1) + '" y="' + (cabPos.y + 9).toFixed(1) + '" text-anchor="middle">' + cabTxt + '</text>' +
           '<text class="bm-way" x="' + (disPos.x + disW / 2).toFixed(1) + '" y="' + (disPos.y + 9).toFixed(1) + '" text-anchor="middle">' + disTxt + '</text></g>');

    ORDER.forEach(function (z) {
      var r = B.region(id, z);
      if (!r) return;
      var st = (o.zoneState ? o.zoneState(z) : '') || '';
      s.push('<path class="bm-z ' + LIFT[z] + (st ? ' ' + st : '') +
             '" d="' + poly(r) + '" data-band="' + z + '"/>');
    });

    /* The folds. Drawn in the gap between a panel and the floor, which is the
       one place a hinge can be without sitting on top of a station. Portrait
       turns the old left/right hinges (horizontal, above and below the floor)
       into vertical ones either side of it, and the old head hinge (vertical)
       into a horizontal one above it — the floor is still the plane everything
       else folds off, only the compass changed. */
    var fl = B.region(id, 'FLR2') || B.region(id, 'FLR1');
    if (fl) {
      var f = bbox(fl), L = B.region(id, 'LEFT'), R = B.region(id, 'RIGHT'), H = B.region(id, 'FRONT');
      var line = function (a, b) {
        var p = px(a), q = px(b);
        return '<path class="bm-fold" d="M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) +
               ' L' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + '"/>';
      };
      var all = B.zones(id).map(function (z) { return B.region(id, z.k); }).filter(Boolean);
      var fy0 = Math.min.apply(null, all.map(function (r) { return bbox(r).y0; }));
      var fy1 = Math.max.apply(null, all.map(function (r) { return bbox(r).y1; }));
      if (L) s.push(line([bbox(L).x1, fy0], [bbox(L).x1, fy1]));
      if (R) s.push(line([bbox(R).x0, fy0], [bbox(R).x0, fy1]));
      if (H) s.push(line([f.x0, bbox(H).y1], [f.x1, bbox(H).y1]));
      /* The floor's own divisions: a hairline, not a border, because front,
         middle, rear and tail are bands OF one plane and not four plates. */
      ['FLR2', 'FLR3', 'TAIL'].forEach(function (z) {
        var r2 = B.region(id, z); if (!r2) return;
        var c2 = bbox(r2), a2 = px([c2.x0, c2.y0]), b2 = px([c2.x1, c2.y0]);
        s.push('<path class="bm-div" d="M' + a2[0].toFixed(1) + ' ' + a2[1].toFixed(1) +
               ' L' + b2[0].toFixed(1) + ' ' + b2[1].toFixed(1) + '"/>');
      });
      /* The tail has no wall — the load leaves over this edge, and the edge is
         the thing that wears through. Draw it as an open lip, not a border. */
      var T = B.region(id, 'TAIL');
      if (T) {
        var t = bbox(T), a = px([t.x0, t.y1]), b = px([t.x1, t.y1]);
        s.push('<path class="bm-lip" d="M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) +
               ' L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + '"/>');
      }
    }

    /* THE MAP PICKS A SURFACE, NOT A BAND. The floor's three bands come out
       narrower than a gloved thumb needs, so one hit area covers the whole
       floor and the chip row underneath picks front, middle or rear at 44 px.
       Three levels, each at a size that actually works: map → surface,
       chips → band, chips → station. The tail keeps its own control; it is
       wide, and it is the one that matters. */
    var HIT = { FRONT: ['FRONT'], LEFT: ['LEFT'], RIGHT: ['RIGHT'],
                FLOOR: ['FLR1', 'FLR2', 'FLR3'], TAIL: ['TAIL'] };
    /* A hit surface is the VISUAL zone's own footprint, widened where that
       footprint is thinner than a thumb needs — a wall panel that is realistic
       rather than generic can be a narrow strip, and the fill stays that shape;
       only the tap target underneath it is guaranteed a floor, in the same
       percent units the points and regions are written in (roughly a quarter
       of the box, which is what 44 CSS px on a phone measures out to at the
       default height). */
    var MIN_HIT_PCT = 39;
    function widen(c) {
      var w = c.x1 - c.x0, h = c.y1 - c.y0;
      if (w < MIN_HIT_PCT) { var dx = (MIN_HIT_PCT - w) / 2; c.x0 -= dx; c.x1 += dx;
        if (c.x0 < 0) { c.x1 -= c.x0; c.x0 = 0; } if (c.x1 > 100) { c.x0 -= (c.x1 - 100); c.x1 = 100; } }
      if (h < MIN_HIT_PCT) { var dy = (MIN_HIT_PCT - h) / 2; c.y0 -= dy; c.y1 += dy;
        if (c.y0 < 0) { c.y1 -= c.y0; c.y0 = 0; } if (c.y1 > 100) { c.y0 -= (c.y1 - 100); c.y1 = 100; } }
      return c;
    }
    Object.keys(HIT).forEach(function (h) {
      var rs = HIT[h].map(function (z) { return B.region(id, z); }).filter(Boolean);
      if (!rs.length) return;
      var bs = rs.map(bbox);
      var c = widen({ x0: Math.min.apply(null, bs.map(function (b2) { return b2.x0; })),
                x1: Math.max.apply(null, bs.map(function (b2) { return b2.x1; })),
                y0: Math.min.apply(null, bs.map(function (b2) { return b2.y0; })),
                y1: Math.max.apply(null, bs.map(function (b2) { return b2.y1; })) });
      s.push('<path class="bm-hit" data-zone="' + HIT[h][0] + '" role="button" tabindex="0"' +
             ' aria-label="' + (B.zoneLabel(id, HIT[h][0], lang) || h) + '" d="' +
             poly([[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]]) + '"/>');
    });

    B.points(id).forEach(function (p) {
      var st = (o.state ? o.state(p.k) : '') || '';
      var q = px([p.x, p.y]);
      /* A DOT IS NOT A BUTTON HERE, and pretending otherwise was the bug. Sixty-
         three stations across a phone puts them close together — a fraction of
         what a bare fingertip needs, let alone a glove. So the dot is an
         indicator: it says how that station read, from across the yard. The
         tap target is the ZONE behind it, and the zone opens a row of station
         chips at a size a thumb can actually hit. Same division the
         undercarriage round already uses for a number covering two bands. */
      s.push('<g class="bm-p' + (st ? ' ' + st : '') + (p.k === o.sel ? ' sel' : '') +
             '" data-pt="' + p.k + '" pointer-events="none" aria-hidden="true">');
      var val = o.values ? o.values[p.k] : null;
      s.push('<circle class="bm-dot" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1)
             + '" r="' + (val == null ? 6 : 8.6) + '"/>');
      /* The number goes in the dot, not beside it: sixty-three labels floating
         over a field of dots is the diagram nobody can read, and that is why
         there were none. Inside, each one is anchored to the thing it measures.
         Whole millimetres - a decimal doubles the width of every station for
         precision the drawing is not the place for. The table keeps the exact
         figure, and the COLOUR is computed from the exact figure too, so
         rounding never moves a station across the limit. */
      if (val != null)
        s.push('<text class="bm-val" pointer-events="none" x="' + q[0].toFixed(1)
               + '" y="' + (q[1] + 3.1).toFixed(1) + '" text-anchor="middle">'
               + val + '</text>');
      /* The code itself, under the dot rather than in it: the reference this
         was traced from names every station on the drawing, not only the one
         selected, and an inspector matching a plate to a code should not have
         to tap sixty-two others first to rule them out. Below rather than
         beside so it never falls into a neighbour a column over — the tightest
         columns on this drawing are closer side to side than top to bottom. */
      if (o.codes !== false)
        s.push('<text class="bm-code" pointer-events="none" x="' + q[0].toFixed(1)
               + '" y="' + (q[1] + (val == null ? 6 : 8.6) + 7).toFixed(1) + '" text-anchor="middle">'
               + p.k + '</text>');
      s.push('</g>');
    });

    /* Painted AFTER the stations, not before. The caption carries a halo so it
       survives over a field of dots — but a halo is no use underneath them, and
       drawn first it was: "LEFT SIDE" came out as "LEFT S(o)E" with a station
       sitting in the middle of the word. */
    if (o.names !== false) {
      Object.keys(NAME).forEach(function (z) {
        var r = B.region(id, z); if (!r) return;
        var c = bbox(r), a = NAME[z].at, lbl = NAME[z][lang] || NAME[z].en;
        var w = 10 + lbl.length * 9.5, h = 11, pl, x, y, anc;
        if (a === 'tl')      { var p4 = px([c.x0, c.y0]); pl = place(p4[0] + 3, p4[1] + 4, w, h, 'y', 14, 20); anc = 'start'; }
        else if (a === 'tr') { var p0 = px([c.x1, c.y0]); pl = place(p0[0] - 3 - w, p0[1] + 4, w, h, 'y', 14, 20); anc = 'end'; }
        else if (a === 'ml') { var p1 = px([c.x0, (c.y0 + c.y1) / 2]); pl = place(p1[0] + 3, p1[1] - h / 2, w, h, 'x', 20, 16); anc = 'start'; }
        else if (a === 'mr') { var p2 = px([c.x1, (c.y0 + c.y1) / 2]); pl = place(p2[0] - 3 - w, p2[1] - h / 2, w, h, 'x', -20, 16); anc = 'end'; }
        else                 { var p3 = px([(c.x0 + c.x1) / 2, c.y0]); pl = place(p3[0] - w / 2, p3[1] + 4, w, h, 'y', 14, 20); anc = 'middle'; }
        x = anc === 'start' ? pl.x : anc === 'end' ? pl.x + w : pl.x + w / 2;
        y = pl.y + 9;
        s.push('<text class="bm-face" pointer-events="none" x="' + x.toFixed(1) +
               '" y="' + y.toFixed(1) + '" text-anchor="' + anc + '">' + lbl + '</text>');
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
           place and it is wrong where columns run close together and the chip
           lands squarely on the next station — hiding what that one read for
           as long as this one is selected. So try right, left, above, below in
           that order and take the first that is clear of every other station;
           if the tray is too tight for any of them, right is still better than
           nothing. */
        var c2 = px([sp.x, sp.y]);
        var w = 20 + String(o.sel).length * 10.5, h = 26;
        var others = B.points(id).filter(function (q) { return q.k !== o.sel; })
                      .map(function (q) { return px([q.x, q.y]); });
        var cand = [[c2[0] + 14, c2[1] - h / 2], [c2[0] - 14 - w, c2[1] - h / 2],
                    [c2[0] - w / 2, c2[1] - 16 - h], [c2[0] - w / 2, c2[1] + 16]];
        var bx = cand[0][0], by = cand[0][1];
        for (var ci = 0; ci < cand.length; ci++) {
          var X = cand[ci][0], Y = cand[ci][1];
          if (X < 2 || X + w > VB_W - 2 || Y < 2 || Y + h > vbH - 2) continue;
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

  /* ---- the tray as PAPER draws it ---------------------------------------
     Two programs print this report - the phone and the dashboard - and for a
     while only one of them knew about any of this. The dashboard called
     bodyMap() with no box height and no readings, so a superintendent printing
     from the office got the phone-sized drawing with sixty-three empty dots on
     it while the same round printed from the pit carried every millimetre.
     Nothing in either file said they had to agree.

     So the report's own call lives here, once, and both hosts make it. The
     caller passes the exact millimetres; the rounding to whole numbers happens
     on this side of the line, because a station's COLOUR is computed from the
     exact figure and only the printed digit is rounded - if the two ever came
     from different places, a plate could read "3" and be green.

     RPT_CSS_H is a real CSS pixel height, on the 760px-wide sheet every report
     section is built at (`#rptRoot .sec{width:760px}`) — not a viewBox number.
     Sized so the drawing plus the heading above it and the key and zone table
     below it still clear one A4 page (`tests/tray.cjs` measures the whole
     section against the paginator's own budget, not this figure back). Unlike
     the old shared landscape box, a fixed HEIGHT on a narrow model (HM400) and
     a near-square one (TR60) prints two different WIDTHS — correct, because
     each drawing then holds the same vertical, station-to-station scale
     instead of one stretched to fill a width its own shape does not want. */
  var RPT_CSS_H = 640;
  W.bodyMapReport = function (o) {
    o = o || {};
    var vals = {}, mm = o.mm || {};
    Object.keys(mm).forEach(function (k) {
      var v = Number(mm[k]);
      if (isFinite(v)) vals[k] = String(Math.round(v));
    });
    var a = {};
    for (var x in o) if (Object.prototype.hasOwnProperty.call(o, x)) a[x] = o[x];
    a.sel = ''; a.tag = false; a.cssH = RPT_CSS_H; a.values = vals;
    return W.bodyMap(a);
  };
})(typeof self !== 'undefined' ? self : this);
