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
/** The Drive folder everything lands in. Open the folder in Drive and copy the
 *  last part of the URL: drive.google.com/drive/folders/<THIS_BIT> */
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

    var dir = path ? folderPath_(DriveApp.getFolderById(ROOT_FOLDER_ID), path)
                   : DriveApp.getFolderById(ROOT_FOLDER_ID);

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
  try {
    var f = DriveApp.getFolderById(ROOT_FOLDER_ID);
    return json({ ok: true, service: 'Condition Monitoring upload', folder: f.getName() });
  } catch (err) {
    return json({ ok: false, error: 'ROOT_FOLDER_ID is not set or not accessible: ' +
                                    String((err && err.message) || err) });
  }
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
