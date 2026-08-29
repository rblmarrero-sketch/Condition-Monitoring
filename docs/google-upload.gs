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
const ROOT_FOLDER_ID = '1aeTSn7FWw9Zh8Xv6SNsdc6mC77MLcsSa?usp=sharing';

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
                                          index: true, media: MEDIA_MAX, at: indexAt_() });

    if (b.op === 'edit')    return json(saveEdit_(b));
    if (b.op === 'delete')  return json(deleteRecord_(b));
    if (b.op === 'delfile') return json(deleteFile_(b));
    if (b.op === 'resolve') return json(resolveConflict_(b));

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
  var dev = cleanDev_(b.dev);
  var plan = placeUpload_(dir, fileName, dev);
  var wanted = fileName;
  fileName = plan.name;

  var blob = Utilities.newBlob(
    Utilities.base64Decode(b.file),
    b.contentType || 'application/octet-stream',
    fileName
  );

  // Re-sending a record (after an edit, or a retry) must overwrite, not pile up
  // "TK146_… (1).jpg" copies next to the original. placeUpload_ has already
  // made sure this name belongs to us, so what we overwrite is our own.
  var existing = dir.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);

  var f = dir.createFile(blob);
  // Who uploaded it, so the next phone to send this name can tell whether it is
  // overwriting its own work or someone else's. Kept out of the bytes so the
  // file itself is untouched, and out of the name so nothing has to parse it.
  if (dev) { try { f.setDescription('cm-dev:' + dev); } catch (err) { /* not fatal */ } }

  /* `req` is the name the phone ASKED for, which is not always the name on
     Drive — placeUpload_ renames when another phone already owns that name. The
     phone marks off what has landed by the name it sent, so without this a
     renamed file would look like one that never arrived and be sent again for
     ever. */
  var out = { ok: true, req: b.name, id: f.getId(), name: f.getName(), url: f.getUrl(), folder: dir.getName() };

  /* The round is on Drive; now make it findable without anyone having to open
     it. This is the only place a record enters the folder, and the JSON is
     already decoded in `blob` — so the index is maintained for the cost of the
     shard write alone, and no read anywhere else ever has to walk the folder
     to discover this round exists. */
  if (isSidecar_(fileName)) {
    try {
      /* Read it back off the file that was just written, not off the blob that
         was handed to createFile. Indexing what actually landed is the only
         version worth indexing — and a blob built in memory is not guaranteed
         to be readable as text on every runtime. One Drive operation, once per
         round, against the hundreds it saves every reader. */
      var side = JSON.parse(f.getBlob().getDataAsString());
      var rs = (side && side.records) || [];
      for (var si = 0; si < rs.length; si++) {
        if (!rs[si]) continue;
        rs[si]._file = (path ? path + '/' : '') + fileName;
        rs[si]._id = f.getId();
        indexPut_(rs[si], f.getId(), dev);
      }
    } catch (err) { /* not our shape — the file still stands, ?rebuild reconciles */ }
  }

  if (plan.rival) {
    out.kept = true;                       // "we did not overwrite the other phone"
    if (isSidecar_(wanted)) {
      var c = markConflict_(wanted, plan.rival, dev);
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
    if (p.action === 'list') return json(listFiles_(p.folder || '', p.ext || ''));
    if (p.action === 'file') return json(readFile_(p.id));
    if (p.action === 'files') return json(readFiles_(p.ids));
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

function saveEdit_(b) {
  var name = keyFile_(b.key, '.edit.json');
  if (!name) return { ok: false, error: 'Bad record key: ' + b.key };
  indexTouch_();               // a correction is a change; clients must come and look
  var dir = folderPath_(rootFolder_(), META_DIR);
  var doc = {
    type: 'cm-record-edit', version: 1,
    key: b.key,
    at: new Date().toISOString(),
    by: String(b.by || '').slice(0, 80),
    void: !!b.void,
    reason: String(b.reason || '').slice(0, 400),
    note: String(b.note || '').slice(0, 2000),
    /* Round-level corrections — the hour meter, who walked it, who verified
       it. The other backend has had this slot since it was written and this
       one did not, so a correction to an hour meter saved here vanished with
       no error. NOT the unit, the date or the round type: those three ARE the
       record's identity, and changing one would leave this marker filed
       against a round that no longer exists. */
    fields: (b.fields && typeof b.fields === 'object') ? b.fields : {},
    /* THE ROUND WAS FILED AGAINST THE WRONG MACHINE, DAY OR ROUND. Not a field
       edit — the three of them ARE the record's filing address, so this marker
       stays filed under the address the round arrived with and names where it
       should read instead. A re-read of the folder then re-applies the move
       instead of undoing it. null puts the round back. */
    move: (b.move && typeof b.move === 'object') ? b.move : null,
    /* Both of these were written by the dashboard and thrown away here. The
       save succeeded, the panel said so, and the crop or the issued report was
       gone the next time the folder was read. */
    media: (b.media && typeof b.media === 'object') ? b.media : null,
    /* Orphan-photograph assignments, keyed by file name — see the note in the
       Yandex function. */
    assign: (b.assign && typeof b.assign === 'object') ? b.assign : null,
    reports: (b.reports && b.reports.length) ? b.reports.slice(-20) : null,
    items: (b.items && typeof b.items === 'object') ? b.items : {},
  };
  var old = dir.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);      // one marker per record
  dir.createFile(Utilities.newBlob(JSON.stringify(doc, null, 2), 'application/json', name));
  return { ok: true, saved: name, at: doc.at };
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
function isSidecar_(name) {
  return /\.json$/i.test(name) && !/\.(edit|deleted|conflict)\.json$/i.test(name);
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
  indexTouch_();      // two versions of one round is the most urgent kind of news
  var key = keyFromSidecar_(sidecarName);
  if (!key) return null;
  var name = sidecarName.replace(/\.json$/i, '') + '.conflict.json';
  var meta = folderPath_(rootFolder_(), META_DIR);

  var doc = null, it = meta.getFilesByName(name);
  if (it.hasNext()) { try { doc = JSON.parse(it.next().getBlob().getDataAsString()); } catch (err) { doc = null; } }

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
  var old = meta.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  meta.createFile(Utilities.newBlob(JSON.stringify(out, null, 2), 'application/json', name));
  return { key: key, devices: devices };
}
/* The office's decision. Both versions stay in Drive — this only records which
   one the reports should use, so it is as reversible as a void. */
function resolveConflict_(b) {
  indexTouch_();     // the office has decided; every phone must stop warning
  var stem = keyFile_(b.key, '');
  if (!stem) return { ok: false, error: 'Bad record key: ' + b.key };
  var name = stem + '.conflict.json';
  var meta = folderPath_(rootFolder_(), META_DIR);
  var it = meta.getFilesByName(name);
  if (!it.hasNext()) return { ok: false, error: 'No conflict recorded for ' + b.key };

  var doc;
  try { doc = JSON.parse(it.next().getBlob().getDataAsString()); }
  catch (err) { return { ok: false, error: 'The conflict marker for ' + b.key + ' is unreadable' }; }

  var keep = cleanDev_(b.keep), devices = doc.devices || [], ok = false;
  for (var i = 0; i < devices.length; i++) if (devices[i].dev === keep) ok = true;
  if (!ok) return { ok: false, error: 'No version from device ' + (keep || '(blank)') + ' for ' + b.key };

  doc.resolved = true;
  doc.keep = keep;
  doc.by = String(b.by || '').slice(0, 80);
  doc.at = new Date().toISOString();
  var old = meta.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  meta.createFile(Utilities.newBlob(JSON.stringify(doc, null, 2), 'application/json', name));
  return { ok: true, key: doc.key, keep: keep, at: doc.at };
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

  var all = [];
  collect_(rootFolder_(), '', all, 0, '');
  var hit = all.filter(function (f) { return re.test(f.name); });
  if (!hit.length) return { ok: false, error: 'Nothing found for ' + b.key };

  var gone = [];
  for (var i = 0; i < hit.length; i++) {
    try { DriveApp.getFileById(hit[i].id).setTrashed(true); gone.push(hit[i].path); }
    catch (err) { /* already gone — not a failure */ }
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

  indexDrop_(b.key);          // or the list keeps offering a round that is gone
  indexTouch_();              // even if it was never indexed, this IS a change
  return { ok: true, deleted: gone.length, files: gone, trashed: true };
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

  var hit = [];
  (function take(it) { while (it.hasNext()) { var f = it.next();
    if (f.getName() === name) hit.push(f); } })(rootFolder_().getFiles());
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

/** One shard, read whole. 2 Drive operations, or 1 if it does not exist yet. */
function shardRead_(dir, name) {
  var it = dir.getFilesByName(name + '.json');
  if (!it.hasNext()) return { records: [], file: null };
  var f = it.next();
  try {
    var j = JSON.parse(f.getBlob().getDataAsString());
    return { records: (j && j.records) || [], file: f };
  } catch (err) { return { records: [], file: f }; }   // corrupt shard rebuilds itself below
}
function shardWrite_(dir, name, records) {
  var body = JSON.stringify({ type: 'cm-index-shard', version: INDEX_V,
                              at: new Date().getTime(), n: records.length, records: records });
  var blob = Utilities.newBlob(body, 'application/json', name + '.json');
  var it = dir.getFilesByName(name + '.json');
  while (it.hasNext()) it.next().setTrashed(true);
  return dir.createFile(blob);
}

/* A round has landed. Put it in its shard.

   Called from saveOne_, which has just decoded this exact JSON in order to
   write it — so the record costs nothing to obtain. The lock matters: two
   phones finishing a round in the same second would otherwise read the same
   shard, each add their own round, and the second write would lose the first.
   A lock that cannot be taken is not a reason to fail the upload; the file is
   on Drive either way and a rebuild puts the index right. */
function indexPut_(rec, fileId, dev) {
  if (!rec || !rec.equip || !rec.date) return;
  /* Which phone sent it. Usually inside the record, but a client that leaves it
     out still sends it alongside the upload — and without it two phones' copies
     of one round key the same, so the second silently replaces the first in the
     index while both files sit in the folder. */
  if (!rec.dev && dev) rec = Object.assign({}, rec, { dev: dev });
  var lock = null;
  try { lock = LockService.getScriptLock(); lock.waitLock(20000); } catch (err) { lock = null; }
  try {
    var dir = folderPath_(rootFolder_(), INDEX_DIR);
    var name = shardOf_(rec.date);
    var cur = shardRead_(dir, name);
    var key = RECKEY_(rec), out = [], put = false;
    for (var i = 0; i < cur.records.length; i++) {
      if (RECKEY_(cur.records[i]) === key) { if (put) continue; out.push(rec); put = true; }
      else out.push(cur.records[i]);
    }
    if (!put) out.push(rec);
    shardWrite_(dir, name, out);
    indexTouch_();
  } catch (err) {
    // Never fail an upload because the index could not be updated. The bytes
    // are safe on Drive; ?action=index&rebuild=1 reconciles.
  } finally { if (lock) { try { lock.releaseLock(); } catch (err2) {} } }
}
/** A round has been deleted. Take it out, so the list stops offering it. */
function indexDrop_(key) {
  var p = String(key || '').split('|');
  if (p.length !== 3) return;
  var lock = null;
  try { lock = LockService.getScriptLock(); lock.waitLock(20000); } catch (err) { lock = null; }
  try {
    var dir = folderPath_(rootFolder_(), INDEX_DIR);
    var name = shardOf_(p[1]);
    var cur = shardRead_(dir, name);
    // Deleting a round deletes every version of it — both phones' — the same
    // way the file sweep below does. Keyed without the device for that reason.
    var want = p[0].toUpperCase() + '|' + p[1] + '|' + p[2], out = [];
    for (var i = 0; i < cur.records.length; i++)
      if (ROUNDKEY_(cur.records[i]) !== want) out.push(cur.records[i]);
    if (out.length !== cur.records.length) { shardWrite_(dir, name, out); indexTouch_(); }
  } catch (err) { /* as above */ }
  finally { if (lock) { try { lock.releaseLock(); } catch (err2) {} } }
}

/* The summary a phone needs, and nothing else.

   "In the system" wants who did what, when, and how bad — six fields. Sending
   the whole record to answer that is sending a megabyte to draw a list. Built
   here from the shard already in memory, so it costs nothing to offer both. */
var GRADE_RANK_ = { A: 0, B: 1, C: 2, X: 3 };
function slimRow_(r) {
  var worst = '', base = [];
  var items = r.items || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {}, g = it.grade;
    if (GRADE_RANK_[g] != null && (worst === '' || GRADE_RANK_[g] > GRADE_RANK_[worst])) worst = g;
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
  var shards = [];
  while (it.hasNext()) {
    var f = it.next();
    if (!/\.json$/i.test(f.getName())) continue;
    shards.push({ f: f, name: f.getName(), updated: f.getLastUpdated().getTime() });
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

  var recs = [], read = 0, bytes = 0, truncated = false, cursor = since;
  var budget = slim ? INDEX_SLIM_BYTES : INDEX_FULL_BYTES;
  for (var i = 0; i < shards.length; i++) {
    if (since && shards[i].updated <= since) continue;      // untouched month
    if (bytes > budget) { truncated = true; break; }
    read++;
    try {
      var raw = shards[i].f.getBlob().getDataAsString();
      bytes += raw.length;
      var j = JSON.parse(raw);
      var rs = (j && j.records) || [];
      for (var k = 0; k < rs.length; k++) recs.push(rs[k]);
    } catch (err) { /* one bad shard must not lose the others */ }
    cursor = shards[i].updated;
  }

  var out = { ok: true, v: INDEX_V, at: at || new Date().getTime(),
              shards: shards.length, readShards: read, n: recs.length };
  if (truncated) { out.truncated = true; out.cursor = cursor; }
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
  var edits = [], conflicts = [], deleted = [], deferrals = [];
  var take = function (it) {
    while (it.hasNext()) {
      var f = it.next(), n = f.getName();
      if (!/\.(edit|conflict|deleted|defer)\.json$/i.test(n)) continue;
      if (since && f.getLastUpdated().getTime() <= since) continue;
      try {
        var j = JSON.parse(f.getBlob().getDataAsString());
        /* A deferral is keyed by unit and round, not by a round key — it is
           about a round that has not happened and so has none. */
        if (!j || (!j.key && !(j.u && j.t))) continue;
        if (/\.conflict\.json$/i.test(n)) conflicts.push(j);
        else if (/\.deleted\.json$/i.test(n)) deleted.push({ key: j.key, by: j.by || '', at: j.at || '' });
        else if (/\.defer\.json$/i.test(n)) deferrals.push({ u: j.u, t: j.t, until: j.until || null,
          why: j.why || '', by: j.by || '', at: j.at || '' });
        else edits.push(j);
      } catch (err) { /* skip */ }
    }
  };
  try { take(folderPath_(rootFolder_(), META_DIR).getFiles()); } catch (err) { /* no _meta yet */ }
  /* Deletion markers are filed in _meta/deletions, one per round and stamped,
     because a round can be deleted more than once over its life and one file
     per key would lose the earlier one. A reader that lists only _meta itself
     finds none of them — which is exactly how this shipped not working. */
  try { take(folderPath_(rootFolder_(), META_DIR + '/deletions').getFiles()); } catch (err) { /* none yet */ }
  /* The phones file theirs here — see syncDefer() in the app. */
  try { take(folderPath_(rootFolder_(), META_DIR + '/deferrals').getFiles()); } catch (err) { /* none yet */ }
  return { edits: edits, conflicts: conflicts, deleted: deleted, deferrals: deferrals };
}

/* Build the index for a folder that predates it.

   This is the expensive read the index exists to abolish, run once. It is
   resumable on purpose: 900 rounds is more Drive operations than one execution
   is allowed, so it returns where it got to and the client calls again. */
var INDEX_FULL_BYTES = 6 * 1024 * 1024;   // ContentService will not carry much more
var INDEX_SLIM_BYTES = 24 * 1024 * 1024;  // ~90 bytes a round: a decade of them
var REBUILD_MAX = 250;
function rebuildIndex_(p) {
  var started = new Date().getTime();
  var after = Number(p.after || 0) || 0;
  var all = [];
  collect_(rootFolder_(), '', all, 0, '');
  var sidecars = all.filter(function (f) {
    return isSidecar_(f.name) && f.path.indexOf(META_DIR + '/') !== 0 && f.updated > after;
  }).sort(function (a, b) { return a.updated - b.updated; });

  var dir = folderPath_(rootFolder_(), INDEX_DIR);
  var open = {}, order = [], done = 0, cursor = after, more = false;
  for (var i = 0; i < sidecars.length; i++) {
    if (done >= REBUILD_MAX || new Date().getTime() - started > 200000) { more = true; break; }
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

  // Merge each touched shard once, at the end — not once per record.
  for (var s = 0; s < order.length; s++) {
    var name = order[s], cur = shardRead_(dir, name), map = {}, keep = [];
    for (var c = 0; c < cur.records.length; c++) map[RECKEY_(cur.records[c])] = cur.records[c];
    for (var kk in open[name]) map[kk] = open[name][kk];
    for (var mk in map) keep.push(map[mk]);
    shardWrite_(dir, name, keep);
  }
  indexTouch_();
  /* Only when the walk actually finished. A rebuild that stopped for time is a
     rebuild that has not covered the folder, and marking it done would leave
     every reader looking at half of it. */
  if (!more) {
    try { PropertiesService.getScriptProperties().setProperty(INDEX_BUILT, '1'); } catch (err) {}
  }
  return { ok: true, building: more, done: done, cursor: cursor,
           pending: Math.max(0, sidecars.length - done), shards: order.length, at: indexAt_() };
}

/* Several files in one reply.

   The dashboard opens a unit and wants its photographs. One invocation each
   meant five round trips and five script starts for five thumbnails; the pool
   that limits it to five at a time exists precisely because that is expensive.
   Asked for together they cost one. */
var MEDIA_MAX = 8;
function readFiles_(ids) {
  var list = String(ids || '').split(',').filter(String).slice(0, MEDIA_MAX);
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

function readRecords_(p) {
  var started = new Date().getTime();
  var after = Number(p.after || 0) || 0;
  var max = Math.min(Number(p.max || 0) || RECORDS_MAX, 2000);
  var wantIndex = String(p.index == null ? '1' : p.index) !== '0';

  var all = [];
  collect_(rootFolder_(), '', all, 0, '');

  // Oldest first, so a truncated run resumes cleanly from its cursor. Records
  // and correction markers share one cursor: they interleave by write time, and
  // two cursors would let an edit arrive before the record it corrects.
  /* The index shards are .json files under _meta/index, and their shape is a
     records array — so the old filter read them back as inspections and every
     round arrived twice. Nothing errors when that happens; the fleet simply
     doubles. The type check below is the belt to this braces. */
  var sidecars = all.filter(function (f) {
    return /\.json$/i.test(f.name) && f.updated > after &&
           f.path.indexOf(INDEX_DIR + '/') !== 0;
  }).sort(function (a, b) { return a.updated - b.updated; });

  var records = [], edits = [], conflicts = [], deleted = [], deferrals = [],
      read = 0, bad = 0, truncated = false;
  var cursor = after;
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
          why: j.why || '', by: j.by || '', at: j.at || '' });
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
    } catch (err) { bad++; }
    cursor = f.updated;          // advance even on a bad file, or it blocks the queue
  }

  var out = { ok: true, records: records, edits: edits, conflicts: conflicts,
              deleted: deleted, deferrals: deferrals, read: read, failed: bad,
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

/** Every file under the root, sub-folders included. `ext` filters by suffix. */
function listFiles_(sub, ext) {
  var root = rootFolder_();
  var dir = sub ? folderPath_(root, sub) : root;
  var out = [];
  collect_(dir, '', out, 0, String(ext || '').toLowerCase());
  return { ok: true, count: out.length, truncated: out.length >= LIST_CAP, files: out };
}
var LIST_CAP = 4000;
function collect_(dir, prefix, out, depth, ext) {
  if (depth > 5 || out.length >= LIST_CAP) return;
  var fs = dir.getFiles();
  while (fs.hasNext() && out.length < LIST_CAP) {
    var f = fs.next(), n = f.getName();
    if (!ext || n.toLowerCase().slice(-ext.length) === ext) {
      // updated drives the incremental read — see readRecords_
      out.push({ name: n, path: prefix + n, id: f.getId(), size: f.getSize(),
                 updated: f.getLastUpdated().getTime() });
    }
  }
  var ds = dir.getFolders();
  while (ds.hasNext()) {
    var d = ds.next();
    collect_(d, prefix + d.getName() + '/', out, depth + 1, ext);
  }
}

function readFile_(id) {
  if (!id) return { ok: false, error: 'Missing file id' };
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
    return { ok: true, service: 'Condition Monitoring upload', folder: f.getName(), id: id,
             canDelete: !!ADMIN_SECRET };
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

/** "2026-07" or "2026/07/TK146" → the matching folder, creating what's missing. */
function folderPath_(root, path) {
  return String(path).split('/').filter(String).reduce(function (dir, part) {
    var it = dir.getFoldersByName(part);
    return it.hasNext() ? it.next() : dir.createFolder(part);
  }, root);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
