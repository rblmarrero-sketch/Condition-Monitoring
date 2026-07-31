/**
 * Condition Monitoring — Google Drive upload endpoint (Google Apps Script).
 *
 * Paste this whole file into a new Apps Script project, set ROOT_FOLDER_ID below,
 * then Deploy → New deployment → Web app → Execute as "Me", Who has access "Anyone".
 * Copy the /exec URL into the Field Capture app (⚙ → Upload mode: Google Drive).
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

/** Opening the /exec URL in a browser is a health check. */
function doGet() {
  return json(diagnose_());
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

function rootFolder_() {
  var d = diagnose_();
  if (!d.ok) throw new Error(d.error);
  return DriveApp.getFolderById(d.id);
}

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
