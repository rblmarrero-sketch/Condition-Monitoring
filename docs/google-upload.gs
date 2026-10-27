/**
 * Condition Monitoring — Google Drive upload endpoint (Google Apps Script).
 *
 * 1. Paste this whole file into a new Apps Script project and set ROOT_FOLDER_ID below.
 * 2. Run ▸ setup   ← DO THIS FIRST. A deployed web app cannot ask for Drive
 *    permission on your behalf, so grant it here or every upload fails with
 *    "Unexpected error while getting the method or property getFolderById".
 * 3. Deploy → New deployment → Web app → Execute as "Me", Who has access "Anyone".
 * 4. Copy the /exec URL into the Field Capture app (⚙ → Upload mode: Google Drive).
 *
 * After ANY later edit: Deploy → Manage deployments → ✏️ → Version: New version.
 * Saving alone does not change what the /exec URL serves.
 *
 * Full walkthrough: docs/GOOGLE_UPLOAD_SETUP.md
 *
 * The app posts JSON as text/plain on purpose. A web app cannot answer a CORS
 * preflight, and text/plain keeps the request "simple" so the browser never sends
 * one. For the same reason the shared secret travels in the body, not a header.
 */

// ── settings ────────────────────────────────────────────────────────────────
/** The Drive folder everything lands in. Paste either the folder id or the whole
 *  Drive URL — the script pulls the id out of
 *  drive.google.com/drive/folders/<id>?usp=... on its own. */
const ROOT_FOLDER_ID = 'PASTE_THE_CM_backup_Pechanka_FOLDER_URL_HERE';   // google_mode.sh folder prints it

/** Optional shared secret. Leave '' to accept any request that has the URL.
 *  If you set it, put the same value in the app's "Shared secret" field. */
const SECRET = '';

/** Password for DELETING inspections from the dashboard. Deletion is OFF while
 *  this is '' — that is the safe default and most sites should leave it so.
 *
 *  Set it only if you want the dashboard's Delete button to work, and then:
 *    • NEVER put this value in the app, in upload-defaults.js, or in the repo.
 *      The /exec URL is handed to every phone and is effectively public; this
 *      password is the only thing standing between that URL and someone wiping
 *      the folder in one request.
 *    • Type it into the dashboard when you delete. It is not stored.
 *
 *  SET IT IN THE APPS SCRIPT EDITOR ONLY — never in this file in the repository.
 *  This copy is the template and is published with everything else; a password
 *  committed here is a password anyone can read, which is the same as having
 *  none. Paste it into script.google.com, then Deploy > Manage deployments >
 *  edit > Version: New version. Editing without deploying changes nothing.
 *
 *  Deleting moves files to Drive's TRASH (recoverable for 30 days) and writes a
 *  log entry saying what went, when, and why. Nothing is ever purged outright. */
const ADMIN_SECRET = '';        // leave empty HERE. Fill it in the script editor.

/** Where the audit trail and the dashboard's edits live, inside ROOT_FOLDER_ID. */
const META_DIR = '_meta';

/* ── the index: why reading is no longer a walk ──────────────────────────────
   Every read used to answer its question by opening the folder and then opening
   every inspection in it. Measured against a season of Baimskaya — 900 rounds,
   2700 photographs — one full read cost 1236 Drive round trips, returned 1.6 MB
   and was still truncated; the second page cost 634 more. Two Drive round trips
   per record, paid again by every phone, every browser, every refresh, against
   a script that gets about 90 minutes of execution a day.

   Nothing about that work is new work. The record was in memory when it was
   uploaded — the script decoded it to write it. So the summary is written then,
   into a shard, and reading becomes reading the shard.

     _meta/index/2026-08.json     one shard per month of inspection dates
     ScriptProperties.cm_at       when anything last changed

   A shard per month bounds the read-modify-write: a busy month is a few hundred
   rounds, not a career. And cm_at is a property, not a file, so "has anything
   changed since I last looked?" costs zero Drive operations — the answer most
   requests get, and the one that used to cost a full folder walk.

   Everything here is additive. ?action=records still works exactly as before,
   so a phone or a dashboard older than this deployment notices nothing.
   ──────────────────────────────────────────────────────────────────────────*/
const INDEX_DIR = META_DIR + '/index';
const INDEX_AT = 'cm_at';               // script property: last change, ms
/* Set ONLY by a completed rebuild. An upload creates a shard as a side effect
   of arriving, and "a shard exists" is not "the index covers this folder" — a
   folder with a season in it and one new round would have answered every read
   with that one round, and everything older would simply have stopped being
   there. Nothing quieter than that, and nothing worse. */
const INDEX_BUILT = 'cm_built';
const INDEX_V = 1;
/* Which version of this file is running. The repo copy and the deployed one
   can differ (every deploy is a paste in the editor), and nothing showed
   which had happened; the ping and the health check (GET /exec) both carry
   this, so a plain GET says whether a redeploy landed. Change it with every
   change to this file. */
const SCRIPT_VERSION = 'GAS_SCAN_FIXES_V2';
// ────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Empty request body' });
    }
    var b = JSON.parse(e.postData.contents);

    if (SECRET && b.secret !== SECRET) return json({ ok: false, error: 'Bad or missing secret' });

    // The dashboard posts corrections and deletions through the same endpoint,
    // because a web app cannot answer a CORS preflight and this body shape is
    // already a "simple" request. Everything else is an ordinary file upload.
    /* The dashboard's write-path probe. Reading and writing are deployed
       together but fail apart — a version released before doPost existed still
       answers every GET — so the dashboard sends this to find out whether the
       half it needs is actually live. It writes nothing. */
    if (b.op === 'ping')    return json({ ok: true, write: true, batch: true, canDelete: !!ADMIN_SECRET,
                                          index: true, media: MEDIA_BATCH, at: indexAt_(),
                                          version: SCRIPT_VERSION });

    /* GAS_SAFETY_V1: the office's changes carry the desk key PECHANKA's /cm-api
       adds, once DESK_KEY is set in Script properties (see deskOk_). Phone ops
       below — uploads, deferrals, push, reads — are never asked for it. */
    if (DESK_OPS_[b.op] && !deskOk_(b)) return json({ ok: false, error: DESK_REFUSED_ });

    if (b.op === 'edit')    return json(saveEdit_(b));
    if (b.op === 'delete')  return json(deleteRecord_(b));
    if (b.op === 'delfile') return json(deleteFile_(b));
    if (b.op === 'resolve') return json(resolveConflict_(b));
    if (b.op === 'rewrite') return json(rewriteObject_(b));
    /* Push subscriptions — the same document the Yandex function keeps under
       _meta/push, so the two backends agree on what a subscription IS. This
       one stores and withdraws them; it cannot SEND a push (there is no
       long-running process here), and action=vapid says so. */
    if (b.op === 'subscribe')   return json(pushSubscribe_(b));
    if (b.op === 'unsubscribe') return json(pushUnsubscribe_(b));
    if (b.op === 'held')        return json(pushHeld_(b));
    if (b.op === 'push')        return json({ ok: false, error: 'This backend cannot send push messages' });

    /* Several files in one request.

       Every file used to be its own web-app invocation: a round trip, a script
       start, and then three Drive operations inside it — look the name up,
       trash a duplicate, create the file. Measured from the mine, that came to
       3.8 s before a single byte of photograph moved, against 2.9 s actually
       sending it. Ten photographs on one component paid it ten times over.

       A batch pays it once, and resolves the folder once for the whole batch
       rather than once per file — which is the other half of the saving, since
       a three-level folder chain is three Drive lookups and they were being
       repeated for every photograph of the same component.

       Each file still succeeds or fails on its own and says which. The phone
       tracks what landed by name and re-sends only what did not, so a batch
       that half works is not a batch that failed. */
    if (b.op === 'batch') {
      var list = b.files || [];
      if (!list.length) return json({ ok: false, error: 'Batch with no files' });
      var dirs = {}, saved = [], failed = [];
      for (var bi = 0; bi < list.length; bi++) {
        var one = list[bi];
        if (one.folder === undefined) one.folder = b.folder;
        if (one.dev === undefined) one.dev = b.dev;
        if (one.desk === undefined) one.desk = b.desk;      // GAS_SAFETY_V1: the lube master's gate reads it
        try {
          var r = saveOne_(one, dirs);
          if (r.ok) saved.push(r); else failed.push({ name: one.name, error: r.error });
        } catch (err2) {
          failed.push({ name: one.name, error: String((err2 && err2.message) || err2) });
        }
      }
      return json({ ok: true, batch: true, saved: saved, failed: failed });
    }

    return json(saveOne_(b, {}));

  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

/* One file onto Drive. Lifted out of doPost so a batch and a single upload run
   the same code — two copies of "where does this file go" is two copies that
   drift, and the one that drifts is the one nobody tests.

   `dirs` caches resolved folders for the life of one request. */
function saveOne_(b, dirs) {
  dirs = dirs || {};
  if (!b.name) return { ok: false, error: 'Missing file name' };
  if (!b.file) return { ok: false, error: 'Missing file content' };

  // A name may carry its own sub-path ("2026-07/TK146_...jpg") — honour it.
  var parts = String(b.name).split('/').filter(String);
  var fileName = parts.pop();
  var path = [String(b.folder || '')].concat(parts).filter(String).join('/');

  /* GAS_SAFETY_V1: what an upload may write. Checked before any folder is
     made, so a refused upload leaves nothing behind. */
  var refusedU = uploadRefused_(path, fileName, b);
  if (refusedU) return { ok: false, error: refusedU };

  /* Keyed on the path, so every file of one component resolves the folder
     chain once and the rest read it back out. On a single upload the cache is
     empty and this costs nothing. */
  var dir = dirs[path];
  if (!dir) { var root = rootFolder_(); dir = dirs[path] = (path ? folderPath_(root, path) : root); }

  // Two phones can inspect the same unit on the same day — a hand-over, or two
  // people covering a big machine between them. Both name their sidecar
  // <UNIT>_<DD.MM.YYYY>_<TYPE>.json, so the overwrite below used to throw the
  // first inspector's round away without either of them ever being told.
  // A rival now gets its own file and a marker; the office decides which stands.
  /* An upload into _meta is one shared document per name (a deferral is one
     file per unit and round, and the newest statement stands), never a
     device's copy: with an owner, a second phone re-deferring a round another
     phone deferred was renamed "X.defer~DEV.json", a name no reader looks for,
     and its decision reached nobody (GAS_SCAN_FIXES_V1). */
  var isMetaUp = /^_meta(\/|$)/.test(path);
  var dev = isMetaUp ? '' : cleanDev_(b.dev);
  var plan = placeUpload_(dir, fileName, dev);
  var wanted = fileName;
  fileName = plan.name;

  var blob = Utilities.newBlob(
    Utilities.base64Decode(b.file),
    b.contentType || 'application/octet-stream',
    fileName
  );

  /* WRITE THE NEW FILE FIRST, THEN TRASH THE OLD (GAS_INDEX_SAFETY_V1).
     Re-sending a record (after an edit, or a retry) must replace, not pile up
     "TK146_… (1).jpg" copies. It used to trash the old file and then create
     the new one, so a createFile that failed (a quota, a Drive error, the
     6-minute limit) left the folder with neither. Two files of one name for a
     moment is harmless: every reader takes the newest (newestByName_). */
  var f = dir.createFile(blob);
  // Who uploaded it, so the next phone to send this name can tell whether it is
  // overwriting its own work or someone else's. Kept out of the bytes so the
  // file itself is untouched, and out of the name so nothing has to parse it.
  if (dev) { try { f.setDescription('cm-dev:' + dev); } catch (err) { /* not fatal */ } }

  /* THE RIVAL WHO LANDED WHILE WE WROTE — docs/yandex/function.js's rule
     (tests/toctou.cjs), which this backend never had. placeUpload_ looked
     before the write; two phones handing over a round both see no owner and
     both write the same name. So look again now: another device's file of
     this name, created before ours, means ours is the later one and moves to
     its own ~DEV name with a conflict marker; the earlier stays. Exactly one
     of the two yields (creation time, then id), so neither is thrown away. */
  var olderRival = '';
  if (dev && !plan.rival) {
    var again = dir.getFilesByName(fileName);
    while (again.hasNext()) {
      var g = again.next();
      if (g.getId() === f.getId() || isTrashed_(g)) continue;
      var go = ownerDev_(g);
      if (go && go !== dev && createdBefore_(g, f)) { olderRival = go; break; }
    }
    if (olderRival) {
      fileName = variantName_(wanted, dev);
      try { f.setName(fileName); } catch (errN) { /* rename failed: both files stand, nothing lost */ }
      plan.rival = olderRival;
    }
  }
  /* Now the old copies go — only our own (or an unowned one, as before). A
     different device's file is never trashed here; an older client that sends
     no device id behaves as it always did. */
  var olds = dir.getFilesByName(fileName);
  while (olds.hasNext()) {
    var o = olds.next();
    if (o.getId() === f.getId()) continue;
    if (dev) { var oo = ownerDev_(o); if (oo && oo !== dev) continue; }
    try { o.setTrashed(true); } catch (errT) { /* already gone */ }
  }

  /* `req` is the name the phone ASKED for, which is not always the name on
     Drive — placeUpload_ renames when another phone already owns that name. The
     phone marks off what has landed by the name it sent, so without this a
     renamed file would look like one that never arrived and be sent again for
     ever. */
  var out = { ok: true, req: b.name, id: f.getId(), name: f.getName(), url: f.getUrl(), folder: dir.getName() };
  /* A deferral is news for every phone, and it carries no record, so nothing
     below moved the index clock: every incremental pull answered upToDate and
     the deferral waited for an unrelated upload, overnight an inspector could
     drive to a machine the office had put off (GAS_SCAN_FIXES_V1). */
  if (/^_meta\/deferrals(\/|$)/.test(path) && /\.defer\.json$/i.test(fileName)) indexTouch_();

  /* THE RECEIPT — mirrored field for field from docs/yandex/function.js.

     This backend is retired and is never deployed. It is kept in step for one
     reason: two backends for one document have to agree about what a record
     IS, so a backend that is ever switched back on cannot silently disagree
     about the shape of a receipt the phone has learned to judge itself by.

     VERIFY AFTER STORAGE, NOT BEFORE. A receipt computed from the request body
     is a receipt for the request: it says the bytes arrived at this script, and
     nothing about whether they reached the folder, or reached it whole. So the
     file is read back and the figures are measured from what Drive returned —
     the only reading that can contradict the phone, and therefore the only one
     worth sending it. */
  var storedSize = null, storedSha = '', verifyError = '';
  try {
    var back = f.getBlob().getBytes();
    if (!back) verifyError = 'stored file could not be read back';
    else { storedSize = back.length; storedSha = sha256Hex_(back); }
  } catch (errV) { verifyError = 'read-after-write failed: ' + String(errV.message || errV); }
  var wantSha = '';
  try { wantSha = sha256Hex_(Utilities.base64Decode(b.file)); } catch (errW) {}
  if (!verifyError && wantSha && storedSha !== wantSha) {
    verifyError = 'stored bytes do not match what was sent';
  }
  out.receipt = {
    receiptId:    'r' + sha256Hex_(strBytes_(f.getId() + ':' + (storedSha || wantSha))).slice(0, 24),
    attachmentId: String(b.aid || ''),
    inspectionId: String(b.inspectionId || ''),
    objectId:     f.getId(),
    byteSize:     storedSize,
    sha256:       storedSha,
    at:           new Date().toISOString(),
    duplicate:    false,
    verified:     !verifyError
  };
  if (verifyError) out.receipt.error = verifyError;

  /* The round is on Drive; now make it findable without anyone having to open
     it. This is the only place a record enters the folder, and the JSON is
     already decoded in `blob` — so the index is maintained for the cost of the
     shard write alone, and no read anywhere else ever has to walk the folder
     to discover this round exists. */
  var idxFail = null;
  if (isSidecar_(fileName)) {
    var side = null;
    try {
      /* Read it back off the file that was just written, not off the blob that
         was handed to createFile. Indexing what actually landed is the only
         version worth indexing — and a blob built in memory is not guaranteed
         to be readable as text on every runtime. One Drive operation, once per
         round, against the hundreds it saves every reader. */
      side = JSON.parse(f.getBlob().getDataAsString());
    } catch (err) { side = null; /* not our shape — the file still stands */ }
    var rs = (side && side.records) || [];
    for (var si = 0; si < rs.length; si++) {
      if (!rs[si]) continue;
      rs[si]._file = (path ? path + '/' : '') + fileName;
      rs[si]._id = f.getId();
      var ix = indexPut_(rs[si], f.getId(), dev);
      if (ix && !ix.ok && !idxFail) idxFail = ix;
    }
  }
  /* GAS_INDEX_SAFETY_V1: the index could not take this round (the lock was
     busy, or the month could not be read). The file is on Drive; the phone is
     told the upload failed so it sends the record again, and the retry indexes
     it. Saying "saved" here would leave the round on Drive and missing from
     every phone's list, with nobody told. */
  if (idxFail) {
    return { ok: false, busy: !!idxFail.busy, req: b.name, id: f.getId(),
             error: idxFail.busy ? 'The index is busy; the file is on Drive. Send it again.'
                                 : 'The index was not updated (' + idxFail.error + '); the file is on Drive. Send it again.' };
  }

  if (plan.rival) {
    out.kept = true;                       // "we did not overwrite the other phone"
    if (isSidecar_(wanted)) {
      var c = markConflict_(wanted, plan.rival, dev);
      /* GAS_SAFETY_V1: the lock was busy, so the marker was not written. Say the
         file failed: the phone sends it again, placeUpload_ finds the rival
         again, and the marker is written then. Our own ~DEV copy is simply
         overwritten by that retry. */
      if (c && c.busy) return { ok: false, busy: true, req: b.name, error: c.error };
      if (c) { out.conflict = c.key; out.devices = c.devices; }
    }
  }
  return out;
}

/**
 * GET serves four things:
 *   (no action)     health check — open the /exec URL in a browser
 *   ?action=records EVERY inspection in one reply. Use this one.
 *   ?action=list    what is in the folder, so a client can find files by name
 *   ?action=file    one file as base64, so a client can show a photo
 *
 * The read side exists so the dashboard works on a PC with no Google Drive client
 * installed, and so the phones can show what the rest of the team has already
 * uploaded — everything comes over plain HTTPS from this URL.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) return json(diagnose_());          // health check needs no secret
  if (SECRET && p.secret !== SECRET) return json({ ok: false, error: 'Bad or missing secret' });
  try {
    if (p.action === 'records') return json(readRecords_(p));
    /* The fast read. ?action=records is left exactly as it was so a client
       older than this deployment keeps working; this is what a current one
       asks for first. */
    if (p.action === 'index') return json(p.rebuild ? rebuildIndex_(p) : readIndex_(p));
    if (p.action === 'list') return json(listFiles_(p.folder || '', p.ext || '', p.cursor || '', p.max));
    if (p.action === 'file') return json(readFile_(p.id));
    if (p.action === 'files') return json(readFiles_(p.ids));
    if (p.action === 'vapid') return json({ ok: false, error: 'No VAPID keys on this endpoint' });
    return json({ ok: false, error: 'Unknown action: ' + p.action });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ── corrections, voids and deletion ─────────────────────────────────────────
   A correction is NOT written back into the inspection's own sidecar. The phone
   that captured it still holds that record, and re-syncing it — after an edit,
   or just a retry — overwrites the file. A correction saved there would vanish
   without trace. So each one is its own small file that nothing else ever
   touches, and the clients merge it over the record when they read.

     _meta/<UNIT>_<DDMMYYYY>_<TYPE>.edit.json

   Voiding is the same mechanism with void:true. Nothing is destroyed: the
   photos, the signature and the original readings all stay exactly as captured,
   and the reason and author travel with the marker.
   ──────────────────────────────────────────────────────────────────────────*/
function keyFile_(key, ext) {
  // "TK146|2026-03-09|MP" -> "TK146_09.03.2026_MP" + ext, matching the sidecars
  var p = String(key || '').split('|');
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
  var d = p[1].split('-');
  if (d.length !== 3) return null;
  return p[0] + '_' + d[2] + '.' + d[1] + '.' + d[0] + '_' + p[2] + ext;
}

/* THE WRITE-RACE GUARD, field for field with docs/yandex/function.js's
   withDocLock()/staleWrite(). The live backend serialises a read-then-write
   on one document behind an in-process lock and refuses a write whose ifAt
   (the 'at' of the version the client last read; "" = "I saw none") is not
   the document's current 'at'. Here the lock is the script lock -- the same
   one indexUpsert_() already takes -- and the compare is identical, so a
   client written against one backend gets the same answer from the other.
   An absent ifAt is a legacy client: allowed, serialised, backed up. */
/* GAS_SAFETY_V1: a lock that could not be taken in 20 s used to let the write
   run WITHOUT it, so the race guard was off exactly when the script was busy.
   Now nothing is written and the client is told to try again. */
function withScriptLock_(fn) {
  var lock = null;
  // No lock service at all is a local harness, never Apps Script; it runs as before.
  try { lock = LockService.getScriptLock(); } catch (err0) { lock = null; }
  if (lock) {
    try { lock.waitLock(20000); }
    catch (err) { return { ok: false, busy: true, error: 'busy, try again' }; }
  }
  try { return fn(); }
  finally { if (lock) { try { lock.releaseLock(); } catch (err2) {} } }
}
function staleWrite_(b, prior, what) {
  if (!b || !Object.prototype.hasOwnProperty.call(b, 'ifAt') || b.ifAt === null || b.ifAt === undefined) return null;
  var curAt = prior ? String(prior.at || '') : '';
  if (String(b.ifAt) === curAt) return null;
  return { ok: false, conflict: true, current: prior || null,
           error: prior ? 'This ' + what + ' was changed by ' + (prior.by || 'someone') + ' at ' + curAt
             + ' after this page read it. Nothing was saved \u2014 reload and re-apply your change.'
           : 'This ' + what + ' was removed after this page read it. Nothing was saved \u2014 reload and re-apply your change.' };
}

function saveEdit_(b) {
  var name = keyFile_(b.key, '.edit.json');
  if (!name) return { ok: false, error: 'Bad record key: ' + b.key };
  return withScriptLock_(function () { return saveEditLocked_(b, name); });
}
/* GAS_SAFETY_V1: one field of the stored correction. A key the request leaves
   out keeps what is stored; a key it sends — an empty value or null included —
   replaces it. Most writers send only what they changed (the action drawer, the
   bulk plan, a report log), and the old whole-document write turned every key
   they left out into {} or null: a re-filed round went back, an hour-meter fix
   vanished with the next PDF. A client that sends the whole document sees no
   difference. */
/* GAS_SAFETY_V1: true when the request changes nothing but the report log. The dashboards' logReport() echoes
   the page's copy of the correction (void, reason, note, items, media) with the new log; a desk that never typed
   a name sends by "" - a refusal there would lose the record that a PDF was issued. Any other change needs a name. */
var EDIT_DFLT_ = { void: false, reason: '', note: '', items: {}, media: {}, fields: {}, assign: {}, move: null };
function blank_(v) {   // null, '', {} and [] all mean "nothing here" (the store writes {} as null for some keys)
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object' && Object.keys(v).length === 0) return null;
  return v;
}
function onlyReportLog_(b, prior) {
  var env = { op: 1, key: 1, ifAt: 1, by: 1, desk: 1, secret: 1, at: 1, reports: 1 };
  if (!Object.prototype.hasOwnProperty.call(b, 'reports')) return false;
  for (var k in b) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || env[k]) continue;
    var was = (prior && Object.prototype.hasOwnProperty.call(prior, k)) ? prior[k]
            : (Object.prototype.hasOwnProperty.call(EDIT_DFLT_, k) ? EDIT_DFLT_[k] : undefined);
    if (JSON.stringify(blank_(b[k])) !== JSON.stringify(blank_(was))) return false;
  }
  return true;
}
function editField_(b, prior, k, norm, dflt) {
  if (Object.prototype.hasOwnProperty.call(b, k)) return norm(b[k]);
  if (prior && Object.prototype.hasOwnProperty.call(prior, k)) return norm(prior[k]);
  return dflt;
}
var EDIT_OBJ_ = function (v) { return (v && typeof v === 'object') ? v : {}; };
var EDIT_OBJN_ = function (v) { return (v && typeof v === 'object') ? v : null; };
function saveEditLocked_(b, name) {
  var dir = folderPath_(rootFolder_(), META_DIR);
  /* Field for field the same gap docs/yandex/function.js's own saveEdit() had
     until it was fixed there: two dashboards saving the same key, one after
     the other, and this function's own setTrashed()-then-create had no check
     at all -- the second save silently erased the first's note, fields and
     assignments for good. Neither backend is deployed both at once, but this
     one is kept field-for-field with the live one regardless, per this
     project's own two-backends-must-agree rule. The prior document is backed
     up before it is trashed, the same _meta/backup/ pattern rewriteObject_()
     already uses. */
  var prior = null, overwrote = null;
  var existing = newestByName_(dir, name);
  if (existing) {
    try { prior = JSON.parse(existing.getBlob().getDataAsString()); }
    catch (errP) { prior = null; }
  }
  var refused = staleWrite_(b, prior, 'correction');
  if (refused) return refused;
  // GAS_SAFETY_V1: every correction, void and unvoid says who made it (a report log alone may come without a name).
  if (!String(b.by || '').trim() && !onlyReportLog_(b, prior)) return { ok: false, error: 'A name is required (who is making this change)' };
  /* GAS_SAFETY_V1: voiding a round needs a reason, as the Edit panel asks.
     Only when this request is what voids it: a writer that echoes an
     existing void back is not voiding anything. */
  var voidNow = editField_(b, prior, 'void', function (v) { return !!v; }, false);
  var reasonNow = editField_(b, prior, 'reason', function (v) { return String(v || '').slice(0, 400); }, '');
  if (voidNow && !(prior && prior.void) && !reasonNow.trim())
    return { ok: false, error: 'A reason is required to void a round' };
  var doc = {
    type: 'cm-record-edit', version: 1,
    key: b.key,
    at: new Date().toISOString(),
    by: String(b.by || '').slice(0, 80),
    void: voidNow,
    reason: reasonNow,
    note: editField_(b, prior, 'note', function (v) { return String(v || '').slice(0, 2000); }, ''),
    /* Round-level corrections — the hour meter, who walked it, who verified
       it. The other backend has had this slot since it was written and this
       one did not, so a correction to an hour meter saved here vanished with
       no error. NOT the unit, the date or the round type: those three ARE the
       record's identity, and changing one would leave this marker filed
       against a round that no longer exists. */
    fields: editField_(b, prior, 'fields', EDIT_OBJ_, {}),
    /* THE ROUND WAS FILED AGAINST THE WRONG MACHINE, DAY OR ROUND. Not a field
       edit — the three of them ARE the record's filing address, so this marker
       stays filed under the address the round arrived with and names where it
       should read instead. A re-read of the folder then re-applies the move
       instead of undoing it. null puts the round back. */
    move: editField_(b, prior, 'move', EDIT_OBJN_, null),
    /* Both of these were written by the dashboard and thrown away here. The
       save succeeded, the panel said so, and the crop or the issued report was
       gone the next time the folder was read. */
    media: editField_(b, prior, 'media', EDIT_OBJN_, null),
    /* Orphan-photograph assignments, keyed by file name — see the note in the
       Yandex function. */
    assign: editField_(b, prior, 'assign', EDIT_OBJN_, null),
    reports: editField_(b, prior, 'reports', function (v) { return (v && v.length) ? v.slice(-20) : null; }, null),
    items: editField_(b, prior, 'items', EDIT_OBJ_, {}),
  };
  if (prior) {
    var stamp = doc.at.replace(/[:.]/g, '-');
    try {
      var bdir = folderPath_(rootFolder_(), META_DIR + '/backup/' + stamp);
      bdir.createFile(Utilities.newBlob(JSON.stringify(prior, null, 2), 'application/json', name));
    } catch (errB) {}
    if ((prior.by || '') !== (b.by || '')) overwrote = { by: prior.by || '', at: prior.at || '' };
  }
  replaceFile_(dir, name, JSON.stringify(doc, null, 2));     // one marker per record
  /* The clock moves AFTER the marker is on Drive (GAS_SCAN_FIXES_V1): moved
     first, a pull in between got the new `at` and no marker, and its next pull
     was told upToDate and never asked again. */
  indexTouch_();               // a correction is a change; clients must come and look
  var out = { ok: true, saved: name, at: doc.at };
  if (overwrote) out.overwrote = overwrote;
  return out;
}

/* ── a phone's push subscription ────────────────────────────────────────────
   _meta/push/<sha256(endpoint)[0:32]>.json — {endpoint, keys:{p256dh, auth},
   dev, lang, ua, at}. Field for field what docs/yandex/function.js writes. */
function pushKey_(ep) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(ep));
  var hex = ''; for (var i = 0; i < d.length; i++) hex += ('0' + (d[i] & 255).toString(16)).slice(-2);
  return hex.slice(0, 32) + '.json';
}
function pushSubscribe_(b) {
  var s = b.sub || {};
  if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) return { ok: false, error: 'Missing subscription' };
  if (!/^https?:\/\//.test(s.endpoint)) return { ok: false, error: 'Bad endpoint' };
  var doc = { endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) },
              dev: String(b.dev || '').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24),
              lang: b.lang === 'ru' ? 'ru' : 'en', ua: String(b.ua || '').slice(0, 160), at: new Date().toISOString() };
  var dir = folderPath_(rootFolder_(), META_DIR + '/push');
  var name = pushKey_(s.endpoint);
  var old = dir.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);          // one document per phone
  dir.createFile(Utilities.newBlob(JSON.stringify(doc, null, 2), 'application/json', name));
  return { ok: true, id: META_DIR + '/push/' + name, key: '' };
}
function pushUnsubscribe_(b) {
  if (!b.endpoint) return { ok: false, error: 'Missing endpoint' };
  try {
    var old = folderPath_(rootFolder_(), META_DIR + '/push').getFilesByName(pushKey_(b.endpoint));
    while (old.hasNext()) old.next().setTrashed(true);
  } catch (e) { /* nothing to withdraw */ }
  return { ok: true };
}
/* "DO YOU STILL HOLD THIS ONE?" — the same answer function.js gives, because
   two backends for one document have to agree about what the document IS. It
   is the only question a phone can ask that settles whether its subscription
   is worth anything: Safari does not expose the key a subscription was made
   with, so a dead one looks exactly like a live one from the handset. This
   backend never sends a push and so never retires one, but it must still
   answer honestly about what it holds. */
function pushHeld_(b) {
  if (!b.endpoint) return { ok: false, error: 'Missing endpoint' };
  var held = false;
  try {
    var f = folderPath_(rootFolder_(), META_DIR + '/push').getFilesByName(pushKey_(b.endpoint));
    held = f.hasNext();
  } catch (e) { held = false; }
  return { ok: true, held: held };
}

/* ── two phones, one inspection ───────────────────────────────────────────────
   Every file an inspection produces is named from the unit, the date and the
   type, so two people who cover the same unit on the same day — a hand-over, a
   big machine split between them, or simply a re-inspection — produce byte-for-
   byte the same file names. The upload used to trash whatever was already there,
   which meant the first inspector's round, photos included, disappeared without
   either of them being told.

   Now a file is only overwritten by the phone that wrote it. A rival keeps its
   own copy under "<stem>~<DEVICE>.<ext>", and the sidecar clash also writes

     _meta/<UNIT>_<DDMMYYYY>_<TYPE>.conflict.json

   listing both devices. The dashboard shows it and records which version stands;
   nothing is destroyed either way, so a wrong choice is one click to change.

   Limit worth knowing: a file uploaded before this guard existed carries no
   device tag. For a sidecar the device is still readable from the content, so
   records are protected regardless; for a photo it is not, and that one first
   clash still overwrites. Everything uploaded from here on is tagged.
   ──────────────────────────────────────────────────────────────────────────*/
function cleanDev_(v) { return String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12); }
/* SHA-256 as lower-case hex.

   Utilities.computeDigest returns SIGNED bytes — anything over 127 comes back
   negative — so each has to be folded back into 0..255 before it is written as
   hex. Getting that wrong produces a hash that is the right length, looks
   entirely plausible, and matches nothing: the exact shape of defect this
   receipt exists to catch. */
function sha256Hex_(bytes) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var out = '';
  for (var i = 0; i < d.length; i++) {
    var v = d[i] < 0 ? d[i] + 256 : d[i];
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}
/* A string as UTF-8 bytes, for hashing an identifier rather than a file. */
function strBytes_(s) {
  var out = [], i, c;
  for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); out.push(c < 128 ? c : 63); }
  return out;
}
function isSidecar_(name) {
  /* No marker is a round: a deferral was parsed as one, and owned like one
     (GAS_SCAN_FIXES_V1). */
  return /\.json$/i.test(name) && !/\.(edit|deleted|conflict|defer|rival|file)\.json$/i.test(name);
}
function variantName_(name, dev) {
  var i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) + '~' + dev + name.slice(i) : name + '~' + dev;
}
/** Which device owns the file already sitting under this name, '' if unknowable. */
function ownerDev_(file) {
  var desc = '';
  try { desc = String(file.getDescription() || ''); } catch (err) { desc = ''; }
  var m = /(?:^|\s)cm-dev:([A-Za-z0-9_-]{1,12})/.exec(desc);
  if (m) return m[1];
  if (isSidecar_(file.getName())) {
    try {
      var j = JSON.parse(file.getBlob().getDataAsString());
      var r = j && j.records && j.records[0];
      if (r && r.dev) return cleanDev_(r.dev);
    } catch (err) { /* unreadable — treat as unowned */ }
  }
  return '';
}
/** The name this upload may safely take, and whose work it would have replaced. */
function placeUpload_(dir, fileName, dev) {
  if (!dev) return { name: fileName, rival: '' };     // an older app: behave as before
  var hit = dir.getFilesByName(fileName);
  if (!hit.hasNext()) return { name: fileName, rival: '' };
  var owner = ownerDev_(hit.next());
  if (!owner || owner === dev) return { name: fileName, rival: '' };
  return { name: variantName_(fileName, dev), rival: owner };
}
/** "TK146_09.03.2026_MP.json" -> "TK146|2026-03-09|MP", '' if it is not one. */
function keyFromSidecar_(fileName) {
  var m = /^(.+)_(\d{2})\.(\d{2})\.(\d{4})_([^_.]+)\.json$/i.exec(fileName);
  return m ? (m[1] + '|' + m[4] + '-' + m[3] + '-' + m[2] + '|' + m[5]) : '';
}
/* One marker per record, listing every device that has sent a version. Re-sending
   a copy already listed changes nothing — a retry must not re-open a decision the
   office has already made. A genuinely new device does re-open it, because that
   is a version nobody has looked at. */
function markConflict_(sidecarName, rivalDev, dev) {
  var key = keyFromSidecar_(sidecarName);
  if (!key) return null;
  var name = sidecarName.replace(/\.json$/i, '') + '.conflict.json';
  return withScriptLock_(function () { return markConflictLocked_(key, name, sidecarName, rivalDev, dev); });
}
function markConflictLocked_(key, name, sidecarName, rivalDev, dev) {
  var meta = folderPath_(rootFolder_(), META_DIR);

  var doc = null, cur0 = newestByName_(meta, name);
  if (cur0) { try { doc = JSON.parse(cur0.getBlob().getDataAsString()); } catch (err) { doc = null; } }

  var devices = (doc && doc.devices) || [];
  var known = {}, i;
  for (i = 0; i < devices.length; i++) known[devices[i].dev] = 1;
  var fresh = false;
  if (!known[rivalDev]) { devices.push({ dev: rivalDev, file: sidecarName }); fresh = true; }
  if (!known[dev])      { devices.push({ dev: dev, file: variantName_(sidecarName, dev) }); fresh = true; }
  if (doc && !fresh) return { key: key, devices: devices };

  var out = { type: 'cm-record-conflict', version: 1, key: key,
              at: new Date().toISOString(), devices: devices,
              resolved: false, keep: '', by: '' };
  replaceFile_(meta, name, JSON.stringify(out, null, 2));
  indexTouch_();      // two versions of one round is the most urgent kind of news (after the marker exists)
  return { key: key, devices: devices };
}
/* The office's decision. Both versions stay in Drive — this only records which
   one the reports should use, so it is as reversible as a void. */
function resolveConflict_(b) {
  // GAS_SAFETY_V1: a decision says who made it.
  if (!String(b.by || '').trim()) return { ok: false, error: 'A name is required (who is making this decision)' };
  var stem = keyFile_(b.key, '');
  if (!stem) return { ok: false, error: 'Bad record key: ' + b.key };
  var name = stem + '.conflict.json';
  return withScriptLock_(function () { return resolveConflictLocked_(b, name); });
}
function resolveConflictLocked_(b, name) {
  var meta = folderPath_(rootFolder_(), META_DIR);
  var curC = newestByName_(meta, name);
  if (!curC) {
    var gone = staleWrite_(b, null, 'conflict');
    return gone || { ok: false, error: 'No conflict recorded for ' + b.key };
  }

  var doc;
  try { doc = JSON.parse(curC.getBlob().getDataAsString()); }
  catch (err) { return { ok: false, error: 'The conflict marker for ' + b.key + ' is unreadable' }; }
  var refusedR = staleWrite_(b, doc, 'conflict');
  if (refusedR) return refusedR;

  var keep = cleanDev_(b.keep), devices = doc.devices || [], ok = false;
  for (var i = 0; i < devices.length; i++) if (devices[i].dev === keep) ok = true;
  if (!ok) return { ok: false, error: 'No version from device ' + (keep || '(blank)') + ' for ' + b.key };

  /* The same gap as saveEdit_() above, one function over: a read-then-write
     with nothing between them, so a second resolution silently replaced the
     first's decision with no trace. Backed up for the same reason. */
  var overwrote = null;
  var stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    var bdir = folderPath_(rootFolder_(), META_DIR + '/backup/' + stamp);
    bdir.createFile(Utilities.newBlob(JSON.stringify(doc, null, 2), 'application/json', name));
  } catch (errB) {}
  if (doc.resolved && (doc.keep !== keep || (doc.by || '') !== String(b.by || '').slice(0, 80))) {
    overwrote = { by: doc.by || '', keep: doc.keep || '', at: doc.at || '' };
  }

  doc.resolved = true;
  doc.keep = keep;
  doc.by = String(b.by || '').slice(0, 80);
  doc.at = new Date().toISOString();
  replaceFile_(meta, name, JSON.stringify(doc, null, 2));
  indexTouch_();     // the office has decided; every phone must stop warning (after the decision exists)
  var out = { ok: true, key: doc.key, keep: keep, at: doc.at };
  if (overwrote) out.overwrote = overwrote;
  return out;
}

/* REWRITE ONE JSON DOCUMENT IN PLACE, WITH THE ORIGINAL KEPT.

   Field for field the same operation as docs/yandex/function.js
   rewriteObject(). This backend is retired and is not deployed; it is kept in
   step because two backends for one document have to agree about what the
   document IS. The grade migration uses it to turn a letter grade into its
   number without changing the file's name, owner or place in the index.
   Admin-gated; JSON only; the original bytes go to _meta/backup/<stamp>/
   first; identical bytes are a no-op. */
function rewriteObject_(b) {
  if (!ADMIN_SECRET) return { ok: false, error:
    'Rewrite is switched off. Set ADMIN_SECRET in the Apps Script and deploy a new version.' };
  if (String(b.admin || '') !== ADMIN_SECRET) return { ok: false, error: 'Wrong admin password' };
  var key = String(b.id || b.key || '').replace(/^\/+/, '');
  if (!key) return { ok: false, error: 'Missing object key' };
  if (!b.file) return { ok: false, error: 'Missing file content' };
  var why = String(b.why || '').trim();
  if (!why) return { ok: false, error: 'A reason is required' };
  var bytes = Utilities.base64Decode(b.file);
  var text = Utilities.newBlob(bytes).getDataAsString();
  try { JSON.parse(text); } catch (errJ) { return { ok: false, error: 'New content is not JSON' }; }
  var want = sha256Hex_(bytes);
  /* Located by a Drive id or a path, whichever the tool was handed by ?action=list.
     GAS_SAFETY_V1: addressed directly (a path, an id, or a round file by its
     own folders), not by a walk of the whole tree that stops at LIST_CAP. */
  var found = findObject_(key);
  if (found.error) return { ok: false, truncated: !!found.truncated, error: found.error };
  var hit = found.hit;
  if (!hit) return { ok: false, error: 'No object called ' + key };
  if (!/\.json$/i.test(hit.name)) return { ok: false, error: 'Only JSON documents can be rewritten' };
  var f = DriveApp.getFileById(hit.id);
  var was = f.getBlob().getBytes();
  var wasSha = sha256Hex_(was);
  if (wasSha === want) return { ok: true, key: key, unchanged: true, sha256: want };
  if (b.ifSha && String(b.ifSha) !== wasSha) return { ok: false, error: 'Object changed since it was read', sha256: wasSha };
  var at = new Date().toISOString();
  var stamp = at.replace(/[:.]/g, '-');
  var bdir = folderPath_(rootFolder_(), META_DIR + '/backup/' + stamp);
  var bf = bdir.createFile(Utilities.newBlob(was, 'application/json', hit.name));
  try { bf.setDescription((f.getDescription() || '') + ' cm-why:' + why.slice(0, 200)); } catch (errD) {}
  f.setContent(text);
  var back = DriveApp.getFileById(hit.id).getBlob().getBytes();
  var storedSha = sha256Hex_(back);
  if (storedSha !== want) return { ok: false, error: 'stored bytes do not match what was sent', key: key, backup: bf.getId() };
  if (/\.json$/i.test(hit.name) && !/\.(edit|conflict|file)\.json$/i.test(hit.name)) indexTouch_();
  return { ok: true, key: key, backup: bf.getId(), was: wasSha, sha256: storedSha, at: at, by: String(b.by || '').slice(0, 80) };
}

/* Deletion. Guarded by ADMIN_SECRET, which is deliberately NOT the same secret
   the phones carry — that one is published with the app. Files are trashed, not
   purged, so Drive keeps them for 30 days, and every deletion leaves a log. */
function deleteRecord_(b) {
  if (!ADMIN_SECRET) return { ok: false, error:
    'Deletion is switched off. Set ADMIN_SECRET in the Apps Script and deploy a new version.' };
  if (String(b.admin || '') !== ADMIN_SECRET) return { ok: false, error: 'Wrong admin password' };

  var p = String(b.key || '').split('|');
  var stem = keyFile_(b.key, '');
  if (!stem) return { ok: false, error: 'Bad record key: ' + b.key };

  // Every file belonging to this inspection: the sidecar, its photos and video,
  // the signature, and any correction marker. Matched on the naming standard —
  // <UNIT>...<DD.MM.YYYY>_<TYPE>.<ext> — so a photo for a component keeps its
  // own prefix (TK146.4C_…) and is still caught.
  //
  // The type must be followed by "." or "_" or nothing: "_2" marks the second
  // photo of a position and "_SIGN" the signature, and "\b" does NOT match
  // before an underscore, so anchoring on a word boundary silently left those
  // files behind — a delete that looked clean and was not.
  // Requiring a separator also stops TYPE "MP" from matching a "MPX" suffix.
  // "~" is there for the second device's copy of a clashing inspection — those
  // are part of the same record and must go with it.
  var unit = p[0], dmy = stem.split('_')[1], type = p[2];
  var re = new RegExp('^' + esc_(unit) + '[._-].*?' + esc_(dmy) + '_' + esc_(type) + '([._~]|$)', 'i');

  /* GAS_SAFETY_V1: the round's own folders (roundDirs_), not a walk of the
     whole tree. That walk stopped at LIST_CAP files, and a round past it
     answered "Nothing found" while its files stayed on Drive. Only when the
     round's folders hold nothing is the tree walked, and a walk that could not
     finish is an error, never "nothing found". */
  var all = roundFiles_(b.key);
  if (!all.filter(function (f) { return re.test(f.name); }).length) {
    var wk = walkAll_('', { cap: 1e9, ms: TIME_BUDGET_MS });
    if (wk.w.cut) return { ok: false, truncated: true, error:
      'The folder could not be listed in full in one request, so nothing was deleted. Try again.' };
    all = wk.files;
  }
  // ONE DEVICE'S RIVAL COPY, AND NOTHING ELSE (`dev`) — field for field the same
  // as docs/yandex/function.js deleteRecord(). This backend is retired; it is
  // kept in step so a backend that is ever switched back on agrees about what
  // the operation does. With `dev` only files carrying "~DEV" go; the primary
  // sidecar, other devices' copies, markers and the signature are never
  // touched, and NO deletion log named .deleted.json-for-the-key is written —
  // that is a tombstone for the whole round. `dry` lists and changes nothing.
  var dev = (b.dev === undefined || b.dev === null) ? '' : String(b.dev);
  if (dev && !/^[A-Za-z0-9_-]{1,24}$/.test(dev)) return { ok: false, error: 'Bad device code: ' + dev };
  var tag = dev ? new RegExp('~' + esc_(dev) + '([._]|$)') : null;
  var hit = all.filter(function (f) { return re.test(f.name) && (!tag || tag.test(f.name)); });
  if (!hit.length) return { ok: false, error: dev ? 'Nothing found for ' + b.key + ' on device ' + dev : 'Nothing found for ' + b.key };
  /* GAS_SAFETY_V1: dry changes nothing, with or without dev. It used to be read
     only beside dev, so a "dry run" of a whole round deleted it (EX003/TK148). */
  if (b.dry) return { ok: true, dry: true, would: hit.map(function (f) { return f.name; }) };

  var gone = [];
  for (var i = 0; i < hit.length; i++) {
    try { DriveApp.getFileById(hit[i].id).setTrashed(true); gone.push(hit[i].path); }
    catch (err) { /* already gone — not a failure */ }
  }

  if (dev) {
    var rivalLog = { type: 'cm-rival-deleted', key: b.key, dev: dev, at: new Date().toISOString(),
                     by: String(b.by || '').slice(0, 80), why: String(b.why || '').slice(0, 400), files: gone };
    folderPath_(rootFolder_(), META_DIR + '/deletions').createFile(
      Utilities.newBlob(JSON.stringify(rivalLog, null, 2), 'application/json',
                        rivalLog.at.replace(/[:.]/g, '-') + '_' + stem + '~' + dev + '.rival.json'));
    /* And that device's row out of the index (GAS_SCAN_FIXES_V1). It stayed,
       keyed unit|date|type|dev, so every phone (which keys a round without the
       device, last row wins) went on showing the deleted copy's grade,
       inspector and hour meter in place of the real round. */
    var droppedR = indexDropDev_(b.key, dev);
    indexTouch_();
    var outR = { ok: true, deleted: gone.length, dev: dev, files: hit.map(function (f) { return f.name; }), trashed: true };
    if (droppedR && !droppedR.ok) { outR.indexed = false; outR.indexNote = droppedR.busy ? 'index busy' : droppedR.error; }
    return outR;
  }

  // Append-only: one file per deletion, so two people deleting at once cannot
  // overwrite each other's entry the way a single shared log would.
  var stampSafe = new Date().toISOString().replace(/[:.]/g, '-');
  var log = { type: 'cm-deletion', version: 1, key: b.key, at: new Date().toISOString(),
              by: String(b.by || '').slice(0, 80), reason: String(b.reason || '').slice(0, 400),
              files: gone };
  folderPath_(rootFolder_(), META_DIR + '/deletions').createFile(
    Utilities.newBlob(JSON.stringify(log, null, 2), 'application/json',
                      stampSafe + '_' + stem + '.deleted.json'));

  /* The files are trashed and the marker is written, so the deletion stands
     and every phone drops the round when it reads the marker. If the index
     could not take it (busy, or the month unreadable) the reply says so
     instead of claiming it did; a rebuild, or the next delete, puts it right. */
  var dropped = indexDrop_(b.key);          // or the list keeps offering a round that is gone
  indexTouch_();              // even if it was never indexed, this IS a change
  var outD = { ok: true, deleted: gone.length, files: gone, trashed: true };
  if (dropped && !dropped.ok) { outD.indexed = false; outD.indexNote = dropped.busy ? 'index busy' : dropped.error; }
  return outD;
}
/* ONE PHOTOGRAPH, DELETED ON PURPOSE, WITH A REASON ON IT.

   Field for field the same operation as docs/yandex/function.js deleteFile().
   This backend is retired and is not deployed; it is kept in step because two
   backends for one document have to agree about what the document IS, and a
   backend that is ever switched back on must not silently disagree.

   Same gate as deleteRecord_ — ADMIN_SECRET — because this destroys a file.
   The marker is written BEFORE the file goes, so a failure halfway leaves a
   note explaining an absence rather than an absence explaining nothing, and a
   reason and a name are both required: a photograph that vanishes with neither
   is indistinguishable from one the sync lost. Media only; a sidecar removed
   this way would take a round off every screen with nothing to say it existed. */
function deleteFile_(b) {
  if (!ADMIN_SECRET) return { ok: false, error:
    'Deletion is switched off. Set ADMIN_SECRET in the Apps Script and deploy a new version.' };
  if (String(b.admin || '') !== ADMIN_SECRET) return { ok: false, error: 'Wrong admin password' };
  var name = String(b.name || '').trim();
  if (!name) return { ok: false, error: 'Missing file name' };
  if (!/\.(jpe?g|png|webp|mp4|mov|webm)$/i.test(name))
    return { ok: false, error: 'Only photographs and video can be deleted one at a time' };
  var why = String(b.why || '').trim();
  if (!why) return { ok: false, error: 'A reason is required' };
  var by = String(b.by || '').trim();
  if (!by) return { ok: false, error: 'A name is required' };

  /* GAS_SAFETY_V1: every phone photograph lives in its round's folder
     (TYPE/UNIT/DATE), and this looked only in the root, where only a photo
     added from the office lands. The dashboard sends the round's key; the
     file is looked up by name in that round's folders and the root, and only
     if it is in none of them is the tree walked. */
  var hit = [];
  var dirs = roundDirs_(b.key);
  dirs.forEach(function (d) {
    var it = d.dir.getFilesByName(name);
    while (it.hasNext()) hit.push(it.next());
  });
  if (!hit.length) {
    var wk = walkAll_('', { cap: 1e9, ms: TIME_BUDGET_MS });
    if (wk.w.cut) return { ok: false, truncated: true, error:
      'The folder could not be listed in full in one request, so nothing was deleted. Try again.' };
    wk.files.forEach(function (f) {
      if (f.name === name && f.path.indexOf(META_DIR + '/') !== 0) hit.push(DriveApp.getFileById(f.id));
    });
  }
  if (!hit.length) return { ok: false, error: 'No file called ' + name };

  var at = new Date().toISOString(), stampSafe = at.replace(/[:.]/g, '-');
  var stem = name.replace(/\.[^.]+$/, '');
  folderPath_(rootFolder_(), META_DIR + '/deletions').createFile(
    Utilities.newBlob(JSON.stringify({ type: 'cm-file-deleted', name: name,
      key: String(b.key || ''), by: by.slice(0, 80), why: why.slice(0, 400), at: at,
      bytes: hit.reduce(function (n, f) { return n + f.getSize(); }, 0) }, null, 2),
      'application/json', stampSafe + '_' + stem + '.file.json'));

  var gone = 0;
  for (var i = 0; i < hit.length; i++) { try { hit[i].setTrashed(true); gone++; } catch (e) {} }
  indexTouch_();
  return { ok: true, deleted: gone, name: name, at: at };
}
function esc_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ══════════════════════════════════════════════════════════════════════════
   THE INDEX
   ══════════════════════════════════════════════════════════════════════════ */

/** ms the folder last changed. A property, not a file — zero Drive operations. */
function indexAt_() {
  try { return Number(PropertiesService.getScriptProperties().getProperty(INDEX_AT) || 0) || 0; }
  catch (err) { return 0; }
}
function indexTouch_(ms) {
  try { PropertiesService.getScriptProperties().setProperty(INDEX_AT, String(ms || new Date().getTime())); }
  catch (err) { /* a property that will not save is not worth failing an upload over */ }
}
/** The file name of every shard shardOf_ can produce, and of nothing else. */
var SHARD_NAME_ = /^(\d{4}-\d{2}|undated)\.json$/;
/** '2026-08' from an inspection date. The shard a record belongs to. */
function shardOf_(iso) {
  var m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
  return m ? m[1] + '-' + m[2] : 'undated';
}
/* Two phones can inspect the same unit on the same day — a hand-over, or two
   people covering a big machine between them. Both versions are kept on Drive
   under different names on purpose, and the office decides which stands. So the
   device belongs in the key: without it the second upload would quietly replace
   the first IN THE INDEX while both files sat in the folder, and the clash the
   conflict marker exists to surface would never reach anybody. */
var RECKEY_ = function (r) {
  return ROUNDKEY_(r) + '|' + cleanDev_(r.dev || '');
};
var ROUNDKEY_ = function (r) {
  return String(r.equip || '').toUpperCase() + '|' + (r.date || '') + '|' + (r.type || 'MP');
};

function isTrashed_(f) { try { return f.isTrashed(); } catch (err) { return false; } }
/** Was `a` created before `b`? Creation time, then id, so two files never tie. */
function createdBefore_(a, b) {
  var ta = 0, tb = 0;
  try { ta = a.getDateCreated().getTime(); tb = b.getDateCreated().getTime(); } catch (err) {}
  return ta !== tb ? ta < tb : String(a.getId()) < String(b.getId());
}
/** The newest live file of one name in one folder, or null. A write creates
    the new file before trashing the old, so for a moment there can be two. */
function newestByName_(dir, name) {
  var it = dir.getFilesByName(name), best = null, bt = 0;
  while (it.hasNext()) {
    var f = it.next();
    if (isTrashed_(f)) continue;
    var t = 0; try { t = f.getLastUpdated().getTime(); } catch (err) {}
    if (!best || t > bt) { best = f; bt = t; }
  }
  return best;
}
/** A marker or a shard-like document, replaced the safe way round: the new
    file FIRST, then the old copies trashed (GAS_SCAN_FIXES_V1). saveEdit,
    markConflict and resolveConflict trashed first and created after, so a
    createFile that failed (a Drive error, a quota) left NO marker: a void and
    its note gone from every reader, a conflict decision gone and the clash with
    it. The order shardWrite_ and saveOne_ already keep. Readers take the
    newest live file of the name (newestByName_). */
function replaceFile_(dir, name, body) {
  var olds = [], it = dir.getFilesByName(name);
  while (it.hasNext()) olds.push(it.next());
  var nf = dir.createFile(Utilities.newBlob(body, 'application/json', name));
  for (var i = 0; i < olds.length; i++) { try { olds[i].setTrashed(true); } catch (err) {} }
  return nf;
}
/** One shard, read whole. A shard that cannot be read THROWS: it is not an
    empty month (GAS_INDEX_SAFETY_V1). Returning [] here used to let the next
    upload write the month back holding one round. */
function shardRead_(dir, name) {
  var f = newestByName_(dir, name + '.json');
  if (!f) return { records: [], file: null };
  var j = JSON.parse(f.getBlob().getDataAsString());
  if (!j || !Array.isArray(j.records)) throw new Error('index shard ' + name + ' is not readable');
  return { records: j.records, file: f };
}
/** Write the new shard FIRST, then trash the old copies: a failed create
    leaves the old month standing instead of no month at all. */
function shardWrite_(dir, name, records) {
  var body = JSON.stringify({ type: 'cm-index-shard', version: INDEX_V,
                              at: new Date().getTime(), n: records.length, records: records });
  var blob = Utilities.newBlob(body, 'application/json', name + '.json');
  var olds = [], it = dir.getFilesByName(name + '.json');
  while (it.hasNext()) olds.push(it.next());
  var nf = dir.createFile(blob);
  for (var i = 0; i < olds.length; i++) { try { olds[i].setTrashed(true); } catch (err) {} }
  return nf;
}
/** The index's own lock. Never written WITHOUT it: a lock that cannot be had
    in 20 s is { busy: true }, and the caller says so (GAS_INDEX_SAFETY_V1).
    It used to carry on with lock = null, and two uploads at shift end each
    kept their own round and dropped the other's from the index. */
function withIndexLock_(fn) {
  var lock = null;
  // No lock service at all is a local harness, never Apps Script (as withScriptLock_).
  try { lock = LockService.getScriptLock(); } catch (err0) { lock = null; }
  if (lock) {
    try { lock.waitLock(20000); }
    catch (err) { return { ok: false, busy: true, error: 'index busy' }; }
  }
  try { return fn(); }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  finally { if (lock) { try { lock.releaseLock(); } catch (err2) {} } }
}

/* A round has landed. Put it in its shard.

   Called from saveOne_, which has just decoded this exact JSON in order to
   write it — so the record costs nothing to obtain. The lock matters: two
   phones finishing a round in the same second would otherwise read the same
   shard, each add their own round, and the second write would lose the first.
   A lock that cannot be taken is not a reason to fail the upload; the file is
   on Drive either way and a rebuild puts the index right. */
function indexPut_(rec, fileId, dev) {
  if (!rec || !rec.equip || !rec.date) return { ok: true, skipped: true };
  /* Which phone sent it. Usually inside the record, but a client that leaves it
     out still sends it alongside the upload — and without it two phones' copies
     of one round key the same, so the second silently replaces the first in the
     index while both files sit in the folder. */
  if (!rec.dev && dev) rec = Object.assign({}, rec, { dev: dev });
  return withIndexLock_(function () {
    var dir = folderPath_(rootFolder_(), INDEX_DIR);
    var name = shardOf_(rec.date);
    var cur = shardRead_(dir, name);          // throws when unreadable: nothing is written
    var key = RECKEY_(rec), out = [], put = false;
    for (var i = 0; i < cur.records.length; i++) {
      if (RECKEY_(cur.records[i]) === key) { if (put) continue; out.push(rec); put = true; }
      else out.push(cur.records[i]);
    }
    if (!put) out.push(rec);
    shardWrite_(dir, name, out);
    indexTouch_();
    return { ok: true };
  });
}
/** One device's copy of a round has been deleted: its row only. */
function indexDropDev_(key, dev) {
  var p = String(key || '').split('|');
  if (p.length !== 3 || !dev) return { ok: true, skipped: true };
  return withIndexLock_(function () {
    var dir = folderPath_(rootFolder_(), INDEX_DIR);
    var name = shardOf_(p[1]);
    var cur = shardRead_(dir, name);          // throws when unreadable: nothing is written
    var want = p[0].toUpperCase() + '|' + p[1] + '|' + p[2] + '|' + cleanDev_(dev), out = [];
    for (var i = 0; i < cur.records.length; i++)
      if (RECKEY_(cur.records[i]) !== want) out.push(cur.records[i]);
    if (out.length !== cur.records.length) { shardWrite_(dir, name, out); indexTouch_(); }
    return { ok: true };
  });
}
/** A round has been deleted. Take it out, so the list stops offering it. */
function indexDrop_(key) {
  var p = String(key || '').split('|');
  if (p.length !== 3) return { ok: true, skipped: true };
  return withIndexLock_(function () {
    var dir = folderPath_(rootFolder_(), INDEX_DIR);
    var name = shardOf_(p[1]);
    var cur = shardRead_(dir, name);          // throws when unreadable: nothing is written
    // Deleting a round deletes every version of it — both phones' — the same
    // way the file sweep below does. Keyed without the device for that reason.
    var want = p[0].toUpperCase() + '|' + p[1] + '|' + p[2], out = [];
    for (var i = 0; i < cur.records.length; i++)
      if (ROUNDKEY_(cur.records[i]) !== want) out.push(cur.records[i]);
    if (out.length !== cur.records.length) { shardWrite_(dir, name, out); indexTouch_(); }
    return { ok: true };
  });
}

/* The summary a phone needs, and nothing else.

   "In the system" wants who did what, when, and how bad — six fields. Sending
   the whole record to answer that is sending a megabyte to draw a list. Built
   here from the shard already in memory, so it costs nothing to offer both. */
/* The grade is 1..5 (see mobile/grade.js). A sidecar written before the
   change carries A/B/C/X; both are read, and the row always says a number —
   the same normalisation GRADE.num applies, kept here in step with it. */
var GRADE_LEGACY_ = { A: 1, B: 2, C: 3, D: 4, X: 5 };
function gradeNum_(v) {
  if (v == null || v === '') return null;
  var s = String(v).trim().toUpperCase();
  if (/^[1-5]$/.test(s)) return Number(s);
  return GRADE_LEGACY_[s] || null;
}
function slimRow_(r) {
  /* The round's own grade when the phone wrote one (build 254 on): it already
     folds in the measured stations, which no grade field here can. Older
     rounds fall back to the worst graded point, as before. */
  var worst = gradeNum_(r.g), base = [];
  if (worst == null) worst = '';
  var items = r.items || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {}, g = gradeNum_(it.grade);
    if (g != null && (worst === '' || g > worst)) worst = g;
    /* A baseline changes how every later reading on that unit is scored, so it
       cannot stay on the phone that set it. Rare, and a few bytes when present.
       This must stay identical to teamRow() in the app — the suite compares the
       two on the same records so they cannot drift apart unnoticed. */
    if (it.baseNew) {
      var k = String(it.key || ''), cut = k.indexOf('.');
      base.push({ p: cut < 0 ? k : k.slice(0, cut),
                  s: it.baseAll ? '' : (cut < 0 ? '' : k.slice(cut + 1)),
                  n: Number(it.baseNew),
                  c: (it.baseCondemn === '' || it.baseCondemn == null) ? null : Number(it.baseCondemn) });
    }
  }
  var row = { u: String(r.equip || '').toUpperCase(), d: r.date || '', t: r.type || 'MP',
              by: r.by || '', g: worst };
  /* The hour meter. The inspection schedule is in hours, so a round somebody
     else walked has to move the due date the same way the phone's own does —
     and two readings of it are what tell a machine its own hours per day.
     Identical to teamRow() in the app, and the suite compares them. */
  var smu = (r.smu === '' || r.smu == null) ? null : Number(r.smu);
  if (smu != null && isFinite(smu)) row.s = smu;
  if (base.length) row.b = base;
  /* The one thing the row carries that the app could not work out for itself:
     which file this round is. Opening it becomes a single request by id — no
     folder listing, no search, no re-read of anything else. */
  if (r._id) row.f = r._id;
  return row;
}

/* Read the index.

   The common case — a phone asking "anything new?" — is answered out of a
   script property without touching Drive at all. When something HAS changed,
   only the shards that changed are read: a month of work is one file, not three
   hundred round trips. */
function readIndex_(p) {
  var since = Number(p.since || 0) || 0;
  var at = indexAt_();
  var slim = String(p.slim || '') === '1';

  if (since && at && since >= at) {
    return { ok: true, v: INDEX_V, at: at, upToDate: true,
             records: [], rows: [], edits: [], conflicts: [] };
  }

  /* Until a rebuild has walked this folder once, the index is not an answer to
     "what is in it" — only to "what has arrived since the script gained one".
     Say so, and let the client read the records the old way meanwhile. */
  var built = '';
  try { built = PropertiesService.getScriptProperties().getProperty(INDEX_BUILT) || ''; }
  catch (err) { built = ''; }
  if (!built) {
    /* The client will read the records the old way and get the markers with
       them — but sending them here too costs one small folder listing and
       means no reply from this endpoint is ever silent about a withdrawal. */
    var mR = metaSince_(since);
    return { ok: true, v: INDEX_V, at: at, needsRebuild: true,
             records: [], rows: [], edits: mR.edits, conflicts: mR.conflicts,
             deleted: mR.deleted, deferrals: mR.deferrals };
  }

  var root = rootFolder_();
  var it = folderPath_(root, INDEX_DIR).getFiles();
  var shards = [], byName = {};
  while (it.hasNext()) {
    var f = it.next();
    /* Only a month shard is a shard (GAS_SCAN_FIXES_V2). The folder is not the
       script's alone: Pechanka mirrors the Yandex bucket into it, and Yandex
       keeps its index clock as _meta/index/at.json. Any .json used to count,
       an unreadable one was skipped; since V1 an unreadable shard stops the
       read, so at.json made every index reply 0 rows. shardOf_ names every
       shard the script writes; read those and nothing else. */
    if (!SHARD_NAME_.test(f.getName()) || isTrashed_(f)) continue;
    /* A shard write creates the new file before trashing the old, so for a
       moment one month can have two files: read the newest, once. */
    var sh0 = { f: f, name: f.getName(), updated: f.getLastUpdated().getTime() };
    var prev = byName[sh0.name];
    if (prev && prev.updated >= sh0.updated) continue;
    if (prev) shards.splice(shards.indexOf(prev), 1);
    byName[sh0.name] = sh0; shards.push(sh0);
  }
  if (!shards.length) {
    /* No shards is not the same as nothing to say. A correction, a void or a
       deletion lives in _meta and needs no shard to exist — and this branch was
       returning empty arrays for all three, so a folder that had not been
       indexed yet swallowed every one of them. */
    var m0 = metaSince_(since);
    return { ok: true, v: INDEX_V, at: at, empty: true,
             records: [], rows: [], edits: m0.edits, conflicts: m0.conflicts,
             deleted: m0.deleted, deferrals: m0.deferrals };
  }

  /* Oldest month first, so a reply that has to stop can be resumed from where
     it stopped. A slim reply is ~90 bytes a round and never needs to; a full
     one is a few kilobytes a round, and a folder large enough to matter would
     otherwise build a reply too big to send. */
  shards.sort(function (a2, b2) { return a2.updated - b2.updated; });

  var recs = [], read = 0, bytes = 0, truncated = false, cursor = since, out0Unread = '';
  var budget = slim ? INDEX_SLIM_BYTES : INDEX_FULL_BYTES;
  for (var i = 0; i < shards.length; i++) {
    if (since && shards[i].updated <= since) continue;      // untouched month
    if (bytes > budget) { truncated = true; break; }
    /* A month that cannot be read is NOT read past (GAS_SCAN_FIXES_V1). It was
       caught, skipped and the cursor moved over it, in a reply that said it
       was complete: a phone's full read rebuilt its history without that
       month and stripped "from the system" off every machine walked in it.
       One retry for a passing Drive error; then stop here, truncated, with the
       cursor on the last month that WAS read, so the client asks again from
       it, and a cursor that does not move never counts as a complete read. */
    var j = null, raw = null;
    for (var tr = 0; tr < 2 && j === null; tr++) {
      try { raw = shards[i].f.getBlob().getDataAsString(); j = JSON.parse(raw); }
      catch (err) { j = null; if (tr === 0) { try { Utilities.sleep(400); } catch (e2) {} } }
    }
    if (!j || !Array.isArray(j.records)) { truncated = true; out0Unread = shards[i].name; break; }
    read++;
    bytes += raw.length;
    for (var k = 0; k < j.records.length; k++) recs.push(j.records[k]);
    cursor = shards[i].updated;
  }

  var out = { ok: true, v: INDEX_V, at: at || new Date().getTime(),
              shards: shards.length, readShards: read, n: recs.length };
  if (truncated) { out.truncated = true; out.cursor = cursor; if (out0Unread) out.unreadable = out0Unread; }
  if (slim) {
    out.rows = recs.map(slimRow_);
  } else {
    out.records = recs;
  }
  // Corrections and voids are few and small, and a client that has the records
  // without them shows figures somebody has already withdrawn.
  var meta = metaSince_(since);
  out.edits = meta.edits; out.conflicts = meta.conflicts; out.deleted = meta.deleted;
  out.deferrals = meta.deferrals;
  return out;
}

/** The _meta markers, which are small enough to read whole.

    Deletions belong here with the corrections. The files of a deleted round are
    gone from the folder, so its marker is the ONLY thing left that says it ever
    existed — and this is the path every phone actually uses. Leaving deletions
    out of it is why a machine deleted in the dashboard stayed on the due list:
    the summary row aged out of the phone's cache, and the last-done date it had
    already written stayed exactly where it was. */
function metaSince_(since) {
  /* META_DIGEST_V1 (06.10): a whole read (since = 0, a new phone or a new browser) opened all ~350 _meta files one
     by one, ~250 of its ~270 s, and passed Google's 360 s limit in a browser (CORS error, 0 rounds shown). The
     parsed files are now kept in ONE cache file, _meta/index/meta_digest.cache, keyed by file id + last-updated
     time: a file is opened only when it is new or changed since the cache saw it. Not .json, so it is never read
     as a shard or a round, and _meta/index is never copied to Pechanka. Same answers as before, file for file. */
  var edits = [], conflicts = [], deleted = [], deferrals = [];
  var dg = metaDigestRead_(), map = dg.map, seen = {}, changed = false;
  var take = function (it) {
    while (it.hasNext()) {
      var f = it.next(), n = f.getName();
      if (!/\.(edit|conflict|deleted|defer)\.json$/i.test(n)) continue;
      var id = f.getId(), upd = f.getLastUpdated().getTime();
      seen[id] = true;
      if (since && upd <= since) continue;
      try {
        var j, c = map[id];
        if (c && c.u === upd) { j = c.j; }
        else {
          j = null;
          try { j = JSON.parse(f.getBlob().getDataAsString()); } catch (errP) { j = null; }
          map[id] = { u: upd, j: j }; changed = true;
        }
        /* A deferral is keyed by unit and round, not by a round key — it is
           about a round that has not happened and so has none. */
        if (!j || (!j.key && !(j.u && j.t))) continue;
        if (/\.conflict\.json$/i.test(n)) conflicts.push(j);
        else if (/\.deleted\.json$/i.test(n)) deleted.push({ key: j.key, by: j.by || '', at: j.at || '' });
        else if (/\.defer\.json$/i.test(n)) deferrals.push({ u: j.u, t: j.t, until: j.until || null,
          why: j.why || '', whyKey: j.whyKey || '', by: j.by || '', at: j.at || '',
          /* The office's "Cancel the deferral" (GAS_SCAN_FIXES_V1): without it
             every reader stored the cancel as "put off, no end date". */
          cleared: j.cleared ? 1 : 0 });
        else edits.push(j);
      } catch (err) { /* skip */ }
    }
  };
  var listed = 0;
  try { folderPaths_(rootFolder_(), META_DIR).forEach(function (d) { take(d.getFiles()); }); listed++; } catch (err) { /* no _meta yet */ }
  /* Deletion markers are filed in _meta/deletions, one per round and stamped,
     because a round can be deleted more than once over its life and one file
     per key would lose the earlier one. A reader that lists only _meta itself
     finds none of them — which is exactly how this shipped not working. */
  try { folderPaths_(rootFolder_(), META_DIR + '/deletions').forEach(function (d) { take(d.getFiles()); }); listed++; } catch (err) { /* none yet */ }
  /* The phones file theirs here — see syncDefer() in the app. */
  try { folderPaths_(rootFolder_(), META_DIR + '/deferrals').forEach(function (d) { take(d.getFiles()); }); listed++; } catch (err) { /* none yet */ }
  if (listed === 3) {                       // drop files that are gone, only when every folder was listed
    for (var k in map) if (!seen[k]) { delete map[k]; changed = true; }
  }
  if (changed) metaDigestWrite_(dg, map);
  return { edits: edits, conflicts: conflicts, deleted: deleted, deferrals: deferrals };
}
var META_DIGEST_NAME = 'meta_digest.cache';
function metaDigestRead_() {
  var d = { dir: null, file: null, map: {} };
  try {
    d.dir = folderPath_(rootFolder_(), INDEX_DIR);
    var it = d.dir.getFilesByName(META_DIGEST_NAME);
    if (it.hasNext()) {
      d.file = it.next();
      var j = JSON.parse(d.file.getBlob().getDataAsString());
      if (j && j.type === 'cm-meta-digest' && j.files && typeof j.files === 'object') d.map = j.files;
    }
  } catch (err) { d.map = {}; }          // a bad cache only costs time: every file is read again
  return d;
}
function metaDigestWrite_(d, map) {
  if (!d.dir) return;
  var lock = null;
  try { lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return; } catch (err) { return; }
  try {
    var body = JSON.stringify({ type: 'cm-meta-digest', v: 1, at: new Date().getTime(), files: map });
    var it = d.dir.getFilesByName(META_DIGEST_NAME);
    if (it.hasNext()) it.next().setContent(body);
    else d.dir.createFile(META_DIGEST_NAME, body, 'application/json');
  } catch (err) { /* the answer is already built; a cache that will not save is read again next time */ }
  finally { try { lock.releaseLock(); } catch (err2) {} }
}

/* Build the index for a folder that predates it.

   This is the expensive read the index exists to abolish, run once. It is
   resumable on purpose: 900 rounds is more Drive operations than one execution
   is allowed, so it returns where it got to and the client calls again. */
var INDEX_FULL_BYTES = 6 * 1024 * 1024;   // ContentService will not carry much more
var INDEX_SLIM_BYTES = 24 * 1024 * 1024;  // ~90 bytes a round: a decade of them
var REBUILD_MAX = 250;
function rebuildIndex_(p) {
  /* REBUILD_FIT_V1 (06.10): walking ~800 folders took most of the 200 s, so a batch indexed 0 rounds and the
     rebuild never moved. Collect only .json (round) files - photos are not needed here and their per-file calls
     were the slow part - and give the indexing its own clock, inside Google's 360 s limit. */
  var t0 = new Date().getTime();
  var after = Number(p.after || 0) || 0;
  /* GAS_SAFETY_V1: the walk is no longer cut at LIST_CAP files in silence. It
     runs to the end or to its clock, and a walk that did not finish indexes
     nothing and says so: a rebuild that saw part of the folder must never mark
     the index built. */
  var wk = walkAll_('', { cap: 1e9, ms: WALK_BUDGET_MS, ext: '.json' });
  if (wk.w.cut) return { ok: false, truncated: true, files: wk.files.length, error:
    'The folder could not be walked in one request (' + wk.files.length + ' files listed before the clock ran out). Nothing was indexed.' };
  var all = wk.files;
  var started = new Date().getTime();
  var budget = Math.max(30000, 300000 - (started - t0));
  var sidecars = all.filter(function (f) {
    return isSidecar_(f.name) && f.path.indexOf(META_DIR + '/') !== 0 && f.updated > after;
  }).sort(function (a, b) { return a.updated - b.updated; });

  var dir = folderPath_(rootFolder_(), INDEX_DIR);
  var open = {}, order = [], done = 0, cursor = after, more = false;
  for (var i = 0; i < sidecars.length; i++) {
    if (done >= REBUILD_MAX || new Date().getTime() - started > budget) { more = true; break; }
    var f = sidecars[i];
    try {
      var j = JSON.parse(DriveApp.getFileById(f.id).getBlob().getDataAsString());
      var rs = (j && j.records) || [];
      for (var k = 0; k < rs.length; k++) {
        var r = rs[k];
        if (!r || !r.equip || !r.date) continue;
        r._file = f.path; r._id = f.id;
        var sh = shardOf_(r.date);
        if (!open[sh]) { open[sh] = {}; order.push(sh); }
        open[sh][RECKEY_(r)] = r;
      }
      done++;
    } catch (err) { done++; }
    cursor = f.updated;
  }

  /* Merge each touched shard once, at the end — not once per record — under
     the index lock, like every other shard write (GAS_INDEX_SAFETY_V1). A
     shard that cannot be read is rebuilt from the walk only on a pass from
     the start, which saw every round of it; an incremental pass leaves it and
     says so. */
  var unreadable = [];
  var merged = withIndexLock_(function () {
    for (var s = 0; s < order.length; s++) {
      var name = order[s], cur, map = {}, keep = [];
      try { cur = shardRead_(dir, name); }
      catch (errR) { if (after) { unreadable.push(name); continue; } cur = { records: [] }; }
      for (var c = 0; c < cur.records.length; c++) map[RECKEY_(cur.records[c])] = cur.records[c];
      for (var kk in open[name]) map[kk] = open[name][kk];
      for (var mk in map) keep.push(map[mk]);
      shardWrite_(dir, name, keep);
    }
    return { ok: true };
  });
  if (!merged.ok) return { ok: false, busy: !!merged.busy, error: 'Rebuild could not write the index: ' + merged.error };
  indexTouch_();
  /* Only when the walk actually finished. A rebuild that stopped for time is a
     rebuild that has not covered the folder, and marking it done would leave
     every reader looking at half of it. */
  if (!more && !unreadable.length) {
    try { PropertiesService.getScriptProperties().setProperty(INDEX_BUILT, '1'); } catch (err) {}
  }
  var outR = { ok: true, building: more, done: done, cursor: cursor,
               pending: Math.max(0, sidecars.length - done), shards: order.length, at: indexAt_() };
  if (unreadable.length) outR.unreadable = unreadable;   // run again from the start (no cursor) to rebuild them
  return outR;
}

/* Several files in one reply.

   The dashboard opens a unit and wants its photographs. One invocation each
   meant five round trips and five script starts for five thumbnails; the pool
   that limits it to five at a time exists precisely because that is expensive.
   Asked for together they cost one. */
var MEDIA_BATCH = 8;
function readFiles_(ids) {
  var list = String(ids || '').split(',').filter(String).slice(0, MEDIA_BATCH);
  var out = [], known = {};
  for (var i = 0; i < list.length; i++) {
    try {
      var f = DriveApp.getFileById(list[i]);
      /* The files of one component share a folder. Checking each one's parents
         separately walks the same chain eight times for eight photographs. */
      var pid = '';
      try { var ps = f.getParents(); if (ps.hasNext()) pid = ps.next().getId(); } catch (err0) { pid = ''; }
      var okHere = pid && known[pid] !== undefined ? known[pid] : underRoot_(f);
      if (pid) known[pid] = okHere;
      if (!okHere) { out.push({ id: list[i], ok: false, error: 'outside the folder' }); continue; }
      var b = f.getBlob();
      out.push({ id: list[i], ok: true, name: f.getName(), mime: b.getContentType(),
                 data: Utilities.base64Encode(b.getBytes()) });
    } catch (err) {
      out.push({ id: list[i], ok: false, error: String((err && err.message) || err) });
    }
  }
  return { ok: true, files: out };
}


/* ── the batch read ──────────────────────────────────────────────────────────
   Reading the sidecars one HTTP request at a time meant a few hundred round
   trips — and a few hundred script invocations against a ~90 min/day quota —
   every time a dashboard was opened, re-reading files that had not changed.

   Here the loop runs inside Apps Script, where Drive is local, and the client
   gets everything in one reply.

     ?action=records                 every inspection
     ?action=records&after=<ms>      only sidecars written since that moment
     ?action=records&index=0         skip the photo index (smaller reply)

   `after` is what makes a refresh nearly free. Pass back the `cursor` from the
   previous reply and only genuinely new inspections come down the wire.

   A run that hits `max` or the time guard returns truncated:true with the
   cursor it reached — call again with that cursor to continue. Deletions are
   invisible to an incremental read, so the client must offer a full reload.
   ──────────────────────────────────────────────────────────────────────────*/
var RECORDS_MAX = 600;         // sidecars read per call; response stays ~1-2 MB
var TIME_BUDGET_MS = 240000;   // stop at 4 min — Apps Script kills us at 6
var WALK_BUDGET_MS = 200000;   // GAS_SAFETY_V1: a whole-tree walk inside a read stops here

function readRecords_(p) {
  var started = new Date().getTime();
  var after = Number(p.after || 0) || 0;
  var max = Math.min(Number(p.max || 0) || RECORDS_MAX, 2000);
  var wantIndex = String(p.index == null ? '1' : p.index) !== '0';

  /* GAS_SAFETY_V1: the walk that feeds this read used to stop at LIST_CAP
     (4,000) files without a word, so the rounds and photographs past it simply
     were not there. It now runs to its clock (WALK_BUDGET_MS), and a walk that
     did not finish is an error — never a reply that looks complete. The fast
     read is ?action=index; a full file listing is ?action=list with its cursor. */
  var wk = walkAll_('', { cap: 1e9, ms: WALK_BUDGET_MS });
  if (wk.w.cut) return { ok: false, truncated: true, listTruncated: true, files: wk.files.length, error:
    'The folder is too large to list in one request (' + wk.files.length + ' files listed before the clock ran out). '
    + 'Use action=index, or action=list with its cursor.' };
  var all = wk.files;

  // Oldest first, so a truncated run resumes cleanly from its cursor. Records
  // and correction markers share one cursor: they interleave by write time, and
  // two cursors would let an edit arrive before the record it corrects.
  /* The index shards are .json files under _meta/index, and their shape is a
     records array — so the old filter read them back as inspections and every
     round arrived twice. Nothing errors when that happens; the fleet simply
     doubles. The type check below is the belt to this braces. */
  /* _meta/backup holds the pre-rewrite copy of a sidecar under its own name
     (see rewriteObject_); read back as an inspection it would double the round. */
  var sidecars = all.filter(function (f) {
    return /\.json$/i.test(f.name) && f.updated > after &&
           f.path.indexOf(INDEX_DIR + '/') !== 0 &&
           f.path.indexOf(META_DIR + '/backup/') !== 0;
  }).sort(function (a, b) { return a.updated - b.updated; });

  var records = [], edits = [], conflicts = [], deleted = [], deferrals = [],
      read = 0, bad = 0, truncated = false;
  var cursor = after;
  var badKeys = [];
  for (var i = 0; i < sidecars.length; i++) {
    if (read >= max || new Date().getTime() - started > TIME_BUDGET_MS) { truncated = true; break; }
    var f = sidecars[i];
    try {
      var j = JSON.parse(DriveApp.getFileById(f.id).getBlob().getDataAsString());
      if (/\.edit\.json$/i.test(f.name) || (j && j.type === 'cm-record-edit')) {
        if (j && j.key) edits.push(j);
      } else if (/\.conflict\.json$/i.test(f.name) || (j && j.type === 'cm-record-conflict')) {
        if (j && j.key) conflicts.push(j);
      } else if (/\.defer\.json$/i.test(f.name) || (j && j.type === 'cm-round-deferred')) {
        /* A round somebody decided NOT to walk, and why. Not a record — the
           round did not happen — and not a correction either. It is the other
           half of the due list: without it the office sees a machine that is
           overdue and cannot tell "nobody went" from "it was on a low-loader". */
        if (j && j.u && j.t) deferrals.push({ u: j.u, t: j.t, until: j.until || null,
          why: j.why || '', whyKey: j.whyKey || '', by: j.by || '', at: j.at || '',
          cleared: j.cleared ? 1 : 0 });      // the office's cancel (GAS_SCAN_FIXES_V1)
      } else if (/\.deleted\.json$/i.test(f.name) || (j && j.type === 'cm-record-deleted')) {
        /* The round was deleted from the office. Its files are already gone, so
           this marker is the only thing left that says so — and a phone that
           never sees it goes on counting the unit as inspected for ever. It was
           being skipped here, which is why a machine deleted in the dashboard
           stayed on the due list. */
        if (j && j.key) deleted.push({ key: j.key, by: j.by || '', at: j.at || '' });
      } else if (!(j && j.type === 'cm-index-shard')) {
        var rs = (j && j.records) || [];
        for (var k = 0; k < rs.length; k++) { rs[k]._file = f.path; records.push(rs[k]); }
      }
      read++;
    } catch (err) {
      /* NAMED, not just counted — the same reason as function.js. A client
         that receives only a NUMBER has to add it to what it already knew,
         and an incremental read re-delivers the same unreadable file every
         time the cursor sits on it, so one bad document became a figure that
         climbed on every pull. A list can be de-duplicated by the reader. */
      bad++; if (badKeys.length < 200) badKeys.push(f.path || f.name);
    }
    cursor = f.updated;          // advance even on a bad file, or it blocks the queue
  }

  var out = { ok: true, records: records, edits: edits, conflicts: conflicts,
              deleted: deleted, deferrals: deferrals, read: read, failed: bad, failedKeys: badKeys,
              pending: Math.max(0, sidecars.length - read - bad),
              truncated: truncated, cursor: cursor, files: all.length,
              photos: all.filter(function (f) { return MEDIA_RE.test(f.name); }).length };
  // The client needs name -> id to fetch a photo later. Sending it here saves a
  // second call; index=0 turns it off when only the records are wanted.
  if (wantIndex) {
    out.index = all.filter(function (f) { return MEDIA_RE.test(f.name); })
                   .map(function (f) { return { name: f.name, id: f.id, size: f.size }; });
  }
  return out;
}
var MEDIA_RE = /\.(jpe?g|png|webp|mp4|mov)$/i;

/** Every file under the root, sub-folders included. `ext` filters by suffix.

    GAS_SAFETY_V1: PAGED. One reply holds at most `max` files (LIST_CAP by
    default) and stops early, at a folder boundary, before Apps Script's
    6-minute limit. When it stops it says truncated:true and gives `cursor`,
    the path of the next folder; ?action=list&cursor=<that> carries on from
    there, so a full listing is a few calls however big the folder gets. The
    order is the folder paths sorted, so a cursor means the same place on every
    call. A client that ignores the cursor gets exactly the first page, with
    truncated:true, as it always did. */
function listFiles_(sub, ext, cursor, max) {
  var cap = Math.min(Math.max(Number(max || 0) || LIST_CAP, 1), LIST_MAX);
  var wk = walkAll_(sub || '', { cap: cap, ms: TIME_BUDGET_MS, from: cursor || '', ext: ext });
  var out = { ok: true, count: wk.files.length, truncated: !!wk.w.cut, files: wk.files };
  if (wk.w.cut) out.cursor = wk.w.next;
  return out;
}
var LIST_CAP = 4000;         // files per page of ?action=list
var LIST_MAX = 20000;        // the most a caller may ask for in one page
/* The walk under every listing. `dirs` are the folders that answer to one
   path (duplicates of a name included, see foldersNamed_), `segs` that path.
   w = { cap, until, from: [segs] | null, ext, cut, next }. A folder's files are
   taken whole; the walk stops only BEFORE a folder, when the page is full or
   the clock has run out, and records that folder's path in w.next. Folders are
   visited in sorted path order (a folder before its sub-folders), so "every
   folder from this path on" is a well-defined rest-of-the-walk. */
function walk_(dirs, segs, out, w) {
  if (w.cut || segs.length > 5) return;
  var mine = !w.from || cmpSegs_(segs, w.from) >= 0;
  if (mine) {
    if (out.length >= w.cap || new Date().getTime() > w.until) { w.cut = true; w.next = segs.join('/'); return; }
    var prefix = segs.length ? segs.join('/') + '/' : '';
    dirs.forEach(function (dir) {
      var fs = dir.getFiles();
      while (fs.hasNext()) {
        var f = fs.next(), n = f.getName();
        if (!w.ext || n.toLowerCase().slice(-w.ext.length) === w.ext) {
          // updated drives the incremental read — see readRecords_
          out.push({ name: n, path: prefix + n, id: f.getId(), size: f.getSize(),
                     updated: f.getLastUpdated().getTime() });
        }
      }
    });
  }
  var kids = {}, names = [];
  dirs.forEach(function (dir) {
    var ds = dir.getFolders();
    while (ds.hasNext()) {
      var d = ds.next(), n = d.getName();
      if (!kids[n]) { kids[n] = []; names.push(n); }
      kids[n].push(d);
    }
  });
  names.sort();
  for (var i = 0; i < names.length; i++) {
    var cs = segs.concat([names[i]]);
    // a folder wholly before the cursor, and not on the way to it, is done
    if (w.from && cmpSegs_(cs, w.from) < 0 && !isPrefix_(cs, w.from)) continue;
    walk_(kids[names[i]], cs, out, w);
    if (w.cut) return;
  }
}
function cmpSegs_(a, b) {
  for (var i = 0; i < a.length && i < b.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}
function isPrefix_(a, b) {
  if (a.length > b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
/* Walk `sub` (every folder of that name, never creating one). opt = { cap, ms,
   from, ext }. Returns { files, w }; w.cut says the walk did not finish. */
function walkAll_(sub, opt) {
  var root = rootFolder_();
  // Every folder of the name, not the first: see foldersNamed_. A folder that
  // was never written to lists as empty rather than being created by a read.
  var dirs = sub ? folderPaths_(root, sub) : [root];
  var from = String(opt.from || '').split('/').filter(String);
  var w = { cap: opt.cap || LIST_CAP, until: new Date().getTime() + (opt.ms || TIME_BUDGET_MS),
            from: from.length ? from : null, ext: String(opt.ext || '').toLowerCase(), cut: false, next: '' };
  var files = [];
  if (dirs.length) walk_(dirs, [], files, w);
  return { files: files, w: w };
}

/* ── a round's own folders (GAS_SAFETY_V1) ───────────────────────────────────
   Every file of a round is filed by the phone under the folder pattern its
   destination carries, filled from the round itself (expandFolder in the app):
     {TYPE}/{UNIT}/{YYYY-MM-DD}   the default since 2026-09
     {TYPE}/{YYYY-MM}             the default before it
     {YYYY-MM}                    older still
   plus the root (a photograph added from the office) and _meta (the round's
   correction and conflict markers). Duplicate folders of one name are all
   read (folderPaths_), and nothing is created by asking. */
function roundDirs_(key) {
  var p = String(key || '').split('|');
  var out = [], root = rootFolder_();
  var add = function (path) {
    (path ? folderPaths_(root, path) : [root]).forEach(function (d) { out.push({ dir: d, path: path }); });
  };
  if (p.length === 3 && p[0] && /^\d{4}-\d{2}-\d{2}$/.test(p[1]) && p[2]) {
    var u = String(p[0]).toUpperCase(), ty = String(p[2]).toUpperCase(), ym = p[1].slice(0, 7);
    add(ty + '/' + u + '/' + p[1]);
    add(ty + '/' + ym);
    add(ym);
    add(META_DIR);
  }
  add('');
  return out;
}
/** The files directly in a round's folders, shaped as a listing entry. */
function roundFiles_(key) {
  var out = [];
  roundDirs_(key).forEach(function (d) {
    var prefix = d.path ? d.path + '/' : '';
    var fs = d.dir.getFiles();
    while (fs.hasNext()) {
      var f = fs.next();
      out.push({ name: f.getName(), path: prefix + f.getName(), id: f.getId(), size: f.getSize(),
                 updated: f.getLastUpdated().getTime() });
    }
  });
  return out;
}
/* One document for op:rewrite, by Drive id, by path, or by a round file's name.
   { hit } or { error, truncated }. Never a whole-tree walk unless the name is
   nothing this script can place, and a walk that did not finish is an error. */
function findObject_(key) {
  var root = rootFolder_(), entry = function (f, path) {
    return { name: f.getName(), path: path, id: f.getId(), size: f.getSize(), updated: f.getLastUpdated().getTime() };
  };
  if (key.indexOf('/') >= 0) {
    var segs = key.split('/').filter(String), base = segs.pop(), dir = segs.join('/');
    var dirs = folderPaths_(root, dir);
    for (var i = 0; i < dirs.length; i++) {
      var it = dirs[i].getFilesByName(base);
      if (it.hasNext()) return { hit: entry(it.next(), dir + '/' + base) };
    }
    return { hit: null };
  }
  var byId = null;
  try { byId = DriveApp.getFileById(key); } catch (err) { byId = null; }
  if (byId && underRoot_(byId)) return { hit: entry(byId, byId.getName()) };
  var rk = keyFromSidecar_(key.replace(/~[A-Za-z0-9_-]{1,12}(?=\.json$)/i, '')
                              .replace(/\.(edit|conflict)\.json$/i, '.json'));
  if (rk) {
    var fs = roundFiles_(rk);
    for (var j = 0; j < fs.length; j++) if (fs[j].name === key) return { hit: fs[j] };
  }
  var wk = walkAll_('', { cap: 1e9, ms: TIME_BUDGET_MS });
  for (var k = 0; k < wk.files.length; k++) if (wk.files[k].name === key) return { hit: wk.files[k] };
  if (wk.w.cut) return { truncated: true, error: 'The folder could not be listed in full in one request, so ' + key + ' was not found and nothing was changed. Try again.' };
  return { hit: null };
}

/* ── what an upload may write (GAS_SAFETY_V1) ────────────────────────────────
   The upload op is the phones' door and is public by design. It used to file
   anything anywhere, so one ordinary upload of _meta/deletions/x.deleted.json
   took a round off every screen with no admin password. _meta is the office's
   and the script's own shelf; an upload may put exactly these there:
     _meta/deferrals/<UNIT>_<TYPE>.defer.json  a round put off — the phone
                    (syncDefer, folder "_meta/deferrals") and the office (dfSave,
                    putDoc). Must be a cm-round-deferred document.
     _meta/diag/<DEV>_<stamp>.json             a phone's sync trace (sendTrace).
                    Must be a cm-sync-trace document.
     _meta/lube/master.json, _meta/lube/log/<stamp>_r<rev>.json
                    the lube master and its change log — LubeLink's sync on
                    PECHANKA (op batch through /cm-api) and the dashboard's own
                    editor (lube-master.js). Must be cm-lube-master /
                    cm-lube-change, and once DESK_KEY is set must carry it.
     _meta/wear/limits.json, _meta/wear/log/<stamp>_r<rev>.json   (WEAR_LIMITS_V1)
                    the office's measurement limits and their change log —
                    dashboard/wear-limits.js, through /cm-api. Must be
                    cm-wear-limits / cm-wear-change, and once DESK_KEY is set
                    must carry it.
   Everything else under _meta is written by this script itself (corrections,
   conflicts, deletions and their logs, backups, the index, push subscriptions)
   and an upload there is refused. Anywhere else, a file shaped like one of
   those markers — by its name or by its type — is refused too, because the
   readers below recognise markers wherever they sit. */
var MARKER_NAME_RE_ = /\.(edit|deleted|conflict|defer|rival|file)\.json$/i;
var MARKER_TYPES_ = { 'cm-record-edit': 1, 'cm-record-conflict': 1, 'cm-record-deleted': 1, 'cm-deletion': 1,
                      'cm-rival-deleted': 1, 'cm-file-deleted': 1, 'cm-round-deferred': 1, 'cm-index-shard': 1,
                      'cm-meta-digest': 1, 'cm-lube-master': 1, 'cm-lube-change': 1,
                      'cm-wear-limits': 1, 'cm-wear-change': 1 };
function uploadJson_(b) {
  try { return JSON.parse(Utilities.newBlob(Utilities.base64Decode(b.file)).getDataAsString()); }
  catch (err) { return undefined; }
}
function uploadRefused_(path, fileName, b) {
  var segs = String(path || '').split('/').filter(String);
  var top = (segs[0] || '').toLowerCase();
  var isJson = /\.json$/i.test(fileName);
  var j = isJson ? uploadJson_(b) : undefined;
  var type = (j && typeof j === 'object' && !Array.isArray(j)) ? String(j.type || '') : '';
  if (top === META_DIR.toLowerCase()) {
    var sub = segs.slice(1).map(function (s) { return s.toLowerCase(); }).join('/');
    if (sub === 'deferrals' && /\.defer\.json$/i.test(fileName) && type === 'cm-round-deferred' && j.u && j.t) return '';
    if (sub === 'diag' && isJson && !MARKER_NAME_RE_.test(fileName) && type === 'cm-sync-trace') return '';
    if ((sub === 'lube' && fileName === 'master.json' && type === 'cm-lube-master') ||
        (sub === 'lube/log' && isJson && !MARKER_NAME_RE_.test(fileName) && type === 'cm-lube-change')) {
      return deskOk_(b) ? '' : DESK_REFUSED_;
    }
    if ((sub === 'wear' && fileName === 'limits.json' && type === 'cm-wear-limits') ||
        (sub === 'wear/log' && isJson && !MARKER_NAME_RE_.test(fileName) && type === 'cm-wear-change')) {
      return deskOk_(b) ? '' : DESK_REFUSED_;
    }
    return 'Uploads into ' + META_DIR + '/ are refused except deferrals, phone diagnostics, the lube master and the wear limits ('
      + [META_DIR].concat(segs.slice(1)).concat([fileName]).join('/') + ')';
  }
  if (MARKER_NAME_RE_.test(fileName)) return 'A file named like an office marker cannot be uploaded (' + fileName + ')';
  if (type && MARKER_TYPES_[type]) return 'A ' + type + ' document cannot be uploaded outside ' + META_DIR + '/';
  return '';
}

/* ── the desk key (GAS_SAFETY_V1) ─────────────────────────────────────────────
   The /exec URL is public (every phone carries it), so anybody could correct,
   void or resolve a round with one request. Office changes reach this script
   only through PECHANKA's /cm-api, which adds `desk` to every body it forwards.
   Set the Script property DESK_KEY (Project Settings > Script properties) to
   the same value and these ops then need it. Not set: they behave as before,
   so deploying this version first changes nothing. The value is never logged,
   echoed or stored in the repository. Phone ops are never gated by it. */
var DESK_OPS_ = { edit: 1, resolve: 1, rewrite: 1, 'delete': 1, delfile: 1 };
var DESK_REFUSED_ = 'office changes go through maintenance.vegadevelopment.com';
function deskKey_() {
  try { return String(PropertiesService.getScriptProperties().getProperty('DESK_KEY') || ''); }
  catch (err) { return ''; }
}
function deskOk_(b) {
  var want = deskKey_();
  if (!want) return true;
  var got = String((b && b.desk) || '');
  if (got.length !== want.length) return false;
  var diff = 0;
  for (var i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

function readFile_(id) {
  if (!id) return { ok: false, error: 'Missing file id' };
  /* GAS_SAFETY_V1: a path under the root ("_meta/lube/master.json") as well as
     a Drive id, so phones and desks read the LubeLink master here too. Read
     only; ".." and absolute paths are refused. "not found" is answered only
     when the folders were read and the file is not in them — the phone takes
     that answer as "no master" and drops its copy. */
  if (String(id).indexOf('/') >= 0) {
    var p = String(id);
    var segs = p.split('/');
    if (p.charAt(0) === '/' || /^[A-Za-z]:/.test(p) || p.indexOf('\\') >= 0 ||
        segs.some(function (s) { return s === '..' || s === '.'; }) || segs.some(function (s) { return s === ''; }))
      return { ok: false, error: 'Bad path: ' + p };
    var base = segs.pop(), best = null;
    folderPaths_(rootFolder_(), segs.join('/')).forEach(function (d) {
      var it = d.getFilesByName(base);
      while (it.hasNext()) {
        var c = it.next();
        if (!best || c.getLastUpdated().getTime() > best.getLastUpdated().getTime()) best = c;
      }
    });
    if (!best) return { ok: false, error: 'Not found: ' + p };
    var pb = best.getBlob();
    return { ok: true, name: best.getName(), mime: pb.getContentType(),
             data: Utilities.base64Encode(pb.getBytes()) };
  }
  var f = DriveApp.getFileById(id);
  // Never hand back something outside the configured folder, even with a valid id.
  if (!underRoot_(f)) return { ok: false, error: 'That file is not inside the configured folder' };
  var b = f.getBlob();
  return { ok: true, name: f.getName(), mime: b.getContentType(),
           data: Utilities.base64Encode(b.getBytes()) };
}

/** Walk parents up to the root folder — Drive files can have more than one. */
function underRoot_(file) {
  var rootId = rootId_(), seen = {}, stack = [];
  var it = file.getParents();
  while (it.hasNext()) stack.push(it.next());
  for (var guard = 0; stack.length && guard < 300; guard++) {
    var f = stack.pop(), fid = f.getId();
    if (fid === rootId) return true;
    if (seen[fid]) continue;
    seen[fid] = 1;
    var ps = f.getParents();
    while (ps.hasNext()) stack.push(ps.next());
  }
  return false;
}

/**
 * RUN THIS ONCE from the editor (Run ▸ setup) before deploying.
 * It forces Google to ask for Drive permission — the web app cannot ask on your
 * behalf, so without this every DriveApp call fails with the unhelpful
 * "Unexpected error while getting the method or property getFolderById".
 */
function setup() {
  var r = diagnose_();
  Logger.log(JSON.stringify(r, null, 2));
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** Tells apart the three ways this normally goes wrong. */
function diagnose_() {
  var raw = String(ROOT_FOLDER_ID || '').trim();
  if (!raw || raw.indexOf('PASTE_') === 0) {
    return { ok: false, error: 'ROOT_FOLDER_ID is still the placeholder. Paste your Drive ' +
      'folder id (or its URL) into the script, then Deploy > Manage deployments > edit > ' +
      'Version: New version.' };
  }
  var id = folderId_(raw);
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    return { ok: false, id: id, error: 'That does not look like a folder id: "' + id +
      '". Open the folder in Drive and copy the part after /folders/.' };
  }
  try {
    var f = DriveApp.getFolderById(id);
    // Whether deletion is switched on, so the dashboard can say which it is
    // instead of offering a password box that can never be satisfied. The
    // secret itself never leaves the script — only whether one is set.
    // `wearLimits` says this version accepts _meta/wear/ (WEAR_LIMITS_V1), so a
    // plain GET of /exec shows whether the redeploy happened.
    return { ok: true, service: 'Condition Monitoring upload', folder: f.getName(), id: id,
             canDelete: !!ADMIN_SECRET, wearLimits: 1, version: SCRIPT_VERSION };
  } catch (err) {
    return { ok: false, id: id, error: 'Could not open that folder. Either (a) the script has ' +
      'not been authorised for Drive — open the editor, Run > setup, click Allow, then deploy a ' +
      'NEW VERSION; or (b) the id is wrong / the folder is not yours. Google said: ' +
      String((err && err.message) || err) };
  }
}

/** Accepts a bare id, a full Drive URL, or an id with ?usp=... stuck to it. */
function folderId_(s) {
  s = String(s || '').trim();
  var m = s.match(/\/folders\/([-\w]+)/);   if (m) return m[1];
  m = s.match(/[?&]id=([-\w]+)/);            if (m) return m[1];
  return s.split('?')[0].split('#')[0].replace(/\/+$/, '');
}

/* diagnose_() opens the folder to check it, so calling it per file — as
   underRoot_ used to — turned every photo fetch into three Drive round trips.
   One invocation only ever serves one request, so caching for its lifetime is
   safe and there is nothing to invalidate. */
var ROOT_CACHE = null;
function rootFolder_() {
  if (!ROOT_CACHE) {
    var d = diagnose_();
    if (!d.ok) throw new Error(d.error);
    ROOT_CACHE = { id: d.id, folder: DriveApp.getFolderById(d.id) };
  }
  return ROOT_CACHE.folder;
}
function rootId_() { rootFolder_(); return ROOT_CACHE.id; }

/* ONE NAME, SEVERAL FOLDERS. Drive allows two folders of one name side by
   side, and this tree has a second writer: Pechanka fills the same root
   (CM_backup_Pechanka) and creates a folder when it cannot find one. On
   2026-10-20 it made a second INSP/TK112, getFoldersByName then handed the
   two back in no fixed order, and one phone's round of 26 files went half
   into each; action=list read the first folder only and answered 13. Two
   uploads arriving together can make the same pair here too. So a write
   always picks the OLDEST folder of a name (every writer of this script
   converges on one), a folder this request just made gives way to an older
   one that appeared beside it, and a reader reads every folder of a name. */
function foldersNamed_(dir, part) {
  var out = [], it = dir.getFoldersByName(part);
  while (it.hasNext()) out.push(it.next());
  var born = function (f) { try { return f.getDateCreated().getTime(); } catch (err) { return 0; } };
  out.sort(function (a, b) {
    return (born(a) - born(b)) || (String(a.getId()) < String(b.getId()) ? -1 : 1);
  });
  return out;
}
function emptyFolder_(f) {
  try { return !f.getFiles().hasNext() && !f.getFolders().hasNext(); } catch (err) { return false; }
}

/** "2026-07" or "2026/07/TK146" → the matching folder, creating what's missing. */
function folderPath_(root, path) {
  return String(path).split('/').filter(String).reduce(function (dir, part) {
    var have = foldersNamed_(dir, part);
    if (have.length) return have[0];
    var made = dir.createFolder(part);
    var now = foldersNamed_(dir, part);
    if (now.length > 1 && now[0].getId() !== made.getId()) {
      // Someone made one first. Ours is empty; leave it to them.
      if (emptyFolder_(made)) { try { made.setTrashed(true); } catch (err) { /* harmless */ } }
      return now[0];
    }
    return made;
  }, root);
}

/** Every folder that answers to `path` — duplicates at any level included.
    Never creates anything: a path nobody wrote to yet is an empty list. */
function folderPaths_(root, path) {
  return String(path).split('/').filter(String).reduce(function (dirs, part) {
    var next = [];
    dirs.forEach(function (d) { next = next.concat(foldersNamed_(d, part)); });
    return next;
  }, [root]);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
