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
    'cause', 'causeCode', 'causeIso', 'particle',
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
    return false;
  }

  /* FIELDS AN UNKNOWN NAME IS *NOT* ALLOWED TO BECOME.

     The first version of this file said "anything beyond the fields we know
     about counts as content", reasoning that a round added next year must not
     have its data silently eaten by a stale list. That reasoning is sound and
     the rule was still wrong, because the blank row is not empty in the JSON
     sense — it arrives carrying housekeeping. A sequence number, a created
     timestamp, an import source, a sync flag: every one of them is non-blank,
     so every blank row came back as "carries something", was flagged for a
     human, and the whole inspection stayed on hold. The catch-all did not
     protect future data; it re-created the exact defect it was written to fix.

     So the operational list is now the only thing that makes a point real, and
     an unknown field is reported to developers rather than charged to a
     technician. `unknown()` is what the diagnostics line reads: a field nobody
     has classified is a bug in this file, and the person who can fix it is not
     the one standing at the truck. */
  /* FIELDS THE APP FILLS IN BY ITSELF.

     This is the category that broke the first two attempts, and it is worth
     naming precisely: a value the SOFTWARE supplies is not evidence that a
     HUMAN recorded anything.

     recToExport writes `detection` and `detectionLabel` on every exported item,
     unconditionally —

         detection:      (p.detect || DETECT_DEFAULT)      // "DM-02"
         detectionLabel: detectLabel(p.detect || DETECT_DEFAULT, "en")

     — so a blank row leaves the phone carrying a detection method and its
     label. Both are non-blank, `detection` was on the operational list, and
     every blank row therefore came back as a real finding with a missing
     component. TK115 and DZ007 stayed on hold through builds 165 and 166, and
     Admin Diagnostics stayed empty because nothing was ever removed.

     Detection describes HOW a finding was found. Without a finding it describes
     nothing. On a real point it is preserved exactly as before — this list
     changes only whether a field can make an otherwise-empty point count as
     populated, never whether it is kept. */
  var DEFAULTED = ['detect', 'detection', 'detectionLabel'];

  var METADATA = [
    'id', 'uid', 'uuid', 'tmpId', 'tempId', 'localId', 'seq', 'idx', 'index',
    'order', 'n', 'row', 'created', 'createdAt', 'updated', 'updatedAt', 'ts',
    'at', 'modified', 'rev', 'version', 'v', 'schema', 'src', 'source',
    'origin', 'imported', 'importedAt', 'dev', 'device', 'sync', 'synced',
    'syncState', 'up', 'upAt', 'dirty', 'touched', 'open', 'expanded',
    'selected', 'active', 'focus', 'ui', 'state', 'draft', 'valid', 'dirtyUi'
  ];
  function isMeta(k) {
    if (k === 'key' || k === 'label' || k === 'name') return true;
    if (k.charAt(0) === '_') return true;
    return METADATA.indexOf(k) >= 0 || DEFAULTED.indexOf(k) >= 0;
  }
  /* Fields on this point that are neither identity, nor operational, nor known
     housekeeping — for developer diagnostics only. */
  function unknown(i) {
    if (!i || typeof i !== 'object') return [];
    return Object.keys(i).filter(function (k) {
      return !isMeta(k) && OPERATIONAL.indexOf(k) < 0 && !blank(i[k]);
    });
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
    if (!rec || !Array.isArray(rec.items)) return { rec: rec, removed: 0, orphans: 0, unknown: [] };
    var keep = [], removed = 0, orphans = 0, unk = [];
    for (var n = 0; n < rec.items.length; n++) {
      var i = rec.items[n], c = classify(i);
      /* An audit copy of anything this file could not classify. Kept whatever
         the verdict, because the point of it is to notice the gap. */
      var u = unknown(i);
      if (u.length) unk.push({ key: (i && i.key) || '', fields: u });
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
    if (!removed && !orphans) return { rec: rec, removed: 0, orphans: 0, unknown: unk };
    var out = Object.assign({}, rec, { items: keep });
    return { rec: out, removed: removed, orphans: orphans, unknown: unk };
  }

  /* A whole list, with one tally for the diagnostics line. */
  function list(recs) {
    var out = [], removed = 0, orphans = 0, touched = 0, unk = [];
    (recs || []).forEach(function (r) {
      var res = record(r);
      if (res.removed || res.orphans) touched++;
      removed += res.removed; orphans += res.orphans;
      (res.unknown || []).forEach(function (u) {
        unk.push({ rec: (r && r.equip) || '', key: u.key, fields: u.fields }); });
      out.push(res.rec);
    });
    return { recs: out, removed: removed, orphans: orphans, touched: touched, unknown: unk };
  }

  G.CMNorm = {
    OPERATIONAL: OPERATIONAL,
    METADATA: METADATA,
    DEFAULTED: DEFAULTED,
    unknown: unknown,
    blank: blank,
    named: named,
    carries: carries,
    classify: classify,
    record: record,
    list: list
  };
})(typeof self !== 'undefined' ? self : this);
