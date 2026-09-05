/* ONE RULE FOR APPLYING AN OFFICE CORRECTION TO A ROUND — on the phone, in
   the office, anywhere a record is read.

   The dashboard wrote corrections as markers (_meta/<round>.edit.json) and
   applied them in its own applyEdits(); the phone read the same markers and
   applied only the void. So a grade the office put on a round that arrived
   ungraded, a finding moved to the right point, a position removed — none of
   it ever reached the inspector's history: "I already put the grade in the
   dashboard, in the mobile still nothing." Two readers of one document with
   two rules is how surfaces come to disagree; this is the one rule, loaded by
   both, and the dashboard's applyEdits() is now a call into it.

   apply(r, e, H) returns a NEW record with the marker e laid over r:
     round fields smu/by/sup, the location, a move of the filing address,
     per-position overlays (grade normalised, a finding moved to another key
     carries _from, a position removed leaves the round and is named in
     _removed, an empty position a finding landed on is absorbed).
   H supplies what differs by surface: gradeNum, itemEmpty, recKey, ek.

   latest(list) keeps one marker per key, the last written winning. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CMEdits = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function apply(r, e, H) {
    if (!r || !e) return r;
    H = H || {};
    var gradeNum = H.gradeNum || function (v) { return v; };
    var itemEmpty = H.itemEmpty || function () { return false; };
    var recKey = H.recKey || function (x) { return [x.equip, x.date, x.type].join('|'); };
    var out = Object.assign({}, r);
    /* The address this correction is filed under, carried onto the corrected
       record so the next edit, report or void goes to the same place. */
    if (H.ek) out._ek = H.ek;
    out._void = !!e.void; out._reason = e.reason || ''; out._editBy = e.by || ''; out._editAt = e.at || '';
    out._note = e.note || '';
    /* Round-level corrections. The unit, the date and the round type are a
       MOVE, not a field edit — they are the record's filing address. */
    var F = e.fields || {};
    ['smu', 'by', 'sup'].forEach(function (k) {
      if (F[k] !== undefined && F[k] !== null) { out[k] = F[k]; out['_f_' + k] = 1; } });
    /* The location: both halves typed and numeric replace the stamp; both
       cleared on purpose remove it; one half alone keeps the other. */
    if (F.lat !== undefined || F.lon !== undefined) {
      var la = F.lat !== undefined ? parseFloat(F.lat) : (r.gps ? Number(r.gps.lat) : NaN);
      var lo = F.lon !== undefined ? parseFloat(F.lon) : (r.gps ? Number(r.gps.lon) : NaN);
      if (isFinite(la) && isFinite(lo)) { out.gps = { lat: la, lon: lo, acc: null, office: 1 }; out._f_gps = 1; }
      else if (String(F.lat == null ? '' : F.lat) === '' && String(F.lon == null ? '' : F.lon) === '') { delete out.gps; out._f_gps = 1; }
    }
    /* The round was filed against the wrong machine, day or round. Only the
       parts that actually differ count as moved. */
    var mv = e.move || null;
    if (mv) {
      var was = { equip: out.equip, date: out.date, type: out.type };
      ['equip', 'date', 'type'].forEach(function (k) { if (mv[k] && mv[k] !== out[k]) out[k] = mv[k]; });
      var changed = ['equip', 'date', 'type'].filter(function (k) { return was[k] !== out[k]; });
      if (changed.length) {
        out._moved = changed; out._wasKey = recKey(was);
        out._moveBy = mv.by || e.by || ''; out._moveAt = mv.at || e.at || '';
        out._moveWhy = mv.why || '';
      }
    }
    var per = e.items || {};
    out._edited = Object.keys(per);
    /* A position logged by mistake: the marker says removed, the sidecar is
       untouched, the round names what was removed so it can be put back. */
    var removed = [];
    out.items = (r.items || []).map(function (i) {
      var p = per[i.key]; if (!p) return i;
      if (p.removed && String(p.removed) !== '0' && String(p.removed) !== 'false') {
        removed.push({ key: i.key, label: i.label || '', by: e.by || '', at: e.at || '' }); return null; }
      /* Only fields actually set in the correction win; a blank means
         "unchanged", so clearing a value is done by writing "" explicitly. */
      var m = Object.assign({}, i);
      Object.keys(p).forEach(function (k) { if (p[k] !== undefined && p[k] !== null) m[k] = p[k]; });
      /* Normalised on the way in — this way in too: a marker written before
         the 1–5 build carries the grade as a letter. */
      if (m.grade != null && m.grade !== '' && gradeNum(m.grade) !== m.grade) m.grade = gradeNum(m.grade) || '';
      /* A finding filed under the wrong point: the marker names the new key
         and stays filed under the key the phone wrote, which _from carries. */
      if (p.key !== undefined && p.key !== null && p.key !== '' && p.key !== i.key) m._from = i.key;
      m._edited = 1;
      return m;
    }).filter(Boolean);
    if (removed.length) out._removed = removed;
    /* The point a finding was moved onto may already exist on the record as an
       empty position the phone listed. One key, one item: the empty one goes. */
    var movedTo = {}; out.items.forEach(function (x) { if (x._from) movedTo[x.key] = 1; });
    if (Object.keys(movedTo).length)
      out.items = out.items.filter(function (x) { return !(!x._from && movedTo[x.key] && itemEmpty(x)); });
    return out;
  }

  /* One marker per key, the last written winning — the same last-write-wins
     the backend states for markers. keyOf normalises a marker's key the way
     the reader files its records, so a marker written "insp" finds "INSP". */
  function latest(list, keyOf) {
    var m = {};
    (list || []).forEach(function (e) {
      if (!e || !e.key) return;
      var k = keyOf ? keyOf(e.key) : e.key; if (!k) return;
      var have = m[k];
      if (!have || String(e.at || '') >= String(have.at || '')) m[k] = e;
    });
    return m;
  }

  return { apply: apply, latest: latest };
}));
