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
    var ix = 64, sx = 396, cy = high ? 112 : 100, cr = 38;
    var spots = [];
    // the two bands are stacked at the idler and spread at the carrier, because
    // touching hit areas are how a gloved thumb picks the wrong one
    spots.push({ k: 'IDLER.@-OUT', x: ix, y: cy - 30, lab: 'O' });
    spots.push({ k: 'IDLER.@-IN',  x: ix, y: cy + 30, lab: 'I' });
    spots.push({ k: 'CARRIER.@-OUT', x: 176, y: cy - 58, lab: 'O' });
    spots.push({ k: 'CARRIER.@-IN',  x: 234, y: cy - 58, lab: 'I' });
    spots.push({ k: 'SPROCKET.@', x: sx, y: high ? 46 : cy, lab: 'S' });
    var x0 = 34, x1 = 426, step = rollers > 1 ? (x1 - x0) / (rollers - 1) : 0;
    for (var i = 1; i <= rollers; i++)
      spots.push({ k: 'ROLLER.@' + i, x: Math.round(x0 + (i - 1) * step), y: 190, lab: String(i) });
    ['LINKH.@', 'BUSH.@', 'PITCH4.@', 'PITCH1.@', 'GROUSER.@'].forEach(function (k, j) {
      spots.push({ k: k, x: 48 + j * 91, y: 254, lab: k.split('.')[0] });
    });
    return { spots: spots, ix: ix, sx: sx, cy: cy, cr: cr, rollerY: 190, step: step };
  }

  function frameArt(L, high) {
    var s = [], ix = L.ix, sx = L.sx, cy = L.cy, cr = L.cr;
    function loop(d) {
      return '<path d="' + d + '" fill="none" stroke="var(--ink-2)" stroke-width="11" ' +
             'stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="var(--surface-3)" ' +
             'stroke-width="6.5" stroke-linejoin="round"/>';
    }
    if (high) {
      s.push(loop('M' + ix + ',' + (cy - cr) + ' L' + (sx - 22) + ',' + (46 - cr) +
                  ' A' + cr + ',' + cr + ' 0 0 1 ' + (sx + 14) + ',' + (46 + cr - 6) +
                  ' L' + (sx - 44) + ',' + (cy + cr) + ' L' + ix + ',' + (cy + cr) +
                  ' A' + cr + ',' + cr + ' 0 0 1 ' + ix + ',' + (cy - cr) + ' Z'));
      s.push(wheel(sx - 4, 46, 26));
    } else {
      s.push(loop('M' + ix + ',' + (cy - cr) + ' L' + sx + ',' + (cy - cr) +
                  ' A' + cr + ',' + cr + ' 0 0 1 ' + sx + ',' + (cy + cr) +
                  ' L' + ix + ',' + (cy + cr) +
                  ' A' + cr + ',' + cr + ' 0 0 1 ' + ix + ',' + (cy - cr) + ' Z'));
      s.push(wheel(sx, cy, 26));
    }
    s.push('<rect x="' + (ix + 20) + '" y="' + (cy - 14) + '" width="' + (sx - ix - 40) +
           '" height="28" rx="7" fill="var(--surface-2)" stroke="var(--ink-2)" stroke-width="2"/>');
    s.push(wheel(ix, cy, 26));
    // the ground run, and a leader from it to the row of rollers beneath
    var gy = cy + cr + 7;
    s.push('<rect x="' + (ix - 34) + '" y="' + gy + '" width="' + (sx - ix + 68) +
           '" height="10" rx="2" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="2"/>');
    for (var gx = ix - 26; gx < sx + 34; gx += 34)
      s.push('<path d="M' + gx + ',' + (gy + 10) + ' l7,0 l-1.8,9 l-3.4,0 Z" ' +
             'fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="1.4"/>');
    s.push('<path d="M34,' + (L.rollerY - 22) + ' L34,' + (gy + 22) + ' L426,' + (gy + 22) +
           ' L426,' + (L.rollerY - 22) + '" fill="none" stroke="var(--muted)" ' +
           'stroke-width="1.3" stroke-dasharray="4 3"/>');
    s.push('<path d="M48,' + (L.rollerY + 30) + ' L48,238 L410,238 L410,' + (L.rollerY + 30) +
           '" fill="none" stroke="var(--muted)" stroke-width="1.3" stroke-dasharray="4 3"/>');
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
