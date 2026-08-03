/* The machine as the picker.

   One track frame per side, drawn to the machine in front of the inspector.
   Every measurement position is a puck on it.

   Two jobs, and the second is the one paper cannot do at all:

     Tap where you are standing. Walking idler-to-sprocket, you tap in the order
     you move, not down a list that has no relation to the machine.

     See the round without reading it. Green, amber, red and a dashed grey for
     "could not measure" — half a round handed over at shift change is legible
     at arm's length.

   ---------------------------------------------------------------------------
   IT HAS TO BE THIS MACHINE, NOT A TRACK FRAME IN GENERAL.

   The frame used to be one fixed drawing for all nineteen models: an oval loop,
   two carrier rollers, and lower rollers spaced every 44 px whatever the model
   actually carried. A D9R — front and rear idlers on the ground with the drive
   sprocket lifted clear above them — came out looking exactly like a PC800.

   That is not a cosmetic complaint. The frame is the thing an inspector matches
   against the machine they are standing at to work out which roller is roller
   one. A drawing that is wrong about where the sprocket is teaches them the
   wrong end, and the whole point of tapping the picture instead of reading a
   list is lost.

   So the geometry is built from the model, every time:

     · the chain is a belt drawn around real wheels, so an elevated-sprocket
       dozer comes out as the triangle it is and an oval frame comes out oval,
       from one piece of maths rather than two drawings;
     · the lower rollers ARE the model's roller count, spread across the frame,
       not a fixed rhythm that happens to look about right;
     · the carrier rollers are the count the model carries, on the run they
       actually sit on — which on a high-drive machine is the climb to the
       sprocket, not a flat top;
     · idler and sprocket sizes and the height of the frame follow the family,
       because an excavator undercarriage is long and low and a dozer's is
       short and tall.
   --------------------------------------------------------------------------- */
(function (W) {
  if (!W) return;

  var VB_W = 460, VB_H = 286;
  var PH = { x: 12, y: 30, w: 436, h: 140 };      // the band a photograph fills

  /* ---- what this model's undercarriage looks like -------------------------
     Wheels are circles: [x, y, r, kind]. The belt is drawn around them in the
     order given, which is the order they sit on the machine. */
  function geom(fam, high, rollers, carriers) {
    var n = Math.max(3, rollers || 8), g;
    if (high) {
      /* Elevated sprocket. Front and rear idlers on the ground carrying the
         beam, the drive lifted clear behind and above them — the shape that
         makes a D9R a D9R from thirty metres away. */
      g = { high: true, beamY: 112, back: 350,
            wheels: [ { x: 92,  y: 112, r: 28, k: 'IDLER' },
                      { x: 404, y: 52,  r: 30, k: 'SPROCKET' },
                      // both ground wheels have to put their bottoms on the same
                      // line, or the machine is drawn standing on a slope
                      { x: 350, y: 112 + 28 - 22, r: 22, k: 'REAR' } ],
            carriers: carriers || 1, rollers: n };
    } else {
      /* Oval. The proportions still follow the family: a dozer drives through a
         sprocket bigger than its idler and an excavator is the other way round,
         which is the difference you actually see standing at the machine. */
      var t = fam === 'dz' ? { ix: 92, sx: 398, cy: 100, ri: 30, rs: 36, car: 2 }
            : fam === 'ex' ? { ix: 88, sx: 404, cy: 100, ri: 34, rs: 30, car: 2 }
            :                { ix: 94, sx: 396, cy: 100, ri: 30, rs: 30, car: 1 };
      /* The bottom run is flat because the machine is standing on it. Two
         wheels of different size on one centre line would tilt it, so the
         bigger one rides higher by exactly the difference — which is where it
         sits on the real frame. */
      g = { high: false, beamY: t.cy, back: t.sx - 34,
            wheels: [ { x: t.ix, y: t.cy, r: t.ri, k: 'IDLER' },
                      { x: t.sx, y: t.cy - (t.rs - t.ri), r: t.rs, k: 'SPROCKET' } ],
            carriers: carriers || t.car, rollers: n };
    }
    var id = g.wheels[0];
    g.run = [id.x, g.back];
    g.rollerY = id.y + id.r - 6;                 // riding on the bottom chain run
    g.groundY = Math.max.apply(null, g.wheels.filter(function (w) { return w.k !== 'SPROCKET' || !g.high; })
                                             .map(function (w) { return w.y + w.r; })) + 12;
    return g;
  }

  /* ---- the belt ------------------------------------------------------------
     A chain around two or three wheels is the taut band around a set of
     circles. Doing it properly rather than as a stadium shape is what lets one
     routine draw both frames: give it two circles of the same size on the same
     line and it produces the oval; move one up and shrink another and it
     produces the triangle, with the tangents and the wrap angles correct.

     Returned as a dense polyline with outward normals, because everything else
     the drawing needs — the two rails either side of the pin line, a pin every
     pitch, the teeth that mesh with them — is that line offset or sampled. */
  function belt(wheels) {
    var pts = [], i;
    for (i = 0; i < wheels.length; i++) {
      var a = wheels[i], b = wheels[(i + 1) % wheels.length];
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      var base = Math.atan2(dy, dx);
      // external tangent: the angle off the centre line where the band leaves
      var q = (a.r - b.r) / d;
      q = q > 1 ? 1 : q < -1 ? -1 : q;
      var th = Math.acos(q);
      /* Minus, not plus. y points down on a screen, so a band running clockwise
         leaves the first wheel on the side ABOVE the centre line — plus would
         take it underneath, and the run to the next wheel would cross the one
         coming back. */
      a.out = base - th; b.in = base - th;
    }
    for (i = 0; i < wheels.length; i++) {
      var w = wheels[i];
      var from = (i === 0) ? wheels[wheels.length - 1].in : wheels[i - 1].in;
      var to = w.out;
      // walk the outside of this wheel from where the band arrived to where it
      // leaves, always the way that keeps the band taut
      var sweep = to - from;
      while (sweep < 0) sweep += Math.PI * 2;
      var steps = Math.max(2, Math.round(sweep * w.r / 3));
      for (var s = 0; s <= steps; s++) {
        var ang = from + sweep * (s / steps);
        pts.push({ x: w.x + w.r * Math.cos(ang), y: w.y + w.r * Math.sin(ang),
                   nx: Math.cos(ang), ny: Math.sin(ang), on: w.k });
      }
      // the straight run to the next wheel
      var nx2 = wheels[(i + 1) % wheels.length];
      var p0 = { x: w.x + w.r * Math.cos(w.out), y: w.y + w.r * Math.sin(w.out) };
      var p1 = { x: nx2.x + nx2.r * Math.cos(nx2.in), y: nx2.y + nx2.r * Math.sin(nx2.in) };
      var run = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      var nsteps = Math.max(1, Math.round(run / 4));
      var ux = Math.cos(w.out), uy = Math.sin(w.out);
      for (var t2 = 1; t2 <= nsteps; t2++)
        pts.push({ x: p0.x + (p1.x - p0.x) * t2 / nsteps, y: p0.y + (p1.y - p0.y) * t2 / nsteps,
                   nx: ux, ny: uy, on: '' });
    }
    return pts;
  }

  function offsetPath(pts, o) {
    var d = '', i;
    for (i = 0; i < pts.length; i++)
      d += (i ? 'L' : 'M') + (pts[i].x + pts[i].nx * o).toFixed(1) + ',' + (pts[i].y + pts[i].ny * o).toFixed(1) + ' ';
    return d + 'Z';
  }

  /* Every `pitch` of chain, by arc length along the band. */
  function pinsOn(pts, pitch) {
    var out = [], acc = 0, i;
    for (i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc <= 0) { out.push(a); acc = pitch; }
      acc -= seg;
    }
    return out;
  }

  /* ---- where the tap targets sit ------------------------------------------
     The whole frame has to fit a phone without a sideways scroll, and eight
     rollers plus a 44 px tap target do not both fit ON the frame at that width
     — so the rollers get their own full-width row directly under it, which is
     where they are on the machine anyway. The four chain points have no single
     home on the frame, so they hang under it on a bracket rather than being
     pinned to a place they do not occupy. */
  function layout(g, photo) {
    var spots = [];
    var idler = g.wheels[0], spr = g.wheels[1];
    var cs = carrierPts(g);
    /* Over a drawing the pucks sit on the parts they name, because the drawing
       was built around them. Over a photograph they cannot: every model's frame
       is framed differently and no fixed offset lands on the right wheel twice
       running. So on a photograph they take the arrangement an inspector has
       already learned — idler at the front, carriers above, sprocket at the
       back — laid out inside the picture rather than chasing it. Same keys,
       same order, same reach; only the backdrop changed. */
    /* Over a photograph the positions are a fraction of the picture rather than
       a point on a drawing, so they land near the real part on every model
       without anyone hand-placing 29 sets. An elevated sprocket is the one
       thing a single fixed set cannot cover — it is somewhere else entirely on
       a D9R — so that one follows the frame type. */
    var at = function (fx, fy) { return { x: PH.x + PH.w * fx, y: PH.y + PH.h * fy }; };
    var idP = photo ? at(0.26, 0.73) : { x: 24, y: idler.y };
    var caP = photo ? (g.high ? at(0.55, 0.32) : at(0.44, 0.47)) : { x: cs[0].x, y: cs[0].y - 40 };
    var spP = photo ? (g.high ? at(0.79, 0.39) : at(0.87, 0.73))
                    : { x: Math.min(432, spr.x), y: spr.y };
    // side by side, not stacked: touching hit areas are how a gloved thumb
    // picks the wrong one, and the band is not tall enough to stack in
    spots.push({ k: 'IDLER.@-OUT', x: idP.x - 24, y: photo ? idP.y : idler.y - 28, lab: 'O' });
    spots.push({ k: 'IDLER.@-IN',  x: idP.x + 24, y: photo ? idP.y : idler.y + 28, lab: 'I' });
    spots.push({ k: 'CARRIER.@-OUT', x: caP.x - 24, y: caP.y, lab: 'O' });
    spots.push({ k: 'CARRIER.@-IN',  x: caP.x + 24, y: caP.y, lab: 'I' });
    spots.push({ k: 'SPROCKET.@', x: spP.x, y: spP.y, lab: 'S' });
    var x0 = 34, x1 = 426, step = g.rollers > 1 ? (x1 - x0) / (g.rollers - 1) : 0;
    for (var i = 1; i <= g.rollers; i++)
      spots.push({ k: 'ROLLER.@' + i, x: Math.round(x0 + (i - 1) * step), y: 190, lab: String(i) });
    ['LINKH.@', 'BUSH.@', 'PITCH4.@', 'PITCH1.@', 'GROUSER.@'].forEach(function (k, j) {
      spots.push({ k: k, x: 48 + j * 91, y: 254, lab: k.split('.')[0] });
    });
    return { spots: spots, g: g, rollerY: 190 };
  }

  /* Carrier rollers hold the top run up off the frame — which on an oval frame
     is the flat top, and on a high-drive is the slope climbing to the sprocket.
     The point returned is on the chain itself; the roller sits just under it,
     which is the way round it works on the machine. */
  function carrierPts(g) {
    var a = g.wheels[0], b = g.wheels[1];
    var n = g.carriers, out = [];
    for (var i = 1; i <= n; i++) {
      var f = n === 1 ? 0.5 : 0.3 + (i - 1) * 0.26;
      out.push({ x: a.x + (b.x - a.x) * f, y: (a.y - a.r) + ((b.y - b.r) - (a.y - a.r)) * f });
    }
    return out;
  }

  /* Lower rollers: the model's own count, spread along the run they carry.
     This is the one that was plainly wrong before — they were drawn every 44 px
     whatever the model had, so a five-roller frame and a nine-roller frame came
     out with the same number of wheels under them. */
  function rollerPts(g) {
    var x0 = g.run[0] + 16, x1 = g.run[1] - 6, n = g.rollers, out = [];
    var step = n > 1 ? (x1 - x0) / (n - 1) : 0;
    for (var i = 0; i < n; i++) out.push({ x: x0 + i * step, y: g.rollerY });
    return out;
  }

  function frameArt(L) {
    var g = L.g, s = [];
    var idler = g.wheels[0], spr = g.wheels[1];
    var gy = g.groundY;

    /* ── track frame: a tapered box between the wheels, not a bar. On a
          high-drive it is the beam from the front idler back to the rear idler
          with the final drive carried above it. */
    var fy = g.beamY, back = g.back;
    s.push('<path class="mf-body" d="M' + (idler.x + 4) + ',' + (fy - 15) +
           ' L' + back + ',' + (fy - 15) + ' L' + back + ',' + (fy - 21) +
           ' L' + (back + 30) + ',' + (fy - 21) + ' L' + (back + 30) + ',' + (fy + 21) +
           ' L' + back + ',' + (fy + 21) + ' L' + back + ',' + (fy + 15) +
           ' L' + (idler.x + 4) + ',' + (fy + 15) + ' Z"/>');
    s.push('<path class="mf-hair" d="M' + (idler.x + 10) + ',' + (fy + 10) + ' L' + (back - 2) + ',' + (fy + 10) + '"/>');
    for (var bx = idler.x + 44; bx < back - 4; bx += 44)
      s.push('<circle class="mf-hair" cx="' + bx + '" cy="' + (fy - 6) + '" r="2"/>');
    if (g.high)                                    // the strut carrying the drive up
      s.push('<path class="mf-body" d="M' + (g.wheels[2].x + 6) + ',' + (fy - 16) +
             ' L' + (spr.x - 16) + ',' + (spr.y + 8) + ' L' + (spr.x + 4) + ',' + (spr.y + 22) +
             ' L' + (g.wheels[2].x + 22) + ',' + (fy + 6) + ' Z"/>');

    // ── recoil spring and track adjuster, at the idler end
    s.push('<rect class="mf-part" x="' + (idler.x + 10) + '" y="' + (fy - 11) + '" width="46" height="22" rx="4"/>');
    for (var c = 0; c < 7; c++)
      s.push('<path class="mf-hair" d="M' + (idler.x + 14 + c * 6) + ',' + (fy - 11) +
             ' L' + (idler.x + 18 + c * 6) + ',' + (fy + 11) + '"/>');
    s.push('<path class="mf-line" d="M' + (idler.x + 4) + ',' + fy + ' L' + (idler.x + 10) + ',' + fy + '"/>');

    // ── the chain: two rails, then a pin and a link plate at every pitch
    var pts = belt(g.wheels.map(function (w) { return { x: w.x, y: w.y, r: w.r, k: w.k }; }));
    var P = pinsOn(pts, 2 * Math.PI * spr.r / 20);
    s.push('<g data-part="CHAIN">');
    s.push('<path class="mf-rail" d="' + offsetPath(pts, 6.5) + '"/>');
    s.push('<path class="mf-rail" d="' + offsetPath(pts, -6.5) + '"/>');
    P.forEach(function (q, i) {
      var n = P[(i + 1) % P.length];
      [6.5, -6.5].forEach(function (o) {
        s.push('<path class="mf-hair" d="M' + (q.x + q.nx * o).toFixed(1) + ',' + (q.y + q.ny * o).toFixed(1) +
               ' L' + (n.x + n.nx * o).toFixed(1) + ',' + (n.y + n.ny * o).toFixed(1) + '"/>');
      });
      s.push('<circle class="mf-pin" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="2.6"/>');
    });
    s.push('</g>');

    /* ── sprocket: a rim, and a tooth reaching up between every second pair of
          pins. One tooth per pin turns the wheel into a starburst; a tooth per
          pocket is what actually drives the chain. */
    s.push('<g data-part="SPROCKET">');
    s.push('<circle class="mf-part" cx="' + spr.x + '" cy="' + spr.y + '" r="' + (spr.r * 0.6).toFixed(1) + '"/>');
    P.forEach(function (q, i) {
      if (q.on !== 'SPROCKET' || i % 2) return;
      var n = P[(i + 1) % P.length];
      var mx = (q.x + n.x) / 2, my = (q.y + n.y) / 2;
      var len = Math.hypot(mx - spr.x, my - spr.y) || 1;
      var ux = (mx - spr.x) / len, uy = (my - spr.y) / len;
      var b = spr.r * 0.55, tip = spr.r * 0.93, px = -uy, py = ux;
      s.push('<path class="mf-part" d="M' + (spr.x + ux * b + px * 6).toFixed(1) + ',' + (spr.y + uy * b + py * 6).toFixed(1) +
             ' Q' + (spr.x + ux * tip + px * 3.4).toFixed(1) + ',' + (spr.y + uy * tip + py * 3.4).toFixed(1) +
             ' ' + (spr.x + ux * tip).toFixed(1) + ',' + (spr.y + uy * tip).toFixed(1) +
             ' Q' + (spr.x + ux * tip - px * 3.4).toFixed(1) + ',' + (spr.y + uy * tip - py * 3.4).toFixed(1) +
             ' ' + (spr.x + ux * b - px * 6).toFixed(1) + ',' + (spr.y + uy * b - py * 6).toFixed(1) + ' Z"/>');
    });
    s.push('</g>');
    // final drive hub, in front of the sprocket rim
    s.push('<circle class="mf-part" cx="' + spr.x + '" cy="' + spr.y + '" r="' + (spr.r * 0.42).toFixed(1) + '"/>');
    s.push('<circle class="mf-hair" cx="' + spr.x + '" cy="' + spr.y + '" r="' + (spr.r * 0.22).toFixed(1) + '"/>');

    // ── idler: rim, hub, and the flange the rails ride either side of
    s.push('<g data-part="IDLER">');
    s.push('<circle class="mf-part" cx="' + idler.x + '" cy="' + idler.y + '" r="' + (idler.r * 0.74).toFixed(1) + '"/>');
    s.push('<circle class="mf-line" cx="' + idler.x + '" cy="' + idler.y + '" r="' + (idler.r * 0.5).toFixed(1) + '"/>');
    s.push('<circle class="mf-part" cx="' + idler.x + '" cy="' + idler.y + '" r="' + (idler.r * 0.24).toFixed(1) + '"/>');
    s.push('</g>');
    if (g.high) {                                  // the rear idler is not a measured point
      var ri = g.wheels[2];
      s.push('<circle class="mf-part" cx="' + ri.x + '" cy="' + ri.y + '" r="' + (ri.r * 0.7).toFixed(1) + '"/>');
      s.push('<circle class="mf-hair" cx="' + ri.x + '" cy="' + ri.y + '" r="' + (ri.r * 0.28).toFixed(1) + '"/>');
    }

    // ── carrier rollers, on their brackets on the run above the ground
    s.push('<g data-part="CARRIER">');
    carrierPts(g).forEach(function (p) {
      var wy = p.y + 9;                              // just under the chain it carries
      s.push('<path class="mf-part" d="M' + (p.x - 8).toFixed(1) + ',' + (fy - 14) +
             ' L' + (p.x - 5).toFixed(1) + ',' + (wy + 4).toFixed(1) +
             ' L' + (p.x + 5).toFixed(1) + ',' + (wy + 4).toFixed(1) +
             ' L' + (p.x + 8).toFixed(1) + ',' + (fy - 14) + ' Z"/>');
      s.push('<circle class="mf-part" cx="' + p.x.toFixed(1) + '" cy="' + wy.toFixed(1) + '" r="8"/>');
      s.push('<circle class="mf-hair" cx="' + p.x.toFixed(1) + '" cy="' + wy.toFixed(1) + '" r="3.2"/>');
    });
    s.push('</g>');

    // ── lower rollers: this model's count, slung under the frame
    s.push('<g data-part="ROLLER">');
    rollerPts(g).forEach(function (p) {
      s.push('<path class="mf-line" d="M' + (p.x - 7).toFixed(1) + ',' + (fy + 15) + ' L' + (p.x - 7).toFixed(1) + ',' + (p.y - 9).toFixed(1) +
             ' M' + (p.x + 7).toFixed(1) + ',' + (fy + 15) + ' L' + (p.x + 7).toFixed(1) + ',' + (p.y - 9).toFixed(1) + '"/>');
      s.push('<circle class="mf-part" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="9"/>');
      s.push('<circle class="mf-hair" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.4"/>');
    });
    s.push('</g>');

    // ── shoes and grousers on the ground run, and the ground itself
    s.push('<g data-part="GROUSER">');
    var gx0 = g.run[0] - 30, gx1 = g.run[1] + 30;
    s.push('<path class="mf-line" d="M' + gx0 + ',' + (gy - 1) + ' L' + gx1 + ',' + (gy - 1) + '"/>');
    for (var gx = gx0 + 4; gx < gx1 - 4; gx += 15) {
      s.push('<path class="mf-hair" d="M' + gx + ',' + (gy - 7) + ' L' + gx + ',' + (gy - 1) + '"/>');
      s.push('<path class="mf-part" d="M' + (gx + 5) + ',' + (gy - 1) + ' l5,0 l-1.4,7 l-2.2,0 Z"/>');
    }
    s.push('<path class="mf-ground" d="M' + (gx0 - 14) + ',' + (gy + 7) + ' L' + (gx1 + 14) + ',' + (gy + 7) + '"/>');
    for (var hx = gx0 - 10; hx < gx1 + 10; hx += 11)
      s.push('<path class="mf-hair" d="M' + hx + ',' + (gy + 7) + ' l-5,6"/>');
    s.push('</g>');

    // the row of roller pucks below stands in for the rollers on the frame
    s.push('<path class="mf-lead" d="M34,' + (L.rollerY - 22) + ' L34,' + (gy + 18) +
           ' L426,' + (gy + 18) + ' L426,' + (L.rollerY - 22) + '"/>');
    s.push('<path class="mf-lead" d="M48,' + (L.rollerY + 30) + ' L48,238 L410,238 L410,' +
           (L.rollerY + 30) + '"/>');
    return s.join('');
  }

  /* state(key) -> "" | "done" | "watch" | "act" | "na"; sel is the current key.

     prof may be a number (the roller count, the old shape) or an object
     { rollers, high, fam, carriers }. The object is what carries the model. */
  W.mapSVG = function (side, prof, high, state, sel, label) {
    var p = (prof && typeof prof === 'object') ? prof : { rollers: prof, high: high };
    var g = geom(p.fam || '', !!p.high, p.rollers, p.carriers);
    var L = layout(g, p.photo || ''), s = [];
    s.push('<svg class="ucmap' + (p.photo ? ' photo' : '') + '" viewBox="0 0 ' + VB_W + ' ' + VB_H +
           '" role="group" aria-label="' + (side === 'L' ? 'Left' : 'Right') + ' track frame">');
    s.push('<text class="um-side" x="10" y="22">' + (label || side) + '</text>');
    /* A photograph of THIS model's track frame where there is one, and the
       drawing where there is not. The pucks do not move either way: they are
       where an inspector has learned to reach for them, and a photograph is a
       backdrop to tap on rather than a thing to hunt across. Scrimmed, because
       a white number on a bright yellow machine is not a number. */
    if (p.photo) {
      s.push('<defs><clipPath id="ucclip-' + side + '"><rect x="' + PH.x + '" y="' + PH.y +
             '" width="' + PH.w + '" height="' + PH.h + '" rx="10"/></clipPath></defs>');
      s.push('<g clip-path="url(#ucclip-' + side + ')">');
      s.push('<image class="um-photo" href="' + p.photo + '" x="' + PH.x + '" y="' + PH.y +
             '" width="' + PH.w + '" height="' + PH.h + '" preserveAspectRatio="xMidYMid slice"/>');
      s.push('<rect class="um-scrim" x="' + PH.x + '" y="' + PH.y + '" width="' + PH.w +
             '" height="' + PH.h + '"/>');
      s.push('</g>');
      s.push('<rect class="um-frameline" x="' + PH.x + '" y="' + PH.y + '" width="' + PH.w +
             '" height="' + PH.h + '" rx="10"/>');
    } else {
      s.push(frameArt(L));
    }
    L.spots.forEach(function (sp) {
      var k = sp.k.replace('@', side), st = state(k) || '';
      var cls = 'um-spot' + (st ? ' ' + st : '') + (k === sel ? ' sel' : '');
      var chain = sp.y > 230;
      s.push('<g class="' + cls + '" data-uc="' + k + '" transform="translate(' + Math.round(sp.x) + ',' + Math.round(sp.y) +
             ')" role="button" tabindex="0" aria-label="' + k + '">');
      s.push(chain ? '<rect class="um-hit" x="-45" y="-28" width="90" height="56" fill="transparent"/>'
                   : '<circle class="um-hit" r="28" fill="transparent"/>');
      if (chain) s.push('<rect class="um-puck" x="-40" y="-17" width="80" height="34" rx="17"/>');
      else s.push('<circle class="um-puck" r="17"/>');
      s.push('<text class="um-n' + (chain ? ' um-chain' : '') + '" y="' + (chain ? 4.5 : 5) +
             '" text-anchor="middle">' + sp.lab + '</text>');
      s.push('</g>');
    });
    s.push('</svg>');
    return s.join('');
  };


  /* ---- the numbered walk over a photograph --------------------------------
     One picture of this model's frame, eleven numbers on the parts they name.
     The numbers come from the client's undercarriage catalog, so a number here
     is the same number on the printed page in the ute; the positions come from
     UCPTS — a shared layout inside a per-model box, which is what puts number 4
     on a D9R's raised sprocket and on a PC800's ground-level one from a single
     set of fractions.

     Where a model has no photograph the same numbers go over the drawn frame
     instead, so the screen is the same screen either way. */
  var PVB_W = 460;
  /* The photograph did not load. Drop it and show the frame that was drawn
     underneath it — silently, because there is nothing the inspector can do
     about it and the round carries on unchanged. */
  W.photoGone = function (img) {
    if (!img || !img.parentNode) return;
    var svg = img.parentNode, drawn = svg.querySelector('.um-drawn');
    if (drawn) drawn.removeAttribute('style');
    img.parentNode.removeChild(img);
  };

  W.mapPhoto = function (o) {
    o = o || {};
    var box = o.box || [20, 55, 70, 40];
    var s = [], pts = o.layout || (window.UCPTS && UCPTS.layout) || [];
    var lang = o.lang || 'en';
    /* The drawing area is the shape of the picture. Anything else letterboxes
       it, and then a point given as a percentage of the picture lands in the
       empty margin beside it rather than on the part it names — which is how
       "left end bit" ended up floating off the edge of a blade. */
    var asp = o.aspect || (window.MACHINE_PHOTOS && o.photo ? MACHINE_PHOTOS.aspectOf(o.photo) : 0);
    var PVB_H = o.photo && asp ? Math.round(PVB_W / asp) : 210;
    PVB_H = Math.max(120, Math.min(360, PVB_H));
    s.push('<svg class="ucmap photo" viewBox="0 0 ' + PVB_W + ' ' + PVB_H +
           '" role="group" aria-label="' + (o.side === 'L' ? 'Left' : 'Right') + ' undercarriage">');
    /* The drawn frame goes in either way, and hides behind the photograph when
       there is one. It is the answer to the photograph not arriving — a cache
       miss on a phone with no signal, a model whose picture has not been shot
       yet — and the failure it prevents is the bad one: eleven numbers floating
       over a blank rectangle, which tells an inspector nothing and looks like
       the app is broken. Scaled into the same picture area, so a number lands
       in the same place relative to the frame either way. */
    /* Only where a track frame is the right thing to draw. A GET round calls
       this for a bucket or a blade and passes no family; drawing rollers and
       an idler under a missing bucket photograph would not be a fallback, it
       would be a wrong answer. Better a bare set of numbers than the wrong
       machine part. */
    if (o.fam) {
      var g = geom(o.fam, !!o.high, o.rollers, o.carriers);
      /* The frame art was drawn for a 210-high box. A photograph sets the
         height from its own aspect, so scale the drawing by the same ratio —
         otherwise it keeps its old size in a taller box and the numbers, which
         are placed as fractions of the box, sit below the frame they name. */
      var k = PVB_H / 210;
      s.push('<g class="um-drawn"' + (o.photo ? ' style="display:none"' : '') +
             ' transform="translate(0,' + (-14 * k).toFixed(1) + ') scale(1,' +
             (0.78 * k).toFixed(3) + ')">' + frameArt(layout(g, '')) + '</g>');
    }
    if (o.photo) {
      s.push('<image class="um-photo" href="' + o.photo + '" x="0" y="0" width="' + PVB_W +
             '" height="' + PVB_H + '" preserveAspectRatio="none"' +
             ' onerror="WEAR.photoGone(this)"/>');
    }
    pts.forEach(function (q) {
      var n = q[0];
      var x = (box[0] + q[1] * box[2]) / 100 * PVB_W;
      var y = (box[1] + q[2] * box[3]) / 100 * PVB_H;
      x = Math.max(18, Math.min(PVB_W - 18, x));
      y = Math.max(18, Math.min(PVB_H - 18, y));
      var st = (o.state ? o.state(n) : '') || '';
      var cls = 'um-num' + (st ? ' ' + st : '') + (n === o.sel ? ' sel' : '');
      s.push('<g class="' + cls + '" data-ucg="' + n + '" transform="translate(' +
             x.toFixed(1) + ',' + y.toFixed(1) + ')" role="button" tabindex="0" aria-label="' +
             n + '">');
      /* 28 in a 460-wide viewBox, which is a 56 px circle scaled to about 46 on
         a 412 px phone — over the 44 px floor a gloved thumb needs. 22 looked
         generous in the drawing and measured 36 on the glass. */
      s.push('<circle class="um-hit" r="28" fill="transparent"/>');
      s.push('<circle class="um-puck" r="13"/>');
      s.push('<text class="um-n" y="4.5" text-anchor="middle">' + n + '</text>');
      s.push('</g>');
    });
    s.push('</svg>');
    return s.join('');
  };

  /* Short labels for the chain row: the full names do not fit and the drawing on
     the capture screen names the point again anyway. */
  W.mapShort = { LINKH: 'HGT', BUSH: 'BUSH', PITCH4: 'P×4', PITCH1: 'P×1', GROUSER: 'GRSR' };
  /* Where a photograph sits in the viewBox: the band the drawn frame occupies,
     so swapping one for the other does not move anything else on the card. */
  W.photoBox = PH;
  W.mapGeom = geom;
})(window.WEAR);
