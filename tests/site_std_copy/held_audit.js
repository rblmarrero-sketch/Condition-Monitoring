/* SITE_STD_V1 v2.7 held-header rule (Rickie 13.11 13:40 "ensure that this bug is not happening in other tables. keep it as a check and rule").
   Run in the page after it has been scrolled: every table the page has scrolled past (top above the pinned bars, body below them) must have its heading directly under the
   bars pinned at the top (site menu, a page's own sticky bar) - not under them, not lower - and fully opaque, so rows never show through.
   Measured on its own (does not ask std.js where it put the heading). Returns a list of faults; empty = PASS. */
window.__stdHeldAudit = function () {
  var bad = [];
  function inTable(e) { return !!(e.closest && e.closest('table,.std-sfpop,.std-pkpop,.std-tip')); }
  var pins = [].slice.call(document.querySelectorAll('body *')).filter(function (e) { if (inTable(e)) return false; var c = getComputedStyle(e);
    if (c.position !== 'fixed' && c.position !== 'sticky') return false; if (c.display === 'none' || c.visibility === 'hidden') return false;
    var r = e.getBoundingClientRect(); return r.height > 0 && r.width > innerWidth * 0.3 && r.height < innerHeight * 0.5 && r.top < innerHeight * 0.5; })
    .map(function (e) { return e.getBoundingClientRect(); }).sort(function (a, b) { return a.top - b.top; });
  var y = 0; pins.forEach(function (r) { if (r.top <= y + 2) y = Math.max(y, r.bottom); });
  /* every table the page has scrolled past (its top above the pinned bars, its body still below them), whatever holds its heading:
     the template (table.std-held), a sticky heading, or the page's own script - and one whose heading simply scrolled away */
  var held = [].slice.call(document.querySelectorAll('table')).filter(function (t) { if (!t.offsetParent || !t.tHead || !t.tHead.rows.length || t.closest('.std-sfpop,.std-pkpop,[hidden]')) return false;
    var r = t.getBoundingClientRect(); return r.top < y - 2 && r.bottom > y + 60 && t.tHead.getBoundingClientRect().height > 0; });
  held.forEach(function (t, i) { var name = t.id || t.getAttribute('data-std-id') || ('table ' + (i + 1));
    var cells = [].slice.call(t.tHead.rows[0].cells).filter(function (c) { return c.offsetWidth; }); if (!cells.length) return;
    var top = Math.min.apply(null, cells.map(function (c) { return c.getBoundingClientRect().top; }));
    if (top < y - 2) bad.push(name + ': heading ' + Math.round(y - top) + ' px under the pinned bars (top ' + Math.round(top) + ', bars end ' + Math.round(y) + ')');
    else if (top > y + 3) bad.push(name + ': heading ' + Math.round(top - y) + ' px below the pinned bars (gap shows rows)');
    cells.forEach(function (c, j) { var o = 1, e = c; while (e && e !== t.parentNode) { o *= +getComputedStyle(e).opacity; e = e.parentElement; }
      var bgOk = false; for (e = c; e && e !== t; e = e.parentElement) { var m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] >= 0.99) && !/^rgba\(0, 0, 0, 0\)$/.test(getComputedStyle(e).backgroundColor)) { bgOk = true; break; } }
      if (o < 0.99) bad.push(name + ': heading cell ' + (j + 1) + ' is see-through (opacity ' + o.toFixed(2) + ')');
      else if (!bgOk) bad.push(name + ': heading cell ' + (j + 1) + ' has no solid background'); }); });
  return { held: held.length, barsEnd: Math.round(y), bad: bad };
};
