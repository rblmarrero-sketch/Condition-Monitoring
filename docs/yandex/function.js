/* ============================================================================
   CONDITION MONITORING — YANDEX CLOUD FUNCTION
   ----------------------------------------------------------------------------
   The same endpoint the phones and the dashboard already talk to, backed by
   Yandex Object Storage instead of Google Drive.

   WHY THIS EXISTS
   Google needs a VPN on every inspector's phone at Baimskaya. A VPN in the pit
   is a second thing to fail, in the cold, and it fails silently: the phone says
   "online", the endpoint is unreachable, and the round sits in the queue. This
   answers on the site's own network.

   WHY IT IS A DROP-IN
   Neither client is wired to Google. The phone builds `url + "?action=..."` and
   the dashboard does the same; the destination called "gas" is really "the one
   that speaks this JSON". Point that URL here and nothing else changes — no new
   build, no settings beyond the URL itself, and the existing test suites apply
   unchanged.

   SO THE CONTRACT IS THE PRODUCT. Every response shape below is what
   docs/google-upload.gs returns, field for field. Where this file guesses, the
   dashboard silently shows nothing — which is the failure mode this project
   spends most of its time hunting. tests/ya-srv.cjs runs THIS FILE against an
   in-memory bucket so both backends are held to one behaviour.

   DEPENDENCY-FREE ON PURPOSE
   Requests are signed by hand with node:crypto. Yandex's console lets you paste
   a single file and deploy it; the moment there is an npm install between the
   engineer and the fix, the fix stops happening at 2 a.m. from a phone. That is
   the same property that made the Apps Script workable, and it is worth more
   than the few lines saved by an SDK.

   WHAT YOU SET UP  (see README.md in this folder)
     · a private bucket
     · a service account with storage.editor on it
     · a static access key for that account
     · this function, with BUCKET / KEY_ID / KEY_SECRET / SECRET / ADMIN_SECRET
       in its environment, and a public HTTPS trigger

   NEVER put the bucket's keys in the app. They are read AND delete on
   everything. The whole point of this function is that the phone never holds
   more than a URL.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const https = require('https');

/* Trimmed, every one of them.

   `KEY_SECRET= abc` in an environment file is one keystroke away from
   `KEY_SECRET=abc` and looks identical on screen, but the leading space goes
   into the SigV4 signing key and the request comes back 403 — which reads as a
   wrong key and sends somebody to delete a credential that was correct. The
   same space in BUCKET produces a 404 on a bucket that exists, and in
   S3_ENDPOINT a DNS failure for a host that resolves.

   A credential with a space on the end of it is never what anybody meant, so
   there is nothing to preserve by keeping it. */
const env = k => String(process.env[k] == null ? '' : process.env[k]).trim();
const ENDPOINT = env('S3_ENDPOINT') || 'storage.yandexcloud.net';
const REGION   = env('S3_REGION')   || 'ru-central1';
const BUCKET   = env('BUCKET');
const KEY_ID   = env('KEY_ID');
const KEY_SEC  = env('KEY_SECRET');
/* Read secret: what the phone and the dashboard send as ?secret=. Empty means
   the folder is open to anyone with the URL, exactly as the Apps Script's is. */
const SECRET   = env('SECRET');
/* Deletion is off unless this is set, and it is never the read secret. The app
   ships with it empty and says so plainly rather than pretending deletion is
   available and failing at the moment somebody presses it. */
const ADMIN    = env('ADMIN_SECRET');

const META_DIR  = '_meta';
const INDEX_DIR = '_meta/index';
const MEDIA_RE  = /\.(jpe?g|png|webp|mp4|mov)$/i;
const RECORDS_MAX = 600;
/* Eight, the same as the Apps Script. The phone asks for exactly this many at a
   time because that is what one reply can carry without timing out on the link
   they have. Changing it here without changing MEDIA_MAX there means the phone
   asks for more than comes back and quietly loses the rest. */
const MEDIA_MAX = 8;

/* ---- signing ------------------------------------------------------------
   SigV4, by hand. Long, but it is the only part of this file that is not
   business logic, and it never changes. */
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();

function sign(method, key, query, body, headers) {
  const now = new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amz.slice(0, 8);
  const canonKey = '/' + BUCKET + (key ? '/' + key.split('/').map(encodeURIComponent).join('/') : '');
  const qs = Object.keys(query || {}).sort().map(k =>
    encodeURIComponent(k) + '=' + encodeURIComponent(query[k])).join('&');
  const payload = sha256(body || '');
  const h = Object.assign({ host: ENDPOINT, 'x-amz-content-sha256': payload, 'x-amz-date': amz }, headers || {});
  const names = Object.keys(h).map(k => k.toLowerCase()).sort();
  const canonHeaders = names.map(n => n + ':' +
    String(h[Object.keys(h).find(k => k.toLowerCase() === n)]).trim() + '\n').join('');
  const signed = names.join(';');
  const canon = [method, canonKey, qs, canonHeaders, signed, payload].join('\n');
  const scope = [day, REGION, 's3', 'aws4_request'].join('/');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256(canon)].join('\n');
  let k = hmac('AWS4' + KEY_SEC, day);
  k = hmac(k, REGION); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
  h.Authorization = 'AWS4-HMAC-SHA256 Credential=' + KEY_ID + '/' + scope
    + ', SignedHeaders=' + signed + ', Signature=' + hmac(k, toSign).toString('hex');
  return { headers: h, path: canonKey + (qs ? '?' + qs : '') };
}

function s3(method, key, query, body, extra) {
  return new Promise((res, rej) => {
    const buf = body == null ? '' : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const { headers, path } = sign(method, key, query, buf, extra);
    const req = https.request({ host: ENDPOINT, method, path, headers }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const out = Buffer.concat(chunks);
        if (r.statusCode >= 200 && r.statusCode < 300) return res({ status: r.statusCode, body: out, headers: r.headers });
        rej(new Error('S3 ' + r.statusCode + ': ' + out.toString('utf8').slice(0, 300)));
      });
    });
    req.on('error', rej);
    if (buf.length) req.write(buf);
    req.end();
  });
}

/* The bucket, one page at a time. S3 caps a listing at 1000 keys and the fleet
   is well past that, so a caller that forgets to follow the continuation token
   sees a folder that stops in the middle of the alphabet and reports the rest
   as missing. */
async function listAll(prefix) {
  const out = [];
  let token = null;
  do {
    const q = { 'list-type': '2', 'max-keys': '1000' };
    if (prefix) q.prefix = prefix;
    if (token) q['continuation-token'] = token;
    const r = await s3('GET', '', q, '');
    const xml = r.body.toString('utf8');
    const re = /<Contents>([\s\S]*?)<\/Contents>/g;
    let m;
    while ((m = re.exec(xml))) {
      const g = t => (new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>').exec(m[1]) || [])[1] || '';
      const key = g('Key').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      if (!key || key.endsWith('/')) continue;
      /* `key` is for this file's own use — readRecords and deleteRecord fetch
         by it. It must NOT reach a reply: the contract has no such field, and
         ?action=list is what the dashboard walks to find a photograph. Stripped
         in listFiles, which is the only place a listing becomes an answer. */
      out.push({ key, name: key.slice(key.lastIndexOf('/') + 1), path: key,
                 id: key, size: Number(g('Size') || 0),
                 updated: Date.parse(g('LastModified')) || 0 });
    }
    token = (/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml) || [])[1] || null;
  } while (token);
  return out;
}
const getObj  = key => s3('GET', key, null, '');
const headObj = key => s3('HEAD', key, null, '').then(r => r, () => null);
const putObj  = (key, buf, type, dev, meta) => s3('PUT', key, null, buf, Object.assign(
  { 'content-type': type || 'application/octet-stream',
    'content-length': String(buf.length) },
  dev ? { 'x-amz-meta-cm-dev': dev } : {}, meta || {}));
const delObj  = key => s3('DELETE', key, null, '');

/* ---- the contract -------------------------------------------------------
   Everything below returns the shape docs/google-upload.gs returns. Where a
   field looks redundant it is not: something reads it. */
/* CORS on every reply, without exception.

   The app is served from GitHub Pages and this function answers on
   functions.yandexcloud.net, so every single call is cross-origin. Apps Script
   gets this header from Google's own infrastructure and nobody had to think
   about it; a Cloud Function gets exactly what it returns. Without it the
   request still reaches the bucket and the file still lands — and the browser
   then refuses to let the page read the reply, so the phone counts a
   successful upload as a failure and sends it again, for ever.

   Both clients deliberately send text/plain with the secret inside the body,
   which keeps every request "simple" and means no preflight is needed. OPTIONS
   is answered anyway: it costs four lines, and the day something adds a header
   is not the day to discover this. */
const CORS = { 'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
               'Access-Control-Allow-Headers': 'Content-Type',
               'Access-Control-Max-Age': '3600' };
const json = o => ({ statusCode: 200,
                     headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
                     body: JSON.stringify(o) });
const isSidecar = n => /\.json$/i.test(n) && !/\.(edit|conflict|deleted)\.json$/i.test(n);

async function readRecords(p) {
  const after = Number(p.after || 0) || 0;
  const max = Math.min(Number(p.max || 0) || RECORDS_MAX, 2000);
  const wantIndex = String(p.index == null ? '1' : p.index) !== '0';
  const all = await listAll('');
  /* Index shards are .json under _meta/index and their shape is a records
     array, so reading them back as inspections doubles the fleet silently.
     Excluded by path, and by type below — belt and braces, same as the script.

     `>=`, not `>`. The Apps Script reads Drive's last-modified in MILLISECONDS,
     so no two files share a timestamp and an exclusive cursor loses nothing.
     Object Storage reports LastModified to the SECOND. Six rounds uploaded in
     the same second all carry the same number, the cursor advances to it, and
     `> after` means every one of them after the first is never delivered to
     anybody again — not to the office, not to a phone — while read, pending and
     truncated all report a complete read. A batch upload at the end of a shift
     is exactly when several sidecars land inside one second.

     Inclusive costs one re-read of the newest second on each sync, and the
     clients are already idempotent about it: the dashboard de-dups records by
     equip|date|type|dev, edits and deferrals are last-write-wins, and teamGone
     on a key already applied does nothing. A round arriving twice is invisible.
     A round arriving never is what we had. */
  /* _meta/backup holds the pre-rewrite copy of a sidecar under its own name
     (see rewriteObject); read back as an inspection it would double the round. */
  const cars = all.filter(f => /\.json$/i.test(f.name) && f.updated >= after
                            && f.path.indexOf(INDEX_DIR + '/') !== 0
                            && f.path.indexOf(META_DIR + '/backup/') !== 0)
                  .sort((a, b) => a.updated - b.updated);
  const records = [], edits = [], conflicts = [], deleted = [], deferrals = [];
  let read = 0, bad = 0, truncated = false, cursor = after;
  for (const f of cars) {
    if (read >= max) { truncated = true; break; }
    try {
      const j = JSON.parse((await getObj(f.key)).body.toString('utf8'));
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
        /* The round was deleted from the office. The files are already gone —
           this marker is the only thing left that says so, and a phone that
           never sees it goes on counting the unit as inspected forever. It was
           being skipped here, which is why a machine deleted in the dashboard
           stayed on the due list. */
        if (j && j.key) deleted.push({ key: j.key, by: j.by || '', at: j.at || '' });
      } else if (!(j && j.type === 'cm-index-shard')) {
        for (const r of ((j && j.records) || [])) { r._file = f.path; records.push(r); }
      }
      read++;
    } catch (e) { bad++; }
    cursor = f.updated;            // advance even on a bad file, or it blocks the queue
  }
  const out = { ok: true, records, edits, conflicts, deleted, deferrals, read, failed: bad,
                pending: Math.max(0, cars.length - read - bad),
                truncated, cursor, files: all.length,
                photos: all.filter(f => MEDIA_RE.test(f.name)).length };
  if (wantIndex) out.index = all.filter(f => MEDIA_RE.test(f.name))
    .map(f => ({ name: f.name, id: f.id, size: f.size }));
  return out;
}

async function listFiles(sub, ext) {
  const all = await listAll(sub ? sub.replace(/^\/+|\/+$/g, '') + '/' : '');
  const e = String(ext || '').toLowerCase();
  const files = all.filter(f => !e || f.name.toLowerCase().slice(-e.length) === e)
    /* Exactly the Apps Script's fields, and only those. An extra one is not
       free: two clients read this, and a shape that drifts is a shape one of
       them will eventually read differently. */
    .map(f => ({ name: f.name, path: f.path, id: f.id, size: f.size, updated: f.updated }));
  return { ok: true, count: files.length, truncated: false, files };
}

async function readFile(id) {
  if (!id) return { ok: false, error: 'Missing file id' };
  try {
    const r = await getObj(id);
    return { ok: true, name: id.slice(id.lastIndexOf('/') + 1),
             mime: r.headers['content-type'] || 'application/octet-stream',
             data: r.body.toString('base64') };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

async function readFiles(ids) {
  const list = String(ids || '').split(',').filter(Boolean).slice(0, MEDIA_MAX);
  const files = [];
  for (const id of list) {
    const one = await readFile(id);
    files.push(one.ok ? { id, ok: true, name: one.name, mime: one.mime, data: one.data }
                      : { id, ok: false, error: one.error });
  }
  return { ok: true, files };
}

/* "UNIT|2026-03-09|MP" -> "UNIT_09.03.2026_MP" + ext, matching the sidecars. */
function keyFile(key, ext) {
  const p = String(key || '').split('|');
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
  const d = p[1].split('-');
  if (d.length !== 3) return null;
  return p[0] + '_' + d[2] + '.' + d[1] + '.' + d[0] + '_' + p[2] + ext;
}

/** "TK146_09.03.2026_MP.json" -> "TK146|2026-03-09|MP", '' if it is not one. */
function keyFromSidecar(fileName) {
  const m = /^(.+)_(\d{2})\.(\d{2})\.(\d{4})_([^_.]+)\.json$/i.exec(String(fileName || ''));
  return m ? (m[1] + '|' + m[4] + '-' + m[3] + '-' + m[2] + '|' + m[5]) : '';
}
/** The loser's own name, so both versions can sit in the folder side by side. */
function variantName(name, dev) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) + '~' + dev + name.slice(i) : name + '~' + dev;
}
/** Markers written before this file listed devices as bare strings. */
const devList = doc => (doc && Array.isArray(doc.devices) ? doc.devices : [])
  .map(d => (typeof d === 'string' ? { dev: d, file: '' } : d))
  .filter(d => d && d.dev);

/* One marker per record, listing every device that has sent a version.

   This used to be four lines inline in saveOne(), and all four were wrong. The
   marker went out with an EMPTY key — and readRecords() only forwards a marker
   that has one, so every clash this backend recorded was written to a file that
   no phone and no dashboard was ever handed. It listed devices as bare strings
   where the rest of the system reads {dev, file}. It carried no resolved/keep/by,
   so there was nowhere for a decision to be written down. And it overwrote
   itself on every retry, which re-opens a question the office has already
   answered. The Apps Script had all four right; a second backend for one
   document has to agree on what the document IS. */
async function markConflict(fileName, rival, dev) {
  const key = keyFromSidecar(fileName);
  if (!key) return null;
  const name = META_DIR + '/' + fileName.replace(/\.json$/i, '.conflict.json');
  let doc = null;
  try { doc = JSON.parse((await getObj(name)).body.toString('utf8')); } catch (e) { doc = null; }
  const devices = devList(doc);
  const known = {};
  devices.forEach(d => { known[d.dev] = 1; });
  let fresh = false;
  if (!known[rival]) { devices.push({ dev: rival, file: fileName }); fresh = true; }
  if (!known[dev])   { devices.push({ dev: dev, file: variantName(fileName, dev) }); fresh = true; }
  /* A re-send of a copy already listed changes nothing. A genuinely new device
     does re-open it, because that is a version nobody has looked at. */
  if (doc && !fresh) return { key, devices };
  const out = { type: 'cm-record-conflict', version: 1, key,
                at: new Date().toISOString(), devices,
                resolved: false, keep: '', by: '' };
  try { await putObj(name, Buffer.from(JSON.stringify(out, null, 2)), 'application/json'); }
  catch (e) { return null; }
  return { key, devices };
}

/* A correction is its own small file that nothing else ever touches.

   NOT written back into the inspection's own sidecar: the phone that captured
   it still holds that record, and re-syncing — after an edit, or just a retry —
   overwrites the file. A correction saved there would vanish without trace. */
async function saveEdit(b) {
  const name = keyFile(b.key, '.edit.json');
  if (!name) return { ok: false, error: 'Bad record key: ' + b.key };
  /* `note` was in the Apps Script's marker and not in this one, so an office
     that typed a note against a round and happened to be on Yandex lost it on
     save with no error anywhere. `fields` was the mirror image: a slot here
     that nothing wrote to, and no slot at all on the other side. Both ends
     keep both now — two backends for one document have to agree on what the
     document IS. */
  const doc = { type: 'cm-record-edit', version: 1, key: b.key,
                by: b.by || '', at: new Date().toISOString(),
                void: !!b.void, reason: b.reason || '',
                note: String(b.note || '').slice(0, 2000),
                /* Round-level corrections: the hour meter, who walked it, who
                   verified it. NOT the unit, the date or the round type —
                   those three ARE this record's identity, and changing one
                   here would leave the correction filed against a round that
                   no longer exists. */
                fields: (b.fields && typeof b.fields === 'object') ? b.fields : {},
                /* THE ROUND WAS FILED AGAINST THE WRONG MACHINE, DAY OR ROUND.
                   Not a field edit — the three of them ARE the record's filing
                   address, so the correction stays filed under the address the
                   round arrived with and names where it should read instead.
                   That is what lets a re-read of the folder re-apply the move
                   rather than undo it. null puts the round back. */
                move: (b.move && typeof b.move === 'object') ? b.move : null,
                /* Both of these were being written by the dashboard and thrown
                   away here, which is the worst kind of silence: the save
                   succeeded, the panel said so, and the crop or the issued
                   report was gone the next time the folder was read. A
                   whitelist is the right shape for this document; it was simply
                   missing two of the things the document actually carries. */
                media: (b.media && typeof b.media === 'object') ? b.media : null,
                /* Which inspection point each orphan photograph belongs to, or
                   that it is general evidence for the whole round. Keyed by
                   file name. Without this the engineer's decision lives in one
                   browser and the record comes back onto the correction list
                   the next time anybody reads the folder. */
                assign: (b.assign && typeof b.assign === 'object') ? b.assign : null,
                reports: Array.isArray(b.reports) ? b.reports.slice(-20) : null,
                items: b.items || null };
  await putObj(META_DIR + '/' + name, Buffer.from(JSON.stringify(doc, null, 2)), 'application/json');
  await touchIndex();
  return { ok: true, saved: name };
}

async function deleteRecord(b) {
  if (!ADMIN) return { ok: false, error: 'Deletion is switched off. Set ADMIN_SECRET in the function to enable it.' };
  if (b.admin !== ADMIN) return { ok: false, error: 'Wrong admin password' };
  const stem = keyFile(b.key, '');
  if (!stem) return { ok: false, error: 'Bad record key: ' + b.key };
  const all = await listAll('');
  /* Everything that belongs to this round: the sidecar, its photographs, its
     video, its signature, and any correction marker — matched on the naming
     standard, <UNIT>...<DD.MM.YYYY>_<TYPE>.<ext>, so a photo that carries its
     own component prefix (TK146.4C_...) is still caught.

     This used to be two indexOf tests: name starts with the unit, name contains
     the date. The TYPE was never in the match and neither was any separator, so
     deleting one round on TK146 took every OTHER round walked on TK146 that day
     with it — the undercarriage sidecar, its photographs, its edit marker, its
     conflict marker — and took TK1465's rounds too, because "TK1465..." starts
     with "TK146". Only ONE marker is written, naming the round the office asked
     about, so nothing tells a phone the others went: they sit in every team
     cache as done, against files that no longer exist, and the machine stops
     being due for a round nobody has walked.

     The type has to be followed by "." or "_" or nothing: "_2" marks the second
     photo of a position and "_SIGN" the signature, and requiring a separator is
     also what stops type "MP" matching an "MPX" suffix. "~" is there for the
     second device's copy of a clashing round — that is part of the same record
     and must go with it. Character for character the Apps Script's rule; two
     backends deleting one record have to agree on what the record IS. */
  const esc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const p = String(b.key).split('|'), dmy = stem.split('_')[1];
  const re = new RegExp('^' + esc(p[0]) + '[._-].*?' + esc(dmy) + '_' + esc(p[2]) + '([._~]|$)', 'i');
  const mine = all.filter(f => re.test(f.name));
  if (!mine.length) return { ok: false, error: 'Nothing found for ' + b.key };
  let gone = 0;
  for (const f of mine) { try { await delObj(f.key); gone++; } catch (e) {} }
  await putObj(META_DIR + '/' + stem + '.deleted.json',
    Buffer.from(JSON.stringify({ type: 'cm-record-deleted', key: b.key,
      by: b.by || '', at: new Date().toISOString(), files: gone }, null, 2)), 'application/json');
  await touchIndex();
  return { ok: true, deleted: gone };
}

/* ONE PHOTOGRAPH, DELETED ON PURPOSE, WITH A REASON ON IT.

   The office can already delete a whole round. It could not delete a single
   file, and there are files that need it: a frame of somebody's boot, a
   duplicate shot twice, a photograph of the wrong machine. Until now the only
   answers were to leave it in the folder for ever or to delete the entire
   inspection around it.

   Same gate as deleteRecord — ADMIN_SECRET, which lives in cm.env on the VM and
   nowhere else — because this destroys bytes and nothing brings them back.

   A REASON IS NOT OPTIONAL. A photograph that vanishes with no record of who
   removed it or why is indistinguishable from one the sync lost, and this
   project has spent months telling those two apart. The marker is written
   BEFORE the object is deleted, so a failure halfway leaves a note explaining
   an absence rather than an absence explaining nothing.

   Refuses anything that is not a media file: a sidecar deleted this way would
   take a round off every screen with no record of the round ever existing. */
async function deleteFile(b) {
  if (!ADMIN) return { ok: false, error: 'Deletion is switched off. Set ADMIN_SECRET in the function to enable it.' };
  if (b.admin !== ADMIN) return { ok: false, error: 'Wrong admin password' };
  const name = String(b.name || '').trim();
  if (!name) return { ok: false, error: 'Missing file name' };
  if (!MEDIA_RE.test(name)) return { ok: false, error: 'Only photographs and video can be deleted one at a time' };
  const why = String(b.why || '').trim();
  if (!why) return { ok: false, error: 'A reason is required' };
  const by = String(b.by || '').trim();
  if (!by) return { ok: false, error: 'A name is required' };

  const all = await listAll('');
  const hit = all.filter(f => f.name === name);
  if (!hit.length) return { ok: false, error: 'No file called ' + name };

  const at = new Date().toISOString();
  const stem = name.replace(/\.[^.]+$/, '');
  await putObj(META_DIR + '/deletions/' + at.replace(/[:.]/g, '-') + '_' + stem + '.file.json',
    Buffer.from(JSON.stringify({ type: 'cm-file-deleted', name: name,
      key: String(b.key || ''), by: by, why: why, at: at,
      paths: hit.map(f => f.path), bytes: hit.reduce((n, f) => n + (Number(f.size) || 0), 0) },
      null, 2)), 'application/json');

  let gone = 0;
  for (const f of hit) { try { await delObj(f.key); gone++; } catch (e) {} }
  await touchIndex();
  return { ok: true, deleted: gone, name: name, at: at };
}

/* REWRITE ONE SIDECAR OR MARKER IN PLACE, WITH THE ORIGINAL KEPT.

   The grade migration (docs/yandex/migrate-grades.js) needs to change the
   bytes of a JSON document the folder already holds — a letter grade to its
   number — without changing anything else about it: not its name, not the
   device that owns it, not its place in the index. saveOne cannot do that: a
   different `dev` makes it a rival and forks the round.

   So this is its own operation, and it is deliberately narrow:
     - admin-gated, like every operation that changes what the folder says;
     - JSON only — a photograph is never rewritten;
     - the ORIGINAL BYTES are copied to _meta/backup/<stamp>/<key> BEFORE the
       object is overwritten, so every rewrite is reversible by copying back;
     - the owner (x-amz-meta-cm-dev) and the stored hash are carried over, so
       the next upload from that phone is still recognised as its own;
     - a rewrite that would store the same bytes is a no-op, and says so, so
       the tool can be run twice and change nothing the second time. */
async function rewriteObject(b) {
  if (!ADMIN) return { ok: false, error: 'Rewrite is switched off. Set ADMIN_SECRET in the function to enable it.' };
  if (b.admin !== ADMIN) return { ok: false, error: 'Wrong admin password' };
  const key = String(b.id || b.key || '').replace(/^\/+/, '');
  if (!key) return { ok: false, error: 'Missing object key' };
  if (!/\.json$/i.test(key)) return { ok: false, error: 'Only JSON documents can be rewritten' };
  if (!b.file) return { ok: false, error: 'Missing file content' };
  const why = String(b.why || '').trim();
  if (!why) return { ok: false, error: 'A reason is required' };
  const buf = Buffer.from(String(b.file), 'base64');
  try { JSON.parse(buf.toString('utf8')); } catch (e) { return { ok: false, error: 'New content is not JSON' }; }
  const want = sha256(buf);
  let cur = null;
  try { cur = await getObj(key); } catch (e) { cur = null; }
  if (!cur || !cur.body) return { ok: false, error: 'No object called ' + key };
  const head = await headObj(key);
  const dev = String((head && head.headers && head.headers['x-amz-meta-cm-dev']) || '');
  const was = Buffer.from(cur.body);
  const wasSha = sha256(was);
  if (wasSha === want) return { ok: true, key, unchanged: true, sha256: want };
  /* Guard against rewriting on top of a document that changed since the tool
     read it: the caller says what it read, and a mismatch is refused. */
  if (b.ifSha && String(b.ifSha) !== wasSha) return { ok: false, error: 'Object changed since it was read', sha256: wasSha };
  const at = new Date().toISOString();
  const stamp = at.replace(/[:.]/g, '-');
  const backupKey = META_DIR + '/backup/' + stamp + '/' + key;
  await putObj(backupKey, was, 'application/json', dev, { 'x-amz-meta-cm-sha': wasSha, 'x-amz-meta-cm-why': why.slice(0, 200) });
  await putObj(key, buf, 'application/json', dev, { 'x-amz-meta-cm-sha': want });
  let storedSha = '';
  try { const back = await getObj(key); storedSha = sha256(Buffer.from(back.body)); } catch (e) {}
  if (storedSha !== want) return { ok: false, error: 'stored bytes do not match what was sent', key, backup: backupKey };
  if (isSidecar(key.split('/').pop())) await touchIndex();
  return { ok: true, key, backup: backupKey, was: wasSha, sha256: storedSha, at, by: String(b.by || '').slice(0, 80) };
}

/* The office's decision. Both versions stay in the bucket — this only records
   which one the reports should use, so it is as reversible as a void.

   It used to DELETE the marker, and read the kept device out of `b.dev` when
   the dashboard sends `b.keep`. Between them that meant the decision was never
   written down anywhere at all: it lived in the localStorage of the one browser
   that made it, so the other computer still asked, and a phone — which learns a
   clash is settled only by being handed a marker that says so — went on warning
   for ever, because an object that is gone is handed to nobody. The marker
   stays now and is stamped. */
async function resolveConflict(b) {
  const file = keyFile(b.key, '.conflict.json');
  if (!file) return { ok: false, error: 'Bad record key: ' + b.key };
  const keep = String(b.keep || b.dev || '').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24);
  if (!keep) return { ok: false, error: 'No device named to keep for ' + b.key };
  const name = META_DIR + '/' + file;
  let doc = null;
  try { doc = JSON.parse((await getObj(name)).body.toString('utf8')); } catch (e) { doc = null; }
  const devices = devList(doc);
  /* The Apps Script refuses a device the marker does not name. Here the marker
     may legitimately be missing — the dashboard also raises the question when
     it simply holds two copies of one round, which is how every clash this
     backend recorded before today reached the office. Refusing would leave
     those undecidable for ever, so the decision is recorded rather than
     rejected, and the kept device joins the list. */
  if (!devices.some(d => d.dev === keep)) devices.push({ dev: keep, file: '' });
  const out = { type: 'cm-record-conflict', version: 1, key: String(b.key),
                at: new Date().toISOString(), devices,
                resolved: true, keep, by: String(b.by || '').slice(0, 80) };
  await putObj(name, Buffer.from(JSON.stringify(out, null, 2)), 'application/json');
  await touchIndex();
  return { ok: true, key: out.key, resolved: out.key, keep, at: out.at };
}

/* When the folder last changed, so a client can ask "anything new?" for the
   cost of one small object rather than a listing of the whole bucket. */
async function touchIndex() {
  try { await putObj(INDEX_DIR + '/at.json',
    Buffer.from(JSON.stringify({ at: Date.now() })), 'application/json'); } catch (e) {}
}
async function indexAt() {
  try { return JSON.parse((await getObj(INDEX_DIR + '/at.json')).body.toString('utf8')).at || 0; }
  catch (e) { return 0; }
}

/* One file into the bucket.

   Two phones can inspect the same unit on the same day — a hand-over, or two
   people covering a big machine between them. Both name their sidecar
   <UNIT>_<DD.MM.YYYY>_<TYPE>.json, and a plain overwrite throws the first
   inspector's round away without either of them ever being told. The loser gets
   its own name and a marker; the office decides which stands. */
async function saveOne(b) {
  if (!b.name) return { ok: false, error: 'Missing file name' };
  if (!b.file) return { ok: false, error: 'Missing file content' };
  const parts = String(b.name).split('/').filter(Boolean);
  const fileName = parts.pop();
  const path = [String(b.folder || '')].concat(parts).filter(Boolean).join('/')
    .replace(/^\/+|\/+$/g, '');
  const dev = String(b.dev || '').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24);
  let name = fileName, rival = '';
  const key0 = (path ? path + '/' : '') + fileName;
  const head = await headObj(key0);
  if (head) {
    const owner = String(head.headers['x-amz-meta-cm-dev'] || '');
    if (owner && dev && owner !== dev) {
      rival = owner;
      name = variantName(fileName, dev);
    }
  }
  const key = (path ? path + '/' : '') + name;
  const buf = Buffer.from(String(b.file), 'base64');
  const want = sha256(buf);

  /* ALREADY HERE, BYTE FOR BYTE?

     A phone that lost the link mid-record re-sends the tail, and a phone that
     lost the reply re-sends a file that did in fact land. Storing it again
     changes nothing, so the honest answer is a receipt for what is already
     there and a flag saying so — which is also the only way either end can
     count a suppressed duplicate rather than assume one. The comparison is on
     the HASH, not the size: two different photographs of the same plug are
     very often the same number of bytes. */
  let duplicate = false;
  const already = await headObj(key);
  if (already && String(already.headers['x-amz-meta-cm-sha'] || '') === want) duplicate = true;

  if (!duplicate) {
    await putObj(key, buf, b.contentType || 'application/octet-stream', dev,
                 { 'x-amz-meta-cm-sha': want });
  }

  /* VERIFY AFTER STORAGE, NOT BEFORE.

     A receipt computed from the request body is a receipt for the request. It
     says the bytes arrived at this function; it says nothing about whether
     they reached the bucket, or reached it whole. So the object is read back
     and the figures in the receipt are measured from what the STORE returned —
     which is the only reading that can contradict the phone, and therefore the
     only one worth sending it.

     If the read-back fails or disagrees, that is reported rather than hidden:
     a receipt is a promise, and a promise nobody checked is what this whole
     system already has too much of. */
  let storedSize = null, storedSha = '', verifyError = '';
  try {
    const back = await getObj(key);
    const body = back && back.body ? Buffer.from(back.body) : null;
    if (!body) verifyError = 'stored object could not be read back';
    else { storedSize = body.length; storedSha = sha256(body); }
  } catch (e) { verifyError = 'read-after-write failed: ' + String(e.message || e); }
  if (!verifyError && storedSha !== want) {
    verifyError = 'stored bytes do not match what was sent';
  }

  const out = { ok: true, req: b.name, id: key, name, url: '', folder: path || '/' };
  /* THE RECEIPT. Every field is something this end measured or was told by the
     caller; nothing is inferred. receiptId is derived from the object and its
     hash, so a retry of the same bytes returns the SAME receipt — an
     idempotent operation should not mint a new proof each time it is asked. */
  out.receipt = {
    receiptId:    'r' + sha256(key + ':' + (storedSha || want)).slice(0, 24),
    attachmentId: String(b.aid || ''),
    inspectionId: String(b.inspectionId || ''),
    objectId:     key,
    byteSize:     storedSize,
    sha256:       storedSha,
    at:           new Date().toISOString(),
    duplicate:    duplicate,
    verified:     !verifyError
  };
  if (verifyError) out.receipt.error = verifyError;
  if (rival) {
    out.kept = true;
    if (isSidecar(fileName)) {
      const c = await markConflict(fileName, rival, dev);
      if (c) { out.conflict = c.key; out.devices = c.devices; }
    }
  }
  if (isSidecar(name)) await touchIndex();
  return out;
}

async function diagnose() {
  try {
    const all = await listAll('');
    return { ok: true, folder: BUCKET, files: all.length,
             sidecars: all.filter(f => isSidecar(f.name)).length,
             photos: all.filter(f => MEDIA_RE.test(f.name)).length,
             secret: !!SECRET, canDelete: !!ADMIN, backend: 'yandex' };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

/* ---- waking a phone that is closed: Web Push ----------------------------
   A web app that is not open runs nothing, and on an iPhone the only thing
   that can wake it is a push message, which the worker must answer with a
   notification. So the endpoint keeps the phones' push subscriptions under
   _meta/push, and server.js sends to all of them when a build ships, when the
   folder changes, and once a day before shift. The worker on the phone then
   fetches the build, refreshes the fleet list and says "Ready for the field"
   or "Not ready" — without anybody opening the app.

   Dependency-free like the rest of this file: RFC 8291/8188 (aes128gcm) and
   RFC 8292 (VAPID) by hand with node:crypto. tests/bgpush.cjs holds
   pushEncrypt to the RFC's own test vector.

   Keys: VAPID_PUBLIC / VAPID_PRIVATE (base64url, raw P-256) and VAPID_SUBJECT
   in the environment; on the VM server.js generates them once into VAPID_FILE
   when the environment has none. A phone compares the key it subscribed with
   against action=vapid at every open and re-subscribes when it changed. */
const PUSH_DIR = '_meta/push';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
let VAPID = { publicKey: env('VAPID_PUBLIC'), privateKey: env('VAPID_PRIVATE'),
              subject: env('VAPID_SUBJECT') || 'mailto:condition-monitoring@baimskaya.invalid' };
function vapidGenerate() {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(e.getPrivateKey()) };
}
function vapidSet(k) { VAPID = Object.assign({}, VAPID, k || {}); }
function vapidReady() { return !!(VAPID.publicKey && VAPID.privateKey); }
function vapidPublic() { return VAPID.publicKey; }
function vapidPrivateKeyObject() {
  const pub = unb64u(VAPID.publicKey);                    // 65 bytes: 0x04, x, y
  return crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
    x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: VAPID.privateKey } });
}
/* RFC 8292: a signed JWT for the push service's origin, twelve hours. */
function vapidAuth(endpoint) {
  const aud = new URL(endpoint).origin;
  const enc = o => b64u(Buffer.from(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID.subject });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body),
                          { key: vapidPrivateKeyObject(), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + VAPID.publicKey;
}
/* RFC 8291 with RFC 8188 framing. `fixed` injects the sender key and the salt
   so the RFC's Appendix A vector can be reproduced byte for byte. */
function pushEncrypt(payload, p256dh, auth, fixed) {
  const local = crypto.createECDH('prime256v1');
  if (fixed && fixed.privateKey) local.setPrivateKey(unb64u(fixed.privateKey)); else local.generateKeys();
  const localPub = local.getPublicKey();
  const clientPub = unb64u(p256dh);
  const secret = local.computeSecret(clientPub);
  const salt = fixed && fixed.salt ? unb64u(fixed.salt) : crypto.randomBytes(16);
  const hk = (ikm, s, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
  const ikm = hk(secret, unb64u(auth), Buffer.concat([Buffer.from('WebPush: info\0'), clientPub, localPub]), 32);
  const cek = hk(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hk(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([localPub.length]), localPub, enc]);
}
const subKey = ep => PUSH_DIR + '/' + sha256(String(ep)).slice(0, 32) + '.json';
/* THE DOCUMENT: {endpoint, keys:{p256dh, auth}, dev, lang, ua, at}. */
async function pushSubscribe(b) {
  const s = b.sub || {};
  if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) return { ok: false, error: 'Missing subscription' };
  if (!/^https?:\/\//.test(s.endpoint)) return { ok: false, error: 'Bad endpoint' };
  const doc = { endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) },
                dev: String(b.dev || '').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24),
                lang: b.lang === 'ru' ? 'ru' : 'en', ua: String(b.ua || '').slice(0, 160), at: new Date().toISOString() };
  await putObj(subKey(s.endpoint), Buffer.from(JSON.stringify(doc)), 'application/json', doc.dev);
  return { ok: true, id: subKey(s.endpoint), key: VAPID.publicKey };
}
async function pushUnsubscribe(b) {
  if (!b.endpoint) return { ok: false, error: 'Missing endpoint' };
  try { await delObj(subKey(b.endpoint)); } catch (e) { /* already gone */ }
  return { ok: true };
}
async function pushList() {
  const out = [];
  for (const f of await listAll(PUSH_DIR + '/')) {
    if (!/\.json$/i.test(f.name) || f.name.charAt(0) === '_') continue;
    try { const d = JSON.parse((await getObj(f.key)).body.toString('utf8'));
          if (d && d.endpoint && d.keys) out.push(Object.assign({ key: f.key }, d)); }
    catch (e) { /* an unreadable subscription is skipped, not fatal */ }
  }
  return out;
}
/* What server.js remembers between restarts: the build it last saw on Pages. */
async function pushStateGet() {
  try { return JSON.parse((await getObj(PUSH_DIR + '/_state.json')).body.toString('utf8')) || {}; } catch (e) { return {}; }
}
async function pushStateSet(o) {
  await putObj(PUSH_DIR + '/_state.json', Buffer.from(JSON.stringify(o || {})), 'application/json', '');
}
function pushSend(sub, payload, opts) {
  return new Promise((res, rej) => {
    const u = new URL(sub.endpoint);
    const body = pushEncrypt(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
    const headers = { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm',
                      'Content-Length': String(body.length), 'TTL': String((opts && opts.ttl) || 86400),
                      'Urgency': (opts && opts.urgency) || 'high', 'Authorization': vapidAuth(sub.endpoint) };
    if (opts && opts.topic) headers.Topic = opts.topic;
    const mod = u.protocol === 'http:' ? require('http') : https;
    const req = mod.request({ host: u.hostname, port: u.port || undefined, method: 'POST',
                              path: u.pathname + u.search, headers }, r => { r.resume(); r.on('end', () => res(r.statusCode)); });
    req.setTimeout(15000, () => req.destroy(new Error('push timeout')));
    req.on('error', rej);
    req.end(body);
  });
}
/* Every phone, one by one. 404/410 is the push service saying the
   subscription is dead, and it is dropped; anything else is counted and left
   for the next push. Returns the counts, so the caller can log a number. */
async function pushAll(payload, opts) {
  if (!vapidReady()) return { ok: false, error: 'No VAPID keys', sent: 0, gone: 0, failed: 0, total: 0 };
  const subs = await pushList();
  const out = { ok: true, sent: 0, gone: 0, failed: 0, total: subs.length, kind: payload && payload.kind, why: [] };
  for (const s of subs) {
    /* A failure is named, never only counted: "failed: 1" told the maintainer
       nothing about a phone that had subscribed under one key pair and was
       being pushed under another. The push service's status code, or the
       network error, goes on the reply and into the log — with the device
       and the service's host, never the endpoint itself. */
    const who = { dev: s.dev || '', host: (() => { try { return new URL(s.endpoint).hostname; } catch (e) { return ''; } })(), since: s.at || '' };
    try {
      const st = await pushSend(s, Object.assign({ at: new Date().toISOString(), lang: s.lang || 'en' }, payload || {}), opts);
      if (st >= 200 && st < 300) out.sent++;
      else if (st === 404 || st === 410) { out.gone++; try { await delObj(s.key); } catch (e) {} }
      else { out.failed++; out.why.push(Object.assign(who, { status: st, hint: pushHint(st) })); }
    } catch (e) { out.failed++; out.why.push(Object.assign(who, { error: String((e && e.message) || e) })); }
  }
  if (out.failed) { try { console.log('[push] ' + (out.kind || '') + ' failed ' + out.failed + '/' + out.total + ': ' + JSON.stringify(out.why)); } catch (e) {} }
  return out;
}
/* What a status from the push service usually means, in one line. */
function pushHint(st) {
  if (st === 401 || st === 403) return 'the push service refused this server\'s key: the phone subscribed under a different key pair — it re-subscribes by itself at its next open';
  if (st === 400) return 'the push service rejected the message';
  if (st === 413) return 'the message is too large';
  if (st === 429) return 'the push service is rate-limiting this server';
  if (st >= 500) return 'the push service is having trouble; it will be retried at the next push';
  return '';
}
/* The folder changed: something for server.js to debounce into a push. */
let onFolderChange = null;
exports.onFolderChange = fn => { onFolderChange = fn; };
function folderChanged(what) { try { if (onFolderChange) onFolderChange(what); } catch (e) { /* never fails a save */ } }

/* ---- the door -----------------------------------------------------------
   One handler, both verbs, because that is what the clients send. */
exports.handler = async function (event) {
  const q = (event && (event.queryStringParameters || event.params)) || {};
  const method = String((event && (event.httpMethod || event.method)) || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  try {
    if (method === 'GET') {
      if (!q.action) return json(await diagnose());       // health needs no secret
      if (SECRET && q.secret !== SECRET) return json({ ok: false, error: 'Bad or missing secret' });
      if (q.action === 'records') return json(await readRecords(q));
      if (q.action === 'list')    return json(await listFiles(q.folder || '', q.ext || ''));
      if (q.action === 'file')    return json(await readFile(q.id));
      if (q.action === 'files')   return json(await readFiles(q.ids));
      /* The public half of the push key pair — what a phone subscribes with. */
      if (q.action === 'vapid')   return json(vapidReady() ? { ok: true, key: vapidPublic() }
                                                           : { ok: false, error: 'No VAPID keys on this endpoint' });
      /* 'index' is deliberately not implemented yet. Both clients already
         handle an endpoint without it — they fall back to records, and to
         list+file — because deployments in the field are never all on the same
         version. Answering "unknown action" is the honest way to say so, and it
         is a tested path (see tests/drv.cjs, "old deployment"). */
      return json({ ok: false, error: 'Unknown action: ' + q.action });
    }
    let b = {};
    try { b = JSON.parse((event && event.body) || '{}'); } catch (e) { b = {}; }
    if (event && event.isBase64Encoded && event.body) {
      try { b = JSON.parse(Buffer.from(event.body, 'base64').toString('utf8')); } catch (e) {}
    }
    if (SECRET && b.secret !== SECRET) return json({ ok: false, error: 'Bad or missing secret' });
    if (b.op === 'ping') return json({ ok: true, write: true, batch: true,
      canDelete: !!ADMIN, index: false, media: MEDIA_MAX, at: await indexAt() });
    if (b.op === 'edit')    { const r = await saveEdit(b); if (r && r.ok) folderChanged('edit'); return json(r); }
    if (b.op === 'subscribe')   return json(await pushSubscribe(b));
    if (b.op === 'unsubscribe') return json(await pushUnsubscribe(b));
    /* A push on demand — admin only, the same gate as deletion. */
    if (b.op === 'push') {
      if (!ADMIN || String(b.admin || '') !== ADMIN) return json({ ok: false, error: 'Push is admin-only. Send the admin secret as "admin".' });
      return json(await pushAll({ kind: String(b.kind || 'manual') }, { topic: 'cm-' + String(b.kind || 'manual').slice(0, 20), ttl: 6 * 3600, urgency: 'high' }));
    }
    if (b.op === 'delete')  return json(await deleteRecord(b));
    if (b.op === 'delfile') return json(await deleteFile(b));
    if (b.op === 'resolve') return json(await resolveConflict(b));
    if (b.op === 'rewrite') return json(await rewriteObject(b));
    if (b.op === 'batch') {
      const list = b.files || [];
      if (!list.length) return json({ ok: false, error: 'Batch with no files' });
      const saved = [], failed = [];
      for (const one of list) {
        if (one.folder === undefined) one.folder = b.folder;
        if (one.dev === undefined) one.dev = b.dev;
        /* Each file succeeds or fails on its own and says which. The phone
           marks off what landed BY NAME and re-sends only what did not, so a
           batch that half works is not a batch that failed — which is the
           difference between an upload that converges on a bad link and one
           that spends every attempt re-sending what already arrived. */
        try { const r = await saveOne(one);
              if (r.ok) saved.push(r); else failed.push({ name: one.name, error: r.error }); }
        catch (e) { failed.push({ name: one.name, error: String(e.message || e) }); }
      }
      if (saved.some(s => isSidecar(s.name))) folderChanged('batch');
      return json({ ok: true, batch: true, saved, failed });
    }
    { const r = await saveOne(b); if (r && r.ok && isSidecar(r.name)) folderChanged('save'); return json(r); }
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) });
  }
};

/* Exported for tests/ya-srv.cjs, which runs this file against an in-memory
   bucket so the suite that proves the Apps Script proves this too. */
exports._internals = { listAll, saveOne, readRecords, listFiles, readFile, readFiles,
                       saveEdit, deleteRecord, deleteFile, resolveConflict, diagnose, keyFile, keyFromSidecar,
                       markConflict, isSidecar,
                       vapidGenerate, vapidSet, vapidReady, vapidPublic, vapidAuth, pushEncrypt,
                       pushSubscribe, pushUnsubscribe, pushList, pushAll, pushSend, pushStateGet, pushStateSet };
