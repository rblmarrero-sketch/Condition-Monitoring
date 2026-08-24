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

const ENDPOINT = process.env.S3_ENDPOINT || 'storage.yandexcloud.net';
const REGION   = process.env.S3_REGION   || 'ru-central1';
const BUCKET   = process.env.BUCKET      || '';
const KEY_ID   = process.env.KEY_ID      || '';
const KEY_SEC  = process.env.KEY_SECRET  || '';
/* Read secret: what the phone and the dashboard send as ?secret=. Empty means
   the folder is open to anyone with the URL, exactly as the Apps Script's is. */
const SECRET   = process.env.SECRET || '';
/* Deletion is off unless this is set, and it is never the read secret. The app
   ships with it empty and says so plainly rather than pretending deletion is
   available and failing at the moment somebody presses it. */
const ADMIN    = process.env.ADMIN_SECRET || '';

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
const putObj  = (key, buf, type, dev) => s3('PUT', key, null, buf, Object.assign(
  { 'content-type': type || 'application/octet-stream',
    'content-length': String(buf.length) }, dev ? { 'x-amz-meta-cm-dev': dev } : {}));
const delObj  = key => s3('DELETE', key, null, '');

/* ---- the contract -------------------------------------------------------
   Everything below returns the shape docs/google-upload.gs returns. Where a
   field looks redundant it is not: something reads it. */
const json = o => ({ statusCode: 200, headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(o) });
const isSidecar = n => /\.json$/i.test(n) && !/\.(edit|conflict|deleted)\.json$/i.test(n);

async function readRecords(p) {
  const after = Number(p.after || 0) || 0;
  const max = Math.min(Number(p.max || 0) || RECORDS_MAX, 2000);
  const wantIndex = String(p.index == null ? '1' : p.index) !== '0';
  const all = await listAll('');
  /* Index shards are .json under _meta/index and their shape is a records
     array, so reading them back as inspections doubles the fleet silently.
     Excluded by path, and by type below — belt and braces, same as the script. */
  const cars = all.filter(f => /\.json$/i.test(f.name) && f.updated > after
                            && f.path.indexOf(INDEX_DIR + '/') !== 0)
                  .sort((a, b) => a.updated - b.updated);
  const records = [], edits = [], conflicts = [];
  let read = 0, bad = 0, truncated = false, cursor = after;
  for (const f of cars) {
    if (read >= max) { truncated = true; break; }
    try {
      const j = JSON.parse((await getObj(f.key)).body.toString('utf8'));
      if (/\.edit\.json$/i.test(f.name) || (j && j.type === 'cm-record-edit')) {
        if (j && j.key) edits.push(j);
      } else if (/\.conflict\.json$/i.test(f.name) || (j && j.type === 'cm-record-conflict')) {
        if (j && j.key) conflicts.push(j);
      } else if (!/\.deleted\.json$/i.test(f.name) && !(j && j.type === 'cm-index-shard')) {
        for (const r of ((j && j.records) || [])) { r._file = f.path; records.push(r); }
      }
      read++;
    } catch (e) { bad++; }
    cursor = f.updated;            // advance even on a bad file, or it blocks the queue
  }
  const out = { ok: true, records, edits, conflicts, read, failed: bad,
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

/* A correction is its own small file that nothing else ever touches.

   NOT written back into the inspection's own sidecar: the phone that captured
   it still holds that record, and re-syncing — after an edit, or just a retry —
   overwrites the file. A correction saved there would vanish without trace. */
async function saveEdit(b) {
  const name = keyFile(b.key, '.edit.json');
  if (!name) return { ok: false, error: 'Bad record key: ' + b.key };
  const doc = { type: 'cm-record-edit', version: 1, key: b.key,
                by: b.by || '', at: new Date().toISOString(),
                void: !!b.void, reason: b.reason || '', fields: b.fields || {},
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
     video, its signature — matched on the stem the naming standard guarantees.
     A marker is left behind so a phone that still holds the round does not
     simply upload it again on its next sync. */
  const mine = all.filter(f => f.name.indexOf(stem.split('_')[0]) === 0
    && f.name.indexOf(stem.split('_')[1]) >= 0);
  let gone = 0;
  for (const f of mine) { try { await delObj(f.key); gone++; } catch (e) {} }
  await putObj(META_DIR + '/' + stem + '.deleted.json',
    Buffer.from(JSON.stringify({ type: 'cm-record-deleted', key: b.key,
      by: b.by || '', at: new Date().toISOString(), files: gone }, null, 2)), 'application/json');
  await touchIndex();
  return { ok: true, deleted: gone };
}

async function resolveConflict(b) {
  const name = keyFile(b.key, '.conflict.json');
  if (!name) return { ok: false, error: 'Bad record key: ' + b.key };
  try { await delObj(META_DIR + '/' + name); } catch (e) {}
  await touchIndex();
  return { ok: true, resolved: b.key, keep: b.dev || '' };
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
      name = fileName.replace(/(\.[^.]+)$/, '~' + dev + '$1');
    }
  }
  const key = (path ? path + '/' : '') + name;
  const buf = Buffer.from(String(b.file), 'base64');
  await putObj(key, buf, b.contentType || 'application/octet-stream', dev);
  const out = { ok: true, req: b.name, id: key, name, url: '', folder: path || '/' };
  if (rival) {
    out.kept = true;
    if (isSidecar(fileName)) {
      const cname = fileName.replace(/\.json$/i, '.conflict.json');
      const doc = { type: 'cm-record-conflict', version: 1,
                    key: '', file: fileName, devices: [rival, dev],
                    at: new Date().toISOString() };
      try { await putObj(META_DIR + '/' + cname,
        Buffer.from(JSON.stringify(doc, null, 2)), 'application/json'); } catch (e) {}
      out.conflict = fileName; out.devices = doc.devices;
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

/* ---- the door -----------------------------------------------------------
   One handler, both verbs, because that is what the clients send. */
exports.handler = async function (event) {
  const q = (event && (event.queryStringParameters || event.params)) || {};
  const method = String((event && (event.httpMethod || event.method)) || 'GET').toUpperCase();
  try {
    if (method === 'GET') {
      if (!q.action) return json(await diagnose());       // health needs no secret
      if (SECRET && q.secret !== SECRET) return json({ ok: false, error: 'Bad or missing secret' });
      if (q.action === 'records') return json(await readRecords(q));
      if (q.action === 'list')    return json(await listFiles(q.folder || '', q.ext || ''));
      if (q.action === 'file')    return json(await readFile(q.id));
      if (q.action === 'files')   return json(await readFiles(q.ids));
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
    if (b.op === 'edit')    return json(await saveEdit(b));
    if (b.op === 'delete')  return json(await deleteRecord(b));
    if (b.op === 'resolve') return json(await resolveConflict(b));
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
      return json({ ok: true, batch: true, saved, failed });
    }
    return json(await saveOne(b));
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) });
  }
};

/* Exported for tests/ya-srv.cjs, which runs this file against an in-memory
   bucket so the suite that proves the Apps Script proves this too. */
exports._internals = { listAll, saveOne, readRecords, listFiles, readFile, readFiles,
                       saveEdit, deleteRecord, resolveConflict, diagnose, keyFile, isSidecar };
