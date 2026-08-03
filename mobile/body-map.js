/* The tray and its stations, for either model.

   The two diagrams are not the same kind of drawing. The HM400's is a plan
   view looking down into the tray; the TR60's is a flat pattern with the head,
   both sides and the floor unfolded onto one sheet. So the map does not draw a
   tray shape of its own — it draws the regions the stations actually occupy,
   which is right for both and cannot disagree with either.

   What it deliberately does NOT do is print sixty-three labels. That works at
   A4 on a clipboard and not at 412 px in a glove, where the labels are the
   first thing to become unreadable and also the least useful thing on the map.
   The map answers WHERE and HOW BAD; the station you are on is named, once, so
   you can check yourself against the tray; the rest of the naming lives in the
   chip row beneath. Same division as the undercarriage and GET rounds. */
(function (W) {
  'use strict';
  var VB_W = 300, VB_H = 640;
  var ORDER = ['FRONT', 'LEFT', 'RIGHT', 'FLR1', 'FLR2', 'FLR3', 'TAIL'];
  var FILL = { FRONT: 'z1', LEFT: 'z2', RIGHT: 'z2', FLR1: 'z3', FLR2: 'z4', FLR3: 'z3', TAIL: 'z5' };

  function px(p) { return [(p[0] / 100 * VB_W), (p[1] / 100 * VB_H)]; }
  function poly(pts) {
    return pts.map(function (p, i) { var q = px(p);
      return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ') + ' Z';
  }

  /* o.model      "HM400" | "TR60"
     o.state(k)   "" | done | watch | act   for one station
     o.zoneState(z)                          for a zone, from its thinnest station
     o.sel        the station or zone currently open
     o.tag        false to leave even the selected station unnamed */
  W.bodyMap = function (o) {
    o = o || {};
    var G = (typeof self !== 'undefined' ? self : this);
    var B = G.BODY, id = o.model || 'HM400';
    if (!B || !B.of(id)) return '';
    var s = [], lang = o.lang || 'en';
    var flat = B.of(id).view === 'flat';
    s.push('<svg class="bodymap" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" role="group" aria-label="' +
           (lang === 'ru' ? 'Кузов и точки замера' : 'Tray and its measurement stations') + '">');
    if (!flat) s.push('<rect class="bm-shell" x="4" y="4" width="' + (VB_W - 8) +
                      '" height="' + (VB_H - 8) + '" rx="10"/>');
    ORDER.forEach(function (z) {
      var r = B.region(id, z);
      if (!r) return;
      var st = (o.zoneState ? o.zoneState(z) : '') || '';
      /* No selected state on the region. o.sel is a station key, so this could
         never match a zone — and shading a whole zone as well as ringing the
         dot inside it was noise on top of an answer already given. */
      s.push('<path class="bm-z ' + FILL[z] + (st ? ' ' + st : '') +
             '" data-zone="' + z + '" d="' + poly(r) + '"/>');
    });
    B.points(id).forEach(function (p) {
      var st = (o.state ? o.state(p.k) : '') || '';
      var q = px([p.x, p.y]);
      s.push('<g class="bm-p' + (st ? ' ' + st : '') + (p.k === o.sel ? ' sel' : '') +
             '" data-pt="' + p.k + '" role="button" tabindex="0" aria-label="' + p.k + '">');
      /* the target is bigger than the mark, the same trick the machine map uses */
      s.push('<circle class="bm-hit" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="14"/>');
      s.push('<circle class="bm-dot" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="5.4"/>');
      s.push('</g>');
    });
    /* Name the one station you are on. Sixty-three is the unreadable diagram;
       none at all leaves you trusting the app about which dot is which. */
    if (o.sel && o.tag !== false) {
      var sp = B.get(id, o.sel);
      if (sp) {
        var q2 = px([sp.x, sp.y]), left = q2[0] < VB_W / 2;
        /* The label sits beside its dot, which puts it on top of the neighbour's
           touch target. Let taps fall through it or the name steals them. */
        s.push('<text class="bm-tag" pointer-events="none" x="' + (q2[0] + (left ? 13 : -13)).toFixed(1) +
               '" y="' + (q2[1] + 5).toFixed(1) + '" text-anchor="' + (left ? 'start' : 'end') +
               '">' + o.sel + '</text>');
      }
    }
    s.push('</svg>');
    return s.join('');
  };
})(typeof self !== 'undefined' ? self : this);
