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
    if (b.op === 'ping')    return json({ ok: true, write: true, batch: true,
                                          canDelete: !!ADMIN_SECRET, canOrganize: true,
                                          needsAdminToOrganize: !!ADMIN_SECRET });

    if (b.op === 'edit')    return json(saveEdit_(b));
    if (b.op === 'delete')  return json(deleteRecord_(b));
    if (b.op === 'resolve') return json(resolveConflict_(b));
    /* Re-shapes the folder into {TYPE}/{UNIT}/{YYYY-MM-DD}. Moves only — nothing
       is renamed, trashed or rewritten, and every reader matches on file names
       rather than paths, so this cannot change what the dashboard or the phones
       can see. See organize_ for why that is true. */
    if (b.op === 'organize') return json(organize_(b));

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
    if (p.action === 'list') return json(listFiles_(p.folder || '', p.ext || ''));
    /* One folder's photographs, by name and id. The global index in ?action=records
       is capped, and under {TYPE}/{UNIT}/{YYYY-MM-DD} a record's own folder is
       known from its sidecar path — so the dashboard can ask for exactly the unit
       it is showing instead of depending on the whole fleet fitting in one reply. */
    if (p.action === 'index') return json(indexFolder_(p.folder || ''));
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

/* ── tidying the folder ──────────────────────────────────────────────────────
   The layout has changed twice. Files uploaded by the earliest builds went to
   the root, then to {YYYY-MM}, then to {TYPE}/{YYYY-MM}; the phones now write
   {TYPE}/{UNIT}/{YYYY-MM-DD}, which is the one an actual person can navigate —
   pick the round, pick the machine, pick the day.

   Nothing depended on the layout, because every reader walks the whole tree and
   matches on file NAMES. That is exactly why the mess accumulated unnoticed, and
   it is also why this is safe: moving a file changes where a human finds it and
   nothing else. Nothing is renamed, nothing is trashed, no bytes are touched.

   Where a file belongs is read out of its own name — <UNIT>…<DD.MM.YYYY>_<TYPE>,
   the naming standard both ends have always used — so this needs no index, no
   record and no state. A name that does not follow the standard is LEFT ALONE
   and reported, never guessed at.

   Runs in batches against the 6-minute limit: call again while `remaining` is
   above zero. `dry:true` reports exactly what would move and moves nothing.
   ──────────────────────────────────────────────────────────────────────────*/
var ORG_MAX = 300;              // files moved per call
var ORG_BUDGET_MS = 240000;     // stop at 4 min — Apps Script kills us at 6

/* <UNIT>[_<KEY> | .<KEY>]_<DD.MM.YYYY>_<TYPE>[_<n> | _SIGN][~<DEVICE>].<ext>
   The register types write "TK151.DRS.ENG_…", everything else "TK151_4C_…", and
   a component's photographs are _1.._4. All of them start with the unit. */
var ORG_RE = /^(.+)_(\d{2})\.(\d{2})\.(\d{4})_([A-Za-z0-9]+)(?:_\d+|_SIGN)?(?:~[A-Za-z0-9_-]{1,12})?\.[A-Za-z0-9]+$/;

/** The folder this file belongs in, or '' when its name does not say. */
function homeFor_(name) {
  // Correction, conflict and deletion markers are addressed by path, not walked
  // for by name — they belong in _meta and moving them would break the readers.
  if (/\.(edit|conflict|deleted)\.json$/i.test(name)) return '';
  var m = ORG_RE.exec(name);
  if (!m) return '';
  var head = m[1], dd = m[2], mm = m[3], yyyy = m[4], type = m[5].toUpperCase();
  // The unit is the head up to the first separator: "TK151_4C" and
  // "TK151.DRS.ENG" are both TK151. Unit numbers carry neither "." nor "_".
  var cut = head.search(/[._]/);
  var unit = (cut < 0 ? head : head.slice(0, cut)).toUpperCase();
  if (!unit || !type) return '';
  // A date that cannot be one is a name that only looks like a file name.
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return '';
  return type + '/' + unit + '/' + yyyy + '-' + mm + '-' + dd;
}

/** Every file under the root with the folder it currently sits in. */
function walkWithDirs_(dir, prefix, out, depth) {
  if (depth > ORG_DEPTH) return;
  // _meta is the readers' fixed address. Never walk into it, never move out of it.
  if (prefix.indexOf(META_DIR + '/') === 0) return;
  var fs = dir.getFiles();
  while (fs.hasNext()) {
    var f = fs.next();
    out.push({ name: f.getName(), dir: prefix.replace(/\/$/, ''), file: f });
  }
  var ds = dir.getFolders();
  while (ds.hasNext()) {
    var d = ds.next(), n = d.getName();
    if (!prefix && n === META_DIR) continue;
    walkWithDirs_(d, prefix + n + '/', out, depth + 1);
  }
}
var ORG_DEPTH = 8;

function organize_(b) {
  /* Moving files is a write, so it needs the shared secret like every other
     POST. Where an admin password has been configured it is required too — a
     site that has bothered to set one has said it wants writes gated, and
     re-shaping the whole folder is not the exception to that. */
  if (ADMIN_SECRET && String(b.admin || '') !== ADMIN_SECRET)
    return { ok: false, error: 'Wrong admin password' };

  var dry = !!b.dry;
  var max = Math.min(Number(b.max || 0) || ORG_MAX, 1000);
  var started = new Date().getTime();
  var root = rootFolder_();

  var all = [];
  walkWithDirs_(root, '', all, 0);

  var moved = [], unknown = [], dirs = {};
  var todo = 0, done = 0, failed = 0, truncated = false;

  for (var i = 0; i < all.length; i++) {
    var f = all[i], home = homeFor_(f.name);
    if (!home) { if (unknown.length < 25) unknown.push(f.dir ? f.dir + '/' + f.name : f.name); continue; }
    if (f.dir === home) continue;                     // already where it belongs
    todo++;
    if (done >= max || new Date().getTime() - started > ORG_BUDGET_MS) { truncated = true; continue; }
    if (moved.length < 25) moved.push({ from: f.dir || '/', to: home, name: f.name });
    if (dry) { done++; continue; }
    try {
      var dest = dirs[home] || (dirs[home] = folderPath_(root, home));
      f.file.moveTo(dest);
      done++;
    } catch (err) { failed++; }
  }

  return { ok: true, dry: dry, scanned: all.length,
           moved: dry ? 0 : done, wouldMove: dry ? done : done,
           remaining: Math.max(0, todo - done), failed: failed,
           truncated: truncated || todo > done,
           samples: moved, unknown: unknown, unknownShown: unknown.length,
           layout: '{TYPE}/{UNIT}/{YYYY-MM-DD}' };
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
              /* The folder walk hit its ceiling: there are more files in Drive
                 than this reply has looked at, so some inspections are missing
                 and the client must say so rather than showing what it got as
                 though it were everything. */
              capped: !!all.capped, cap: LIST_CAP,
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

/** The media under one folder — the photographs and video of a single round. */
function indexFolder_(sub) {
  var root = rootFolder_();
  var dir;
  /* Ask for a folder that is not there and the answer is "nothing", not a new
     empty folder: folderPath_ CREATES what it cannot find, which would litter
     the root with a directory per unit the moment a client guessed wrong. */
  try { dir = sub ? findPath_(root, sub) : root; } catch (err) { dir = null; }
  if (!dir) return { ok: true, folder: sub, found: false, index: [] };
  /* This folder's OWN files, not the tree under it. One round is one folder, so
     recursing buys nothing — and asked for the root of a site that has not been
     tidied yet, it would walk the entire fleet and hit the same ceiling this
     call exists to get around. */
  var out = [], fs = dir.getFiles(), n = 0;
  while (fs.hasNext() && n < LIST_CAP) {
    var f = fs.next(), nm = f.getName();
    n++;
    if (MEDIA_RE.test(nm)) out.push({ name: nm, id: f.getId(), size: f.getSize() });
  }
  return { ok: true, folder: sub, found: true, capped: n >= LIST_CAP, index: out };
}

/** folderPath_ without the create — null when the path does not exist. */
function findPath_(root, path) {
  return String(path).split('/').filter(String).reduce(function (dir, part) {
    if (!dir) return null;
    var it = dir.getFoldersByName(part);
    return it.hasNext() ? it.next() : null;
  }, root);
}

/** Every file under the root, sub-folders included. `ext` filters by suffix. */
function listFiles_(sub, ext) {
  var root = rootFolder_();
  var dir = sub ? folderPath_(root, sub) : root;
  var out = [];
  collect_(dir, '', out, 0, String(ext || '').toLowerCase());
  return { ok: true, count: out.length, truncated: out.length >= LIST_CAP, files: out };
}

/* The walk stops somewhere — a run that never returns is an Apps Script that is
   killed at six minutes and a dashboard that shows nothing at all. What it must
   not do is stop QUIETLY: at 4,000 files, a site a year into a fleet of a
   thousand machines passes the cap on photographs alone, and every sidecar after
   it is a round that simply never appears. Nobody is told, because the reply
   looks exactly like the reply for a folder that holds nothing more.

   So the cap is raised to where a real site reaches it slowly, and — the part
   that actually matters — hitting it is reported. The dashboard says so in the
   Data sources panel and names the fix, rather than quietly showing nine tenths
   of the fleet as if it were all of it. */
var LIST_CAP = 30000;
var WALK_DEPTH = 8;              // {TYPE}/{UNIT}/{DATE} is three; the old layouts were fewer
function collect_(dir, prefix, out, depth, ext) {
  if (depth > WALK_DEPTH || out.length >= LIST_CAP) { out.capped = true; return; }
  var fs = dir.getFiles();
  while (fs.hasNext()) {
    if (out.length >= LIST_CAP) { out.capped = true; return; }
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
