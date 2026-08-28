/* ONE RULE FOR WHAT AN INSPECTION POINT IS, USED BY EVERY PATH THAT TOUCHES ONE.
   ==========================================================================

   TK115 and DZ007 arrived at the dashboard carrying an extra inspection-point
   object with nothing in it at all: no key, no name, no condition, no
   measurement, no defect, no comment, no photograph. Both inspections also
   carried perfectly good identified points.

   The dashboard saw a point with no key, held the whole inspection back as
   untrustworthy, and told the reliability engineer that a finding was not
   linked to a component — advising them to name the point or re-walk the
   machine. There was no finding. There was an empty row, and the advice would
   have sent somebody to a truck in −40 to re-inspect a machine that had been
   inspected correctly the first time.

   That is this project's signature defect wearing its most expensive coat yet:
   not a real value rendered as nothing, but NOTHING RENDERED AS A REAL PROBLEM.

   ---------------------------------------------------------------------------
   THE RULE

   Remove an inspection point automatically only when it is empty in EVERY
   respect — no key, no name, and not one operational field carrying anything.
   That is a blank row somebody's finger created; it is not data, and it has no
   business stopping an inspection from being counted.

   Keep a keyless point that carries ANYTHING operational. A grade, a
   millimetre, a defect, a comment, a photograph — any one of those means an
   inspector recorded something real and only the label is missing. That needs a
   human to say which component it was, and it is worth interrupting somebody
   for. It is flagged, not deleted, and never guessed at.

   The distinction is the whole file. Deleting a populated point loses field
   evidence; keeping an empty one blocks a good inspection. Both are wrong, and
   they are wrong in opposite directions, so the test has to be exact.
   ---------------------------------------------------------------------------

   Written to `self` rather than `window`: the service worker imports this to
   decide what to cache, and a service worker has no window. Loaded by the
   phone, the dashboard and the report engine, so all three agree on what an
   inspection point IS — which is the only way they can agree on how many
   there are. */
(function (G) {
  'use strict';

  /* Every field on an inspection point that can carry something an inspector
     meant. Deliberately generous: a field NOT on this list makes a populated
     point look empty and deletes real evidence, which is the failure that
     cannot be undone. A field wrongly on it only keeps a blank row visible.
     When in doubt, add it. */
  var OPERATIONAL = [
    /* condition */
    'grade', 'sev', 'sevIso', 'severity', 'condition',
    /* measurement, and everything a measured round writes with it */
    'mm', 'value', 'unit', 'measurement', 'pct', 'worn', 'remaining',
    'reading', 'baseline', 'limit', 'hours', 'f',
    /* what was found and why */
    'defect', 'defectCode', 'defectIso', 'finding', 'iso', 'isoMode',
    'cause', 'causeCode', 'causeIso', 'particle', 'detection',
    /* what to do about it */
    'action', 'actionIso', 'actionLabel', 'recommendation', 'rec',
    'prio', 'prioLabel', 'priority', 'wo', 'workOrder',
    /* who and when */
    'owner', 'due', 'status', 'dispBy', 'dispReason',
    /* the inspector's own words */
    'comment', 'note', 'notes',
    /* lubrication */
    'lubeProduct', 'lubeUnlisted', 'lubeEvidence', 'lubeSampled', 'prod', 'evid',
    /* temperature */
    'tempC', 'ambC', 'tempMethod', 'tempV', 'tempA', 'tempM',
    /* components and fluid */
    'comp', 'oil',
    /* evidence */
    'photo', 'photos', 'video', 'attachments', 'media'
  ];

  /* "Carries nothing" has to cover every shape a blank arrives in. A count of
     zero photographs is not a photograph; an empty array is not evidence; a
     string of spaces is what a keyboard leaves behind. */
  function blank(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'number') return v === 0;      // photos:0 is no photographs
    if (typeof v === 'boolean') return v === false;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  }

  /* The identity half: what the point IS. */
  function named(i) {
    return !blank(i && i.key) || !blank(i && i.label) || !blank(i && i.name);
  }

  /* The evidence half: whether anything was recorded here. */
  function carries(i) {
    if (!i || typeof i !== 'object') return false;
    for (var n = 0; n < OPERATIONAL.length; n++) {
      if (!blank(i[OPERATIONAL[n]])) return true;
    }
    /* Anything at all beyond the fields we know about still counts as content.
       A round added next year writes a field this list has never heard of, and
       silently deleting it because the list is out of date is exactly the
       failure this file exists to prevent. */
    var keys = Object.keys(i);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (k === 'key' || k === 'label' || k === 'name') continue;
      if (k.charAt(0) === '_') continue;             // internal marks, not data
      if (!blank(i[k])) return true;
    }
    return false;
  }

  /* THE THREE ANSWERS.
       "empty"  nothing at all — remove it, quietly, and count it
       "orphan" real content, no identity — keep it, flag it, never guess
       "ok"     a normal point                                            */
  function classify(i) {
    if (!i || typeof i !== 'object') return 'empty';
    if (named(i)) return 'ok';
    return carries(i) ? 'orphan' : 'empty';
  }

  /* Normalise ONE record. Returns the record (a copy when anything changed, the
     original when nothing did, so callers can cheaply tell) plus what happened,
     which is what Admin Diagnostics reports and what the suites assert on. */
  function record(rec) {
    if (!rec || !Array.isArray(rec.items)) return { rec: rec, removed: 0, orphans: 0 };
    var keep = [], removed = 0, orphans = 0;
    for (var n = 0; n < rec.items.length; n++) {
      var i = rec.items[n], c = classify(i);
      if (c === 'empty') { removed++; continue; }
      if (c === 'orphan') {
        orphans++;
        /* Marked, not modified. The point keeps every field it arrived with —
           the correction workflow's job is to add the identity, not to rebuild
           the finding. */
        var m = Object.assign({}, i);
        m._needsPoint = 1;
        keep.push(m);
        continue;
      }
      keep.push(i);
    }
    if (!removed && !orphans) return { rec: rec, removed: 0, orphans: 0 };
    var out = Object.assign({}, rec, { items: keep });
    return { rec: out, removed: removed, orphans: orphans };
  }

  /* A whole list, with one tally for the diagnostics line. */
  function list(recs) {
    var out = [], removed = 0, orphans = 0, touched = 0;
    (recs || []).forEach(function (r) {
      var res = record(r);
      if (res.removed || res.orphans) touched++;
      removed += res.removed; orphans += res.orphans;
      out.push(res.rec);
    });
    return { recs: out, removed: removed, orphans: orphans, touched: touched };
  }

  G.CMNorm = {
    OPERATIONAL: OPERATIONAL,
    blank: blank,
    named: named,
    carries: carries,
    classify: classify,
    record: record,
    list: list
  };
})(typeof self !== 'undefined' ? self : this);
