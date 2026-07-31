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
const ROOT_FOLDER_ID = 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE';

/** Optional shared secret. Leave '' to accept any request that has the URL.
 *  If you set it, put the same value in the app's "Shared secret" field. */
const SECRET = '';
// ────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Empty request body' });
    }
    var b = JSON.parse(e.postData.contents);

    if (SECRET && b.secret !== SECRET) return json({ ok: false, error: 'Bad or missing secret' });
    if (!b.name) return json({ ok: false, error: 'Missing file name' });
    if (!b.file) return json({ ok: false, error: 'Missing file content' });

    // A name may carry its own sub-path ("2026-07/TK146_...jpg") — honour it.
    var parts = String(b.name).split('/').filter(String);
    var fileName = parts.pop();
    var path = [String(b.folder || '')].concat(parts).filter(String).join('/');

    var root = rootFolder_();
    var dir = path ? folderPath_(root, path) : root;

    var blob = Utilities.newBlob(
      Utilities.base64Decode(b.file),
      b.contentType || 'application/octet-stream',
      fileName
    );

    // Re-sending a record (after an edit, or a retry) must overwrite, not pile up
    // "TK146_… (1).jpg" copies next to the original.
    var existing = dir.getFilesByName(fileName);
    while (existing.hasNext()) existing.next().setTrashed(true);

    var f = dir.createFile(blob);
    return json({ ok: true, id: f.getId(), name: f.getName(), url: f.getUrl(), folder: dir.getName() });

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

  // Oldest first, so a truncated run resumes cleanly from its cursor.
  var sidecars = all.filter(function (f) { return /\.json$/i.test(f.name) && f.updated > after; })
                    .sort(function (a, b) { return a.updated - b.updated; });

  var records = [], read = 0, bad = 0, truncated = false;
  var cursor = after;
  for (var i = 0; i < sidecars.length; i++) {
    if (read >= max || new Date().getTime() - started > TIME_BUDGET_MS) { truncated = true; break; }
    var f = sidecars[i];
    try {
      var j = JSON.parse(DriveApp.getFileById(f.id).getBlob().getDataAsString());
      var rs = (j && j.records) || [];
      for (var k = 0; k < rs.length; k++) { rs[k]._file = f.path; records.push(rs[k]); }
      read++;
    } catch (err) { bad++; }
    cursor = f.updated;          // advance even on a bad file, or it blocks the queue
  }

  var out = { ok: true, records: records, read: read, failed: bad,
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
