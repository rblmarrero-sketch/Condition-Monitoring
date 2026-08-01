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

  var VB_W = 660, VB_H = 300;

  /* Where each point sits on one frame. Rollers are laid out at run time because
     the count is a property of the model, not of the drawing. */
  function layout(rollers, high) {
    var ix = 92, sx = 566, cy = high ? 150 : 138, cr = 46;
    var spots = [];
    // idler and carrier are two readings each: the outer and the inner tread band
    spots.push({ k: 'IDLER.@-OUT', x: ix - 17, y: cy, lab: 'O' });
    spots.push({ k: 'IDLER.@-IN', x: ix + 17, y: cy, lab: 'I' });
    spots.push({ k: 'CARRIER.@-OUT', x: 246, y: cy - 62, lab: 'O' });
    spots.push({ k: 'CARRIER.@-IN', x: 286, y: cy - 62, lab: 'I' });
    var x0 = 150, x1 = 500, step = rollers > 1 ? (x1 - x0) / (rollers - 1) : 0;
    for (var i = 1; i <= rollers; i++)
      spots.push({ k: 'ROLLER.@' + i, x: Math.round(x0 + (i - 1) * step), y: cy + 44, lab: String(i) });
    spots.push({ k: 'SPROCKET.@', x: sx, y: high ? 74 : cy, lab: 'S' });
    // the chain: not a place on the frame, so it gets its own row
    var chain = ['LINKH.@', 'BUSH.@', 'PITCH4.@', 'PITCH1.@', 'GROUSER.@'];
    var cx0 = 196, cstep = 76;
    chain.forEach(function (k, j) {
      spots.push({ k: k, x: cx0 + j * cstep, y: 268, lab: k.split('.')[0] });
    });
    return { spots: spots, ix: ix, sx: sx, cy: cy, cr: cr };
  }

  function frameArt(L, high) {
    var s = [], ix = L.ix, sx = L.sx, cy = L.cy, cr = L.cr;
    function loop(d) {
      return '<path d="' + d + '" fill="none" stroke="var(--ink-2)" stroke-width="13" ' +
             'stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="var(--surface-3)" ' +
             'stroke-width="8" stroke-linejoin="round"/>';
    }
    if (high) {
      // elevated sprocket: the drive wheel sits above the frame on a triangle
      s.push('<path d="M' + ix + ',' + (cy - cr) + ' L' + (sx - 30) + ',' + (74 - cr) +
             ' A' + cr + ',' + cr + ' 0 0 1 ' + (sx + 18) + ',' + (74 + cr - 8) +
             ' L' + (sx - 60) + ',' + (cy + cr) + ' L' + ix + ',' + (cy + cr) +
             ' A' + cr + ',' + cr + ' 0 0 1 ' + ix + ',' + (cy - cr) + ' Z"' +
             ' fill="none" stroke="var(--ink-2)" stroke-width="13" stroke-linejoin="round"/>');
      s.push('<rect x="' + (ix + 20) + '" y="' + (cy - 18) + '" width="' + (sx - ix - 100) +
             '" height="36" rx="8" fill="var(--surface-2)" stroke="var(--ink-2)" stroke-width="2"/>');
      s.push(wheel(sx - 6, 74, 32));
    } else {
      s.push(loop('M' + ix + ',' + (cy - cr) + ' L' + sx + ',' + (cy - cr) +
                  ' A' + cr + ',' + cr + ' 0 0 1 ' + sx + ',' + (cy + cr) +
                  ' L' + ix + ',' + (cy + cr) +
                  ' A' + cr + ',' + cr + ' 0 0 1 ' + ix + ',' + (cy - cr) + ' Z'));
      s.push('<rect x="' + (ix + 26) + '" y="' + (cy - 18) + '" width="' + (sx - ix - 52) +
             '" height="36" rx="8" fill="var(--surface-2)" stroke="var(--ink-2)" stroke-width="2"/>');
      s.push(wheel(sx, cy, 32));
    }
    s.push(wheel(ix, cy, 32));
    // the ground run and its shoes
    var gy = cy + cr + 9;
    s.push('<rect x="' + (ix - 40) + '" y="' + gy + '" width="' + (sx - ix + 80) +
           '" height="12" rx="2" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="2"/>');
    for (var gx = ix - 30; gx < sx + 40; gx += 38)
      s.push('<path d="M' + gx + ',' + (gy + 12) + ' l8,0 l-2,11 l-4,0 Z" ' +
             'fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="1.6"/>');
    // the chain points hang below on a bracket, because that is where they live
    s.push('<path d="M170,246 L170,238 L500,238 L500,246" fill="none" stroke="var(--muted)" ' +
           'stroke-width="1.4" stroke-dasharray="4 3"/>');
    return s.join('');
  }
  function wheel(x, y, r) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="var(--surface-3)" ' +
           'stroke="var(--ink-2)" stroke-width="2.4"/><circle cx="' + x + '" cy="' + y +
           '" r="' + Math.round(r / 2.6) + '" fill="var(--surface-2)" stroke="var(--ink-2)" ' +
           'stroke-width="1.8"/>';
  }

  /* state(key) -> "" | "done" | "watch" | "act" | "na"; sel is the current key. */
  W.mapSVG = function (side, rollers, high, state, sel, label) {
    var L = layout(rollers, high), s = [];
    s.push('<svg class="ucmap" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" role="group" aria-label="' +
           (side === 'L' ? 'Left' : 'Right') + ' track frame">');
    s.push('<text class="um-side" x="16" y="30">' + (label || side) + '</text>');
    s.push(frameArt(L, high));
    L.spots.forEach(function (sp) {
      var k = sp.k.replace('@', side), st = state(k) || '';
      var cls = 'um-spot' + (st ? ' ' + st : '') + (k === sel ? ' sel' : '');
      var chain = sp.y > 240;
      s.push('<g class="' + cls + '" data-uc="' + k + '" transform="translate(' + sp.x + ',' + sp.y +
             ')" role="button" tabindex="0" aria-label="' + k + '">');
      s.push('<circle class="um-hit" r="' + (chain ? 32 : 28) + '" fill="transparent"/>');
      if (chain) s.push('<rect class="um-puck" x="-33" y="-15" width="66" height="30" rx="15"/>');
      else s.push('<circle class="um-puck" r="16"/>');
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
