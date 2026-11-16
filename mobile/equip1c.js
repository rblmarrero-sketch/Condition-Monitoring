/* EQ1C_V1 (17.11.2026, Rickie: "lets all follow the manufacturer and model and specs from 1C. correct the CM register. if there is no
   inspection done in CM then we can drop it"; "when we build the CM app, we put all the list from 1C").

   THE EQUIPMENT LIST COMES FROM 1C. assets.js is the register the app was first built with (an older client list, not 1C): 1,128
   units, 364 of them in neither 1C Asset State nor any work order, 54 1C units missing. PECHANKA now writes data/equipment_1c.json
   with every work-order build (askpi-site eq1c_kit): every unit 1C knows (Asset State, and units with work orders or hour-meter
   readings only), the unit code as the key, range / manufacturer / applicability from Asset State else the newest work order, the
   model typed on the hierarchy page else 1C's "Equip model", and "keep" = units not in 1C that have CM rounds.

   This file runs right after assets.js and before any page script reads window.ASSETS, on the phone and both office pages:
   - it applies the last copy it stored (synchronously, from localStorage), so the page builds its indexes on the 1C list;
   - it fetches a fresh copy in the background and stores it for the next load (the phone reloads itself for every build, an
     office page refreshes); on a device that never stored one, assets.js stands until then;
   - nothing here throws: no copy, a broken copy or a list of under 100 units leaves assets.js exactly as it is.
   A unit in 1C: range, manufacturer and model from 1C. Where the register already names the SAME model (spelling aside), the
   register's own model text and model key are kept, because the lubrication, GET, wear and component tables are keyed on them;
   where 1C names another model, or the register had none, 1C's model is used. The inspection class is the register's while the
   range is unchanged, otherwise the class of 1C's range (CAT2CLS, the same table as mobile/index.html, held equal by tests/eq1c.cjs).
   A unit not in 1C: kept, marked n1c, if it has CM rounds; otherwise dropped. */
(function () {
  "use strict";
  var KEY = "cm_eq1c", URL = "../data/equipment_1c.json";
  var CAT2CLS = {"TRUCK, DUMP":"HT","TRUCK, ARTICULATED":"AT","EXCAVATOR, BUCKET":"EXC","DOZER, TRACK TYPE":"DOZ",
    "GRADER, MOBILE":"GRD","LOADER, FRONT":"LDR","DRILL, BLASTING":"DRB","DRILL, EXPLORATION":"DRE",
    "CRUSHER, MOBILE CONE":"CRC","CRUSHER, MOBILE JAW":"CRJ","SCREENER, MOBILE":"SCR","ROCK BREAKER, HYDRAULIC":"HRB","CRANE, MOBILE":"CRN"};
  var E = window.EQ1C = { CAT2CLS: CAT2CLS, applied: null, stats: null, stored: null, fetched: null };
  function key(s) { return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9А-ЯЁ]/g, ""); }
  function same(a, b) { a = key(a); b = key(b); return !!a && !!b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0); }
  function apply(d) {
    var reg = window.ASSETS || [], by = {}, out = [], st = { units: 0, added: 0, dropped: 0, kept: 0, model1c: 0 };
    if (!d || !d.units || d.units.length < 100) return null;
    reg.forEach(function (a) { by[String(a.n).toUpperCase()] = a; });
    var keep = {}; (d.keep || []).forEach(function (n) { keep[String(n).toUpperCase()] = 1; });
    var in1c = {};
    d.units.forEach(function (u) {
      var n = String(u.n || "").toUpperCase(); if (!n) return; in1c[n] = 1;
      var e = by[n], cat = u.r || (e && e.cat) || "", mf = u.m || "", md = u.md || "";
      var a = { n: n };
      if (e && e.cat === cat && e.cls) a.cls = e.cls; else a.cls = CAT2CLS[cat] || (e && !cat ? e.cls : "GEN");
      if (cat) a.cat = cat; else if (e && e.fb) a.fb = e.fb;
      var regModel = e ? (e.mk && e.mk.indexOf("|") > 0 ? e.mk.split("|")[1] : (key(e.m) !== key(mf) ? e.m : "")) : "";
      if (e && md && regModel && same(regModel, md)) { a.m = e.m; if (e.mk) a.mk = e.mk; }
      else if (md) { a.m = (mf && !same(md, mf) && key(md).indexOf(key(mf)) !== 0 ? mf + " " : "") + md; if (mf) a.mk = mf + "|" + md; st.model1c++; }
      else if (mf) a.m = mf;
      if (u.ap) a.ap = u.ap; if (u.d) a.d = u.d; a.src = "1C";
      if (!e) st.added++;
      out.push(a);
    });
    reg.forEach(function (a) {
      var n = String(a.n).toUpperCase(); if (in1c[n]) return;
      if (keep[n]) { var k = {}; for (var p in a) k[p] = a[p]; k.n1c = 1; out.push(k); st.kept++; } else st.dropped++;
    });
    out.sort(function (x, y) { return x.n < y.n ? -1 : x.n > y.n ? 1 : 0; });
    st.units = out.length; st.generated = d.generated || "";
    window.ASSETS = out; E.applied = d.generated || "?"; E.stats = st;
    return st;
  }
  function load() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
  E.apply = apply;
  try { var d0 = load(); E.stored = d0 && d0.generated || null; if (d0) apply(d0); } catch (e) { (window.__errs = window.__errs || []).push({ where: "eq1c-apply", e: String(e) }); }
  E.refresh = function () {
    if (typeof fetch !== "function") return Promise.resolve(false);
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 30000) : 0;
    return fetch(URL + "?_=" + Date.now(), { cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (!d || d.marker !== "EQ1C_V1" || !d.units || d.units.length < 100) return false;
        E.fetched = d.generated || "?"; var moved = d.generated !== E.stored; if (moved && save(d)) E.stored = d.generated; return moved;
      })
      .catch(function () { return false; })
      .then(function (x) { if (t) clearTimeout(t); return x; });
  };
  /* The list exists only where PECHANKA publishes it: Firebase (the phones) and the office copy under /cm/. Anywhere else (a test
     server, GitHub Pages) nothing is asked, so no page logs a 404 for a file that cannot be there. */
  var L = typeof location !== "undefined" ? location : {};
  E.live = /\.web\.app$|\.firebaseapp\.com$/.test(L.hostname || "") || /^\/cm\//.test(L.pathname || "") || !!window.CM_EQ1C_FETCH;
  if (E.live && typeof setTimeout === "function") setTimeout(function () { E.refresh(); }, 4000);
})();
