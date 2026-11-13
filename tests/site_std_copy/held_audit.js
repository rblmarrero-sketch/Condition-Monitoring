/* SITE_STD_V1 v2.7 held-header rule (Rickie 13.11 13:40 "ensure that this bug is not happening in other tables. keep it as a check and rule").
   Run in the page after it has been scrolled: every table the page has scrolled past (top above the pinned bars, body below them) must have its heading directly under the
   bars pinned at the top (site menu, a page's own sticky bar) - not under them, not lower - and fully opaque, so rows never show through.
   Measured on its own (does not ask std.js where it put the heading). Returns a list of faults; empty = PASS. */
/* v2.7.1: a table inside its own vertical scroll box (a list capped at a height) keeps its heading at the top of that box, by design;
   the page-level rule does not apply to it */
window.__stdOwnBox = function (t) { for (var e = t.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
    var c = getComputedStyle(e); if (/auto|scroll/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 2) return true; } return false; };
/* v2.7.2: a heading painted with a gradient (Work Order Manager: th{background:linear-gradient(#eef3f7,#e6edf2)}) is solid when every colour in it is opaque;
   its background-colour reads transparent, which v2.7 took for see-through */
window.__stdSolidImg = function (bi) { if (!bi || !/gradient\(/.test(bi) || /transparent/.test(bi)) return false;
  var cs = bi.match(/rgba?\([^)]*\)/g); if (!cs || !cs.length) return false;
  return cs.every(function (x) { var n = x.match(/[\d.]+/g); return n && (n.length < 4 || +n[3] >= 0.99); }); };
/* v2.7.2: a table drawn as cards (its rows and heading no longer laid out as a table - DQ report's dq-stack, CM's ascards, the
   template's phone cards) has no columns to hold a heading over: every card names its own fields. Not judged. */
window.__stdCards = function (t) { var d = getComputedStyle(t.tHead).display, r = t.tBodies[0] && t.tBodies[0].rows[0];
  return d !== 'table-header-group' || !!(r && getComputedStyle(r).display !== 'table-row'); };
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
  var held = [].slice.call(document.querySelectorAll('table')).filter(function (t) { if (!t.offsetParent || !t.tHead || !t.tHead.rows.length || t.closest('.std-sfpop,.std-pkpop,[hidden]') || __stdOwnBox(t) || __stdCards(t)) return false;
    var r = t.getBoundingClientRect(); return r.top < y - 2 && r.bottom > y + 60 && t.tHead.getBoundingClientRect().height > 0; });
  held.forEach(function (t, i) { var name = t.id || t.getAttribute('data-std-id') || ('table ' + (i + 1));
    var cells = [].slice.call(t.tHead.rows[0].cells).filter(function (c) { return c.offsetWidth; }); if (!cells.length) return;
    var top = Math.min.apply(null, cells.map(function (c) { return c.getBoundingClientRect().top; }));
    if (top < y - 2) bad.push(name + ': heading ' + Math.round(y - top) + ' px under the pinned bars (top ' + Math.round(top) + ', bars end ' + Math.round(y) + ')');
    else if (top > y + 3) bad.push(name + ': heading ' + Math.round(top - y) + ' px below the pinned bars (gap shows rows)');
    cells.forEach(function (c, j) { var o = 1, e = c; while (e && e !== t.parentNode) { o *= +getComputedStyle(e).opacity; e = e.parentElement; }
      var bgOk = false; for (e = c; e && e !== t; e = e.parentElement) { var m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g); if ((m && (m.length < 4 || +m[3] >= 0.99) && !/^rgba\(0, 0, 0, 0\)$/.test(getComputedStyle(e).backgroundColor)) || __stdSolidImg(getComputedStyle(e).backgroundImage)) { bgOk = true; break; } }
      if (o < 0.99) bad.push(name + ': heading cell ' + (j + 1) + ' is see-through (opacity ' + o.toFixed(2) + ')');
      else if (!bgOk) bad.push(name + ': heading cell ' + (j + 1) + ' has no solid background'); }); });
  return { held: held.length, barsEnd: Math.round(y), bad: bad };
};
