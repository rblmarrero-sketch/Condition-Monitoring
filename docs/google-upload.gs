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
 *  Deleting moves files to Drive's TRASH (recoverable for 30 days) and writes a
 *  log entry saying what went, when, and why. Nothing is ever purged outright. */
const ADMIN_SECRET = '';

/** Where the audit trail and the dashboard's edits live, inside ROOT_FOLDER_ID. */
const META_DIR = '_meta';
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
    if (b.op === 'edit')    return json(saveEdit_(b));
    if (b.op === 'delete')  return json(deleteRecord_(b));
    if (b.op === 'resolve') return json(resolveConflict_(b));

    if (!b.name) return json({ ok: false, error: 'Missing file name' });
    if (!b.file) return json({ ok: false, error: 'Missing file content' });

    // A name may carry its own sub-path ("2026-07/TK146_...jpg") — honour it.
    var parts = String(b.name).split('/').filter(String);
    var fileName = parts.pop();
    var path = [String(b.folder || '')].concat(parts).filter(String).join('/');

    var root = rootFolder_();
    var dir = path ? folderPath_(root, path) : root;

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

    var out = { ok: true, id: f.getId(), name: f.getName(), url: f.getUrl(), folder: dir.getName() };
    if (plan.rival) {
      out.kept = true;                       // "we did not overwrite the other phone"
      if (isSidecar_(wanted)) {
        var c = markConflict_(wanted, plan.rival, dev);
        if (c) { out.conflict = c.key; out.devices = c.devices; }
      }
    }
    return json(out);

  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
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
    if (p.action === 'list') return json(listFiles_(p.folder || '', p.ext || ''));
    if (p.action === 'file') return json(readFile_(p.id));
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
  var dir = folderPath_(rootFolder_(), META_DIR);
  var doc = {
    type: 'cm-record-edit', version: 1,
    key: b.key,
    at: new Date().toISOString(),
    by: String(b.by || '').slice(0, 80),
    void: !!b.void,
    reason: String(b.reason || '').slice(0, 400),
    note: String(b.note || '').slice(0, 2000),
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

  return { ok: true, deleted: gone.length, files: gone, trashed: true };
}
function esc_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

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
  var sidecars = all.filter(function (f) { return /\.json$/i.test(f.name) && f.updated > after; })
                    .sort(function (a, b) { return a.updated - b.updated; });

  var records = [], edits = [], conflicts = [], read = 0, bad = 0, truncated = false;
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
      } else if (!/\.deleted\.json$/i.test(f.name)) {
        var rs = (j && j.records) || [];
        for (var k = 0; k < rs.length; k++) { rs[k]._file = f.path; records.push(rs[k]); }
      }
      read++;
    } catch (err) { bad++; }
    cursor = f.updated;          // advance even on a bad file, or it blocks the queue
  }

  var out = { ok: true, records: records, edits: edits, conflicts: conflicts, read: read, failed: bad,
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
    return { ok: true, service: 'Condition Monitoring upload', folder: f.getName(), id: id };
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
