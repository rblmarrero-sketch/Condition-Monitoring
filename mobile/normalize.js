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
    /* A WEAR SURVEY IS A THING A HUMAN DID.

       `stood` is the technician saying the machine was stood the right way for
       the measurement to mean anything — their input, not the app's, so a
       point carrying it is a point somebody worked on. */
    'stood',
    /* evidence */
    'photo', 'photos', 'video', 'attachments', 'media'
  ];

  /* HOW MANY PHOTOGRAPHS THIS POINT ACTUALLY CLAIMS.
     ------------------------------------------------------------------------
     `photos` is the field that kept TK115 and DZ007 on hold through v168, and
     it is the one on the list that arrives in half a dozen shapes: a count from
     the phone's export, an array of file names from an older sidecar, an array
     of attachment objects, and — in between — arrays holding nulls and empty
     strings where a photograph was removed but its slot was not.

     A slot is not a photograph. Counting one is how a blank row becomes a
     finding somebody must identify; NOT counting a real one is how field
     evidence gets deleted. So this is deliberately exact, and it is the only
     place that decides.

     A positive answer means an inspector attached photographs to a position
     that never got a key. That is a real correction for a human, and the
     photographs must not be touched. */
  function photoCount(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : 0;
    if (typeof v === 'string') return v.trim() === '' ? 0 : 1;
    if (Array.isArray(v)) {
      var n = 0;
      for (var i = 0; i < v.length; i++) {
        var e = v[i];
        if (e == null) continue;                       // a slot, not a photograph
        if (typeof e === 'string') { if (e.trim() !== '') n++; continue; }
        if (typeof e === 'object') {
          var nm = e.name || e.file || e.filename || e.src || e.url || '';
          var id = e.id || e.attachmentId || e.aid || '';
          if (String(nm).trim() !== '' || String(id).trim() !== '') n++;
          continue;
        }
        n++;
      }
      return n;
    }
    if (typeof v === 'object') {
      if (!Object.keys(v).length) return 0;
      var onm = v.name || v.file || v.filename || v.src || v.url || '';
      var oid = v.id || v.attachmentId || v.aid || '';
      return (String(onm).trim() !== '' || String(oid).trim() !== '') ? 1 : 0;
    }
    return 0;
  }
  var MEDIA_FIELDS = ['photos', 'photo', 'video', 'attachments', 'media'];

  /* "Carries nothing" has to cover every shape a blank arrives in. A count of
     zero photographs is not a photograph; an empty array is not evidence; a
     string of spaces is what a keyboard leaves behind. */
  function blank(v, field) {
    /* Media gets the exact count above, never the generic test: [null, ""] is
       length 2 and holds nothing at all. */
    if (field && MEDIA_FIELDS.indexOf(field) >= 0) return photoCount(v) === 0;
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
    return !blank(i && i.key, 'key') || !blank(i && i.label, 'label') ||
           !blank(i && i.name, 'name');
  }

  /* WHAT A HUMAN ACTUALLY RECORDED — THE SHORT LIST, AND ONLY THIS LIST.

     Three builds shipped a fix that passed locally and failed in production,
     because `carries()` asked a sixty-field question. Every extra field is
     another way for a blank row to look populated: a unit, a limit, a baseline,
     a reference source, a status, an ISO code — none of them is a finding, and
     any one of them being non-blank kept a good inspection on hold.

     So the test that can BLOCK an inspection is now exactly the list of things
     an inspector records, and nothing else:

         grade · severity · measurement · finding · defect · cause ·
         recommendation · comment · photograph · attachment · work order

     A field outside this list can still be preserved, reported and printed.
     What it can no longer do is make an otherwise-empty row into a finding
     somebody has to identify. The wide OPERATIONAL list stays for callers that
     ask "is there anything here at all"; EVIDENCE is what decides whether a
     human is interrupted. Narrow, because the cost of being wrong is a shift. */
  var EVIDENCE = [
    'grade', 'sev', 'severity', 'condition',
    'mm', 'value', 'measurement', 'reading',
    'finding', 'defect', 'defectCode', 'cause', 'causeCode',
    'recommendation', 'rec', 'action', 'actionLabel',
    'prio', 'priority', 'wo', 'workOrder',
    'comment', 'note', 'notes',
    'photo', 'photos', 'video', 'attachments', 'media',
    /* A temperature IS a measurement, and the product found in a component IS
       what the lubrication round records — both are things an inspector wrote
       down, so both belong on the short list. Left off the first draft of it
       because the list was cut to the audit's eleven headings and these two sit
       under "measurement" and "finding" rather than having headings of their
       own. `owner` is deliberately NOT here: an owner is assigned TO a finding
       in the office, it is not something anybody observed at a machine. */
    'tempC', 'tempV', 'ambC', 'tempA',
    'lubeProduct', 'lubeEvidence', 'prod', 'evid'
  ];
  function carries(i) {
    if (!i || typeof i !== 'object') return false;
    for (var n = 0; n < EVIDENCE.length; n++) {
      if (!blank(i[EVIDENCE[n]], EVIDENCE[n])) return true;
    }
    return false;
  }
  /* Which of them, by name — so a diagnostic can say WHY a row was kept rather
     than leaving somebody to work it out from the outside. */
  function evidenceIn(i) {
    if (!i || typeof i !== 'object') return [];
    return EVIDENCE.filter(function (f) { return !blank(i[f], f); });
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
  /* refSrc, zone and zoneLabel are the same category, and they were reported
     as unclassified 1,220 times on the deployed dashboard — one identical
     warning per point, which is noise a real diagnostic would have to hide in.

     All three carry operational MEANING and are kept: refSrc is the provenance
     of the limit a wear judgement was made against ("tray:<model>", with a "?"
     when the model was not certain, or "x:<id>" for an explicit reference), and
     zone/zoneLabel say which zone of a tray body a measurement belongs to. An
     auditor asking "measured against what, and where?" needs both.

     What they are not is evidence that anybody recorded anything. The app
     writes them itself:

         refSrc:    st.ok ? ("tray:" + st.model + …) : ""     — a table lookup
         zone:      pt ? pt.z : ""                            — the point definition
         zoneLabel: pt ? BODY.zoneLabel(st.model, pt.z, …)    — its label

     Every point on a tray-body round has a zone whether or not a technician
     touched it, so a row nobody filled in leaves the phone carrying two
     non-blank fields. Put on the operational list they would make every blank
     tray row a finding with no component — which is precisely what `detection`
     did to TK115 and DZ007 through builds 165 and 166. Listed here they are
     preserved on a real point exactly as before and can never make an empty
     one count as populated. */
  /* The wear fields are the same category and were reported as unclassified
     on 466 points of the live folder — newMM, condemnMM, band and wearPct,
     one warning per point, which is a number big enough to look like a fault
     and is nothing of the kind.

     Not one of them is something a person typed. They are written beside the
     millimetre a technician DID record, out of the reference table:

         newMM:     L ? L.n : ""                  — the new-part dimension
         condemnMM: L ? L.c : ""                  — the condemn limit
         wearPct:   BODY.wear(model, key, mm)     — the two, and the reading
         band:      BODY.band(model, key, mm)     — which is the same again

     They are operational in every sense that matters and they are KEPT: an
     auditor asking "worn how far, against what limit?" needs all four, and
     this list has never governed whether a field is preserved. What it governs
     is whether a field can make an otherwise-empty point count as populated —
     and a row nobody filled in must not become a finding because a lookup
     table had an opinion about it. That is exactly what `detection` did to
     TK115 and DZ007.

     mapSev is the dashboard's own derived severity, written from the grade
     since 194. Same category, for the same reason. */
  var DEFAULTED = ['detect', 'detection', 'detectionLabel',
                   'refSrc', 'zone', 'zoneLabel',
                   'newMM', 'condemnMM', 'wearPct', 'band',
                   'mapSev'];

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
      return !isMeta(k) && OPERATIONAL.indexOf(k) < 0 && !blank(i[k], k);
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

  /* THE WHOLE VERDICT ON ONE POINT, IN THE TERMS THE AUDIT ASKED FOR.

     Three rounds of "the fixture passes and production does not" ended here:
     the app can see the object and I cannot, so the app says what it sees. */
  function explain(i) {
    var meta = [], unk = unknown(i), ev = evidenceIn(i);
    if (i && typeof i === 'object') {
      Object.keys(i).forEach(function (k) {
        if (isMeta(k) && !blank(i[k], k) && k !== 'key' && k !== 'label' && k !== 'name')
          meta.push(k);
      });
    }
    var c = classify(i);
    /* THE VALUE, NOT ONLY THE FIELD NAME. v168 reported "on hold because:
       photos", which was not enough to act on — a count of three and an array
       of two nulls are the same word and opposite problems. */
    var detail = ev.map(function (f) {
      var v = i[f], d = f + '=';
      if (MEDIA_FIELDS.indexOf(f) >= 0) {
        d += (Array.isArray(v) ? 'array[' + v.length + ']'
             : v === null ? 'null' : typeof v === 'object' ? 'object' : String(v));
        /* EXPECTED, NOT REAL. A count is a claim that photographs were taken;
           it says nothing about whether their files ever arrived. Calling it
           "real" put six photographs on a panel that could show none of them
           and let an engineer file evidence nobody can see. */
        d += ' \u2192 ' + photoCount(v) + ' expected';
      } else {
        d += typeof v === 'string' ? '"' + String(v).slice(0, 24) + '"' : String(v);
      }
      return d;
    });
    return {
      verdict: c,
      detail: detail,
      /* How many photographs this point CLAIMS. Whether their files exist is a
         question only the dashboard can answer, and it must ask separately. */
      expected: photoCount(i && i.photos) + photoCount(i && i.photo) +
                photoCount(i && i.attachments),
      photos: photoCount(i && i.photos) + photoCount(i && i.photo) +
              photoCount(i && i.attachments),
      identity: named(i) ? ['key', 'label', 'name'].filter(function (k) {
        return !blank(i && i[k], k); }) : [],
      evidence: ev,
      housekeeping: meta,
      unknown: unk,
      reason: c === 'ok' ? 'identified'
            : c === 'orphan' ? 'no identity, but carries: ' + ev.join(', ')
            : 'nothing identifying and nothing recorded',
      removed: c === 'empty'
    };
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
    EVIDENCE: EVIDENCE,
    evidenceIn: evidenceIn,
    photoCount: photoCount,
    METADATA: METADATA,
    DEFAULTED: DEFAULTED,
    unknown: unknown,
    explain: explain,
    blank: blank,
    named: named,
    carries: carries,
    classify: classify,
    record: record,
    list: list
  };
})(typeof self !== 'undefined' ? self : this);
