/* The machine as the picker.

   One track frame per side, drawn to the machine in front of the inspector: the
   roller count comes from the model, and an elevated-sprocket dozer gets a
   different frame from an oval one. Every measurement position is a puck on it.

   Two jobs, and the second is the one paper cannot do at all:

     Tap where you are standing. Walking idler-to-sprocket, you tap in the order
     you move, not down a list that has no relation to the machine.

     See the round without reading it. Green, amber, red and a dashed grey for
     "could not measure" — half a round handed over at shift change is legible
     at arm's length.

   The four chain points have no single home on the frame, so they hang under it
   on a bracket rather than being pinned to a place they do not occupy. */
(function (W) {
  if (!W) return;

  var VB_W = 460, VB_H = 286;

  /* Where each point sits. The whole frame has to fit a phone without a sideways
     scroll, and eight rollers plus a 44 px tap target do not both fit ON the
     frame at that width — so the rollers get their own full-width row directly
     under it, which is where they are on the machine anyway. */
  function layout(rollers, high) {
    var ix = 88, sx = 404, cy = high ? 112 : 100, cr = 34;
    var spots = [];
    // the two bands are stacked at the idler and spread at the carrier, because
    // touching hit areas are how a gloved thumb picks the wrong one
    spots.push({ k: 'IDLER.@-OUT', x: 24, y: cy - 28, lab: 'O' });
    spots.push({ k: 'IDLER.@-IN',  x: 24, y: cy + 28, lab: 'I' });
    spots.push({ k: 'CARRIER.@-OUT', x: 186, y: cy - 58, lab: 'O' });
    spots.push({ k: 'CARRIER.@-IN',  x: 244, y: cy - 58, lab: 'I' });
    spots.push({ k: 'SPROCKET.@', x: sx, y: high ? 46 : cy, lab: 'S' });
    var x0 = 34, x1 = 426, step = rollers > 1 ? (x1 - x0) / (rollers - 1) : 0;
    for (var i = 1; i <= rollers; i++)
      spots.push({ k: 'ROLLER.@' + i, x: Math.round(x0 + (i - 1) * step), y: 190, lab: String(i) });
    ['LINKH.@', 'BUSH.@', 'PITCH4.@', 'PITCH1.@', 'GROUSER.@'].forEach(function (k, j) {
      spots.push({ k: k, x: 48 + j * 91, y: 254, lab: k.split('.')[0] });
    });
    return { spots: spots, ix: ix, sx: sx, cy: cy, cr: cr, rollerY: 190, step: step };
  }

  /* A track frame, not an outline of one.

     The loop is the chain: two rails at a fixed offset either side of the pin
     line, with a pin every pitch and a link plate between them — that repeat is
     what makes a track read as a track rather than as a stadium. Around it go
     the parts an inspector actually names: the recoil spring and adjuster at the
     idler end, the final drive behind the sprocket, teeth meshing with the pins,
     carrier rollers on their brackets, and shoes with grousers on the ground run.

     Everything is hairline. At this scale a 2 px stroke is a 2.5 mm line on the
     real machine — it buries the detail it is supposed to describe. */
  function railPath(L, o) {
    var ix = L.ix, sx = L.sx, cy = L.cy, R = L.cr + o;
    return 'M' + ix + ',' + (cy - R) + ' L' + sx + ',' + (cy - R) +
           ' A' + R + ',' + R + ' 0 0 1 ' + sx + ',' + (cy + R) +
           ' L' + ix + ',' + (cy + R) +
           ' A' + R + ',' + R + ' 0 0 1 ' + ix + ',' + (cy - R) + ' Z';
  }
  /* Walk the pin line and hand back a point every `pitch` units, with the
     outward normal, so pins, plates and teeth all land on the same rhythm. */
  function pins(L, pitch) {
    var ix = L.ix, sx = L.sx, cy = L.cy, R = L.cr, run = sx - ix;
    var arc = Math.PI * R, total = 2 * run + 2 * arc, out = [];
    for (var d = 0; d < total; d += pitch) {
      var x, y, nx, ny, t = d;
      if (t < run) { x = ix + t; y = cy - R; nx = 0; ny = -1; }
      else if ((t -= run) < arc) { var a = -Math.PI / 2 + t / R;
        x = sx + R * Math.cos(a); y = cy + R * Math.sin(a); nx = Math.cos(a); ny = Math.sin(a); }
      else if ((t -= arc) < run) { x = sx - t; y = cy + R; nx = 0; ny = 1; }
      else { t -= run; var b = Math.PI / 2 + t / R;
        x = ix + R * Math.cos(b); y = cy + R * Math.sin(b); nx = Math.cos(b); ny = Math.sin(b); }
      out.push({ x: x, y: y, nx: nx, ny: ny, onSprocket: x > sx - 2 });
    }
    return out;
  }

  function part(k, body) { return '<g data-part="' + k + '">' + body + '</g>'; }

  function frameArt(L, high) {
    var s = [], ix = L.ix, sx = L.sx, cy = L.cy, cr = L.cr, R = cr;
    var gy = cy + cr + 12;                                  // ground

    // ── track frame: a tapered box between the wheels, not a bar
    s.push('<path class="mf-body" d="M' + (ix + 4) + ',' + (cy - 15) + ' L' + (sx - 34) + ',' + (cy - 15) +
           ' L' + (sx - 34) + ',' + (cy - 21) + ' L' + (sx - 4) + ',' + (cy - 21) +
           ' L' + (sx - 4) + ',' + (cy + 21) + ' L' + (sx - 34) + ',' + (cy + 21) +
           ' L' + (sx - 34) + ',' + (cy + 15) + ' L' + (ix + 4) + ',' + (cy + 15) + ' Z"/>');
    // the rail the lower rollers bolt to
    s.push('<path class="mf-hair" d="M' + (ix + 10) + ',' + (cy + 10) + ' L' + (sx - 36) + ',' + (cy + 10) + '"/>');
    for (var bx = ix + 44; bx < sx - 40; bx += 44)
      s.push('<circle class="mf-hair" cx="' + bx + '" cy="' + (cy - 6) + '" r="2"/>');

    // ── recoil spring and track adjuster, at the idler end
    s.push('<rect class="mf-part" x="' + (ix + 10) + '" y="' + (cy - 11) + '" width="46" height="22" rx="4"/>');
    for (var c = 0; c < 7; c++)
      s.push('<path class="mf-hair" d="M' + (ix + 14 + c * 6) + ',' + (cy - 11) +
             ' L' + (ix + 18 + c * 6) + ',' + (cy + 11) + '"/>');
    s.push('<path class="mf-line" d="M' + (ix + 4) + ',' + cy + ' L' + (ix + 10) + ',' + cy + '"/>');


    s.push('<g data-part="CHAIN">');
    // ── the chain: two rails, then a pin and a link plate at every pitch
    var pitch = 2 * Math.PI * R / 20;
    var P = pins(L, pitch);
    s.push('<path class="mf-rail" d="' + railPath(L, 6.5) + '"/>');
    s.push('<path class="mf-rail" d="' + railPath(L, -6.5) + '"/>');
    P.forEach(function (q, i) {
      var n = P[(i + 1) % P.length];
      // link plate: a chord between this pin and the next, on both rails
      [6.5, -6.5].forEach(function (o) {
        s.push('<path class="mf-hair" d="M' + (q.x + q.nx * o).toFixed(1) + ',' + (q.y + q.ny * o).toFixed(1) +
               ' L' + (n.x + n.nx * o).toFixed(1) + ',' + (n.y + n.ny * o).toFixed(1) + '"/>');
      });
      s.push('<circle class="mf-pin" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="2.6"/>');
    });

    s.push('</g>');
    s.push('<g data-part="SPROCKET">');
    // ── sprocket: a rim, and a tooth reaching up between every second pair of
    //    pins. One tooth per pin turns the wheel into a starburst; a tooth per
    //    pocket is what actually drives the chain.
    s.push('<circle class="mf-part" cx="' + sx + '" cy="' + cy + '" r="' + (R * 0.6).toFixed(1) + '"/>');
    P.forEach(function (q, i) {
      if (!q.onSprocket || i % 2) return;
      var n = P[(i + 1) % P.length];
      var mx = (q.x + n.x) / 2, my = (q.y + n.y) / 2;
      var len = Math.hypot(mx - sx, my - cy) || 1;
      var ux = (mx - sx) / len, uy = (my - cy) / len;
      var b = R * 0.55, tip = R * 0.93;
      var px = -uy, py = ux;
      s.push('<path class="mf-part" d="M' + (sx + ux * b + px * 6).toFixed(1) + ',' + (cy + uy * b + py * 6).toFixed(1) +
             ' Q' + (sx + ux * tip + px * 3.4).toFixed(1) + ',' + (cy + uy * tip + py * 3.4).toFixed(1) +
             ' ' + (sx + ux * tip).toFixed(1) + ',' + (cy + uy * tip).toFixed(1) +
             ' Q' + (sx + ux * tip - px * 3.4).toFixed(1) + ',' + (cy + uy * tip - py * 3.4).toFixed(1) +
             ' ' + (sx + ux * b - px * 6).toFixed(1) + ',' + (cy + uy * b - py * 6).toFixed(1) + ' Z"/>');
    });

    s.push('</g>');
    // ── final drive hub, in front of the sprocket rim
    s.push('<circle class="mf-part" cx="' + sx + '" cy="' + cy + '" r="' + (R * 0.42).toFixed(1) + '"/>');
    s.push('<circle class="mf-hair" cx="' + sx + '" cy="' + cy + '" r="' + (R * 0.22).toFixed(1) + '"/>');

    s.push('<g data-part="IDLER">');
    // ── idler: rim, hub, and the flange the rails ride either side of
    s.push('<circle class="mf-part" cx="' + ix + '" cy="' + cy + '" r="' + (R * 0.74) + '"/>');
    s.push('<circle class="mf-line" cx="' + ix + '" cy="' + cy + '" r="' + (R * 0.5) + '"/>');
    s.push('<circle class="mf-part" cx="' + ix + '" cy="' + cy + '" r="' + (R * 0.24) + '"/>');

    s.push('</g>');
    s.push('<g data-part="CARRIER">');
    // ── carrier rollers, on their brackets on top of the frame
    [186, 244].forEach(function (x) {
      s.push('<path class="mf-part" d="M' + (x - 8) + ',' + (cy - 14) + ' L' + (x - 5) + ',' + (cy - 32) +
             ' L' + (x + 5) + ',' + (cy - 32) + ' L' + (x + 8) + ',' + (cy - 14) + ' Z"/>');
      s.push('<circle class="mf-part" cx="' + x + '" cy="' + (cy - 39) + '" r="8"/>');
      s.push('<circle class="mf-hair" cx="' + x + '" cy="' + (cy - 39) + '" r="3.2"/>');
    });

    s.push('</g>');
    s.push('<g data-part="ROLLER">');
    // ── lower rollers, slung under the frame on the ground run
    for (var rx = ix + 34; rx < sx - 20; rx += 44) {
      s.push('<path class="mf-line" d="M' + (rx - 7) + ',' + (cy + 15) + ' L' + (rx - 7) + ',' + (cy + 24) +
             ' M' + (rx + 7) + ',' + (cy + 15) + ' L' + (rx + 7) + ',' + (cy + 24) + '"/>');
      s.push('<circle class="mf-part" cx="' + rx + '" cy="' + (cy + 30) + '" r="9"/>');
      s.push('<circle class="mf-hair" cx="' + rx + '" cy="' + (cy + 30) + '" r="3.4"/>');
    }

    s.push('</g>');
    s.push('<g data-part="GROUSER">');
    // ── shoes and grousers on the ground run, and the ground itself
    s.push('<path class="mf-line" d="M' + (ix - 30) + ',' + (gy - 1) + ' L' + (sx + 30) + ',' + (gy - 1) + '"/>');
    for (var gx = ix - 26; gx < sx + 26; gx += 15) {
      s.push('<path class="mf-hair" d="M' + gx + ',' + (gy - 7) + ' L' + gx + ',' + (gy - 1) + '"/>');
      s.push('<path class="mf-part" d="M' + (gx + 5) + ',' + (gy - 1) + ' l5,0 l-1.4,7 l-2.2,0 Z"/>');
    }
    s.push('<path class="mf-ground" d="M' + (ix - 44) + ',' + (gy + 7) + ' L' + (sx + 44) + ',' + (gy + 7) + '"/>');
    for (var hx = ix - 40; hx < sx + 40; hx += 11)
      s.push('<path class="mf-hair" d="M' + hx + ',' + (gy + 7) + ' l-5,6"/>');

    s.push('</g>');
    // the row of roller pucks below stands in for the rollers on the frame
    s.push('<path class="mf-lead" d="M34,' + (L.rollerY - 22) + ' L34,' + (gy + 18) +
           ' L426,' + (gy + 18) + ' L426,' + (L.rollerY - 22) + '"/>');
    s.push('<path class="mf-lead" d="M48,' + (L.rollerY + 30) + ' L48,238 L410,238 L410,' +
           (L.rollerY + 30) + '"/>');
    return s.join('');
  }

  /* state(key) -> "" | "done" | "watch" | "act" | "na"; sel is the current key. */
  W.mapSVG = function (side, rollers, high, state, sel, label) {
    var L = layout(rollers, high), s = [];
    s.push('<svg class="ucmap" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" role="group" aria-label="' +
           (side === 'L' ? 'Left' : 'Right') + ' track frame">');
    s.push('<text class="um-side" x="10" y="22">' + (label || side) + '</text>');
    s.push(frameArt(L, high));
    L.spots.forEach(function (sp) {
      var k = sp.k.replace('@', side), st = state(k) || '';
      var cls = 'um-spot' + (st ? ' ' + st : '') + (k === sel ? ' sel' : '');
      var chain = sp.y > 230;
      s.push('<g class="' + cls + '" data-uc="' + k + '" transform="translate(' + sp.x + ',' + sp.y +
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

  /* Short labels for the chain row: the full names do not fit and the drawing on
     the capture screen names the point again anyway. */
  W.mapShort = { LINKH: 'HGT', BUSH: 'BUSH', PITCH4: 'P×4', PITCH1: 'P×1', GROUSER: 'GRSR' };
})(window.WEAR);
